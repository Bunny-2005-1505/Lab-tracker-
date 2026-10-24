-- Step 5 of 7: views. security_invoker makes each view obey the row-level security of the
-- person who queries it, so users only ever see rows they are allowed to see.

create or replace view public.product_risk with (security_invoker = true) as
select p.id as product_id, p.name, p.lab, p.quantity, p.unit, p.expiry_date, p.low_stock_level,
       coalesce(u.used14, 0::bigint) as used_14d,
       round(coalesce(u.used14, 0::bigint)::numeric / 14.0, 2) as burn_per_day,
       case when coalesce(u.used14, 0::bigint) > 0
            then floor(p.quantity::numeric / (u.used14::numeric / 14.0)) else null::numeric end as days_left,
       u.last_log,
       (u.ever > 0 and (u.last_log is null or u.last_log < now() - interval '14 days')) as stale,
       case
         when p.quantity <= 0 or p.quantity <= p.low_stock_level then 'critical'
         when u.used14 > 0 and p.quantity::numeric / (u.used14::numeric / 14.0) <= 7  then 'critical'
         when u.used14 > 0 and p.quantity::numeric / (u.used14::numeric / 14.0) <= 21 then 'watch'
         when p.expiry_date is not null and u.used14 > 0
              and (p.expiry_date - current_date)::numeric < p.quantity::numeric / (u.used14::numeric / 14.0) then 'watch'
         else 'ok'
       end as risk
from public.products p
left join lateral (
  select sum(l.amount) filter (where l.created_at > now() - interval '14 days') as used14,
         max(l.created_at) as last_log,
         count(*) as ever
  from public.usage_logs l where l.product_id = p.id) u on true;

create or replace view public.overdue_returns with (security_invoker = true) as
select b.id, b.equipment_id, e.name as equipment, e.lab, b.user_id, b.purpose, b.starts_at, b.ends_at,
       floor(extract(epoch from (now() - b.ends_at)) / 3600::numeric)::integer as hours_overdue
from public.equipment_bookings b
join public.equipment e on e.id = b.equipment_id
where b.kind = 'booking' and b.status = 'active' and b.ends_at < now();
