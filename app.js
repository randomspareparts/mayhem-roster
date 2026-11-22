'use strict';
const $=id=>document.getElementById(id);
const state={api:null,user:null,org:null,role:null,season:null,seasons:[],teams:[],teamCatalog:[],teamMode:false,familyMode:false,studentContacts:[],familyHouseholds:[],familyGuardians:[],studentHouseholds:[],householdGuardians:[],studentGuardians:[],students:[],enrollments:[],requirements:[],definitions:[],seasonRules:[],requirementsMode:false,studentRequirements:[],dues:[],first:[],tab:'overview'};
function message(text='',success=false){$('banner').replaceChildren();if(!text)return;const p=document.createElement('p');p.className='alert'+(success?' success':'');p.textContent=text;$('banner').appendChild(p)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function option(value,label,selected=false){return '<option value="'+escapeHtml(value)+'"'+(selected?' selected':'')+'>'+escapeHtml(label)+'</option>'}
function display(section){for(const id of ['setup','login','workspace'])$(id).classList.toggle('hidden',id!==section);$('signout').classList.toggle('hidden',section!=='workspace')}
function requireAdmin(){if(state.role!=='admin')throw Error('Only organization administrators can make changes.')}
function check(r){if(r.error)throw r.error;return r.data}
function setTab(tab){state.tab=tab;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('hidden',x.id!=='tab-'+tab));document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));render()}
function activeTeams(){return state.teams.filter(t=>t.season_id===state.season)}
function teamCatalogRecord(t){return state.teamCatalog.find(c=>c.id===t?.catalog_team_id)}
function teamLabel(t){return (t.team_number?t.team_number+' · ':'')+t.name}
function teamHistory(t){return state.teams.filter(x=>x.catalog_team_id&&x.catalog_team_id===t.catalog_team_id)
 .sort((a,b)=>(state.seasons.find(x=>x.id===b.season_id)?.name||'').localeCompare(state.seasons.find(x=>x.id===a.season_id)?.name||''))}

function guardianName(g){return [g.first_name,g.last_name].filter(Boolean).join(' ')}
function studentContact(s){return state.studentContacts.find(x=>x.student_id===s.id)}
function guardiansForStudent(id){return state.studentGuardians.filter(x=>x.student_id===id).map(x=>({link:x,guardian:state.familyGuardians.find(g=>g.id===x.guardian_id)})).filter(x=>x.guardian)}
function householdsForStudent(id){return state.studentHouseholds.filter(x=>x.student_id===id).map(x=>({link:x,household:state.familyHouseholds.find(h=>h.id===x.household_id)})).filter(x=>x.household)}
function familyReady(){requireAdmin();if(!state.familyMode)throw Error('Activate the Student and Households SQL migration first.')}
function familyLabel(h){return h.display_name+(h.city?', '+h.city:'')}
function activeEnrollments(){const ids=new Set(activeTeams().map(t=>t.id));return state.enrollments.filter(e=>ids.has(e.team_id)&&e.status!=='withdrawn')}
function reqsFor(team){
 if(!state.requirementsMode) return state.requirements.filter(r=>r.season_id===state.season&&(!r.program||r.program===team.program));
 const applicable=state.seasonRules.filter(r=>r.season_id===state.season&&r.is_active&&(
 r.scope==='all'||(r.scope==='program'&&r.program===team.program)||(r.scope==='team'&&r.team_id===team.id)
 ));
 const mostSpecific=new Map();
 const priority={all:1,program:2,team:3};
 for(const r of applicable){
  const prior=mostSpecific.get(r.definition_id);
  if(!prior||priority[r.scope]>priority[prior.scope])mostSpecific.set(r.definition_id,r);
 }
 return [...mostSpecific.values()].map(r=>({...r,name:r.display_name}));
}
function matchedCompletion(e,r) {
 return state.studentRequirements.find(sr=>sr.enrollment_id===e.id&&
 (state.requirementsMode?sr.season_requirement_id===r.id:sr.requirement_id===r.id));
}

function enrollmentStatus(e){const team=state.teams.find(t=>t.id===e.team_id);if(!team)return {forms:'—',dues:'—',first:'—',outstanding:0};const req=reqsFor(team).filter(r=>r.is_required),results=req.map(r=>matchedCompletion(e,r)),complete=results.filter(sr=>sr&&['received','waived','not_applicable'].includes(sr.status)).length;const dues=state.dues.find(d=>d.enrollment_id===e.id),first=state.first.find(f=>f.enrollment_id===e.id);const owed=dues?Math.max(0,Number(dues.amount_due)-Number(dues.amount_paid)-Number(dues.amount_waived)):null;const firstOk=first&&['complete','not_required'].includes(first.status);return {forms:complete+'/'+req.length,dues:owed===null?'Not set':owed===0?'Paid/waived':'$'+owed.toFixed(2)+' due',first:first?first.status.replaceAll('_',' '):'Not set',outstanding:req.length-complete+(owed!==null&&owed>0?1:0)+(first&&!firstOk?1:0)}}
function name(s){return (s.preferred_name||s.first_name)+' '+s.last_name}
function render(){if(!state.org)return;const aTeams=activeTeams(),aEnroll=activeEnrollments(),selectedStudentIds=new Set(aEnroll.map(e=>e.student_id)),aStudents=state.students.filter(s=>selectedStudentIds.has(s.id));$('membership-label').textContent=state.org.name+' · '+state.role+' access';document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',state.role!=='admin'));$('count-students').textContent=aStudents.length;$('count-teams').textContent=aTeams.length;$('count-enrollments').textContent=aEnroll.length;$('count-not-ready').textContent=aEnroll.reduce((sum,e)=>sum+enrollmentStatus(e).outstanding,0);$('overview-info').textContent=aTeams.length?aTeams.map(t=>t.name+' ('+aEnroll.filter(e=>e.team_id===t.id).length+' students)').join(' · '):'No teams yet. Add your first team in the Teams tab.';const selection=$('team-filter').value;$('team-filter').innerHTML=option('','All teams')+aTeams.map(t=>option(t.id,t.name,t.id===selection)).join('');$('team-table').innerHTML=aTeams.map(t=>'<tr><td>'+escapeHtml(t.name)+'</td><td>'+escapeHtml(t.program)+'</td><td>'+escapeHtml(t.team_number||'—')+'</td><td>'+aEnroll.filter(e=>e.team_id===t.id).length+'</td><td><button class="small secondary admin-only" data-action="edit-team" data-id="'+t.id+'">Edit season</button></td></tr>').join('');$('team-empty').textContent=aTeams.length?'':'No teams for this season. Add an existing team from the permanent catalog or create a new one.';
$('team-catalog-section').classList.toggle('hidden',!state.teamMode);
$('team-add-existing').classList.toggle('hidden',!state.teamMode);
$('team-catalog-table').innerHTML=state.teamCatalog.map(c=>{
 const seasons=state.teams.filter(t=>t.catalog_team_id===c.id).map(t=>state.seasons.find(x=>x.id===t.season_id)?.name).filter(Boolean).sort();
 return '<tr><td>'+escapeHtml(c.name)+'</td><td>'+escapeHtml(c.program)+'</td><td>'+escapeHtml(c.team_number||'—')+'</td><td>'+escapeHtml(seasons.join(', ')||'Not assigned')+'</td><td><button class="small secondary admin-only" data-action="edit-catalog-team" data-id="'+c.id+'">Edit</button></td></tr>';
}).join('');
$('team-catalog-empty').textContent=state.teamMode&&!state.teamCatalog.length?'No permanent teams yet. Create your first team above.':'';
const search=$('student-search').value.toLowerCase(),teamFilter=$('team-filter').value;const matching=state.students.filter(s=>{const enroll=aEnroll.filter(e=>e.student_id===s.id&&(teamFilter===''||e.team_id===teamFilter));return enroll.length&&name(s).toLowerCase().includes(search)});$('student-table').innerHTML=matching.map(s=>{const enr=aEnroll.filter(e=>e.student_id===s.id&&(teamFilter===''||e.team_id===teamFilter));const status=enr.map(enrollmentStatus);return '<tr><td>'+escapeHtml(name(s))+'</td><td>'+escapeHtml(enr.map(e=>state.teams.find(t=>t.id===e.team_id)?.name||'').join(', '))+'</td><td>'+escapeHtml(status.map(x=>x.forms).join(', '))+'</td><td>'+escapeHtml(status.map(x=>x.dues).join(', '))+'</td><td>'+escapeHtml(status.map(x=>x.first).join(', '))+'</td><td><button class="small secondary" data-action="student-detail" data-id="'+s.id+'">Manage</button></td></tr>'}).join('');$('student-empty').textContent=matching.length?'':'No students match this season and team filter.';const rs=state.requirementsMode?state.seasonRules.filter(r=>r.season_id===state.season):state.requirements.filter(r=>r.season_id===state.season);
$('requirements-mode').textContent=state.requirementsMode?'Catalog and annual assignments enabled.':'Migration pending. Follow the README to activate the catalog.';
$('requirements-actions').classList.toggle('hidden',!state.requirementsMode);
$('requirement-table').innerHTML=rs.map(r=>'<tr><td>'+escapeHtml(r.display_name||r.name)+'</td><td>'+escapeHtml(r.requirement_type)+'</td><td>'+escapeHtml(state.requirementsMode?(r.scope==='all'?'All teams':r.scope==='program'?r.program:state.teams.find(t=>t.id===r.team_id)?.name||'Team'):r.program||'All programs')+'</td><td>'+(r.is_required?'Yes':'No')+'</td><td>'+escapeHtml(state.requirementsMode?(r.is_active?'Active':'Archived'):'Legacy')+'</td><td>'+(state.requirementsMode?'<button class="small secondary admin-only" data-action="edit-requirement" data-id="'+r.id+'">Edit assignment</button>':'')+'</td></tr>').join('');
$('requirement-empty').textContent=rs.length?'':'No requirements for this season.';
$('definition-table').innerHTML=state.definitions.map(d=>'<tr><td>'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.requirement_type)+'</td><td>'+(d.is_active?'Active':'Archived')+'</td><td><button class="small secondary admin-only" data-action="edit-definition" data-id="'+d.id+'">Edit catalog</button></td></tr>').join('');
$('definition-empty').textContent=state.requirementsMode&&!state.definitions.length?'No catalog entries yet.':'';
$('tab-families-nav').classList.toggle('hidden',state.role!=='admin'||!state.familyMode);
$('families-info').textContent=state.familyMode?
 'Permanent contact records shared across seasons. Only administrators can access these records.':
 'Activate the Student and Households database migration to manage family contacts.';
$('household-table').innerHTML=state.familyHouseholds.map(h=>{
 const children=state.studentHouseholds.filter(link=>link.household_id===h.id).length;
 return '<tr><td>'+escapeHtml(h.display_name)+'</td><td>'+escapeHtml([h.city,h.state_region].filter(Boolean).join(', '))+'</td><td>'+children+'</td><td><button class="small secondary admin-only" data-action="household-detail" data-id="'+h.id+'">Manage</button></td></tr>';
}).join('');
$('household-empty').textContent=state.familyHouseholds.length?'':'No households yet.';
$('guardian-table').innerHTML=state.familyGuardians.map(g=>{
 const links=state.studentGuardians.filter(link=>link.guardian_id===g.id).length;
 return '<tr><td>'+escapeHtml(guardianName(g))+'</td><td>'+escapeHtml(g.email||'—')+'</td><td>'+links+'</td><td><button class="small secondary admin-only" data-action="guardian-detail" data-id="'+g.id+'">Manage</button></td></tr>';
}).join('');
$('guardian-empty').textContent=state.familyGuardians.length?'':'No guardians yet.';
document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',state.role!=='admin'));$('team-add-existing').classList.toggle('hidden',state.role!=='admin'||!state.teamMode)}
async function fetchData(){const org=state.org.id;const queries=[['seasons',state.api.from('seasons').select('*').eq('organization_id',org).order('name',{ascending:false})],['teams',state.api.from('teams').select('*').eq('organization_id',org).order('name')],['students',state.api.from('students').select('*').eq('organization_id',org).order('last_name')],['enrollments',state.api.from('team_enrollments').select('*').eq('organization_id',org)],['requirements',state.api.from('requirements').select('*').eq('organization_id',org)],['studentRequirements',state.api.from('student_requirements').select('*').eq('organization_id',org)],['dues',state.api.from('student_dues').select('*').eq('organization_id',org)],['first',state.api.from('first_registrations').select('*').eq('organization_id',org)]];const results=await Promise.all(queries.map(async ([key,q])=>[key,check(await q.limit(1000))]));for(const [key,data]of results)state[key]=data;
const [defs,rules]=await Promise.all([
 state.api.from('requirement_definitions').select('*').eq('organization_id',org).limit(1000),
 state.api.from('season_requirements').select('*').eq('organization_id',org).limit(1000)]);
if(!defs.error&&!rules.error){
 state.definitions=defs.data||[];state.seasonRules=rules.data||[];state.requirementsMode=true;
}else{
 const missing=['PGRST205','42P01','PGRST204'];
 const unexpected=[defs.error,rules.error].find(err=>err&&!missing.includes(err.code));
 if(unexpected)throw unexpected;
 state.definitions=[];state.seasonRules=[];state.requirementsMode=false;
}
const catalog=await state.api.from('team_catalog').select('*').eq('organization_id',org).order('name').limit(1000);
if(!catalog.error){state.teamCatalog=catalog.data||[];state.teamMode=true;}
else if(['PGRST205','42P01','PGRST204'].includes(catalog.error.code)){
 state.teamCatalog=[];state.teamMode=false;
}else throw catalog.error;
if(state.role==='admin'){
 const names=[
  ['studentContacts','student_contact_profiles'],
  ['familyHouseholds','family_households'],
  ['familyGuardians','family_guardians'],
  ['studentHouseholds','student_household_links'],
  ['householdGuardians','household_guardian_links'],
  ['studentGuardians','student_guardian_links']
 ];
 const requests=await Promise.all(names.map(async ([key,table])=>({key,result:await state.api.from(table).select('*').eq('organization_id',org).limit(1000)})));
 const missing=['PGRST205','42P01','PGRST204'];
 const absent=requests.every(x=>x.result.error&&missing.includes(x.result.error.code));
 if(absent){
  state.familyMode=false;
  for(const {key} of requests)state[key]=[];
 }else{
  for(const {key,result} of requests){
   if(result.error)throw result.error;
   state[key]=result.data||[];
  }
  state.familyMode=true;
 }
}else{
 state.familyMode=false;
 for(const key of ['studentContacts','familyHouseholds','familyGuardians','studentHouseholds','householdGuardians','studentGuardians'])state[key]=[];
}
const previous=state.season;state.season=state.seasons.some(s=>s.id===previous)?previous:(state.seasons.find(s=>s.is_active)||state.seasons[0])?.id||null;$('season-filter').innerHTML=state.seasons.map(s=>option(s.id,s.name,s.id===state.season)).join('');render()}
async function begin(){message();try{const {data:{user},error}=await state.api.auth.getUser();if(error)throw error;if(!user){display('login');return}state.user=user;const memberships=check(await state.api.from('memberships').select('organization_id,role').eq('user_id',user.id));if(!memberships.length)throw Error('Your account has no organization membership. Ask an administrator to grant access.');const membership=memberships[0];const orgs=check(await state.api.from('organizations').select('id,name').eq('id',membership.organization_id).single());state.org=orgs;state.role=membership.role;$('who').textContent=user.email;display('workspace');await fetchData()}catch(err){display('login');message(err.message)}}
function modal(title,html){$('modal-title').textContent=title;$('modal-content').innerHTML=html;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden');$('modal-content').replaceChildren()}
function actions(){return '<div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button type="submit">Save</button></div>'}
function field(label,id,value='',required=false){return '<label>'+escapeHtml(label)+'<input name="'+id+'" value="'+escapeHtml(value)+'"'+(required?' required':'')+'></label>'}
function catalogTeamForm(id){
 requireAdmin();if(!state.teamMode)throw Error('Apply the permanent team database migration first.');
 const c=state.teamCatalog.find(x=>x.id===id);
 if(!c)throw Error('Permanent team not found.');
 const hasHistory=state.teams.some(x=>x.catalog_team_id===c.id);
 const html='<p class="muted">This information identifies the team across seasons. Change a season-specific name through Edit season instead.</p>'
 +'<form id="catalog-team-form"><div class="form-grid">'
 +field('Current team name','name',c.name,true)
 +field('Registration number','team_number',c.team_number)
 +'<label>Program<select name="program" '+(hasHistory?'disabled':'')+'>'+['FRC','FTC','FLL Challenge','FLL Explore','Other'].map(x=>option(x,x,x===c.program)).join('')+'</select></label>'
 +'<label>Catalog status<select name="is_active">'+option('true','Active',c.is_active)+option('false','Inactive',!c.is_active)+'</select></label>'
 +'</div>'+(hasHistory?'<p class="muted note">Program is locked to preserve the team identity and historical reports. The number can be corrected, and past season snapshots remain unchanged.</p>':'')
 +actions()+'</form>';
 modal('Edit permanent team',html);
 $('catalog-team-form').onsubmit=e=>saveForm(e,async f=>{
  const nm=f.get('name').trim(),number=f.get('team_number').trim()||null;
  if(!nm)throw Error('Enter a team name.');
  check(await state.api.from('team_catalog').update({
   name:nm,team_number:number,program:hasHistory?c.program:f.get('program'),
   is_active:f.get('is_active')==='true'
  }).eq('id',c.id).eq('organization_id',state.org.id));
 });
}
function addExistingTeamForm(){
 requireAdmin();if(!state.teamMode)throw Error('Apply the permanent team migration first.');
 const assigned=new Set(activeTeams().map(t=>t.catalog_team_id));
 const available=state.teamCatalog.filter(c=>c.is_active&&!assigned.has(c.id));
 if(!available.length)throw Error('All active catalog teams are already in this season. Create a new permanent team if needed.');
 const html='<p class="muted">Choose a permanent team to participate this season. Its prior years remain unchanged.</p>'
 +'<form id="existing-team-form"><label>Permanent team<select name="catalog_id">'
 +available.map(c=>option(c.id,(c.team_number?c.team_number+' · ':'')+c.name+' ('+c.program+')')).join('')
 +'</select></label><label>Season team name (optional override)<input name="season_name" placeholder="Leave blank to use the current name"></label>'
 +actions()+'</form>';
 modal('Add existing team to season',html);
 $('existing-team-form').onsubmit=e=>saveForm(e,async f=>{
  const c=available.find(x=>x.id===f.get('catalog_id'));
  if(!c)throw Error('Select a team not yet in this season.');
  const n=f.get('season_name').trim()||c.name;
  check(await state.api.from('teams').insert({
   organization_id:state.org.id,season_id:state.season,catalog_team_id:c.id,
   name:n,program:c.program,team_number:c.team_number,is_active:true
  }));
 });
}
function teamForm(id){
 requireAdmin();
 const t=state.teams.find(x=>x.id===id);
 if(t&&t.season_id!==state.season)throw Error('Team belongs to another season.');
 const catalog=t?teamCatalogRecord(t):null;
 const programs=['FRC','FTC','FLL Challenge','FLL Explore','Other'];
 let html;
 if(state.teamMode&&t){
  html='<p class="muted">Edit the season-specific team name and participation. To change permanent registration information, edit the team in the catalog below.</p>'
   +'<form id="team-form"><div class="form-grid">'
   +field('Team name for this season','name',t.name,true)
   +'<label>Status<select name="is_active">'+option('true','Active',t.is_active)+option('false','Inactive',!t.is_active)+'</select></label>'
   +'</div><p class="muted note">Permanent identity: '+escapeHtml((catalog?.team_number||t.team_number||'Unnumbered')+' · '+(catalog?.program||t.program))+'</p>'
   +actions()+'</form>';
 }else{
  html='<p class="muted">'+(state.teamMode?'Create a new permanent team and assign it to the selected season. To reuse a team from another season, choose Add existing team.':'Create a season team.')+'</p>'
  +'<form id="team-form"><div class="form-grid">'
  +field('Team name','name',t?.name||'',true)
  +field('Team number (optional)','team_number',t?.team_number||'')
  +'<label>Program<select name="program">'+programs.map(p=>option(p,p,p===t?.program)).join('')+'</select></label>'
  +'<label>Status<select name="is_active">'+option('true','Active',t?.is_active!==false)+option('false','Inactive',t?.is_active===false)+'</select></label>'
  +'</div>'+actions()+'</form>';
 }
 modal(t?'Edit team for season':'Create team',html);
 $('team-form').onsubmit=e=>saveForm(e,async f=>{
  const teamName=f.get('name').trim(),isActive=f.get('is_active')==='true';
  if(!teamName)throw Error('Enter a team name.');
  if(state.teamMode&&t){
   check(await state.api.from('teams').update({name:teamName,is_active:isActive})
     .eq('id',t.id).eq('organization_id',state.org.id));
  }else if(state.teamMode){
   const program=f.get('program'),number=f.get('team_number').trim()||null;
   if(number&&state.teamCatalog.some(c=>c.program===program&&
    c.team_number?.trim().toLowerCase()===number.toLowerCase()))
      throw Error('A permanent team with that number and program already exists. Use Add existing team instead.');
   // A two-request operation: if the second step fails, the permanent catalog entry stays available.
   const created=check(await state.api.from('team_catalog').insert({
    organization_id:state.org.id,program,team_number:number,name:teamName,is_active:true
   }).select('id').single());
   check(await state.api.from('teams').insert({
    organization_id:state.org.id,season_id:state.season,catalog_team_id:created.id,
    name:teamName,program,team_number:number,is_active:isActive
   }));
  }else{
   const payload={organization_id:state.org.id,season_id:state.season,
    name:teamName,team_number:f.get('team_number').trim()||null,
    program:f.get('program'),is_active:isActive};
   check(await (t?state.api.from('teams').update(payload).eq('id',id):
    state.api.from('teams').insert(payload)));
  }
 });
}
function householdForm(id){
 familyReady();
 const h=state.familyHouseholds.find(x=>x.id===id);
 if(id&&!h)throw Error('Household not found.');
 const html='<form id="household-form"><div class="form-grid">'
  +field('Household label','display_name',h?.display_name||'',true)
  +field('Address line 1','address_line1',h?.address_line1||'')
  +field('Address line 2','address_line2',h?.address_line2||'')
  +field('City','city',h?.city||'')
  +field('State','state_region',h?.state_region||'')
  +field('Postal code','postal_code',h?.postal_code||'')
  +field('Country','country',h?.country||'US')
  +'</div><label>Administrative notes<textarea name="notes" rows="2">'+escapeHtml(h?.notes||'')+'</textarea></label>'
  +actions()+'</form>';
 modal(h?'Edit household':'Add household',html);
 $('household-form').onsubmit=e=>saveForm(e,async f=>{
  const name=f.get('display_name').trim();
  if(!name)throw Error('Enter a household label.');
  const keys=['address_line1','address_line2','city','state_region','postal_code','country','notes'];
  const payload={display_name:name};
  for(const k of keys)payload[k]=f.get(k).trim()||(k==='country'?'US':null);
  if(h)check(await state.api.from('family_households').update(payload).eq('id',h.id).eq('organization_id',state.org.id));
  else check(await state.api.from('family_households').insert({...payload,organization_id:state.org.id}));
 });
}
function guardianForm(id){
 familyReady();
 const g=state.familyGuardians.find(x=>x.id===id);
 if(id&&!g)throw Error('Guardian not found.');
 const html='<form id="guardian-form"><div class="form-grid">'
  +field('First name','first_name',g?.first_name||'',true)
  +field('Last name','last_name',g?.last_name||'',true)
  +field('Email','email',g?.email||'')
  +field('Phone','phone',g?.phone||'')
  +'</div><label>Administrative notes<textarea name="notes" rows="2">'+escapeHtml(g?.notes||'')+'</textarea></label>'
  +actions()+'</form>';
 modal(g?'Edit guardian':'Add guardian',html);
 $('guardian-form').onsubmit=e=>saveForm(e,async f=>{
  const payload={first_name:f.get('first_name').trim(),last_name:f.get('last_name').trim(),
    email:f.get('email').trim()||null,phone:f.get('phone').trim()||null,
    notes:f.get('notes').trim()||null};
  if(!payload.first_name||!payload.last_name)throw Error('Enter the guardian name.');
  if(g)check(await state.api.from('family_guardians').update(payload).eq('id',g.id).eq('organization_id',state.org.id));
  else check(await state.api.from('family_guardians').insert({...payload,organization_id:state.org.id}));
 });
}
function studentContactForm(id){
 familyReady();
 const st=state.students.find(x=>x.id===id);
 if(!st)throw Error('Student not found.');
 const existing=studentContact(st);
 const html='<p class="muted">Contact details are permanent and do not reset each school year. Birth dates and contact information are visible to administrators only.</p>'
 +'<form id="student-contact-form"><div class="form-grid">'
 +'<label>Date of birth<input type="date" name="birth_date" value="'+escapeHtml(existing?.birth_date||'')+'"></label>'
 +field('Student email','email',existing?.email||'')
 +field('Student mobile','mobile_phone',existing?.mobile_phone||'')
 +field('Mayhem email address','mayhem_email',existing?.mayhem_email||'')
 +'</div>'+actions()+'</form>';
 modal('Contact profile — '+name(st),html);
 $('student-contact-form').onsubmit=e=>saveForm(e,async f=>{
  const payload={organization_id:state.org.id,student_id:id,birth_date:f.get('birth_date')||null,
   email:f.get('email').trim()||null,mobile_phone:f.get('mobile_phone').trim()||null,
   mayhem_email:f.get('mayhem_email').trim()||null,updated_at:new Date().toISOString()};
  check(await state.api.from('student_contact_profiles').upsert(payload,{onConflict:'student_id'}));
 });
}
function familyLinkForm(kind,sourceId){
 familyReady();
 const specs={
  studentHousehold:{table:'student_household_links',source:'student_id',target:'household_id',
   candidates:state.familyHouseholds,existing:state.studentHouseholds,
   label:h=>familyLabel(h),title:'Link student to household'},
  householdStudent:{table:'student_household_links',source:'household_id',target:'student_id',
   candidates:state.students,existing:state.studentHouseholds,
   label:st=>name(st),title:'Add student to household'},
  studentGuardian:{table:'student_guardian_links',source:'student_id',target:'guardian_id',
   candidates:state.familyGuardians,existing:state.studentGuardians,
   label:g=>guardianName(g),title:'Link guardian to student'},
  guardianStudent:{table:'student_guardian_links',source:'guardian_id',target:'student_id',
   candidates:state.students,existing:state.studentGuardians,
   label:st=>name(st),title:'Link guardian to student'},
  householdGuardian:{table:'household_guardian_links',source:'household_id',target:'guardian_id',
   candidates:state.familyGuardians,existing:state.householdGuardians,
   label:g=>guardianName(g),title:'Add guardian to household'},
  guardianHousehold:{table:'household_guardian_links',source:'guardian_id',target:'household_id',
   candidates:state.familyHouseholds,existing:state.householdGuardians,
   label:h=>familyLabel(h),title:'Add guardian to household'}
 };
 const config=specs[kind];if(!config)throw Error('Unknown relationship type.');
 const unavailable=new Set(config.existing.filter(link=>link[config.source]===sourceId).map(link=>link[config.target]));
 const available=config.candidates.filter(c=>!unavailable.has(c.id));
 if(!available.length)throw Error('There are no additional records to link. Create the relevant student, household, or guardian first.');
 const extra=config.table==='student_guardian_links'?
  '<label>Relationship (optional)<input name="relationship" placeholder="Parent, guardian, other"></label>'
  +'<label class="inline"><input type="checkbox" name="is_primary_contact" value="yes"> Primary contact</label>'
  +'<label class="inline"><input type="checkbox" name="emergency_contact" value="yes"> Emergency contact</label>'
  :config.table==='student_household_links'?
  '<label class="inline"><input type="checkbox" name="is_primary" value="yes"> Primary household (only one per student)</label>':'';
 const html='<form id="family-link-form"><label>Select existing record<select name="target">'
 +available.map(c=>option(c.id,config.label(c))).join('')+'</select></label>'
 +extra+actions()+'</form>';
 modal(config.title,html);
 $('family-link-form').onsubmit=e=>saveForm(e,async f=>{
  const targetId=f.get('target');
  if(!available.some(x=>x.id===targetId))throw Error('Select an available record.');
  const payload={organization_id:state.org.id,[config.source]:sourceId,[config.target]:targetId};
  if(config.table==='student_household_links'){
   payload.is_primary=f.get('is_primary')==='yes';
   if(payload.is_primary){
    const studentId=payload.student_id;
    if(state.studentHouseholds.some(link=>link.student_id===studentId&&link.is_primary))
     throw Error('This student already has a primary household. Add this as a secondary household.');
   }
  }
  if(config.table==='student_guardian_links'){
   payload.relationship=f.get('relationship').trim()||null;
   payload.is_primary_contact=f.get('is_primary_contact')==='yes';
   payload.emergency_contact=f.get('emergency_contact')==='yes';
  }
  check(await state.api.from(config.table).insert(payload));
 });
}
function confirmFamilyUnlink(kind,id){
 familyReady();
 const targets={
  sh:'student_household_links',sg:'student_guardian_links',hg:'household_guardian_links'
 };
 const table=targets[kind];if(!table)throw Error('Unknown relationship.');
 const html='<p>Remove this relationship? This does not delete the student, guardian, or household.</p>'
 +'<form id="unlink-form">'+actions().replace('>Save</button>','>Remove relationship</button>')+'</form>';
 modal('Remove relationship',html);
 $('unlink-form').onsubmit=e=>saveForm(e,async f=>{
  check(await state.api.from(table).delete().eq('id',id).eq('organization_id',state.org.id));
 });
}
function householdDetail(id){
 familyReady();
 const h=state.familyHouseholds.find(x=>x.id===id);
 if(!h)throw Error('Household not found.');
 const children=state.studentHouseholds.filter(x=>x.household_id===id);
 const adults=state.householdGuardians.filter(x=>x.household_id===id);
 let html='<div class="bar"><h3>'+escapeHtml(h.display_name)+'</h3>'
  +'<button class="small secondary admin-only" data-action="edit-household" data-id="'+h.id+'">Edit address</button></div>'
  +'<p class="muted">'+escapeHtml([h.address_line1,h.address_line2,h.city,h.state_region,h.postal_code].filter(Boolean).join(', ')||'No address recorded')+'</p>'
  +'<div class="section"><div class="bar"><h3>Students</h3><button class="small secondary admin-only" data-action="link-household-student" data-id="'+h.id+'">+ Add existing student</button></div>'
  +children.map(link=>{const st=state.students.find(x=>x.id===link.student_id);
   return '<div class="bar"><span>'+escapeHtml(st?name(st):'Unknown student')+(link.is_primary?' (primary)':'')+'</span><button class="small secondary" data-action="unlink-sh" data-id="'+link.id+'">Unlink</button></div>';
  }).join('')+'</div>'
  +'<div class="section"><div class="bar"><h3>Guardians</h3><button class="small secondary admin-only" data-action="link-household-guardian" data-id="'+h.id+'">+ Add existing guardian</button></div>'
  +adults.map(link=>{const g=state.familyGuardians.find(x=>x.id===link.guardian_id);
   return '<div class="bar"><span>'+escapeHtml(g?guardianName(g):'Unknown guardian')+'</span><button class="small secondary" data-action="unlink-hg" data-id="'+link.id+'">Unlink</button></div>';
  }).join('')+'</div>';
 modal('Household',html);
}
function guardianDetail(id){
 familyReady();
 const g=state.familyGuardians.find(x=>x.id===id);
 if(!g)throw Error('Guardian not found.');
 const students=state.studentGuardians.filter(x=>x.guardian_id===id);
 const homes=state.householdGuardians.filter(x=>x.guardian_id===id);
 let html='<div class="bar"><h3>'+escapeHtml(guardianName(g))+'</h3>'
  +'<button class="small secondary admin-only" data-action="edit-guardian" data-id="'+g.id+'">Edit contact</button></div>'
  +'<p class="muted">'+escapeHtml([g.email,g.phone].filter(Boolean).join(' · ')||'No contact details recorded')+'</p>'
  +'<div class="section"><div class="bar"><h3>Students</h3><button class="small secondary admin-only" data-action="link-guardian-student" data-id="'+g.id+'">+ Link student</button></div>'
  +students.map(link=>{const st=state.students.find(x=>x.id===link.student_id);
   return '<div class="bar"><span>'+escapeHtml(st?name(st):'Unknown student')+(link.relationship?' · '+escapeHtml(link.relationship):'')+'</span><button class="small secondary" data-action="unlink-sg" data-id="'+link.id+'">Unlink</button></div>';
  }).join('')+'</div>'
  +'<div class="section"><div class="bar"><h3>Households</h3><button class="small secondary admin-only" data-action="link-guardian-household" data-id="'+g.id+'">+ Link household</button></div>'
  +homes.map(link=>{const h=state.familyHouseholds.find(x=>x.id===link.household_id);
   return '<div class="bar"><span>'+escapeHtml(h?h.display_name:'Unknown household')+'</span><button class="small secondary" data-action="unlink-hg" data-id="'+link.id+'">Unlink</button></div>';
  }).join('')+'</div>';
 modal('Guardian',html);
}
function studentForm(id){requireAdmin();const s=state.students.find(x=>x.id===id), available=activeTeams();if(!s&&!available.length)throw Error('Create a team before adding students.');const teamField=s?'':'<label class="wide">Initial team<select name="initial_team">'+available.map(t=>option(t.id,t.name)).join('')+'</select></label>';const html='<form id="student-form"><div class="form-grid">'+field('First name','first_name',s?.first_name,true)+field('Last name','last_name',s?.last_name,true)+field('Preferred name (optional)','preferred_name',s?.preferred_name)+'<label>Status<select name="is_active">'+option('true','Active',s?.is_active!==false)+option('false','Inactive',s?.is_active===false)+'</select></label>'+teamField+'</div>'+actions()+'</form>';modal(s?'Edit student':'Add student',html);$('student-form').onsubmit=e=>saveForm(e,async f=>{const payload={organization_id:state.org.id,first_name:f.get('first_name').trim(),last_name:f.get('last_name').trim(),preferred_name:f.get('preferred_name').trim()||null,is_active:f.get('is_active')==='true'};if(s){check(await state.api.from('students').update(payload).eq('id',id))}else{const created=check(await state.api.from('students').insert(payload).select('id').single());check(await state.api.from('team_enrollments').insert({organization_id:state.org.id,student_id:created.id,team_id:f.get('initial_team'),status:'active'}))}})}
function seasonForm(){
 requireAdmin();
 const current=state.seasons.find(s=>s.id===state.season);
 const match=/^(\d{4})-(\d{4})$/.exec(current?.name||'');
 const suggested=match?Number(match[2])+'-'+(Number(match[2])+1):'';
 const templates=state.seasons.filter(s=>s.id!=null);
 const html='<p class="muted">Create a school-year season. Select which existing teams participate in the new season; no permanent team identities are copied.</p>'
 +'<form id="season-form">'
 +'<label>New school-year season (YYYY-YYYY)<input name="name" required pattern="[0-9]{4}-[0-9]{4}" value="'+escapeHtml(suggested)+'"></label>'
 +'<label>Copy setup from<select name="source">'+option('','Start empty')+templates.map(t=>option(t.id,t.name,t.id===state.season)).join('')+'</select></label>'
 +'<div id="season-copy-teams"></div>'
 +'<label class="inline"><input type="checkbox" name="copy_students" value="yes"> Carry over students from selected teams as pending enrollments</label>'
 +'<p class="muted note">Requirements are copied as new annual assignments. Completed forms, payment and FIRST status are NOT copied. Selecting a team reuses its permanent identity; its historical season roster remains unchanged.</p>'
 +actions()+'</form>';
 modal('Create school-year season',html);
 const form=$('season-form');
 function updateTeams(){
  const source=form.elements.source.value;
  const teams=state.teams.filter(t=>t.season_id===source);
  $('season-copy-teams').innerHTML=source?('<fieldset><legend>Teams participating in new season</legend>'
   +(teams.length?teams.map(t=>'<label class="inline"><input type="checkbox" name="copy_team" value="'+escapeHtml(t.id)+'" '+(t.is_active?'checked':'')+'> '+escapeHtml(teamLabel(t))+' ('+escapeHtml(t.program)+')</label>').join(''):'<p class="muted">No teams in source season. You can add existing teams afterward.</p>')
   +'</fieldset>'):'<p class="muted">Start empty: add existing permanent teams afterward from the Teams tab.</p>';
 }
 form.elements.source.onchange=updateTeams;updateTeams();
 form.onsubmit=e=>saveForm(e,async f=>{
  const seasonName=f.get('name').trim(),m=/^(\d{4})-(\d{4})$/.exec(seasonName);
  if(!m||Number(m[2])!==Number(m[1])+1)throw Error('Use a consecutive school year such as 2027-2028.');
  if(state.seasons.some(x=>x.name===seasonName))throw Error('That season already exists.');
  const sourceId=f.get('source'),selectedTeamIds=new Set(f.getAll('copy_team'));
  if(f.get('copy_students')&&!sourceId)throw Error('Choose a source season before carrying over students.');
  if(f.get('copy_students')&&!selectedTeamIds.size)throw Error('Select participating teams before carrying over students.');
  const created=check(await state.api.from('seasons').insert({
   organization_id:state.org.id,name:seasonName,is_active:false
  }).select('id').single());
  state.season=created.id;
  if(sourceId){
   const mapping=new Map();
   for(const t of state.teams.filter(t=>t.season_id===sourceId&&selectedTeamIds.has(t.id))){
    const c=state.teamMode?teamCatalogRecord(t):null;
    if(state.teamMode&&!c)throw Error('A source team has no permanent identity; check the migration.');
    const payload={organization_id:state.org.id,season_id:created.id,name:t.name,
     program:t.program,team_number:t.team_number,is_active:true};
    if(state.teamMode)payload.catalog_team_id=c.id;
    const newer=check(await state.api.from('teams').insert(payload).select('id').single());
    mapping.set(t.id,newer.id);
   }
   if(state.requirementsMode){
    for(const r of state.seasonRules.filter(r=>r.season_id===sourceId&&r.is_active)){
     const targetTeam=r.scope==='team'?mapping.get(r.team_id):null;
     if(r.scope==='team'&&!targetTeam)continue;
     check(await state.api.from('season_requirements').insert({
      organization_id:state.org.id,definition_id:r.definition_id,season_id:created.id,
      scope:r.scope,program:r.scope==='program'?r.program:null,
      team_id:r.scope==='team'?targetTeam:null,display_name:r.display_name,
      description:r.description,requirement_type:r.requirement_type,
      is_required:r.is_required,is_active:true
     }));
    }
   }else{
    for(const rr of state.requirements.filter(rr=>rr.season_id===sourceId)){
     check(await state.api.from('requirements').insert({
      organization_id:state.org.id,season_id:created.id,name:rr.name,
      description:rr.description,program:rr.program,requirement_type:rr.requirement_type,
      is_required:rr.is_required
     }));
    }
   }
   if(f.get('copy_students')){
    for(const enrollment of state.enrollments.filter(x=>mapping.has(x.team_id)&&x.status!=='withdrawn')){
     check(await state.api.from('team_enrollments').insert({
      organization_id:state.org.id,team_id:mapping.get(enrollment.team_id),
      student_id:enrollment.student_id,status:'pending'
     }));
    }
   }
  }
 });
}
function definitionForm(id){
 requireAdmin();
 if(!state.requirementsMode)throw Error('Run the catalog migration first.');
 const d=id?state.definitions.find(x=>x.id===id):null;
 if(id&&!d)throw Error('Catalog item not found.');
 const assigned=d?state.seasonRules.some(r=>r.definition_id===d.id):false;
 const content='<p class="muted">'+(d?'Changes to the catalog name and description do not alter past season assignments.':'Catalog items are reusable across seasons.')+'</p><form id="definition-form">'
 +field('Requirement name','name',d?.name||'',true)
 +'<label>Type<select name="requirement_type" '+(assigned?'disabled':'')+'>'+['form','registration','other'].map(t=>option(t,t,d?.requirement_type===t)).join('')+'</select></label>'
 +'<label>Description<textarea name="description" rows="3">'+escapeHtml(d?.description||'')+'</textarea></label>'
 +(d?'<label>Status<select name="is_active">'+option('true','Active',d.is_active)+option('false','Archived',!d.is_active)+'</select></label>':'')
 + (assigned?'<p class="muted note">Type is locked because this requirement has annual assignments.</p>':'')
 + actions()+'</form>';
 modal(d?'Edit catalog requirement':'Add requirement to catalog',content);
 $('definition-form').onsubmit=e=>saveForm(e,async f=>{
 const title=f.get('name').trim(),kind=assigned?d.requirement_type:f.get('requirement_type');
 if(!title)throw Error('Enter a requirement name.');
 const key=title.toLowerCase()+':'+kind;
 if(state.definitions.some(x=>x.id!==d?.id&&x.canonical_key===key))throw Error('This catalog name and type already exist.');
 const payload={name:title,canonical_key:key,requirement_type:kind,description:f.get('description').trim()||null};
 if(d){
  payload.is_active=f.get('is_active')==='true';
  check(await state.api.from('requirement_definitions').update(payload).eq('id',d.id).eq('organization_id',state.org.id));
 }else{
  check(await state.api.from('requirement_definitions').insert({...payload,organization_id:state.org.id}));
 }
 });
}
function requirementForm(id){
 requireAdmin();
 if(!state.requirementsMode)throw Error('Run the migration first.');
 const r=id?state.seasonRules.find(x=>x.id===id&&x.season_id===state.season):null;
 if(id&&!r)throw Error('Season requirement not found.');
 if(!r&&!state.definitions.some(d=>d.is_active))throw Error('Add a catalog requirement first.');
 const previouslyUsed=r&&state.studentRequirements.some(sr=>sr.season_requirement_id===r.id);
 const defs=r?state.definitions.filter(d=>d.is_active||d.id===r.definition_id):state.definitions.filter(d=>d.is_active);
 const content='<p class="muted">'+(r?'This changes only the selected season assignment, not the reusable catalog or other seasons.':'Applies to the selected school year only. Completion starts pending.')+'</p>'
 +'<form id="requirement-form"><label>Catalog requirement<select name="definition_id" '+(r?'disabled':'')+'>'
 +defs.map(d=>option(d.id,d.name,d.id===r?.definition_id)).join('')+'</select></label>'
 +field('Name shown for this season','display_name',r?.display_name||'',Boolean(r))
 +'<label>Description for this season<textarea name="description" rows="3">'+escapeHtml(r?.description||'')+'</textarea></label>'
 +'<label>Applies to<select name="scope" '+(previouslyUsed?'disabled':'')+'>'+option('all','All teams',r?.scope==='all')+option('program','Program',r?.scope==='program')+option('team','Specific team',r?.scope==='team')+'</select></label>'
 +'<label>Program (when applicable)<select name="program" '+(previouslyUsed?'disabled':'')+'>'+['FRC','FTC','FLL Challenge','FLL Explore','Other'].map(p=>option(p,p,r?.program===p)).join('')+'</select></label>'
 +'<label>Team (when applicable)<select name="team_id" '+(previouslyUsed?'disabled':'')+'>'+activeTeams().map(t=>option(t.id,t.name,t.id===r?.team_id)).join('')+'</select></label>'
 +'<label>Required<select name="is_required">'+option('true','Yes',r?.is_required!==false)+option('false','Optional',r?.is_required===false)+'</select></label>'
 +(r?'<label>Status<select name="is_active" '+(previouslyUsed?'disabled':'')+'>'+option('true','Active',r.is_active)+option('false','Archived',!r.is_active)+'</select></label>':'')
 +(previouslyUsed?'<p class="muted note">This requirement has student completion records. Its catalog item, scope, and active status are locked to protect existing tracking.</p>':'')
 +actions()+'</form>';
 modal(r?'Edit season assignment':'Assign requirement to season',content);
 const titleInput=$('requirement-form').querySelector('[name="display_name"]');
 const definitionSelect=$('requirement-form').querySelector('[name="definition_id"]');
 if(!r&&titleInput&&definitionSelect){
  titleInput.value=defs.find(x=>x.id===definitionSelect.value)?.name||'';
  definitionSelect.onchange=()=>{titleInput.value=defs.find(x=>x.id===definitionSelect.value)?.name||'';};
 }
 $('requirement-form').onsubmit=e=>saveForm(e,async f=>{
 const d=state.definitions.find(x=>x.id===(r?r.definition_id:f.get('definition_id')));
 const scope=previouslyUsed?r.scope:f.get('scope');
 const displayName=f.get('display_name').trim();
 if(!d||!displayName)throw Error('Select a catalog requirement and enter a season name.');
 const team=scope==='team'?activeTeams().find(t=>t.id===(previouslyUsed?r.team_id:f.get('team_id'))):null;
 if(scope==='team'&&!team)throw Error('Select a team for this season.');
 const payload={
  scope,program:scope==='program'?(previouslyUsed?r.program:f.get('program')):null,
  team_id:scope==='team'?team.id:null,
  display_name:displayName,description:f.get('description').trim()||null,
  is_required:f.get('is_required')==='true'
 };
 if(r){
  payload.is_active=previouslyUsed?r.is_active:f.get('is_active')==='true';
  check(await state.api.from('season_requirements').update(payload).eq('id',r.id).eq('organization_id',state.org.id));
 }else{
  check(await state.api.from('season_requirements').insert({
   ...payload,organization_id:state.org.id,definition_id:d.id,season_id:state.season,
   requirement_type:d.requirement_type,is_active:true
  }));
 }
 });
}
function returningStudentForm(){
 requireAdmin();
 if(!activeTeams().length)throw Error('Add a participating team in this season before enrolling students.');
 const available=state.students.filter(s=>s.is_active);
 if(!available.length)throw Error('There are no existing students to enroll. Add a new student first.');
 const html='<p class="muted">Reuse the permanent student record. You can enroll someone in another team in this season, or a different team in a later season.</p>'
 +'<form id="returning-form"><label>Returning student<select name="student_id">'
 +available.sort((a,b)=>name(a).localeCompare(name(b))).map(x=>option(x.id,name(x))).join('')+'</select></label>'
 +'<label>New season team<select name="team_id">'+activeTeams().map(t=>option(t.id,teamLabel(t))).join('')+'</select></label>'
 +'<label>Enrollment status<select name="status">'+option('pending','Pending re-enrollment',true)+option('active','Confirmed / active')+'</select></label>'
 +actions()+'</form>';
 modal('Enroll existing student',html);
 $('returning-form').onsubmit=e=>saveForm(e,async f=>{
  const s=state.students.find(x=>x.id===f.get('student_id')),
   t=activeTeams().find(x=>x.id===f.get('team_id'));
  if(!s||!t)throw Error('Select a valid student and team.');
  if(state.enrollments.some(x=>x.student_id===s.id&&x.team_id===t.id))
   throw Error('This student already has an enrollment on the selected team. Open the existing enrollment to change their status.');
  check(await state.api.from('team_enrollments').insert({
   organization_id:state.org.id,student_id:s.id,team_id:t.id,status:f.get('status')
  }));
 });
}
function studentDetail(id){
 const st=state.students.find(x=>x.id===id);if(!st)return;
 const current=state.enrollments.filter(e=>e.student_id===id&&activeTeams().some(t=>t.id===e.team_id));
 const available=activeTeams().filter(t=>!current.some(e=>e.team_id===t.id));
 let html='<div class="bar"><div><h3>'+escapeHtml(name(st))+'</h3><div class="muted note">'+(st.is_active?'Active':'Inactive')+'</div></div>'
  +'<button class="secondary small admin-only" data-action="edit-student" data-id="'+id+'">Edit student</button></div>';
 html+='<div class="section"><h3>Team assignments — selected season</h3>'
  +current.map(e=>{
   const t=state.teams.find(x=>x.id===e.team_id);
   return '<div class="bar"><span>'+escapeHtml(t?teamLabel(t):'Unknown team')+' · '+escapeHtml(e.status)+'</span>'
    +'<button class="small secondary" data-action="enrollment-detail" data-id="'+e.id+'">Registration details</button></div>';
  }).join('');
 if(!current.length)html+='<p class="muted">Not assigned to a team this season.</p>';
 if(available.length&&state.role==='admin')
  html+='<form id="assign-form" class="inline"><label>Add to team<select name="team_id">'
    +available.map(t=>option(t.id,teamLabel(t))).join('')+'</select></label><button>Add</button></form>';
 html+='</div>';
 const history=state.enrollments.filter(e=>e.student_id===id).map(e=>{
  const t=state.teams.find(x=>x.id===e.team_id);
  const season=state.seasons.find(x=>x.id===t?.season_id);
  return {enrollment:e,team:t,season:season?.name||'Unknown'};
 }).sort((a,b)=>b.season.localeCompare(a.season));
 html+='<div class="section"><h3>Participation history</h3>'
  +(history.length?'<div class="overflow"><table><thead><tr><th>Season</th><th>Team number</th><th>Team name</th><th>Status</th></tr></thead><tbody>'
   +history.map(h=>'<tr><td>'+escapeHtml(h.season)+'</td><td>'+escapeHtml(h.team?.team_number||'—')+'</td><td>'+escapeHtml(h.team?.name||'Unknown')+'</td><td>'+escapeHtml(h.enrollment.status)+'</td></tr>').join('')
   +'</tbody></table></div>':'<p class="muted">No participation history yet.</p>')
  +'</div>';
 modal('Student',html);
 if($('assign-form'))$('assign-form').onsubmit=e=>saveForm(e,async f=>{
  check(await state.api.from('team_enrollments').insert({
   organization_id:state.org.id,student_id:id,team_id:f.get('team_id'),status:'active'
  }));
 });
}
function enrollmentDetail(id){const e=state.enrollments.find(x=>x.id===id),t=state.teams.find(x=>x.id===e?.team_id),s=state.students.find(x=>x.id===e?.student_id);if(!e||!t||!s)return;const due=state.dues.find(x=>x.enrollment_id===id),first=state.first.find(x=>x.enrollment_id===id),rs=reqsFor(t);let html='<p>'+escapeHtml(name(s))+' · '+escapeHtml(t.name)+'</p><form id="enrollment-form"><div class="section"><h3>Enrollment</h3><label>Status<select name="status">'+['active','pending','withdrawn'].map(x=>option(x,x,e.status===x)).join('')+'</select></label></div><div class="section"><h3>Forms and requirements</h3>';for(const r of rs){const sr=matchedCompletion(e,r);html+='<label>'+escapeHtml(r.name)+(r.is_required?' *':'')+'<select name="req_'+r.id+'">'+['pending','received','waived','not_applicable'].map(x=>option(x,x.replaceAll('_',' '),sr?.status===x)).join('')+'</select></label>'}if(!rs.length)html+='<p class="muted">No requirements defined for this program and season.</p>';html+='</div><div class="section"><h3>Dues</h3><div class="form-grid"><label>Amount due ($)<input name="amount_due" type="number" min="0" step=".01" value="'+escapeHtml(due?.amount_due??0)+'"></label><label>Amount paid ($)<input name="amount_paid" type="number" min="0" step=".01" value="'+escapeHtml(due?.amount_paid??0)+'"></label><label>Amount waived ($)<input name="amount_waived" type="number" min="0" step=".01" value="'+escapeHtml(due?.amount_waived??0)+'"></label></div></div><div class="section"><h3>FIRST registration</h3><label>Status<select name="first_status">'+['not_started','pending','complete','not_required'].map(x=>option(x,x.replaceAll('_',' '),first?.status===x)).join('')+'</select></label></div>';html+=state.role==='admin'?actions():'<p class="muted">Read-only access</p>';html+='</form>';modal('Registration details',html);if(state.role!=='admin')$('enrollment-form').querySelectorAll('input,select').forEach(el=>el.disabled=true);else $('enrollment-form').onsubmit=ev=>saveForm(ev,async f=>{check(await state.api.from('team_enrollments').update({status:f.get('status')}).eq('id',id));for(const r of rs){const status=f.get('req_'+r.id);const payload={organization_id:state.org.id,enrollment_id:id,status,
 completed_at:status==='received'?new Date().toISOString():null};
 if(state.requirementsMode)payload.season_requirement_id=r.id;else payload.requirement_id=r.id;
 check(await state.api.from('student_requirements').upsert(payload,{
 onConflict:state.requirementsMode?'enrollment_id,season_requirement_id':'enrollment_id,requirement_id'}))}const money=k=>{const n=Number(f.get(k));if(!Number.isFinite(n)||n<0)throw Error('Amounts must be nonnegative numbers.');return n};check(await state.api.from('student_dues').upsert({organization_id:state.org.id,enrollment_id:id,amount_due:money('amount_due'),amount_paid:money('amount_paid'),amount_waived:money('amount_waived')},{onConflict:'enrollment_id'}));check(await state.api.from('first_registrations').upsert({organization_id:state.org.id,enrollment_id:id,status:f.get('first_status'),verified_at:f.get('first_status')==='complete'?new Date().toISOString():null},{onConflict:'enrollment_id'}))})}
async function saveForm(event,fn){event.preventDefault();if(state.role!=='admin')return message('Not authorized.');const button=event.target.querySelector('button[type=submit]');if(button)button.disabled=true;try{await fn(new FormData(event.target));closeModal();await fetchData();message('Saved successfully.',true)}catch(err){message('Save failed: '+err.message)}finally{if(button)button.disabled=false}}
async function init(){const url=localStorage.getItem('mayhem-url'),key=localStorage.getItem('mayhem-key');if(!url||!key){display('setup');return}try{state.api=supabase.createClient(url,key);await begin()}catch(err){display('setup');message(err.message)}}
$('setup-form').onsubmit=async e=>{e.preventDefault();const key=$('project-key').value.trim(),url=$('project-url').value.trim();if(!key.startsWith('sb_publishable_')&&!key.startsWith('eyJ'))return message('Use only a Supabase publishable or legacy anon key.');if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))return message('Enter a Supabase project URL.');localStorage.setItem('mayhem-url',url);localStorage.setItem('mayhem-key',key);await init()};
$('login-form').onsubmit=async e=>{e.preventDefault();message();try{const {error}=await state.api.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error)throw error;$('login-password').value='';await begin()}catch(err){message('Sign in failed: '+err.message)}};
$('signout').onclick=async()=>{await state.api.auth.signOut();state.user=null;state.org=null;state.role=null;display('login');message()};
$('config-button').onclick=()=>{display('setup');$('project-url').value=localStorage.getItem('mayhem-url')||'';$('project-key').value=''};
$('reload').onclick=async()=>{try{await fetchData();message('Updated.',true)}catch(e){message(e.message)}};
$('season-filter').onchange=e=>{state.season=e.target.value;render()};
$('team-filter').onchange=render;$('student-search').oninput=render;
$('close-modal').onclick=closeModal;
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').classList.contains('hidden'))closeModal()});
document.addEventListener('click',e=>{const nav=e.target.closest('[data-tab]');if(nav){setTab(nav.dataset.tab);return}const b=e.target.closest('[data-action]');if(!b)return;try{const a=b.dataset.action,id=b.dataset.id;if(a==='close-modal')closeModal();if(a==='add-team')teamForm();if(a==='add-existing-team')addExistingTeamForm();if(a==='edit-catalog-team')catalogTeamForm(id);if(a==='add-season')seasonForm();if(a==='edit-team')teamForm(id);if(a==='add-student')studentForm();if(a==='returning-student')returningStudentForm();if(a==='edit-student')studentForm(id);if(a==='student-detail')studentDetail(id);if(a==='enrollment-detail')enrollmentDetail(id);if(a==='add-definition')definitionForm();if(a==='edit-definition')definitionForm(id);if(a==='add-requirement')requirementForm();if(a==='edit-requirement')requirementForm(id)}catch(err){message(err.message)}});
init();