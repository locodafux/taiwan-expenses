-- Profile settings: lets a member rename themselves (how they appear to their
-- household partner). household_members deliberately has no client UPDATE
-- policy (see 20260913000002_rls.sql - a broad one would also let a member
-- rewrite household_id/user_id), so this goes through a SECURITY DEFINER
-- function that only ever touches the caller's own row and only display_name.
create function public.update_own_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if v_name is null or v_name = '' then
    raise exception 'Name is required';
  end if;
  if length(v_name) > 50 then
    raise exception 'Name must be 50 characters or fewer';
  end if;

  update public.household_members set display_name = v_name where user_id = auth.uid();
end;
$$;

revoke execute on function public.update_own_display_name(text) from public, anon;
grant execute on function public.update_own_display_name(text) to authenticated;
