# Mayhem Roster Manager — Production readiness (Step 5)

**Status: NOT YET VERIFIED.** This checklist is a procedure, not evidence.
Do not import actual minors' personal information until each gate is independently
tested and its outcome documented in a private project operations record.
Never commit passwords, actual contact details, Auth UUIDs, SQL query results,
backups, or roster exports to this public GitHub repository.

## 1. Verify the database migration and permissions

1. Run [readiness-access-test.sql](../supabase/readiness-access-test.sql)
   in the original project's Supabase SQL Editor.
2. The inventory should list 24 expected tables, all with `rls_enabled = true`.
3. For all 24 tables, `anon_can_read` should be `false`.
4. For all 7 private-family-and-import tables, verify that the actual RLS
   policies use `public.is_org_admin(organization_id)` for SELECT, INSERT,
   UPDATE, and DELETE. Do not merely inspect the UI's hidden tabs.
5. Run [security-check.sql](../supabase/security-check.sql) for the additional
   simulated no-membership checks.

## 2. Test real non-admin accounts and role isolation

1. In Supabase Authentication, create a **fictional-data test user** with a
   normal email you control, not a child's or family's email. Confirm it.
2. In the project's `memberships` table, use an existing supported
   organization role **other than admin** (such as viewer or coach, if present).
   Do not elevate the account to admin or overwrite another membership.
3. In SQL Editor, use the real account UUID (not an arbitrary invented value).
   The read-only test template at the bottom of
   [readiness-access-test.sql](../supabase/readiness-access-test.sql)
   sets the authenticated role for that identity inside a rollback transaction.
4. The seven private counts should all be zero, **with at least one private
   fictional contact record present that an admin can read**. Empty tables
   can hide security mistakes.
5. Also sign into the actual app as the non-admin: verify the Families and
   Import / Export tabs are hidden. Using that non-admin's authenticated
   browser session, test a **direct GET against private Supabase endpoints**;
   results must not include private family or import records.
6. Confirm an admin can still read and edit fictional data normally. If either
   test fails, stop; correct policies before importing any real records.
7. Review members and revoke inactive accounts; set an offboarding procedure.

## 3. Establish and **test** recovery

A CSV roster export is not a full database backup. The minimum is a
consistent database backup, a separate protected copy, a restore test in
a separate environment, and a periodic repeat schedule.

### Option A — Supabase daily backups (if available on your project plan)

1. Supabase Dashboard → **Database → Backups**.
2. Confirm the project has a usable backup covering the present date.
3. Restore **to a separate project or other isolated test environment**;
   never test a rollback by overwriting the active Mayhem database.
4. Compare the restored structure and counts in students, teams,
   team_enrollments, family tables, requirements, dues and import records.
5. Verify test records can be read from the restored database. Save the
   date of the backup, last successful test restore, result, and next review
   date in a *private* checklist.

Supabase's current plan guidance: Pro/Team/Enterprise projects have automatic
daily backups; on a Free project, plan for independent logical dumps.

### Option B — Supabase CLI logical backup (plan-independent)

Official reference:
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

Install Supabase CLI and Docker Desktop. Retrieve the **database connection
string** using the project's Supabase **Connect** menu; keep the password
private. Run the official `supabase db dump --remote` commands to produce
`roles.sql`, `schema.sql`, and `data.sql`. Use the official guide's
`psql` restoration instructions in a **new isolated test project**.

**Never put a connection string with a real password in public GitHub,
screenshots, ChatGPT, or an unprotected script.** Encrypt the generated dump
files at rest and keep an offsite copy accessible only to the administrators.

Official references:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## 4. Verify import behavior with fiction

1. Run the Step 4 import audit migration first; verify it is RLS enabled.
2. Load the **fictional sample** in Import / Export; ensure all rows begin Skip.
3. Preview and verify that clicking Preview has no database side effects.
4. Inspect an exact-name match and a duplicate/conflicting DOB scenario.
5. Confirm an inactive or prospect profile does not enroll as active.
6. Confirm Unknown values are not transformed into Yes or No.
7. Confirm incomplete DOBs, form labels or guardian data remain for manual
   reconciliation, not fabricated values.
8. Inspect the private import log. Attempt a second identical import: no
   duplicate permanent students or completed enrollment records.
9. Export the test season CSV and compare every status with the application.
10. Confirm the source workbook is never committed to GitHub.

## 5. Go / no-go

**Do not import actual children's information until all the following are true:**

- [ ] Requirements, team and family migrations verified.
- [ ] Non-admin direct access denied with a real signed-in test account.
- [ ] Admin access confirmed against real (fictional) private records.
- [ ] Independent backup exists and a complete test restore succeeded.
- [ ] Import audit table migrated and policies checked.
- [ ] Fictional import/duplicate/export test completed.
- [ ] Actual Mayhem roster is approved for import and sensitive contact fields
      reviewed for ambiguity before saving.
- [ ] Administrators know how to revoke accounts and protect exported files.

### Known limitation requiring additional work

The initial browser importer saves records through **multiple API calls** per
row and does not yet provide a single database transaction across a batch.
A failed write may leave a partial student/contact/enrollment record. The
preflight validation catches common problems but cannot guarantee rollback.
For large-scale real imports, prefer an atomic server-side import function
with tested rollback semantics or an individually reviewed small-batch
migration procedure with reconciliation. This is a go-live risk to resolve
before depending on repeated bulk imports.

**Do not mark this checklist complete merely because the application shows a
checkbox. A checkbox is a self-attestation, not an automated audit.**
