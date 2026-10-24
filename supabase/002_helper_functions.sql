-- Step 2 of 7: small helper functions used by defaults, policies and other functions.

create or replace function public.lt_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid() limit 1
$$;

create or replace function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.memberships where user_id = auth.uid()
$$;

create or replace function public.lt_is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where user_id = auth.uid() and role in ('owner','teacher'))
$$;

create or replace function public.is_org_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where user_id = auth.uid() and role in ('owner','teacher'))
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public.can_view_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships me
    join public.memberships t on t.org_id = me.org_id
    where me.user_id = auth.uid() and me.role in ('owner','teacher') and t.user_id = target)
$$;
