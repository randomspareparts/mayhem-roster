-- Mayhem Roster Manager: controlled source-row reconciliation log
-- Optional for Step 4. Stores imported source fields only inside Supabase.
-- Never store an uploaded roster in the public GitHub repository.
begin;
create table if not exists public.roster_import_records (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 season_id uuid not null,
 team_id uuid,
 student_id uuid,
 source_name text not null,
 source_sheet text not null default 'Roster',
 source_row integer not null,
 source_fingerprint text not null,
 source_category text,
 source_followup text,
 source_fields jsonb not null default '{}'::jsonb,
 import_outcome text not null default 'reviewed'
   check (import_outcome in ('reviewed','created','matched','skipped')),
 imported_at timestamptz not null default now(),
 unique (organization_id,season_id,source_fingerprint),
 foreign key (season_id,organization_id) references public.seasons(id,organization_id),
 foreign key (team_id,organization_id,season_id)
  references public.teams(id,organization_id,season_id),
 foreign key (student_id,organization_id)
  references public.students(id,organization_id)
);
alter table public.roster_import_records enable row level security;
revoke all on public.roster_import_records from anon,public;
grant select,insert,update,delete on public.roster_import_records to authenticated;
drop policy if exists "Admins manage roster import records" on public.roster_import_records;
create policy "Admins manage roster import records" on public.roster_import_records
 for all to authenticated
 using (public.is_org_admin(organization_id))
 with check (public.is_org_admin(organization_id));
commit;
select tablename,rowsecurity as rls_enabled,
 has_table_privilege('anon',format('public.%I',tablename),'select') as anon_can_select
from pg_tables where schemaname='public' and tablename='roster_import_records';
