-- Mayhem Roster Manager: configurable requirements migration v2 (scope collision fixed)
-- Run once in Supabase SQL Editor BEFORE enabling the new requirements UI.
-- Additive and repeatable; leaves legacy public.requirements in place.
-- No student data is deleted. The entire migration runs in one transaction.
begin;

create table if not exists public.requirement_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  canonical_key text not null,
  name text not null,
  description text,
  requirement_type text not null default 'form'
    check (requirement_type in ('form','registration','other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, canonical_key),
  unique (id, organization_id)
);

-- Composite organization/season foreign key needs a unique parent key.
do $migration$ begin
 if not exists (
  select 1 from pg_constraint
  where conname='seasons_id_org_unique'
    and conrelid='public.seasons'::regclass
 ) then
  alter table public.seasons
    add constraint seasons_id_org_unique unique (id,organization_id);
 end if;
end $migration$;

-- Each rule is a snapshot of an annual requirement's name and type.
-- A rule applies to all teams, one program, or one team in the season.
create table if not exists public.season_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  definition_id uuid not null,
  season_id uuid not null,
  scope text not null default 'all',
  program text,
  team_id uuid,
  display_name text not null,
  description text,
  requirement_type text not null default 'form'
    check (requirement_type in ('form','registration','other')),
  is_required boolean not null default true,
  is_active boolean not null default true,
  legacy_requirement_id uuid unique references public.requirements(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (definition_id,organization_id)
    references public.requirement_definitions(id,organization_id),
  foreign key (season_id,organization_id)
    references public.seasons(id,organization_id),
  constraint season_requirements_rule_validity_v2_check check (
    (scope='all' and program is null and team_id is null)
    or (scope='program' and program is not null and team_id is null)
    or (scope='team' and team_id is not null and program is null)
  )
);

-- Team is a season-specific row in the current schema.
-- This FK will be adjusted with the future permanent-team migration.
do $migration$ begin
 if not exists (select 1 from pg_constraint where conname='teams_id_org_season_unique' and conrelid='public.teams'::regclass) then
   alter table public.teams add constraint teams_id_org_season_unique unique (id,organization_id,season_id);
 end if;
end $migration$;
do $migration$ begin
 if not exists (select 1 from pg_constraint where conname='season_requirements_team_same_season_fk' and conrelid='public.season_requirements'::regclass) then
  alter table public.season_requirements add constraint season_requirements_team_same_season_fk
    foreign key (team_id,organization_id,season_id) references public.teams(id,organization_id,season_id);
 end if;
end $migration$;

-- Prevent duplicate annual rules, including null scope dimensions.
create unique index if not exists season_requirements_unique_scope
  on public.season_requirements(
    organization_id,season_id,definition_id,scope,
    coalesce(program,''),coalesce(team_id::text,'')
  );

-- Backfill permanent catalog from old seasonal requirement rows.
insert into public.requirement_definitions
  (organization_id,canonical_key,name,description,requirement_type)
select distinct on (organization_id,
        lower(btrim(name)) || ':' || requirement_type)
  organization_id,
  lower(btrim(name)) || ':' || requirement_type,
  name,description,requirement_type
from public.requirements
order by organization_id,
         lower(btrim(name)) || ':' || requirement_type,
         id
on conflict (organization_id,canonical_key) do nothing;

-- Backfill annual rules from old rows, preserving their original UUIDs.
insert into public.season_requirements
  (organization_id,definition_id,season_id,scope,program,
   display_name,description,requirement_type,is_required,
   legacy_requirement_id)
select r.organization_id,d.id,r.season_id,
       case when r.program is null then 'all' else 'program' end,
       r.program,r.name,r.description,r.requirement_type,r.is_required,r.id
from public.requirements r
join public.requirement_definitions d
  on d.organization_id=r.organization_id
 and d.canonical_key=lower(btrim(r.name)) || ':' || r.requirement_type
on conflict (legacy_requirement_id) do nothing;

-- Add new FK while preserving the old one during the transition.
alter table public.student_requirements
  add column if not exists season_requirement_id uuid;

do $migration$ begin
 if not exists (select 1 from pg_constraint where conname='student_req_season_fk' and conrelid='public.student_requirements'::regclass) then
  alter table public.student_requirements add constraint student_req_season_fk foreign key
  (season_requirement_id,organization_id) references public.season_requirements(id,organization_id);
 end if;
end $migration$;

-- Legacy requirement_id is no longer mandatory for newly created entries.
alter table public.student_requirements
  alter column requirement_id drop not null;

update public.student_requirements sr
set season_requirement_id = rule.id
from public.season_requirements rule
where sr.requirement_id=rule.legacy_requirement_id
  and sr.organization_id=rule.organization_id
  and sr.season_requirement_id is null;

create unique index if not exists student_req_enrollment_season_unique
  on public.student_requirements(enrollment_id,season_requirement_id);

-- Grant only logged-in members access, constrained further by RLS.
alter table public.requirement_definitions enable row level security;
alter table public.season_requirements enable row level security;
revoke all on public.requirement_definitions,public.season_requirements
  from public,anon;
grant select,insert,update,delete on
  public.requirement_definitions,public.season_requirements
  to authenticated;

drop policy if exists "Members read catalog" on public.requirement_definitions;
drop policy if exists "Admins insert catalog" on public.requirement_definitions;
drop policy if exists "Admins update catalog" on public.requirement_definitions;
drop policy if exists "Admins delete catalog" on public.requirement_definitions;
create policy "Members read catalog" on public.requirement_definitions
  for select to authenticated
  using (public.has_org_access(organization_id));
create policy "Admins insert catalog" on public.requirement_definitions
  for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy "Admins update catalog" on public.requirement_definitions
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy "Admins delete catalog" on public.requirement_definitions
  for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Members read season requirements" on public.season_requirements;
drop policy if exists "Admins insert season requirements" on public.season_requirements;
drop policy if exists "Admins update season requirements" on public.season_requirements;
drop policy if exists "Admins delete season requirements" on public.season_requirements;
create policy "Members read season requirements" on public.season_requirements
  for select to authenticated
  using (public.has_org_access(organization_id));
create policy "Admins insert season requirements" on public.season_requirements
  for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy "Admins update season requirements" on public.season_requirements
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy "Admins delete season requirements" on public.season_requirements
  for delete to authenticated
  using (public.is_org_admin(organization_id));

commit;

-- Result: definitions, annual rules, and historical completion mapping.
select
  (select count(*) from public.requirement_definitions) as catalog_definitions,
  (select count(*) from public.season_requirements) as annual_rules,
  (select count(*) from public.student_requirements
    where season_requirement_id is not null) as linked_completions;
