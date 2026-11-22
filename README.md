# Mayhem Robotics Roster Manager

Mobile-friendly GitHub Pages app backed by Supabase authentication and Postgres.

## Version 2 (early access)
- Create and edit seasons and FRC/FTC/FLL teams
- Add and edit students, and assign students to multiple teams
- Define program-specific or common registration requirements by season
- Track forms, payment totals/waivers, and FIRST registration per enrollment
- Filter by season/team; view counts and outstanding items

Not yet built: parent/guardian editor, Excel import/export, attendance, notifications, audit trail, team-limited coach access. Current coaches/viewers have organization-wide read access.

## Deployment
GitHub Settings > Pages > Deploy from a branch > main / (root).
App: https://randomspareparts.github.io/mayhem-roster/

## Connection
Use only your Supabase publishable (or legacy anon) key with the Supabase project URL. Never put a service-role key, secret key, database password, student information, or roster export in this public repository. Login with the Supabase Authentication user assigned an admin membership.

## REQUIRED before entering actual student data
1. Run [security-check.sql](supabase/security-check.sql) using Supabase SQL Editor.
2. Confirm all 14 roster tables have rowsecurity = true.
3. Confirm anon_can_read_* values are false.
4. Confirm the four simulated unauthorized-user counts are zero.
5. Verify the administrator can still read the application and an actual account without organization membership cannot read records.
6. Arrange a tested backup/restore process.

The script is an initial smoke test, not a full independent security audit. Until those checks pass, use only fictional test student data.

## Try the app using fictional information
1. Create FRC Team 8724 in Teams.
2. Create a consent form in Requirements.
3. Add a fictional student in Students, assigning the new team.
4. Use Manage > Registration details to update the form, dues, and FIRST status.
5. Refresh and verify the values persist.

Each team enrollment tracks its own requirements, payment totals, and FIRST status. Student records can be reused across multiple seasons.

## Year-to-year rollover (school-year seasons)

The season selector supports historical rosters such as **2026-2027**, **2027-2028**, etc. The existing student identity stays the same across years, while each season has fresh team enrollments.

To start the next year:
1. Select the old season in the **Season** dropdown and click **+ Season**.
2. Enter the consecutive school year (for example, `2027-2028`).
3. Select the prior season as the source. This copies team definitions and requirement definitions only.
4. Optionally check **Carry over previous students as pending enrollments**. These students are not marked as confirmed or registered.
5. Save and select the new season. Update the team list or enroll returning students individually from **Students → Enroll returning student**.

**Important:** Old student records and historical enrollment, form completion, payment, and FIRST registration data are not overwritten or duplicated. Each new-season enrollment is a new record. Annual form completion statuses, dues amounts paid, and FIRST registration statuses are intentionally **not** copied. A new-season form begins pending, FIRST registration is not set, and dues are not set until entered. This supports the policy requiring fresh forms each year.

Do not create a second student record for someone returning. Use **Enroll returning student**.

**Current limitation:** The rollover process creates the season and copies related records in multiple requests, not a single database transaction. If an error occurs partway through, some records may already have been copied. Review the new season before retrying; don't create the same season again. Eventually this should be moved to a database transaction/RPC with a tested rollback mechanism. Continue using fictional data until access and backup tests are completed.

## Configurable requirements catalog migration (November 22, 2026)

The Requirements tab now supports three distinct concepts:
1. **Requirement catalog** (`requirement_definitions`): reusable names/descriptions and types across seasons.
2. **Annual assignments** (`season_requirements`): snapshot of the requirement name and applicability to all teams, one program, or one season team.
3. **Completion records** (`student_requirements`): individual student enrollment statuses for each annual assignment.

**Activate this version in Supabase:**
1. In the Supabase SQL Editor, start a new query and paste the complete contents of [20261122_requirements_catalog.sql](supabase/migrations/20261122_requirements_catalog.sql).
2. Run it as project administrator. It is additive and transaction-wrapped, preserving existing requirements and completion records.
3. Confirm the final result has `catalog_definitions`, `annual_rules`, and `linked_completions` columns. Zero counts are valid on a fresh project.
4. Refresh the GitHub Pages app. Open **Requirements**: you can add reusable definitions, then assign them to a season with all/program/team scope.
5. With fictional test data, verify newly assigned requirements appear on the appropriate student's Registration Details and statuses survive refresh. Compare historical completions before and after.

**Rollout caution:** The UI code is deployed before the SQL migration. It can read the legacy requirements while awaiting migration, but creation/editing of the new catalog requires the SQL migration. Do not import actual children's data until comprehensive authorization and backups are tested. The annual-rule snapshot means a later catalog rename does not retroactively rename prior seasons. The app currently provides creation of definitions and annual assignments; edit/retire controls and richer historical audits are future work.

**Legacy note:** The old `requirements` table remains in place for migration compatibility and should not be manually edited after transitioning. Do not delete it until all references have been carefully migrated and tested.
