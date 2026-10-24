-- Demo data. Replace YOUR_EMAIL@example.com with the e-mail you registered with (twice below),
-- then run this in the Supabase SQL Editor AFTER creating your account.

-- Equipment
with u as (select id from auth.users where email = 'YOUR_EMAIL@example.com' limit 1)
insert into equipment (owner_id, name, lab, asset_code)
select u.id, v.name, v.lab, v.code from u,
 (values ('Digital oscilloscope','Physics Lab','PHY-OSC-01'),
         ('Spectrophotometer','Chemistry Lab','CHM-SPC-01'),
         ('Analytical balance','Chemistry Lab','CHM-BAL-02'),
         ('Raspberry Pi kit','CSE Lab','CSE-RPI-05')) as v(name, lab, code);

-- Bookings: one today, one overdue, one maintenance block, one tomorrow
with u as (select id from auth.users where email = 'YOUR_EMAIL@example.com' limit 1)
insert into equipment_bookings (equipment_id, user_id, kind, purpose, starts_at, ends_at)
select e.id, u.id, x.kind, x.purpose, x.s, x.e from u
join equipment e on e.owner_id = u.id
join (values
  ('PHY-OSC-01','booking','Physics practical, Batch A', date_trunc('day', now()) + interval '10 hours', date_trunc('day', now()) + interval '12 hours'),
  ('CHM-SPC-01','booking','Overdue test',               now() - interval '2 days 3 hours',              now() - interval '2 days 1 hour'),
  ('CHM-BAL-02','maintenance','Calibration',            date_trunc('day', now()) + interval '14 hours', date_trunc('day', now()) + interval '16 hours'),
  ('CSE-RPI-05','booking','IoT lab session',            date_trunc('day', now()) + interval '1 day 9 hours', date_trunc('day', now()) + interval '1 day 11 hours')
) as x(code, kind, purpose, s, e) on e.asset_code = x.code;

-- Products, chosen so the forecast shows every label
with u as (select id from auth.users where email = 'YOUR_EMAIL@example.com' limit 1)
insert into products (user_id, lab, qr_code, name, description, quantity, unit, expiry_date, low_stock_level)
select u.id, v.lab, v.code, v.name, v.descr, v.qty, v.unit, current_date + v.days, v.low from u,
 (values
  ('Chemistry Lab','CHM-ETH-01','Ethanol (absolute)','Solvent',        20,'bottles',120, 5),  -- about 10 days left: Watch
  ('Chemistry Lab','CHM-GLV-01','Nitrile gloves','Consumable',           6,'boxes',  400, 2),  -- about 6 days left: Critical
  ('Chemistry Lab','CHM-FLT-01','Filter paper','Consumable',           200,'sheets', 700,20),  -- plenty left: ok
  ('Chemistry Lab','CHM-HCL-01','Hydrochloric acid','Reagent',          30,'bottles', 30, 5)   -- expires before it is used up: Watch
 ) as v(lab, code, name, descr, qty, unit, days, low);

-- Usage over the last 14 days
with u as (select id from auth.users where email = 'YOUR_EMAIL@example.com' limit 1)
insert into usage_logs (product_id, user_id, amount, created_at)
select p.id, u.id, x.amount, now() - make_interval(days => g)
from u
join products p on p.user_id = u.id
join (values ('CHM-ETH-01', 2, 13), ('CHM-GLV-01', 1, 13), ('CHM-FLT-01', 1, 13), ('CHM-HCL-01', 1, 6)) as x(code, amount, last_day)
  on p.qr_code = x.code
cross join generate_series(0, 13) as g
where g <= x.last_day;
