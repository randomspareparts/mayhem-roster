-- Mayhem Roster Manager: public access hardening + safe RLS smoke test
-- Run in the Supabase SQL Editor, using the SQL Editor's normal administrator context.
-- This is intended for the original 14 roster tables, the 3 catalog/migration tables, 6 new private family tables, and 1 roster import provenance table.
-- It does not insert or delete student data.

-- Remove inherited public/anonymous table access.
revoke all on
 public.organizations, public.memberships, public.seasons, public.teams,
 public.students, public.team_enrollments, public.team_catalog, public.households, public.guardians,
 public.household_guardians, public.student_households, public.requirements,
 public.student_requirements, public.student_dues, public.first_registrations,
 public.requirement_definitions, public.season_requirements,
 public.student_contact_profiles, public.family_households, public.family_guardians,
 public.student_household_links, public.household_guardian_links, public.student_guardian_links,
 public.roster_import_records
from anon, public;

-- The application uses the authenticated role. Row Level Security remains enforced.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
 public.organizations, public.memberships, public.seasons, public.teams,
 public.students, public.team_enrollments, public.team_catalog, public.households, public.guardians,
 public.household_guardians, public.student_households, public.requirements,
 public.student_requirements, public.student_dues, public.first_registrations,
 public.requirement_definitions, public.season_requirements,
 public.student_contact_profiles, public.family_households, public.family_guardians,
 public.student_household_links, public.household_guardian_links, public.student_guardian_links,
 public.roster_import_records
to authenticated;

-- Prevent anonymous access to our authorization helper functions.
revoke all on function public.has_org_access(uuid) from anon, public;
revoke all on function public.is_org_admin(uuid) from anon, public;
grant execute on function public.has_org_access(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- Verify all tables have Row Level Security enabled.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'organizations','memberships','seasons','teams','team_catalog','students',
    'team_enrollments','households','guardians','household_guardians',
    'student_households','requirements','student_requirements',
    'student_dues','first_registrations','requirement_definitions','season_requirements',
    'student_contact_profiles','family_households','family_guardians',
    'student_household_links','household_guardian_links','student_guardian_links',
    'roster_import_records'
  )
order by tablename;

-- Test 1: an anonymous session should have no SELECT privileges.
select
 has_table_privilege('anon','public.students','select') as anon_can_read_students,
 has_table_privilege('anon','public.guardians','select') as anon_can_read_guardians,
 has_table_privilege('anon','public.student_dues','select') as anon_can_read_dues,
 has_table_privilege('anon','public.team_catalog','select') as anon_can_read_team_catalog,
 has_table_privilege('anon','public.requirement_definitions','select') as anon_can_read_req_catalog,
 has_table_privilege('anon','public.season_requirements','select') as anon_can_read_annual_rules,
 has_table_privilege('anon','public.family_guardians','select') as anon_can_read_private_guardians,
 has_table_privilege('anon','public.family_households','select') as anon_can_read_private_households,
 has_table_privilege('anon','public.student_contact_profiles','select') as anon_can_read_student_contacts,
 has_table_privilege('anon','public.roster_import_records','select') as anon_can_read_import_records;

-- Test 2: a signed-in user with NO membership should see zero rows.
-- Uses a deliberately artificial UUID. ROLLBACK restores session settings.
begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select
 (select count(*) from public.organizations) as organizations_visible,
 (select count(*) from public.students) as students_visible,
 (select count(*) from public.guardians) as guardians_visible,
 (select count(*) from public.student_dues) as dues_visible,
 (select count(*) from public.team_catalog) as team_catalog_visible,
 (select count(*) from public.requirement_definitions) as req_catalog_visible,
 (select count(*) from public.season_requirements) as annual_rules_visible,
 (select count(*) from public.family_guardians) as private_guardians_visible,
 (select count(*) from public.family_households) as private_households_visible,
 (select count(*) from public.student_contact_profiles) as private_contacts_visible,
 (select count(*) from public.roster_import_records) as import_records_visible;
rollback;

-- Expected results: all 'anon_can_read_*' = false; all '*_visible' = 0.
-- Before real data import, separately test an actual authorized admin login,
-- and an authenticated user belonging to a different organization.

-- Check the additional requirement that family PII is admin-only.
-- Inspect policies and verify only is_org_admin is used for these 6 tables:
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in (
 'student_contact_profiles','family_households','family_guardians',
 'student_household_links','household_guardian_links','student_guardian_links',
 'roster_import_records'
)
order by tablename,policyname;
