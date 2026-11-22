-- Mayhem Roster Manager | Permanent team identities, season-specific teams (2026-11-22)
-- Run AFTER the requirements catalog migration has succeeded.
-- Keeps public.teams as the existing season-specific table, preserving IDs and all
-- team_enrollments + season_requirements.team_id foreign keys.
-- public.team_catalog stores ONE permanent team identity, referenced by teams.catalog_team_id.
-- This is additive, rerunnable and transaction-wrapped. No student rows are deleted.

begin;

create table if not exists public.team_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  program text not null,
  team_number text,
  name text not null,
  is_active boolean not null default true,
  -- Only for legacy teams that did not have a registration number.
  legacy_seed_team_id uuid unique,
  created_at timestamptz not null default now(),
  constraint team_catalog_name_nonempty check (length(btrim(name)) > 0),
  constraint team_catalog_program_nonempty check (length(btrim(program)) > 0),
  unique (id, organization_id)
);

create unique index if not exists team_catalog_number_program_unique
  on public.team_catalog (organization_id, program, lower(btrim(team_number)))
  where team_number is not null and btrim(team_number) <> '';

alter table public.teams
  add column if not exists catalog_team_id uuid;

do $team_migration$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.teams'::regclass
      and conname='teams_catalog_org_fk'
  ) then
    alter table public.teams
      add constraint teams_catalog_org_fk
      foreign key (catalog_team_id, organization_id)
      references public.team_catalog(id, organization_id);
  end if;
end $team_migration$;

-- Reconcile historical teams WITH registration numbers by organization, FIRST
-- program and normalized number. Prefer the name from the latest season.
insert into public.team_catalog
  (organization_id, program, team_number, name, is_active)
select distinct on (t.organization_id, t.program, lower(btrim(t.team_number)))
  t.organization_id, t.program, btrim(t.team_number), t.name, true
from public.teams t
join public.seasons s on s.id=t.season_id
where t.team_number is not null and btrim(t.team_number) <> ''
order by t.organization_id, t.program, lower(btrim(t.team_number)),
         s.name desc, t.id
on conflict do nothing;

update public.teams t
set catalog_team_id=c.id
from public.team_catalog c
where t.catalog_team_id is null
  and t.organization_id=c.organization_id
  and t.program=c.program
  and t.team_number is not null
  and btrim(t.team_number) <> ''
  and lower(btrim(t.team_number))=lower(btrim(c.team_number));

-- Teams with NO number cannot safely be assumed to be the same team across
-- seasons. Keep each distinct until an administrator explicitly reconciles it.
insert into public.team_catalog
  (organization_id, program, team_number, name, is_active, legacy_seed_team_id)
select t.organization_id, t.program, null, t.name, true, t.id
from public.teams t
where t.catalog_team_id is null
  and (t.team_number is null or btrim(t.team_number)='')
on conflict do nothing;

update public.teams t
set catalog_team_id=c.id
from public.team_catalog c
where t.catalog_team_id is null
  and c.legacy_seed_team_id=t.id
  and c.organization_id=t.organization_id;

do $team_migration$ begin
  if exists (select 1 from public.teams where catalog_team_id is null) then
    raise exception 'Some legacy season teams could not be assigned permanent identities; transaction rolled back';
  end if;
  if exists (
    select 1
    from public.teams
    where catalog_team_id is not null
    group by organization_id, season_id, catalog_team_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate team number/program in the same season; resolve duplicate legacy teams before migration';
  end if;
end $team_migration$;

-- Each permanent team can be activated only once per school-year season.
create unique index if not exists teams_one_catalog_per_season
  on public.teams (organization_id, season_id, catalog_team_id)
  where catalog_team_id is not null;

-- All future season-team rows must point to a permanent team.
alter table public.teams alter column catalog_team_id set not null;

alter table public.team_catalog enable row level security;
revoke all on public.team_catalog from public, anon;
grant select, insert, update, delete on public.team_catalog to authenticated;

drop policy if exists "Organization members read team catalog" on public.team_catalog;
drop policy if exists "Organization admins insert team catalog" on public.team_catalog;
drop policy if exists "Organization admins update team catalog" on public.team_catalog;
drop policy if exists "Organization admins delete team catalog" on public.team_catalog;
create policy "Organization members read team catalog" on public.team_catalog
  for select to authenticated using (public.has_org_access(organization_id));
create policy "Organization admins insert team catalog" on public.team_catalog
  for insert to authenticated with check (public.is_org_admin(organization_id));
create policy "Organization admins update team catalog" on public.team_catalog
  for update to authenticated using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy "Organization admins delete team catalog" on public.team_catalog
  for delete to authenticated using (public.is_org_admin(organization_id));

commit;

select
  (select count(*) from public.team_catalog) as permanent_teams,
  (select count(*) from public.teams) as season_team_records,
  (select count(*) from public.teams where catalog_team_id is null) as unlinked_season_teams,
  (select count(*) from public.team_enrollments) as preserved_enrollments,
  (select count(*) from public.season_requirements where scope='team') as preserved_team_requirement_rules;
