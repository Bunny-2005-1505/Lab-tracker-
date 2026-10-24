-- Step 6 of 7: row-level security. Every table is locked, then opened only as listed.

alter table public.organizations          enable row level security;
alter table public.memberships            enable row level security;
alter table public.platform_admins        enable row level security;
alter table public.profiles               enable row level security;
alter table public.products               enable row level security;
alter table public.usage_logs             enable row level security;
alter table public.equipment              enable row level security;
alter table public.equipment_bookings     enable row level security;
alter table public.booking_attempts       enable row level security;
alter table public.feedback               enable row level security;
alter table public.teacher_requests       enable row level security;
alter table public.teacher_verifications  enable row level security;
alter table public.ping                   enable row level security;

-- products: own, or same-organization teacher can read; only the owner writes
create policy "View own or same-org teacher" on public.products for select
  using (auth.uid() = user_id or (public.is_org_teacher() and org_id is not null and org_id = public.my_org()));
create policy "Add own"    on public.products for insert with check (auth.uid() = user_id);
create policy "Edit own"   on public.products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.products for delete using (auth.uid() = user_id);

-- usage logs follow access to their product (writes go through log_usage / undo_usage)
create policy usage_read on public.usage_logs for select
  using (exists (select 1 from public.products p where p.id = usage_logs.product_id));

-- equipment
create policy eq_read on public.equipment for select
  using (owner_id = auth.uid() or (org_id is not null and org_id = public.lt_org()));
create policy eq_write on public.equipment for all
  using (owner_id = auth.uid() or (org_id = public.lt_org() and public.lt_is_teacher()))
  with check (owner_id = auth.uid() or (org_id = public.lt_org() and public.lt_is_teacher()));

-- bookings: readable when the equipment is readable; NO insert/update policy,
-- so every change must go through request_booking / mark_returned / cancel_booking
create policy eb_read on public.equipment_bookings for select
  using (exists (select 1 from public.equipment e where e.id = equipment_bookings.equipment_id));

create policy att_read on public.booking_attempts for select
  using (user_id = auth.uid() or (org_id is not null and org_id = public.lt_org() and public.lt_is_teacher()));

-- accounts and organizations
create policy "Read own membership"   on public.memberships   for select using (user_id = auth.uid());
create policy "Read own organization" on public.organizations for select
  using (id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "Read own profile"          on public.profiles for select using (auth.uid() = id);
create policy "Insert own profile"        on public.profiles for insert with check (auth.uid() = id);
create policy "Update own profile"        on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Teachers read org profiles" on public.profiles for select using (public.can_view_profile(id));

-- teacher verification and feedback
create policy "Admin reads requests"       on public.teacher_requests      for select using (public.is_platform_admin());
create policy "Read own verification"      on public.teacher_verifications for select using (auth.uid() = user_id);
create policy "Add own feedback"           on public.feedback for insert with check (auth.uid() = user_id);
create policy "Read own feedback or admin" on public.feedback for select using (auth.uid() = user_id or public.is_platform_admin());
