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
  const n=key(r.name||r.display_name).replace(/[^a-z0-9]/g,'');
  return reqsFor(team).find(x=>key(x.name||x.display_name).replace(/[^a-z0-9]/g,'')===n);
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
   check(await state.api.from('student_requirements').insert({
    organization_id:state.org.id,enrollment_id:enrollmentId,
    season_requirement_id:rule.id,status:yes(cell)?'received':'pending',
    completed_at:yes(cell)?new Date().toISOString():null
   }));
  }
 }
 async function saveOne(row,choice,team){
  const record=row.record,mode=chosenAction(choice),match=candidateMatches(row);
  if(!mode)throw Error('Select Create or Match.');
  const dob=dateValue(record.birth);
  let student;
  if(mode.kind==='create'){
   if(!canCreate(row))throw Error('Full student name is required.');
   if(match.length)throw Error('Potential duplicate exists; explicitly select Match.');
   const parts=splitName(record.name);
   student=check(await state.api.from('students').insert({
    organization_id:state.org.id,first_name:parts.first,last_name:parts.last,
    is_active:key(record.category)!=='inactive'
   }).select('*').single());
   state.students.push(student);
  }else{
   student=state.students.find(x=>x.id===mode.id);
   if(!student||!match.some(s=>s.id===student.id))throw Error('Existing student match changed. Refresh and preview again.');
   const currentDOB=state.studentContacts.find(c=>c.student_id===student.id)?.birth_date;
   if(currentDOB&&dob&&currentDOB!==dob)throw Error('Birth date conflict with existing student.');
  }
  const currentContact=state.studentContacts.find(c=>c.student_id===student.id);
  if(!currentContact){
   const email=record.email||null;
   check(await state.api.from('student_contact_profiles').insert({
    organization_id:state.org.id,student_id:student.id,birth_date:dob,
    email,mobile_phone:record.mobile||null,
    mayhem_email:email&&email.toLowerCase().endsWith('@mayhemrobotics.org')?email:null
   }));
  }
  let enrollment=state.enrollments.find(e=>e.student_id===student.id&&e.team_id===team.id);
  const isConfirmed=key(record.category)==='confirmed member';
  if(isConfirmed&&!enrollment){
   enrollment=check(await state.api.from('team_enrollments').insert({
    organization_id:state.org.id,student_id:student.id,team_id:team.id,
    status:key(record.followup)==='confirmed'?'active':'pending'
   }).select('*').single());
   state.enrollments.push(enrollment);
  }
  if(isConfirmed&&enrollment){
   const status=record.first;
   if((yes(status)||no(status))&&!state.first.some(x=>x.enrollment_id===enrollment.id)){
    check(await state.api.from('first_registrations').insert({
     organization_id:state.org.id,enrollment_id:enrollment.id,
     status:yes(status)?'complete':'not_started',
     verified_at:yes(status)?new Date().toISOString():null
    }));
   }
   await applyRequirements(enrollment.id,team,record);
  }
  // Store full reviewed spreadsheet row in the private, admin-only audit table.
  // Never infer dues amounts, household membership, or guardian identity from text.
  check(await state.api.from('roster_import_records').insert({
   organization_id:state.org.id,season_id:state.season,
   team_id:enrollment?team.id:null,student_id:student.id,
   source_name:imp.filename,source_sheet:imp.sheet,source_row:row.line,
   source_fingerprint:sourceFingerprint(row),source_category:record.category||null,
   source_followup:record.followup||null,source_fields:record._extra,
   import_outcome:mode.kind==='create'?'created':'matched'
  }));
  imp.importedIds.add(sourceFingerprint(row));
  return {student,enrollment};
 }
 async function save(){
  if(!state.user||state.role!=='admin')throw Error('Admin sign-in required.');
  if(!imp.rows.length||imp.loadedSeason!==state.season)throw Error('Preview this workbook for the currently selected season first.');
  if(!$('import-authorized').checked)throw Error('Complete the security and backup confirmation.');
  const team=activeTeams().find(t=>t.id===$('import-team').value);
  if(!team)throw Error('Choose a participating target team.');
  const picks=selectedRows();if(!picks.length)throw Error('Choose Create or Match for at least one row.');
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
  const rows=[['Season','Team','Team number','Student','Student DOB','Student email',
   'Student mobile','Enrollment status','Guardians','Guardian email(s)','Guardian phone(s)',
   'Households','Mailing address(es)','FIRST registration','Forms complete',
   'Dues due','Dues paid','Dues waived']];
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
    first?.status||'',enrollmentStatus(e).forms,dues?.amount_due??'',dues?.amount_paid??'',dues?.amount_waived??'']);
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
 $('import-reset').onclick=clear;
 $('import-authorized').onchange=e=>{$('import-save').disabled=!e.target.checked;};
 $('import-save').onclick=()=>run(save);
 $('export-roster').onclick=()=>run(exportCsv);
 if(state?.org)refresh();
})();