-- Step 4 of 7: application functions (called from the browser) and triggers.

-- ---------- Equipment booking ----------
create or replace function public.request_booking(
  p_equipment uuid, p_start timestamptz, p_end timestamptz,
  p_purpose text default null, p_kind text default 'booking')
returns jsonb language plpgsql security definer set search_path = public as $$
declare e equipment; b equipment_bookings; c equipment_bookings;
begin
  select * into e from equipment where id = p_equipment
    and (owner_id = auth.uid() or (org_id is not null and org_id = public.lt_org()));
  if not found then raise exception 'Equipment not found'; end if;
  if p_kind = 'maintenance' and not (e.owner_id = auth.uid() or public.lt_is_teacher()) then
    raise exception 'Only teachers can schedule maintenance'; end if;
  if p_end <= p_start then raise exception 'End time must be after start time'; end if;
  if p_kind = 'booking' and p_start < now() - interval '5 minutes' then
    raise exception 'Start time is in the past'; end if;

  begin
    insert into equipment_bookings(equipment_id, user_id, kind, purpose, starts_at, ends_at)
    values (p_equipment, auth.uid(), p_kind, p_purpose, p_start, p_end) returning * into b;
  exception when exclusion_violation then
    -- the no_overlap constraint rejected the insert: log it and explain the clash
    select * into c from equipment_bookings
      where equipment_id = p_equipment and status = 'active'
        and tstzrange(starts_at, ends_at) && tstzrange(p_start, p_end)
      order by starts_at limit 1;
    insert into booking_attempts(org_id, equipment_id, starts_at, ends_at, outcome)
    values (e.org_id, p_equipment, p_start, p_end,
            case when c.kind = 'maintenance' then 'maintenance' else 'conflict' end);
    return jsonb_build_object('ok', false, 'message',
      e.name || ' is ' || case when c.kind = 'maintenance' then 'under maintenance' else 'already booked' end
      || ' from ' || to_char(c.starts_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI')
      || ' to '   || to_char(c.ends_at   at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'));
  end;

  if p_kind = 'booking' then
    insert into booking_attempts(org_id, equipment_id, starts_at, ends_at, outcome)
    values (e.org_id, p_equipment, p_start, p_end, 'booked');
  end if;
  return jsonb_build_object('ok', true, 'id', b.id);
end $$;

create or replace function public.mark_returned(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update equipment_bookings b set status = 'returned', returned_at = now()
   where b.id = p_booking and b.status = 'active'
     and exists (select 1 from equipment e where e.id = b.equipment_id
                 and (e.owner_id = auth.uid() or (e.org_id is not null and e.org_id = public.lt_org())))
     and (b.user_id = auth.uid() or public.lt_is_teacher());
  if not found then raise exception 'Cannot mark returned'; end if;
end $$;

create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update equipment_bookings b set status = 'cancelled'
   where b.id = p_booking and b.status = 'active' and b.ends_at > now()
     and exists (select 1 from equipment e where e.id = b.equipment_id
                 and (e.owner_id = auth.uid() or (e.org_id is not null and e.org_id = public.lt_org())))
     and (b.user_id = auth.uid() or public.lt_is_teacher());
  if not found then raise exception 'Cannot cancel'; end if;
end $$;

-- ---------- Stock usage ----------
create or replace function public.log_usage(p_product uuid, p_amount integer default 1, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare q int;
begin
  if p_amount is null or p_amount < 1 then raise exception 'Amount must be at least 1'; end if;
  if not exists (select 1 from products p where p.id = p_product and (
        p.user_id = auth.uid()
        or (public.lt_is_teacher() and p.user_id in
              (select m.user_id from memberships m where m.org_id = public.lt_org())))) then
    raise exception 'Not allowed';
  end if;
  update products set quantity = quantity - p_amount
   where id = p_product and quantity >= p_amount returning quantity into q;
  if q is null then
    raise exception 'Only % left, cannot use %', (select quantity from products where id = p_product), p_amount;
  end if;
  insert into usage_logs(product_id, user_id, amount, note) values (p_product, auth.uid(), p_amount, p_note);
  return q;
end $$;

create or replace function public.undo_usage(p_product uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare l usage_logs; q int;
begin
  select * into l from usage_logs
   where product_id = p_product and user_id = auth.uid()
     and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;
  if not found then raise exception 'Nothing to undo'; end if;
  update products set quantity = quantity + l.amount where id = l.product_id returning quantity into q;
  delete from usage_logs where id = l.id;
  return q;
end $$;

-- ---------- Organizations and roles ----------
create or replace function public.my_membership() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('role', m.role, 'org_id', m.org_id, 'org_name', o.name, 'domain', o.domain)
  from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
$$;

create or replace function public.claim_organization(org_name text default null) returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  em text; confirmed timestamptz; dom text;
  o public.organizations; m public.memberships;
  free text[] := array['gmail.com','googlemail.com','yahoo.com','yahoo.in','yahoo.co.in','ymail.com',
    'outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','proton.me','protonmail.com',
    'rediffmail.com','aol.com','mail.com','zoho.com','gmx.com'];
begin
  if uid is null then raise exception 'Not logged in'; end if;
  select * into m from public.memberships where user_id = uid;
  if found then return json_build_object('status','member','role',m.role); end if;
  select email, email_confirmed_at into em, confirmed from auth.users where id = uid;
  if confirmed is null then return json_build_object('status','unverified'); end if;
  dom := lower(split_part(em, '@', 2));
  if dom = any(free) then return json_build_object('status','free_email','domain',dom); end if;
  insert into public.organizations(name, domain) values (dom, dom) on conflict (domain) do nothing;
  select * into o from public.organizations where domain = dom;
  insert into public.memberships(user_id, org_id, role) values (uid, o.id, 'assistant')
    on conflict (user_id) do nothing;
  update public.products set user_id = user_id where user_id = uid and org_id is null;
  return json_build_object('status','joined','role','assistant','org_name',o.name);
end $$;

create or replace function public.submit_teacher_request(p_designation text, p_proof_path text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.memberships;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  select * into m from public.memberships where user_id = uid;
  if not found then raise exception 'Join an organization first'; end if;
  if m.role <> 'assistant' then raise exception 'You already have teacher access'; end if;
  if exists (select 1 from public.teacher_requests where user_id = uid and status = 'reported') then
    raise exception 'Teacher access cannot be requested for this account. Please contact support.';
  end if;
  if exists (select 1 from public.teacher_requests where user_id = uid and status in ('pending','flagged','needs_review')) then
    raise exception 'You already have a request under review';
  end if;
  if (select count(*) from public.teacher_requests where user_id = uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Too many attempts today. Please try again tomorrow.';
  end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> uid::text then
    raise exception 'Invalid proof file';
  end if;
  if length(trim(coalesce(p_designation, ''))) < 3 then raise exception 'Enter your designation'; end if;
  insert into public.teacher_requests(user_id, org_id, designation, proof_path)
  values (uid, m.org_id, trim(p_designation), p_proof_path);
  return json_build_object('ok', true);
end $$;

create or replace function public.my_teacher_request() returns json
language sql stable security definer set search_path = public as $$
  select row_to_json(t) from (
    select case when status in ('pending','flagged','needs_review') then 'pending'
                when status = 'reported' then 'rejected'
                else status end as status,
           case when status = 'rejected' then admin_note else null end as admin_note,
           created_at
    from public.teacher_requests where user_id = auth.uid()
    order by created_at desc limit 1) t
$$;

-- ---------- Platform administrator functions ----------
create or replace function public.admin_list_requests() returns json
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return coalesce((
    select json_agg(r order by r.sort, r.created_at) from (
      select t.id, t.status, t.designation, t.proof_path, t.created_at, t.ai_result,
             u.email, p.full_name, o.name as org_name, o.domain,
             case t.status when 'flagged' then 0 when 'needs_review' then 1 else 2 end as sort
      from public.teacher_requests t
      join auth.users u on u.id = t.user_id
      left join public.profiles p on p.id = t.user_id
      left join public.organizations o on o.id = t.org_id
      where t.status in ('pending','flagged','needs_review')) r), '[]'::json);
end $$;

create or replace function public.admin_review_request(
  p_req uuid, p_approve boolean, p_note text default null, p_display_name text default null) returns json
language plpgsql security definer set search_path = public as $$
declare t public.teacher_requests;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  select * into t from public.teacher_requests
   where id = p_req and status in ('pending','flagged','needs_review');
  if not found then raise exception 'Request not found or already reviewed'; end if;
  if p_approve then
    update public.memberships set role = 'teacher' where user_id = t.user_id and role = 'assistant';
    if t.org_id is not null and length(trim(coalesce(p_display_name, ''))) >= 3 then
      update public.organizations set name = trim(p_display_name) where id = t.org_id;
    end if;
    update public.teacher_requests set status = 'approved', reviewed_at = now(), admin_note = p_note where id = p_req;
  else
    update public.teacher_requests set status = 'rejected', reviewed_at = now(), admin_note = p_note where id = p_req;
  end if;
  return json_build_object('ok', true, 'proof_path', t.proof_path);
end $$;

-- Server-side only (no permission checks inside), see the REVOKE statements below.
create or replace function public.grant_verified_teacher(p_user uuid, p_org_name text) returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  em text; dom text; o public.organizations; m public.memberships; new_role text;
  free text[] := array['gmail.com','googlemail.com','yahoo.com','yahoo.in','yahoo.co.in','ymail.com',
    'outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','proton.me','protonmail.com',
    'rediffmail.com','aol.com','mail.com','zoho.com','gmx.com'];
begin
  select email into em from auth.users where id = p_user and email_confirmed_at is not null;
  if em is null then raise exception 'User not found or email not confirmed'; end if;
  dom := lower(split_part(em, '@', 2));
  if dom = any(free) then raise exception 'A college or company email is required'; end if;
  perform pg_advisory_xact_lock(hashtext('org:' || dom));
  select * into o from public.organizations where domain = dom;
  if not found then
    if p_org_name is null or length(trim(p_org_name)) < 3 then raise exception 'Organization name required'; end if;
    insert into public.organizations(name, domain, created_by)
    values (trim(p_org_name), dom, p_user) returning * into o;
    new_role := 'owner';
  else
    new_role := 'teacher';
  end if;
  select * into m from public.memberships where user_id = p_user;
  if found then
    if m.org_id <> o.id then raise exception 'User already belongs to another organization'; end if;
    if m.role <> 'owner' then update public.memberships set role = new_role where user_id = p_user; end if;
  else
    insert into public.memberships(user_id, org_id, role) values (p_user, o.id, new_role);
  end if;
  update public.products set user_id = user_id where user_id = p_user and org_id is null;
  return json_build_object('org_name', o.name,
                           'role', (select role from public.memberships where user_id = p_user));
end $$;

create or replace function public.revoke_teacher(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.memberships set role = 'assistant' where user_id = p_user and role in ('teacher','owner');
$$;

-- IMPORTANT: these two functions contain no permission check, so they must not be callable
-- from the browser. Only the server (service role) may run them.
revoke execute on function public.grant_verified_teacher(uuid, text) from public, anon, authenticated;
revoke execute on function public.revoke_teacher(uuid)               from public, anon, authenticated;

-- ---------- Triggers ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.set_product_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.org_id := (select org_id from public.memberships where user_id = new.user_id);
  return new;
end $$;

create or replace function public.lock_product_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := old.user_id;
  if old.org_id is null then
    new.org_id := (select org_id from public.memberships where user_id = old.user_id);
  else
    new.org_id := old.org_id;
  end if;
  return new;
end $$;

create or replace function public.feedback_guard() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if (select count(*) from public.feedback
       where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many feedback messages. Please try again later.';
  end if;
  new.email := (select email from auth.users where id = new.user_id);
  return new;
end $$;

drop trigger if exists products_set_org   on public.products;
create trigger products_set_org   before insert on public.products for each row execute function public.set_product_org();
drop trigger if exists products_lock_org  on public.products;
create trigger products_lock_org  before update on public.products for each row execute function public.lock_product_org();
drop trigger if exists feedback_guard_trg on public.feedback;
create trigger feedback_guard_trg before insert on public.feedback for each row execute function public.feedback_guard();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
