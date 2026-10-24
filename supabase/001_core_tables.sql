-- Lab Tracker database, step 1 of 7: extension and core tables.
-- Run the files in this folder in numeric order in the Supabase SQL Editor.

create extension if not exists btree_gist;   -- needed for the booking overlap constraint

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  domain     text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.memberships (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  org_id    uuid not null references public.organizations(id) on delete cascade,
  role      text not null default 'assistant'
            check (role in ('owner','teacher','assistant')),
  joined_at timestamptz default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text,
  lab         text,
  phone       text,
  employee_id text,
  updated_at  timestamptz default now(),
  avatar_url  text,
  email       text
);
