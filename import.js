'use strict';
// Mayhem Roster Manager: Step 4 — local workbook preview, reviewed import, CSV export.
// All student workbook contents stay in the browser until the admin explicitly imports.
(function(){
 const $=id=>document.getElementById(id);
 const imp={rows:[],filename:'',sheet:'',header:[],loadedSeason:null,importedIds:new Set()};
 const norm=v=>String(v??'').trim().replace(/\s+/g,' ');
 const key=v=>norm(v).toLocaleLowerCase();
 const yes=v=>['yes','true','y','1','complete','received'].includes(key(v));
 const no=v=>['no','false','n','0','pending','not started'].includes(key(v));
 const safe=v=>escapeHtml(v);
 const headerMap={
  name:'Student Name',category:'Roster Category',followup:'Follow-up Status',
  birth:'Birth Date',email:'Student Email',mobile:'Student Cell',
  mayhemEmail:'Mayhem Email',guardName:'Parent / Guardian',
  guardian1:'Parent 1 Email',guardian1phone:'Parent 1 Cell',
  guardian2name:'Parent 2 Name',guardian2:'Parent 2 Email',guardian2phone:'Parent 2 Cell',
  address:'Address',dues:'Dues Paid',first:'FIRST Registered',
  form1:'Mayhem Release',form2:'WireBelt Release',form3:'Emergency Medical',
  form4:'Media Waiver',form5:'FIRST Release'
 };
 function indexHeaders(arr){
  const headers=arr.map(v=>key(v));
  const get=name=>headers.indexOf(key(name));
  return Object.fromEntries(Object.entries(headerMap).map(([k,v])=>[k,get(v)]));
 }
 function dateValue(value){
  const x=norm(value);if(!x)return null;
  let m=x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|$)/);
  if(!m){const y=x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(y)m=[null,y[3],y[1],y[2]];}
  if(!m)return null;
  const yr=+m[1],mon=+m[2],day=+m[3];
  const d=new Date(Date.UTC(yr,mon-1,day));
  if(d.getUTCFullYear()!==yr||d.getUTCMonth()!==mon-1||d.getUTCDate()!==day)return null;
  return [yr,String(mon).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
 }
 function splitName(x){
  const p=norm(x).split(' ').filter(Boolean);
  if(p.length<2||p.some(v=>v.includes('?'))||p.some(v=>v.length<1))return null;
  return {first:p.slice(0,-1).join(' '),last:p.at(-1)};
 }
 function sourceFingerprint(row){
  const raw=JSON.stringify([imp.filename,imp.sheet,row.line,row.record]);
  let h=2166136261;
  for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0')+'-'+row.line;
 }
 function candidateMatches(row){
  const nm=key(row.record.name);
  return state.students.filter(s=>key([s.first_name,s.last_name].join(' '))===nm||
   key([s.preferred_name||s.first_name,s.last_name].join(' '))===nm);
 }
 function canCreate(row){return !!splitName(row.record.name);}
 function rowStatus(row){
  const r=row.record,notes=[];
  if(!canCreate(row))notes.push('Incomplete or unknown student name');
  if(key(r.category)==='inactive')notes.push('Inactive — never auto-enroll');
  if(key(r.category).includes('prospect'))notes.push('Prospect — profile only');
  if(!r.birth)notes.push('DOB missing');
  else if(!dateValue(r.birth))notes.push('DOB not recognized; review');
  if(r.guardName||r.guardian1||r.guardian2||r.address)
   notes.push('Guardian/household details retained for manual reconciliation');
  if(r.dues)notes.push('Dues paid flag is not a dollar amount');
  const matches=candidateMatches(row);
  if(matches.length>1)notes.push('Ambiguous existing students');
  if(matches.length===1){
   const dob=state.studentContacts.find(c=>c.student_id===matches[0].id)?.birth_date;
   if(dob&&dateValue(r.birth)&&dob!==dateValue(r.birth))
    notes.push('DOB conflicts with existing record — skip until resolved');
  }
  return notes;
 }
 function rowChoices(row,i){
  const matches=candidateMatches(row);
  let html='<select class="import-choice" data-import-row="'+i+'">'+option('skip','Skip (default)');
  if(canCreate(row)&&matches.length===0)html+=option('create','Create new student');
  for(const st of matches)html+=option('match:'+st.id,'Match: '+[st.first_name,st.last_name].join(' '));
  html+='</select>';
  return html;
 }
 function refreshChoices(){
  const team=$('import-team'),current=team.value;
  team.innerHTML=activeTeams().map(t=>option(t.id,t.name+(t.team_number?' · '+t.team_number:''),t.id===current)).join('');
 }
 function previewRender(){
  const tbody=$('import-preview-table');const rows=imp.rows;
  tbody.innerHTML=rows.map((r,i)=>{
   const match=candidateMatches(r),category=r.record.category||'—';
   return '<tr><td>'+r.line+'</td><td>'+safe(r.record.name||'[missing name]')+'</td>'
    +'<td>'+safe(category)+'<div class="muted note">'+safe(r.record.followup||'')+'</div></td>'
    +'<td>'+safe(match.length?match.map(s=>[s.first_name,s.last_name].join(' ')).join(', '):'No exact name match')+'</td>'
    +'<td>'+rowChoices(r,i)+'</td><td class="note">'+safe(rowStatus(r).join(' • ')||'Review before creating')+'</td></tr>';
  }).join('');
  $('import-empty').textContent=rows.length?'':'No importable records found in the Roster sheet.';
  $('import-security').classList.toggle('hidden',!rows.length);
  $('import-authorized').checked=false;
  $('import-save').disabled=true;
  $('import-result').textContent='';
  const cats={};
  rows.forEach(r=>{const c=r.record.category||'Uncategorized';cats[c]=(cats[c]||0)+1;});
  $('import-summary').textContent=rows.length+' roster entries in "'+imp.sheet+'" from '+imp.filename
   +' · '+Object.entries(cats).map(([n,v])=>n+': '+v).join(' · ')
   +'. Nothing has been saved.';
 }
 async function preview(){
  if(state.role!=='admin')throw Error('Administrator access required.');
  const file=$('import-file').files?.[0];if(!file)throw Error('Choose an Excel workbook or CSV first.');
  if(typeof XLSX==='undefined')throw Error('Excel parser did not load; reload the page.');
  if(file.size>12*1024*1024)throw Error('Workbook exceeds the 12 MB preview limit.');
  const suffix=file.name.toLowerCase().split('.').at(-1);
  if(!['xlsx','xls','csv'].includes(suffix))throw Error('Choose an .xlsx, .xls or .csv file.');
  const bytes=await file.arrayBuffer();
  const book=XLSX.read(bytes,{type:'array',cellDates:false,dense:true});
  const sheetName=book.SheetNames.find(n=>key(n)==='roster')||book.SheetNames[0];
  if(!sheetName)throw Error('Workbook has no worksheets.');
  const arr=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,raw:false,defval:''});
  const headerAt=arr.findIndex(row=>row.some(v=>key(v)==='student name')&&row.some(v=>key(v)==='roster category'));
  if(headerAt<0)throw Error('Expected Roster headers not found: Student Name and Roster Category.');
  const fields=indexHeaders(arr[headerAt]);
  const required=['name','category','followup'];for(const n of required)
   if(fields[n]<0)throw Error('Missing expected column: '+headerMap[n]);
  const results=[];
  for(let i=headerAt+1;i<arr.length;i++){
   const cells=arr[i];
   if(!cells.some(v=>norm(v)))continue;
   const record=Object.fromEntries(Object.entries(fields).map(([k,ix])=>[k,ix<0?'':norm(cells[ix])]));
   if(!record.name&&!record.guardName&&!record.guardian1&&!record.guardian2&&!record.category)continue;
   record._extra={};
   const heads=arr[headerAt];
   for(let ci=0;ci<heads.length;ci++){
    const n=norm(heads[ci]);if(n&&cells[ci]!==undefined&&norm(cells[ci])!=='')record._extra[n]=norm(cells[ci]);
   }
   results.push({line:i+1,record});
  }
  if(!results.length)throw Error('No data entries found below the Roster header.');
  imp.rows=results;imp.filename=file.name;imp.sheet=sheetName;imp.header=arr[headerAt];
  imp.loadedSeason=state.season;imp.importedIds.clear();previewRender();
 }
 function example(){
  if(state.role!=='admin')throw Error('Administrator access required.');
  const sample=[
   {name:'Fictional Exampleton',category:'Confirmed Member',followup:'Confirmed',
    birth:'2012-03-04',email:'exampleton@example.invalid',mobile:'555-0100',
    first:'Yes',dues:'Unknown',form1:'Yes',form2:'Unknown',
    guardName:'Pat Exampleton',guardian1:'pat@example.invalid',address:'123 Fictional Lane, Sampletown',
    _extra:{'Student Name':'Fictional Exampleton','Roster Category':'Confirmed Member',
      'Follow-up Status':'Confirmed','Birth Date':'2012-03-04','Student Email':'exampleton@example.invalid',
      'Parent / Guardian':'Pat Exampleton','Parent 1 Email':'pat@example.invalid','FIRST Registered':'Yes'}},
   {name:'Imaginary Prospector',category:'Prospect / Follow Up',followup:'Awaiting Reply',
    birth:'',email:'',mobile:'',first:'Unknown',dues:'Unknown',form1:'Unknown',
    guardName:'',guardian1:'',address:'',_extra:{'Student Name':'Imaginary Prospector',
      'Roster Category':'Prospect / Follow Up','Follow-up Status':'Awaiting Reply'}}
  ];
  imp.rows=sample.map((record,i)=>({line:i+5,record}));
  imp.filename='Fictional_Demo_Roster.xlsx';
  imp.sheet='Roster';imp.header=Object.values(headerMap);
  imp.loadedSeason=state.season;imp.importedIds.clear();previewRender();
  $('import-summary').textContent+=' Fictional sample only — no real student data.';
 }
 function clear(){
  imp.rows=[];imp.filename='';imp.sheet='';imp.header=[];imp.loadedSeason=null;
  $('import-file').value='';$('import-preview-table').replaceChildren();
  $('import-empty').textContent='Select a workbook and click Preview.';
  $('import-summary').textContent='No file loaded.';
  $('import-security').classList.add('hidden');
  $('import-result').textContent='';
 }
 function selectedRows(){
  return [...document.querySelectorAll('.import-choice')].map(el=>{
   const row=imp.rows[+el.dataset.importRow];return {row,choice:el.value};
  }).filter(x=>x.choice!=='skip');
 }
 function chosenAction(choice){return choice==='create'?{kind:'create'}:
  choice.startsWith('match:')?{kind:'match',id:choice.slice(6)}:null;}
 function relevantRule(r,team){
  const normalized=n=>key(n).replace(/\s*\(v[.\s-]*\d{4}\)\s*$/,'').replace(/[^a-z0-9]/g,'');
  const n=normalized(r.name||r.display_name);
  const matching=reqsFor(team).filter(x=>normalized(x.name||x.display_name)===n);
  return matching.length===1?matching[0]:null; // ambiguous labels must not map silently
 }
 async function applyRequirements(enrollmentId,team,source){
  if(!state.requirementsMode)return;
  const map=[
   ['form1','Mayhem Release'],['form2','WireBelt Release'],
   ['form3','Emergency Medical'],['form4','Media Waiver'],['form5','FIRST Release']
  ];
  for(const [field,label] of map){
   const cell=source[field],rule=relevantRule({name:label},team);
   if(!rule||(!yes(cell)&&!no(cell)))continue;
   const found=state.studentRequirements.some(x=>x.enrollment_id===enrollmentId&&x.season_requirement_id===rule.id);
   if(found)continue;
   const saved=check(await state.api.from('student_requirements').insert({
    organization_id:state.org.id,enrollment_id:enrollmentId,
    season_requirement_id:rule.id,status:yes(cell)?'received':'pending',
    completed_at:null // source confirms status, but not the date it was completed
   }).select('*').single());
   state.studentRequirements.push(saved);
  }
 }
 async function saveOne(row,choice,team){
  const mode=chosenAction(choice);
  if(!mode)throw Error('Choose Create or Match.');
  // This is a single database transaction, implemented by the SQL RPC.
  // Never fall back to the old multi-request write sequence: that could
  // leave partially imported students/registrations after a failure.
  const {data,error}=await state.api.rpc('import_reviewed_roster_row',{
   p_organization_id:state.org.id,
   p_season_id:state.season,
   p_team_id:team.id,
   p_source_name:imp.filename,
   p_source_sheet:imp.sheet,
   p_source_row:row.line,
   p_source_fingerprint:sourceFingerprint(row),
   p_source:row.record,
   p_match_student_id:mode.kind==='match'?mode.id:null
  });
  if(error){
   if(['PGRST202','42883'].includes(error.code))
    throw Error('Atomic import migration has not been applied. No row was written.');
   throw error;
  }
  if(!data?.student_id)throw Error('Import did not return a student ID; verify the server result.');
  imp.importedIds.add(sourceFingerprint(row));
  return {student:{id:data.student_id},enrollment:data.enrollment_id?{id:data.enrollment_id}:null};
 }
 function validatePicks(picks,team){
  const errors=[],seenSourceNames=new Set(),seenStudents=new Set();
  if(!state.familyMode)errors.push('Family/contact tables are not available. Run and verify the Phase 3 migration.');
  if(!state.requirementsMode)errors.push('Annual requirements tables are not available.');
  if(picks.length>100)errors.push('Select at most 100 rows per batch.');
  for(const {row,choice} of picks){
   const r=row.record,mode=chosenAction(choice),label='Row '+row.line+': ';
   if(!mode){errors.push(label+'Choose Create or Match.');continue;}
   if(!canCreate(row)){errors.push(label+'Student name is incomplete.');continue;}
   const n=key(r.name);
   if(seenSourceNames.has(n))errors.push(label+'Repeated student name within selection; review before import.');
   seenSourceNames.add(n);
   const matches=candidateMatches(row);
   if(mode.kind==='create'&&matches.length)errors.push(label+'Existing student with this name found; select Match.');
   if(mode.kind==='match'){
    const st=state.students.find(s=>s.id===mode.id);
    if(!st||!matches.some(m=>m.id===st.id))errors.push(label+'Student match is no longer valid.');
    const dob=state.studentContacts.find(c=>c.student_id===mode.id)?.birth_date;
    if(dob&&dateValue(r.birth)&&dob!==dateValue(r.birth))
     errors.push(label+'Birth date conflicts with the selected student.');
    if(seenStudents.has(mode.id))errors.push(label+'Same permanent student selected for more than one source row.');
    seenStudents.add(mode.id);
   }
   if(r.birth&&!dateValue(r.birth))errors.push(label+'Unrecognized birth date; correct the source or leave this row skipped.');
   if(!['confirmed member','inactive','prospect / follow up'].includes(key(r.category)))
    errors.push(label+'Unexpected roster category "'+r.category+'"; skip pending review.');
   if(key(r.category)==='confirmed member'&&!team)
    errors.push(label+'Target season team must be selected.');
  }
  return errors;
 }
 async function save(){
  if(!state.user||state.role!=='admin')throw Error('Admin sign-in required.');
  if(!imp.rows.length||imp.loadedSeason!==state.season)throw Error('Preview this workbook for the currently selected season first.');
  if(!$('import-authorized').checked)throw Error('Complete the security and backup confirmation.');
  const team=activeTeams().find(t=>t.id===$('import-team').value);
  if(!team)throw Error('Choose a participating target team.');
  const picks=selectedRows();if(!picks.length)throw Error('Choose Create or Match for at least one row.');
  const problems=validatePicks(picks,team);
  if(problems.length)throw Error('Preflight failed. No records saved: '+problems.join(' | '));
  // The import audit table is the application-level signal that SQL
  // phase 4 has been applied. It is also admin-only under RLS.
  const records=check(await state.api.from('roster_import_records').select('source_fingerprint').eq('organization_id',state.org.id).eq('season_id',state.season).limit(1000));
  const existing=new Set(records.map(x=>x.source_fingerprint));
  const results=[];
  const btn=$('import-save');btn.disabled=true;
  try{
   for(const {row,choice} of picks){
    const fp=sourceFingerprint(row);
    if(existing.has(fp)||imp.importedIds.has(fp)){results.push('Row '+row.line+': already imported; skipped');continue;}
    try{
     const saved=await saveOne(row,choice,team);
     existing.add(fp);
     results.push('Row '+row.line+': '+(saved.enrollment?'student and season enrollment':'permanent student profile')+' saved');
    }catch(e){
     results.push('Row '+row.line+': ERROR — '+e.message+' (check for partial writes)');
     break; // No silent retry after any partial failure.
    }
   }
   $('import-result').textContent=results.join(' | ');
   await fetchData();
   previewRender();
   $('import-result').textContent=results.join(' | ');
  }finally{btn.disabled=!$('import-authorized').checked;}
 }
 function csvValue(v){
  let s=String(v??'');
  if(/^[\s]*[=+@-]/.test(s))s="'"+s; // Spreadsheet formula injection protection
  return '"'+s.replace(/"/g,'""')+'"';
 }
 function exportCsv(){
  if(state.role!=='admin'||!state.familyMode)throw Error('Administrator and private contacts access required.');
  const season=state.seasons.find(s=>s.id===state.season);
  const teamIds=new Set(activeTeams().map(t=>t.id));
  const currentTeams=activeTeams();
  const ruleNames=[...new Set(currentTeams.flatMap(t=>reqsFor(t).map(r=>r.name||r.display_name)))].sort();
  const rows=[['Season','Team','Team number','Student','Student DOB','Student email',
   'Student mobile','Enrollment status','Guardians','Guardian email(s)','Guardian phone(s)',
   'Households','Mailing address(es)','FIRST registration','Forms complete',
   'Dues due','Dues paid','Dues waived',...ruleNames.map(n=>'Form: '+n)]];
  for(const e of state.enrollments.filter(x=>teamIds.has(x.team_id))){
   const t=state.teams.find(x=>x.id===e.team_id),st=state.students.find(x=>x.id===e.student_id);
   if(!st||!t)continue;
   const c=state.studentContacts.find(x=>x.student_id===st.id);
   const guardians=guardiansForStudent(st.id).map(x=>x.guardian);
   const houses=householdsForStudent(st.id).map(x=>x.household);
   const first=state.first.find(x=>x.enrollment_id===e.id);
   const dues=state.dues.find(x=>x.enrollment_id===e.id);
   rows.push([season?.name||'',t.name,t.team_number||'',name(st),c?.birth_date||'',
    c?.email||'',c?.mobile_phone||'',e.status,
    guardians.map(guardianName).join(' ; '),guardians.map(x=>x.email||'').join(' ; '),
    guardians.map(x=>x.phone||'').join(' ; '),houses.map(x=>x.display_name).join(' ; '),
    houses.map(x=>[x.address_line1,x.address_line2,x.city,x.state_region,x.postal_code].filter(Boolean).join(', ')).join(' ; '),
    first?.status||'',enrollmentStatus(e).forms,dues?.amount_due??'',dues?.amount_paid??'',dues?.amount_waived??'',
    ...ruleNames.map(ruleName=>{
      const rule=reqsFor(t).find(x=>(x.name||x.display_name)===ruleName);
      return rule?matchedCompletion(e,rule)?.status||'pending':'Not applicable';
    })]);
  }
  const csv='\uFEFF'+rows.map(a=>a.map(csvValue).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='Mayhem_Roster_'+(season?.name||'selected')+'.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function run(fn){
  try{await fn();message('Completed.',true)}catch(e){message(e.message);$('import-result').textContent='Action failed: '+e.message;}
 }
 function refresh(){
  if(!state?.org)return;
  $('tab-import-nav').classList.toggle('hidden',state.role!=='admin');
  if(state.role==='admin')refreshChoices();
  if(imp.rows.length&&imp.loadedSeason!==state.season){
   clear();$('import-summary').textContent='Season changed. Preview the workbook again for the new target season.';
  }
 }
 window.mayhemImportRefresh=refresh;
 $('import-preview').onclick=()=>run(preview);
 $('import-example').onclick=()=>run(example);
 $('import-reset').onclick=clear;
 $('import-authorized').onchange=e=>{$('import-save').disabled=!e.target.checked;};
 $('import-save').onclick=()=>run(save);
 $('export-roster').onclick=()=>run(exportCsv);
 if(state?.org)refresh();
})();