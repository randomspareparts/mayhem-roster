-- Mayhem Roster Manager: Student contacts and multi-household relationships
-- Phase 3. Run AFTER the permanent team + requirements migrations.
-- ADDITIVE: legacy households/guardians tables are left untouched until their
-- structure and contents have been audited. No existing data is deleted.
-- This first implementation stores PII in admin-only tables (not public GitHub).
begin;

-- Enforce a composite key so every family relationship stays in one org.
do $family$ begin
 if not exists (
  select 1 from pg_constraint where conrelid='public.students'::regclass
   and conname='students_id_org_family_unique'
 ) then
  alter table public.students
   add constraint students_id_org_family_unique unique (id,organization_id);
 end if;
end $family$;

-- Existing students is the canonical person identity.
-- A student has at most one personal contact record, independent of seasons.
create table if not exists public.student_contact_profiles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 student_id uuid not null unique,
 birth_date date,
 email text,
 mobile_phone text,
 mayhem_email text,
 updated_at timestamptz not null default now(),
 constraint student_contact_profiles_student_org_fk
  foreign key (student_id,organization_id)
  references public.students(id,organization_id),
 unique (id,organization_id)
);

create table if not exists public.family_households (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 display_name text not null,
 address_line1 text,
 address_line2 text,
 city text,
 state_region text,
 postal_code text,
 country text not null default 'US',
 notes text,
 created_at timestamptz not null default now(),
 unique (id,organization_id),
 constraint family_households_name_nonempty check (length(btrim(display_name))>0)
);

create table if not exists public.family_guardians (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 first_name text not null,
 last_name text not null,
 email text,
 phone text,
 notes text,
 created_at timestamptz not null default now(),
 unique (id,organization_id),
 constraint family_guardians_first_nonempty check (length(btrim(first_name))>0),
 constraint family_guardians_last_nonempty check (length(btrim(last_name))>0)
);

create table if not exists public.student_household_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 student_id uuid not null,
 household_id uuid not null,
 is_primary boolean not null default false,
 created_at timestamptz not null default now(),
 unique (organization_id,student_id,household_id),
 foreign key (student_id,organization_id)
  references public.students(id,organization_id),
 foreign key (household_id,organization_id)
  references public.family_households(id,organization_id)
);
-- One preferred address per student, but zero or multiple additional homes.
create unique index if not exists student_household_one_primary
 on public.student_household_links (organization_id,student_id)
 where is_primary=true;

create table if not exists public.household_guardian_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 household_id uuid not null,
 guardian_id uuid not null,
 created_at timestamptz not null default now(),
 unique (organization_id,household_id,guardian_id),
 foreign key (household_id,organization_id)
  references public.family_households(id,organization_id),
 foreign key (guardian_id,organization_id)
  references public.family_guardians(id,organization_id)
);

create table if not exists public.student_guardian_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 student_id uuid not null,
 guardian_id uuid not null,
 relationship text,
 is_primary_contact boolean not null default false,
 emergency_contact boolean not null default false,
 created_at timestamptz not null default now(),
 unique (organization_id,student_id,guardian_id),
 foreign key (student_id,organization_id)
  references public.students(id,organization_id),
 foreign key (guardian_id,organization_id)
  references public.family_guardians(id,organization_id)
);

-- Admin-only for now: young students' DOB, addresses and family contact data
-- must NOT be readable by an organization-wide viewer/coach role by default.
do $family$ declare tablename text; begin
 foreach tablename in array array[
  'student_contact_profiles','family_households','family_guardians',
  'student_household_links','household_guardian_links','student_guardian_links'
 ] loop
  execute format('alter table public.%I enable row level security',tablename);
  execute format('revoke all on public.%I from anon,public',tablename);
  execute format('grant select,insert,update,delete on public.%I to authenticated',tablename);
  execute format('drop policy if exists "Admins manage family records" on public.%I',tablename);
  execute format(
   'create policy "Admins manage family records" on public.%I for all to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id))',
   tablename);
 end loop;
end $family$;

commit;

-- Expected before entering actual student data: all enabled = true,
-- all anonymous SELECT permissions = false.
select
 tablename,
 rowsecurity as rls_enabled,
 has_table_privilege('anon',format('public.%I',tablename),'select') as anon_can_select
from pg_tables
where schemaname='public'
 and tablename in (
 'student_contact_profiles','family_households','family_guardians',
 'student_household_links','household_guardian_links','student_guardian_links')
order by tablename;
