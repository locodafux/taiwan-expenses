-- Chat pushes (in-app feedback, 2026-09-21: "is it possible to add
-- notification for the messages or chat"). Each new household chat message
-- pushes to the other members, through the same push_to_household() and master
-- switch as 20260921000040_notifications.sql.

-- push_to_household gains an optional data payload so the app can tell a chat
-- push apart (hide it while the app is open, open the Chat tab on tap). Dropped
-- and recreated: adding a defaulted parameter with create or replace would
-- leave an ambiguous 4-arg overload behind. Existing callers resolve it by
-- name at run time, so they keep working unchanged.
drop function private.push_to_household(uuid, uuid, text, text);

create function private.push_to_household(p_household_id uuid, p_exclude_user uuid, p_title text, p_body text, p_data jsonb default null)
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
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default', 'data', p_data)))
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

revoke execute on function private.push_to_household(uuid, uuid, text, text, jsonb) from public;

-- The sender never hears their own message. Titled with the sender's name like
-- a messaging app; the body is the message itself, trimmed to push length.
create function private.notify_message_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.push_to_household(
    new.household_id, new.sender_id,
    coalesce((select display_name from public.household_members where user_id = new.sender_id), 'Your partner'),
    case when length(new.body) > 180 then left(new.body, 179) || '…' else new.body end,
    '{"type": "chat"}'::jsonb
  );
  return null;
end;
$$;

create trigger messages_notify_sent
  after insert on public.messages
  for each row execute function private.notify_message_sent();
