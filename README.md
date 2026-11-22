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
