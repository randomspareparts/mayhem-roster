-- Mayhem Roster Manager: public access hardening + safe RLS smoke test
-- Run in the Supabase SQL Editor, using the SQL Editor's normal administrator context.
-- This is intended for the 14 tables created in setup parts 1-3.
-- It does not insert or delete student data.

-- Remove inherited public/anonymous table access.
revoke all on
 public.organizations, public.memberships, public.seasons, public.teams,
 public.students, public.team_enrollments, public.households, public.guardians,
 public.household_guardians, public.student_households, public.requirements,
 public.student_requirements, public.student_dues, public.first_registrations
from anon, public;

-- The application uses the authenticated role. Row Level Security remains enforced.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
 public.organizations, public.memberships, public.seasons, public.teams,
 public.students, public.team_enrollments, public.households, public.guardians,
 public.household_guardians, public.student_households, public.requirements,
 public.student_requirements, public.student_dues, public.first_registrations
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
    'organizations','memberships','seasons','teams','students',
    'team_enrollments','households','guardians','household_guardians',
    'student_households','requirements','student_requirements',
    'student_dues','first_registrations'
  )
order by tablename;

-- Test 1: an anonymous session should have no SELECT privileges.
select
 has_table_privilege('anon','public.students','select') as anon_can_read_students,
 has_table_privilege('anon','public.guardians','select') as anon_can_read_guardians,
 has_table_privilege('anon','public.student_dues','select') as anon_can_read_dues;

-- Test 2: a signed-in user with NO membership should see zero rows.
-- Uses a deliberately artificial UUID. ROLLBACK restores session settings.
begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select
 (select count(*) from public.organizations) as organizations_visible,
 (select count(*) from public.students) as students_visible,
 (select count(*) from public.guardians) as guardians_visible,
 (select count(*) from public.student_dues) as dues_visible;
rollback;

-- Expected results: all 'anon_can_read_*' = false; all '*_visible' = 0.
-- Before real data import, separately test an actual authorized admin login,
-- and an authenticated user belonging to a different organization.
