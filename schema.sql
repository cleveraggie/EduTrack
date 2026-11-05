-- EduTrack fresh project setup.
-- This stores teacher names only. Student, accommodation, TEKS, and score data
-- are deliberately not created in Supabase.

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teacher_profiles enable row level security;
revoke all on public.teacher_profiles from anon, authenticated;
grant select, insert, update on public.teacher_profiles to authenticated;

drop policy if exists "Teachers read their own profile" on public.teacher_profiles;
create policy "Teachers read their own profile"
  on public.teacher_profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Teachers create their own profile" on public.teacher_profiles;
create policy "Teachers create their own profile"
  on public.teacher_profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Teachers update their own profile" on public.teacher_profiles;
create policy "Teachers update their own profile"
  on public.teacher_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function public.edutrack_create_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.teacher_profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists edutrack_auth_user_created on auth.users;
create trigger edutrack_auth_user_created
  after insert on auth.users
  for each row execute procedure public.edutrack_create_teacher_profile();

-- Backfill teacher names for accounts that already exist.
insert into public.teacher_profiles (id, display_name)
select id, coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), '')
from auth.users
on conflict (id) do nothing;

-- Verify: public.teacher_profiles should be the only EduTrack app table.
-- This script does not create, query, or delete any student-data tables.
