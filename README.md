# Mayhem Robotics Roster Manager

An initial mobile-friendly, read-only roster dashboard for Mayhem Robotics, hosted on GitHub Pages with Supabase authentication and data storage.

## Current capabilities
- Email/password sign-in with Supabase Auth
- Student, team, and enrollment counts
- Searchable student list and team list
- Responsive layout and sign-out

**Not yet available:** editing, team creation, forms, dues, FIRST registration, household administration, Excel import/export.

## Publish
1. In GitHub, open **Settings → Pages** for this repository.
2. Under **Build and deployment → Source**, select **Deploy from a branch**.
3. Choose **main**, folder **/(root)**, then **Save**.
4. Open https://randomspareparts.github.io/mayhem-roster/ once GitHub Pages reports publishing is complete.

## Connect to Supabase
On the application's first screen, the project URL is prefilled. In Supabase navigate to **Project Settings → API Keys** (or the **Connect** dialog, depending on UI) and copy the **publishable key**. A legacy **anon** key also works. Enter it in the app. **Never enter a service-role or secret key**, and never commit secrets to this repository.

Sign in using the roster app user created under Supabase **Authentication → Users**. The account must have the appropriate organization membership for RLS-controlled data access.

The public URL/key are stored locally in this browser; they are not authorization secrets. Supabase Row Level Security (RLS) must be configured correctly. Do not import real student/guardian data before testing anonymous, unauthorized, and authorized access.

## Development notes
This preview uses a single static `index.html` and Supabase JS from a CDN, so GitHub Pages does not need a build step. The database tables and policies were established separately in the Supabase SQL Editor and are not yet versioned in this repository.

Before production use: verify membership/RLS restrictions end to end; verify same-organization foreign-key consistency for all roster tables; add security testing and backups; configure Supabase Auth URL settings for the GitHub Pages origin; implement edit/import flows.

No real student records or credentials belong in GitHub.
