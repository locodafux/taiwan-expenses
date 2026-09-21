-- Push notifications (captain's intent, 2026-09-21): bill due reminders,
-- partner activity, payday checklist ready, partner joined - delivered as
-- real phone pushes through Expo's push service, so they arrive with the app
-- closed. One master on/off switch per user.
--
-- Everything is sent from the database itself: triggers and a daily pg_cron
-- job POST straight to Expo's push API through pg_net (async - the request is
-- only queued inside the writing transaction). No Edge Function, no secret:
-- Expo's push API needs no access token unless "enhanced push security" is
-- turned on for the Expo project.

-- A real project may already have these enabled from the dashboard; the test
-- harness (supabase/tests/support/stub_auth.sql) stubs both schemas because a
-- plain Postgres has neither extension available.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    create extension pg_net with schema extensions;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end;
$$;

-- The master switch. Per user (not per device), so turning it off on one
-- phone silences every phone signed in as that user.
alter table public.household_members add column notifications_enabled boolean not null default true;

-- One row per device. A token belongs to whoever last signed in on that
-- device, so registration is an upsert that can move it between users - which
-- a plain RLS insert/update can't do (the old owner's row is invisible), hence
-- register_push_token() below.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Own rows only. Sign-out deletes the device's token so a shared/handed-down
-- phone stops getting the previous user's pushes.
create policy "users read own push_tokens" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users delete own push_tokens" on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then
    raise exception 'Invalid push token';
  end if;

  insert into public.push_tokens (token, user_id) values (p_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, created_at = now();
end;
$$;

revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;

-- Same shape as update_own_display_name: household_members has no client
-- UPDATE policy, so this only ever touches the caller's own row and column.
create function public.set_notifications_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update public.household_members set notifications_enabled = coalesce(p_enabled, true)
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.set_notifications_enabled(boolean) from public, anon;
grant execute on function public.set_notifications_enabled(boolean) to authenticated;

create function private.peso(p_amount numeric)
returns text
language sql
immutable
as $$
  select '₱ ' || to_char(round(p_amount), 'FM999,999,999,990');
$$;

-- Sends one push to every member of the household except p_exclude_user (the
-- actor, for partner activity; null for scheduled reminders), skipping members
-- who turned notifications off. Never raises: a notification problem must not
-- roll back the write that triggered it (ticking off a bill, joining, ...).
create function private.push_to_household(p_household_id uuid, p_exclude_user uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  -- ponytail: no push receipts - a token Expo reports as DeviceNotRegistered
  -- (app uninstalled) stays in push_tokens and just keeps failing quietly.
  -- Poll receipts and prune if the table ever grows past a handful per user.
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default'))
    into v_messages
  from public.push_tokens t
  join public.household_members m on m.user_id = t.user_id
  where m.household_id = p_household_id
    and m.notifications_enabled
    and m.user_id is distinct from p_exclude_user;

  if v_messages is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'push_to_household failed: %', sqlerrm;
end;
$$;

revoke execute on function private.push_to_household(uuid, uuid, text, text) from public;
revoke execute on function private.peso(numeric) from public;

create function private.actor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select display_name from public.household_members where user_id = auth.uid()),
    'Your partner'
  );
$$;

revoke execute on function private.actor_name() from public;

-- --- Partner activity -------------------------------------------------------
-- Only client writes (auth.uid() set) count as partner activity; the actor
-- never hears about their own action.

create function private.notify_bill_checked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  perform private.push_to_household(
    new.household_id, auth.uid(),
    'Bill paid',
    private.actor_name() || ' paid ' ||
      coalesce((select label from public.bill_items where id = new.bill_item_id), 'a bill') ||
      ' (' || private.peso(new.amount) || ')'
  );
  return null;
end;
$$;

create trigger ledger_entries_notify_bill_checked
  after update of status on public.ledger_entries
  for each row
  when (new.status = 'checked' and old.status <> 'checked' and new.bill_item_id is not null)
  execute function private.notify_bill_checked();

create function private.notify_category_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  perform private.push_to_household(
    new.household_id, auth.uid(),
    'New category',
    private.actor_name() || ' added ' || new.name
  );
  return null;
end;
$$;

create trigger categories_notify_added
  after insert on public.categories
  for each row execute function private.notify_category_added();

create function private.notify_income_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  perform private.push_to_household(
    new.household_id, auth.uid(),
    'New income',
    private.actor_name() || ' added ' || new.label || ' (' || private.peso(new.amount) || ')'
  );
  return null;
end;
$$;

create trigger incomes_notify_added
  after insert on public.incomes
  for each row execute function private.notify_income_added();

-- --- Household events -------------------------------------------------------
-- A household_members insert only ever happens in handle_new_user: a solo
-- signup (no one else to tell) or an invite redemption (tell the inviter).

create function private.notify_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.push_to_household(
    new.household_id, new.user_id,
    'Your partner joined',
    new.display_name || ' used your invite and joined ' ||
      coalesce((select name from public.households where id = new.household_id), 'your household')
  );
  return null;
end;
$$;

create trigger household_members_notify_joined
  after insert on public.household_members
  for each row execute function private.notify_member_joined();

-- --- Scheduled reminders ----------------------------------------------------
-- Runs daily at 09:00 Asia/Taipei (01:00 UTC - Taiwan has no DST). p_today is
-- a parameter only so tests can pin the date.

create function private.send_daily_reminders(p_today date default (now() at time zone 'Asia/Taipei')::date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tomorrow date := p_today + 1;
  rec record;
begin
  -- Bills due tomorrow, one push per household. A bill already ticked off on
  -- tomorrow's checklist (due date = a payday) needs no reminder.
  for rec in
    select c.household_id,
           count(*) as n,
           string_agg(bi.label || ' ' || private.peso(bi.amount), ', ' order by bi.label) as bills
    from public.bill_items bi
    join public.categories c on c.id = bi.category_id
    where c.kind = 'bill' and not c.archived
      and private.clamp_day_to_month(bi.recurring_day, v_tomorrow) = v_tomorrow
      and (bi.end_date is null or bi.end_date >= v_tomorrow)
      and not exists (
        select 1 from public.ledger_entries le
        where le.bill_item_id = bi.id and le.payday_date = v_tomorrow and le.status = 'checked'
      )
    group by c.household_id
  loop
    perform private.push_to_household(
      rec.household_id, null,
      case when rec.n = 1 then 'Bill due tomorrow' else rec.n || ' bills due tomorrow' end,
      rec.bills
    );
  end loop;

  -- Payday: that payday's checklist is ready (the app materializes it on open).
  -- The month's first payday doubles as the "new month" notice.
  for rec in
    select distinct i.household_id
    from public.incomes i
    where i.active and private.clamp_day_to_month(i.recurring_day, p_today) = p_today
  loop
    perform private.push_to_household(
      rec.household_id, null,
      case
        when (private.household_paydays_in_month(rec.household_id, p_today))[1] = p_today
          then 'New month, new checklist'
        else 'Payday checklist ready'
      end,
      'It''s payday - your checklist is ready. Open the app to set aside this payday''s bills and savings.'
    );
  end loop;
end;
$$;

revoke execute on function private.send_daily_reminders(date) from public;

select cron.schedule('daily-push-reminders', '0 1 * * *', 'select private.send_daily_reminders()');
