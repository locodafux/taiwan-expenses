-- Core schema for the couple's finance app (docs/plan.md §1, docs/techspec.md §4).
-- Seven household-scoped tables. household_id is denormalized onto bill_items,
-- incomes and ledger_entries (populated by trigger from their parent row) so
-- every table can share one flat RLS predicate instead of a join chain.

create extension if not exists pgcrypto with schema extensions;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  color text,
  created_at timestamptz not null default now(),
  -- v1 has no multi-household support (docs/plan.md §3): one household per user.
  unique (user_id),
  unique (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('bill', 'fund')),
  name text not null,
  color text,
  sort_order int not null default 0,
  -- rule shapes (docs/plan.md §1 "three rule types"):
  --   {"type":"goal","target_amount":80000,"target_date":"2027-03-05"}
  --   {"type":"capped_percent","percent":30,"cap":100000}
  --   {"type":"remainder","percent":50}
  rule jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'fund') = (rule is not null)),
  check (rule is null or rule ->> 'type' in ('goal', 'capped_percent', 'remainder'))
);

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  label text not null,
  amount numeric(12, 2) not null check (amount > 0),
  recurring_day int not null check (recurring_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  label text not null,
  amount numeric(12, 2) not null check (amount > 0),
  recurring_day int not null check (recurring_day between 1 and 31),
  -- debts auto-retire by setting this; recurring bills leave it null (docs/plan.md §1)
  end_date date,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  bill_item_id uuid references public.bill_items(id) on delete set null,
  payday_date date not null,
  amount numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'checked')),
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- idempotent materialization: one row per (category, occurrence, payday).
-- NULLs aren't equal in a plain unique index, so fund rows (bill_item_id is
-- null) and bill rows need separate partial unique indexes.
create unique index ledger_entries_fund_occurrence
  on public.ledger_entries (category_id, payday_date)
  where bill_item_id is null;

create unique index ledger_entries_bill_occurrence
  on public.ledger_entries (category_id, bill_item_id, payday_date)
  where bill_item_id is not null;

create index household_members_household_idx on public.household_members (household_id);
create index household_invites_household_idx on public.household_invites (household_id);
create index categories_household_idx on public.categories (household_id);
create index incomes_household_idx on public.incomes (household_id);
create index bill_items_household_idx on public.bill_items (household_id);
create index ledger_entries_household_idx on public.ledger_entries (household_id);

-- Denormalize household_id from the parent row on insert, overwriting
-- whatever the client sent, so a spoofed household_id can never diverge from
-- the category/member it actually belongs to (defense in depth for RLS).

create function public.set_household_id_from_category()
returns trigger
language plpgsql
as $$
begin
  select household_id into new.household_id from public.categories where id = new.category_id;
  if new.household_id is null then
    raise exception 'category % not found', new.category_id;
  end if;
  return new;
end;
$$;

-- bill_items must attach to a kind='bill' category: payday_leftover() and
-- materialize_payday()'s bill loop both filter on c.kind = 'bill', so a bill
-- attached to a fund category would silently never be tracked or paid.
create function public.set_household_id_from_bill_category()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  select household_id, kind into new.household_id, v_kind
    from public.categories where id = new.category_id;
  if new.household_id is null then
    raise exception 'category % not found', new.category_id;
  end if;
  if v_kind <> 'bill' then
    raise exception 'bill_items.category_id must reference a bill category, got kind %', v_kind;
  end if;
  return new;
end;
$$;

create trigger bill_items_set_household_id
  before insert or update of category_id on public.bill_items
  for each row execute function public.set_household_id_from_bill_category();

create trigger ledger_entries_set_household_id
  before insert or update of category_id on public.ledger_entries
  for each row execute function public.set_household_id_from_category();

create function public.set_household_id_from_member()
returns trigger
language plpgsql
as $$
begin
  select household_id into new.household_id from public.household_members where id = new.member_id;
  if new.household_id is null then
    raise exception 'household member % not found', new.member_id;
  end if;
  return new;
end;
$$;

create trigger incomes_set_household_id
  before insert or update of member_id on public.incomes
  for each row execute function public.set_household_id_from_member();
