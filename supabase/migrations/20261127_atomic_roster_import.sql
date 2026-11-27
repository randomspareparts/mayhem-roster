-- Mayhem Roster Manager — atomic (per row) reviewed import.
-- RUN AFTER 20261122_roster_import_audit.sql.
-- Existing browser importer previously wrote student, contact, enrollment,
-- requirements, FIRST and source log in separate API requests. This RPC
-- makes those updates one PostgreSQL transaction PER ROW.
-- A failed invocation rolls back every change to that row.
-- A multi-row batch still consists of multiple transactions.
begin;
create or replace function public.import_reviewed_roster_row(
 p_organization_id uuid,
 p_season_id uuid,
 p_team_id uuid,
 p_source_name text,
 p_source_sheet text,
 p_source_row integer,
 p_source_fingerprint text,
 p_source jsonb,
 p_match_student_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
 v_team public.teams%rowtype;
 v_student_id uuid;
 v_enrollment_id uuid;
 v_first text;
 v_category text;
 v_followup text;
 v_name text;
 v_first_name text;
 v_last_name text;
 v_dob date;
 v_existing_dob date;
 v_existing_count integer;
 v_status text;
 v_field text;
 v_label text;
 v_rule_id uuid;
 v_rule_count integer;
 v_source_key text;
begin
 if not public.is_org_admin(p_organization_id) then
  raise exception 'Not authorized to import roster data';
 end if;
 if p_source_name is null or btrim(p_source_name) = ''
    or p_source_sheet is null or btrim(p_source_sheet) = ''
    or p_source_row is null or p_source_row < 1
    or p_source_fingerprint is null or btrim(p_source_fingerprint) = '' then
  raise exception 'Missing source provenance';
 end if;
 if jsonb_typeof(p_source) <> 'object' then
  raise exception 'Expected a reviewed row object';
 end if;
 select * into v_team from public.teams
 where id=p_team_id and season_id=p_season_id
   and organization_id=p_organization_id;
 if not found then raise exception 'Team not in selected organization and season'; end if;
 -- Organization-wide transaction lock also serializes concurrent reviewed
 -- imports so two simultaneous requests cannot create the same student.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_organization_id::text,0)
 );
 if exists (
  select 1 from public.roster_import_records
  where organization_id=p_organization_id and season_id=p_season_id
    and source_fingerprint=p_source_fingerprint
 ) then
  raise exception 'Source row has already been imported';
 end if;
 v_name=btrim(coalesce(p_source->>'name',''));
 if v_name = '' or v_name like '%?%' or v_name !~ '^[^ ]+ +[^ ]+' then
  raise exception 'Student must have a complete, unambiguous name';
 end if;
 v_first_name=btrim(pg_catalog.regexp_replace(v_name,' +[^ ]+$',''));
 v_last_name=pg_catalog.substring(v_name from '[^ ]+$');
 v_category=pg_catalog.lower(btrim(coalesce(p_source->>'category','')));
 if v_category not in ('confirmed member','inactive','prospect / follow up') then
  raise exception 'Unrecognized roster category: %',v_category;
 end if;
 v_followup=pg_catalog.lower(btrim(coalesce(p_source->>'followup','')));
 if nullif(btrim(coalesce(p_source->>'birth','')),'') is not null then
  begin
   v_dob=(p_source->>'birth')::date;
  exception when others then
   raise exception 'Unrecognized date of birth';
  end;
 end if;
 select count(*) into v_existing_count from public.students s
 where s.organization_id=p_organization_id
   and pg_catalog.lower(btrim(s.first_name||' '||s.last_name))=pg_catalog.lower(v_name);
 if p_match_student_id is null then
  if v_existing_count>0 then raise exception 'Possible duplicate student: review and match'; end if;
  insert into public.students
   (organization_id,first_name,last_name,is_active)
  values (p_organization_id,v_first_name,v_last_name,v_category<>'inactive')
  returning id into v_student_id;
 else
  select s.id into v_student_id from public.students s
  where s.id=p_match_student_id and s.organization_id=p_organization_id
    and pg_catalog.lower(btrim(s.first_name||' '||s.last_name))=pg_catalog.lower(v_name);
  if v_student_id is null then raise exception 'Student match invalid or name differs'; end if;
 end if;
 select birth_date into v_existing_dob from public.student_contact_profiles
 where student_id=v_student_id and organization_id=p_organization_id;
 if v_existing_dob is not null and v_dob is not null
    and v_existing_dob<>v_dob then
  raise exception 'Birth date conflicts with existing student';
 end if;
 insert into public.student_contact_profiles
  (organization_id,student_id,birth_date,email,mobile_phone,mayhem_email)
 values (
  p_organization_id,v_student_id,v_dob,
  nullif(btrim(coalesce(p_source->>'email','')),''),
  nullif(btrim(coalesce(p_source->>'mobile','')),''),
  case when pg_catalog.lower(coalesce(p_source->>'mayhemEmail',''))='yes'
     and pg_catalog.lower(coalesce(p_source->>'email','')) like '%@mayhemrobotics.org'
   then nullif(btrim(p_source->>'email'),'') else null end
 )
 on conflict (student_id) do nothing;

 if v_category='confirmed member' then
  select id into v_enrollment_id from public.team_enrollments
  where organization_id=p_organization_id
    and student_id=v_student_id and team_id=p_team_id;
  if v_enrollment_id is null then
   insert into public.team_enrollments
    (organization_id,student_id,team_id,status)
   values (p_organization_id,v_student_id,p_team_id,
     case when v_followup='confirmed' then 'active' else 'pending' end)
   returning id into v_enrollment_id;
  end if;
  v_first=pg_catalog.lower(btrim(coalesce(p_source->>'first','')));
  if v_first in ('yes','true','y','1','no','false','n','0') then
   insert into public.first_registrations
    (organization_id,enrollment_id,status,verified_at)
   values (p_organization_id,v_enrollment_id,
    case when v_first in ('yes','true','y','1') then 'complete' else 'not_started' end,
    null)
   on conflict (enrollment_id) do nothing;
  end if;

  -- Map ONLY an unambiguous, explicitly assigned annual requirement.
  -- Preserve unknown / blank values. Existing completion is never overwritten.
  for v_field,v_label in
   select * from (values
     ('form1','Mayhem Release'),
     ('form2','WireBelt Release'),
     ('form3','Emergency Medical'),
     ('form4','Media Waiver'),
     ('form5','FIRST Release')
   ) as labels(field_name,label_name)
  loop
   v_status=pg_catalog.lower(btrim(coalesce(p_source->>v_field,'')));
   if v_status not in ('yes','true','y','1','no','false','n','0') then continue; end if;
   select count(*),(array_agg(sr.id))[1] into v_rule_count,v_rule_id
   from public.season_requirements sr
   where sr.organization_id=p_organization_id and sr.season_id=p_season_id
    and sr.is_active
    and (sr.scope='all'
      or (sr.scope='program' and sr.program=v_team.program)
      or (sr.scope='team' and sr.team_id=p_team_id))
    and pg_catalog.lower(
     pg_catalog.regexp_replace(sr.display_name,'[^a-zA-Z0-9]','','g')
    )=pg_catalog.lower(pg_catalog.regexp_replace(v_label,'[^a-zA-Z0-9]','','g'));
   if v_rule_count=1 then
    insert into public.student_requirements
      (organization_id,enrollment_id,season_requirement_id,status,completed_at)
    values (p_organization_id,v_enrollment_id,v_rule_id,
      case when v_status in ('yes','true','y','1') then 'received' else 'pending' end,
      null)
    on conflict (enrollment_id,season_requirement_id) do nothing;
   end if;
  end loop;
 end if;

 insert into public.roster_import_records (
  organization_id,season_id,team_id,student_id,source_name,source_sheet,
  source_row,source_fingerprint,source_category,source_followup,
  source_fields,import_outcome
 ) values (
  p_organization_id,p_season_id,
  case when v_enrollment_id is not null then p_team_id else null end,
  v_student_id,p_source_name,p_source_sheet,p_source_row,p_source_fingerprint,
  p_source->>'category',p_source->>'followup',
  coalesce(p_source->'_extra','{}'::jsonb),
  case when p_match_student_id is null then 'created' else 'matched' end
 );
 return pg_catalog.jsonb_build_object(
  'student_id',v_student_id,'enrollment_id',v_enrollment_id,
  'outcome',case when p_match_student_id is null then 'created' else 'matched' end
 );
end;
$$;
revoke all on function public.import_reviewed_roster_row(
 uuid,uuid,uuid,text,text,integer,text,jsonb,uuid
) from public,anon;
grant execute on function public.import_reviewed_roster_row(
 uuid,uuid,uuid,text,text,integer,text,jsonb,uuid
) to authenticated;
commit;
-- Inspect the function after applying; do not run imports from SQL editor.
select p.proname,p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='import_reviewed_roster_row';
-- Expected security_definer = false (RLS enforced for caller).
