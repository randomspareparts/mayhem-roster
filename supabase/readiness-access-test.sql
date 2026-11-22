-- Mayhem Roster Manager — read-only authorization verification
-- Run in Supabase SQL Editor as project administrator.
-- This file does not insert, update or delete student information.
--
-- 1. Review the inventory: 24 roster tables should be accounted for.
-- 2. All tables should have RLS enabled.
-- 3. All private tables should have no anonymous SELECT privileges.
-- 4. Private data tables should have policies using public.is_org_admin().
-- 5. To test an ACTUAL viewer account, copy the second transaction into a
--    new SQL Editor tab and replace the placeholder with the Auth user's UUID.
--    A UI-hidden tab is not evidence that underlying RLS protects the data.

select
 t.tablename,
 t.rowsecurity as rls_enabled,
 has_table_privilege('anon',format('%I.%I',t.schemaname,t.tablename),'select') as anon_can_read,
 has_table_privilege('authenticated',format('%I.%I',t.schemaname,t.tablename),'select') as authenticated_role_has_select_grant
from pg_tables t
where t.schemaname='public'
 and t.tablename in (
 'organizations','memberships','seasons','teams','students','team_enrollments',
 'households','guardians','household_guardians','student_households',
 'requirements','student_requirements','student_dues','first_registrations',
 'requirement_definitions','season_requirements','team_catalog',
 'student_contact_profiles','family_households','family_guardians',
 'student_household_links','household_guardian_links','student_guardian_links',
 'roster_import_records'
 )
order by t.tablename;

-- Inspect actual RLS policy expressions on sensitive private tables.
select tablename,policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename in (
 'student_contact_profiles','family_households','family_guardians',
 'student_household_links','household_guardian_links','student_guardian_links',
 'roster_import_records')
order by tablename,policyname;

-- Actual account membership and role lookup (shown only to SQL editor admin).
-- Choose a real TEST viewer/coach account whose membership exists, not admin.
-- This displays Auth UUID values; keep the results out of public GitHub.
select m.user_id,m.organization_id,m.role
from public.memberships m
order by m.role,m.organization_id;

-- SECOND QUERY / REAL ACCOUNT SIMULATION TEMPLATE
-- Copy the lines below into a NEW query, UNCOMMENT them and replace the
-- placeholder with an actual non-admin Auth UUID from memberships above.
-- Expected for all seven private tables: *_visible = 0.
-- If a table is missing, the migration is not complete.
--
-- begin;
-- select set_config('request.jwt.claim.sub',
--   'REPLACE_WITH_REAL_NON_ADMIN_AUTH_UUID',true);
-- set local role authenticated;
-- select
--   (select count(*) from public.student_contact_profiles) as student_contacts_visible,
--   (select count(*) from public.family_households) as households_visible,
--   (select count(*) from public.family_guardians) as guardians_visible,
--   (select count(*) from public.student_household_links) as student_household_links_visible,
--   (select count(*) from public.household_guardian_links) as household_guardian_links_visible,
--   (select count(*) from public.student_guardian_links) as student_guardian_links_visible,
--   (select count(*) from public.roster_import_records) as import_records_visible;
-- rollback;
--
-- NOTE: zero counts are necessary but not sufficient if private tables are
-- EMPTY. Create NON-SENSITIVE FICTIONAL test records first. Verify a real
-- admin can see those records and an actual viewer cannot. Also test the
-- signed-in viewer via Supabase's browser API, not only simulated JWT context.
