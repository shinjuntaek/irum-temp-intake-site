import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profileDir = "/tmp/irum-temp-admin-chromium";
const outputDir = "/tmp/irum-temp-admin-qa";
const chromiumPath = process.env.CHROMIUM_PATH || ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!chromiumPath) throw new Error("Chromium executable not found");
const port = 4176;
const debugPort = 9334;
const mime = new Map([[".html","text/html; charset=utf-8"],[".js","text/javascript; charset=utf-8"],[".css","text/css; charset=utf-8"],[".png","image/png"],[".jpg","image/jpeg"],[".jpeg","image/jpeg"],[".webp","image/webp"],[".svg","image/svg+xml"]]);

await rm(profileDir,{recursive:true,force:true});
await rm(outputDir,{recursive:true,force:true});
await mkdir(outputDir,{recursive:true});

const server=createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url||"/",`http://127.0.0.1:${port}`).pathname),candidate=pathname.endsWith("/")?`${pathname}index.html`:pathname,filePath=path.resolve(rootDir,`.${candidate}`);if(!filePath.startsWith(`${rootDir}${path.sep}`))throw new Error("PATH_OUTSIDE_ROOT");if(!(await stat(filePath)).isFile())throw new Error("NOT_A_FILE");response.writeHead(200,{"Content-Type":mime.get(path.extname(filePath).toLowerCase())||"application/octet-stream"});response.end(await readFile(filePath));}catch{response.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});response.end("Not found")}});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));

const chromium=spawn(chromiumPath,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,"about:blank"],{stdio:["ignore","ignore","ignore"]});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitDebug(){for(let i=0;i<100;i+=1){try{if((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok)return}catch{}await sleep(100)}throw new Error("Chromium debugging port did not open")}
await waitDebug();
const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:"PUT"}).then(r=>r.json());
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})});
let commandId=0;const pending=new Map();
socket.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(!message.id||!pending.has(message.id))return;const job=pending.get(message.id);pending.delete(message.id);message.error?job.reject(new Error(message.error.message)):job.resolve(message.result)});
function send(method,params={}){const id=++commandId;socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}))}
async function evaluate(expression){const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||"Browser evaluation failed");return result.result.value}
async function waitFor(expression,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(`Boolean(${expression})`))return;await sleep(120)}throw new Error(`Timed out waiting for ${label}`)}
async function screenshot(file){const metrics=await send("Page.getLayoutMetrics"),width=Math.ceil(metrics.cssContentSize?.width||metrics.contentSize.width),height=Math.min(12000,Math.ceil(metrics.cssContentSize?.height||metrics.contentSize.height)),result=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width,height,scale:1}});await writeFile(file,Buffer.from(result.data,"base64"))}

try{
  await send("Page.enable");await send("Runtime.enable");await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:`http://127.0.0.1:${port}/admin/`});
  await waitFor("document.readyState === 'complete'","admin document");
  await waitFor("document.querySelector('#login-button')","unauthenticated login gate");
  const unauthenticated=await evaluate(`({login:!!document.querySelector('#login-button'),layout:!!document.querySelector('.layout')})`);

  await evaluate(`(async()=>{
    sessionStorage.setItem(sessionKey,JSON.stringify({access_token:'qa-token',expires_at:Math.floor(Date.now()/1000)+3600}));
    sessionStorage.setItem(issuedLinksKey,JSON.stringify({'qa-form':'https://irum.click/profile/#qa-token'}));
    window.__qaCalls=[];window.confirm=()=>true;window.open=()=>null;
    photoUrl=async()=> 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420"><rect width="100%" height="100%" fill="#d8d0c5"/><text x="50%" y="50%" text-anchor="middle" fill="#28231c">PRIVATE QA</text></svg>');
    loadAll=async()=>{};
    state.records=[
      {id:2,created_at:'2026-08-27T01:00:00.000Z',payload:{submission_type:'matching',profile:{name:'QA 남성',phone:'01011112222',birthYear:'1992',gender:'male',job:'대표',education:'대졸',region:'서울',height:'180',mbti:'ENTJ',appealPoints:['리더십']},photo_refs:[{path:'submissions/2/qa.jpg'}]}},
      {id:3,created_at:'2026-08-27T02:00:00.000Z',payload:{submission_type:'social',profile:{name:'QA 복수',phone:'01033334444',birthYear:'1995',gender:'female',job:'마케터',region:'서울',socialAttendanceIntent:'specific_event',socialEventId:'event-1'},photo_refs:[]}},
      {id:4,created_at:'2026-08-27T03:00:00.000Z',payload:{submission_type:'matching',profile:{name:'QA 복수',phone:'01033334444',birthYear:'1995',gender:'female',job:'마케터',region:'서울'},photo_refs:[]}}
    ];
    state.legacy=[{source_application_id:1,source_updated_at:'2026-08-26T00:00:00.000Z',exported_at:'2026-08-26T00:00:00.000Z',photo_refs:[],snapshot:{profile:{name:'QA 여성',phone:'01000000000',birthYear:'1994',gender:'female',job:'전문직',education:'대졸',region:'서울',height:'165',mbti:'INFJ',entryPath:'/matching'},consultation:{consultationStatus:'before'},notes:[{content:'기존 상담 메모',source:'원본 CRM',createdAt:'2026-08-25T00:00:00.000Z'}]}}];
    state.operational=[{source_type:'social_event',source_id:'event-1',payload:{title:'QA 프라이빗 소셜',startsAt:'2026-10-17T10:00:00.000Z',location:'서울 강남',status:'OPEN'}},{source_type:'member',source_id:'legacy-member-1',payload:{applicant_name:'기존 회원',applicant_gender:'male',memberStatus:'active',applicant_job:'전문직',applicant_region:'서울'}},{source_type:'task',source_id:'task-1',payload:{title:'기존 할 일'}},{source_type:'schedule',source_id:'schedule-1',payload:{title:'기존 일정'}},{source_type:'audit',source_id:'audit-1',payload:{action:'legacy'}}];
    state.consultations=[];
    state.forms=[
      {id:'qa-form',subject_type:'temporary_submission',subject_id:'2',form_type:'profile_male',status:'submitted',expires_at:'2026-09-10T00:00:00.000Z',created_at:'2026-08-27T00:00:00.000Z',submitted_at:'2026-08-27T00:30:00.000Z',sent_at:null,draft_revision:3,submitted_payload:{purpose:'marriage',incomeMale:'8천만원',privacyConsent:true}},
      {id:'qa-female-form',subject_type:'legacy_snapshot',subject_id:'1',form_type:'profile_female',status:'submitted',expires_at:'2026-09-10T00:00:00.000Z',created_at:'2026-08-26T00:00:00.000Z',submitted_at:'2026-08-26T01:00:00.000Z',sent_at:'2026-08-26T00:30:00.000Z',submitted_payload:{purpose:'marriage',privacyConsent:true}}
    ];
    state.documents=[{id:'qa-document',form_id:'qa-form',document_type:'job',status:'verified'}];
    state.reviews=[{id:'review-female',form_id:'qa-female-form',subject_type:'legacy_snapshot',subject_id:'1',result:'approved',reason:null,reviewed_by_email:'qa-admin@example.invalid',reviewed_at:'2026-08-26T02:00:00.000Z'}];
    state.secondaryEvents=[];state.workflows=[];state.workflowEvents=[];state.schedules=[];state.members=[];state.matchingCases=[];state.matchingEvents=[];state.socialEvents=[];state.audit=[];state.loadedAt=Date.now();
    invokeAdmin=async(action,body={})=>{window.__qaCalls.push({endpoint:'intake',action,body});const now=new Date().toISOString();if(action==='admin-workflow-set'){state.workflows.unshift({id:'wf',...body,updated_at:now,assigned_to:body.assigned_to||null})}else if(action==='admin-schedule-add'){state.schedules.unshift({id:'schedule',...body,event_action:'scheduled',scheduled_at:body.scheduled_at,actor_email:'qa-admin@example.invalid',created_at:now})}else if(action==='admin-schedule-cancel'){state.schedules.unshift({id:'schedule-cancel',...body,event_action:'cancelled',actor_email:'qa-admin@example.invalid',created_at:now})}else if(action==='consultation-add'){state.consultations.unshift({id:'memo',...body,created_by_email:'qa-admin@example.invalid',created_at:now})}else if(action==='admin-member-set'){state.members.unshift({id:'member',...body,actor_email:'qa-admin@example.invalid',created_at:now})}else if(action==='admin-match-create'){state.matchingCases.unshift({id:'match-1',male_subject_type:body.male_subject_type,male_subject_id:body.male_subject_id,female_subject_type:body.female_subject_type,female_subject_id:body.female_subject_id,status:'candidate_selected',updated_at:now,created_at:now})}else if(action==='admin-match-transition'){const c=state.matchingCases.find(x=>x.id===body.matching_case_id);if(c){c.status=body.status;c.updated_at=now}state.matchingEvents.unshift({id:'match-event',matching_case_id:body.matching_case_id,status:body.status,reason:body.reason,scheduled_at:body.scheduled_at,actor_email:'qa-admin@example.invalid',created_at:now})}else if(action==='admin-social-status-set'){state.socialEvents.unshift({id:'social-state',...body,actor_email:'qa-admin@example.invalid',created_at:now})}return {ok:true};};
    invokeSecondary=async(action,body={})=>{window.__qaCalls.push({endpoint:'secondary',action,body});const now=new Date().toISOString();if(action==='secondary-admin-review'){state.reviews.unshift({id:'review-male',form_id:body.form_id,subject_type:'temporary_submission',subject_id:'2',result:body.result,reason:body.reason,reviewed_by_email:'qa-admin@example.invalid',reviewed_at:now});return {review:state.reviews[0]}}if(action==='secondary-admin-mark-sent'){const f=state.forms.find(x=>x.id===body.form_id);f.sent_at=now;f.sent_by_email='qa-admin@example.invalid';return {form:f}}if(action==='secondary-admin-clear-sent'){const f=state.forms.find(x=>x.id===body.form_id);f.sent_at=null;f.sent_by_email=null;return {form:f}}if(action==='secondary-admin-document-url')return {signed_url:'https://example.invalid/private'};if(action==='secondary-admin-reissue'){const f=state.forms.find(x=>x.id===body.form_id);f.sent_at=null;return {form:f,raw_url:'https://irum.click/profile/#qa-new-token'}}throw Object.assign(new Error('UNEXPECTED_QA_ACTION'),{code:'UNEXPECTED_QA_ACTION'});};
    state.page='applicants';renderApplicants();return true;
  })()`);
  await waitFor("document.querySelectorAll('[data-subject]').length === 3","fixture applicant list");
  const list=await evaluate(`({cards:document.querySelectorAll('[data-subject]').length,filters:document.querySelectorAll('.filters input,.filters select').length,duplicateCards:Array.from(document.querySelectorAll('.app-card')).filter(n=>n.innerText.includes('동일인 그룹')).length,oldMenu:Array.from(document.querySelectorAll('[data-nav]')).some(n=>/티어 확인|Host 유입|통계|관리자 · 권한/.test(n.textContent)),labels:Array.from(document.querySelectorAll('[data-nav]')).map(n=>n.textContent.trim()),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1})`);
  await screenshot(`${outputDir}/desktop-list.png`);

  await evaluate(`document.querySelector('[data-open="phone:01011112222"]').click()`);
  await waitFor("document.querySelectorAll('[data-temp-applicant-section]').length === 5","five applicant sections");
  await waitFor("document.querySelector('.profile-photo img')","private photo thumbnail");
  const detail=await evaluate(`({sections:Array.from(document.querySelectorAll('[data-temp-applicant-section]')).map(n=>[n.dataset.tempApplicantSection,Number(n.dataset.tempSectionOrder)]),review:!!document.querySelector('[data-review-save]'),document:!!document.querySelector('[data-document]'),markSent:!!document.querySelector('[data-mark-sent]'),copy:!!document.querySelector('[data-copy-link]'),privatePhoto:!!document.querySelector('.profile-photo img'),currentWork:document.body.innerText.includes('CURRENT WORK'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1})`);

  await evaluate(`(()=>{const box=document.querySelector('[data-review-box]');box.querySelector('[data-review-result]').value='hold';box.querySelector('[data-review-save]').click()})()`);
  await waitFor("document.querySelector('.toast')","review reason validation");
  const callsBeforeReason=await evaluate(`window.__qaCalls.filter(c=>c.action==='secondary-admin-review').length`);
  await evaluate(`(()=>{const box=document.querySelector('[data-review-box]');box.querySelector('[data-review-reason]').value='추가 확인 필요';box.querySelector('[data-review-save]').click()})()`);
  await waitFor("document.body.innerText.includes('추가 확인 필요')","append-only review history");
  await evaluate(`(()=>{const box=document.querySelector('[data-review-box]');box.querySelector('[data-review-result]').value='approved';box.querySelector('[data-review-reason]').value='';box.querySelector('[data-review-save]').click()})()`);
  await waitFor("document.body.innerText.includes('승인') && document.querySelector('[data-review-box] .chip.green')","approved review transition");
  const reviewCalls=await evaluate(`window.__qaCalls.filter(c=>c.action==='secondary-admin-review').length`);

  await evaluate(`document.querySelector('[data-mark-sent]').click()`);
  await waitFor("document.querySelector('[data-clear-sent]')","manual sent mark");
  await evaluate(`document.querySelector('[data-clear-sent]').click()`);
  await waitFor("document.querySelector('[data-mark-sent]')","manual sent clear");
  const sentCalls=await evaluate(`({mark:window.__qaCalls.filter(c=>c.action==='secondary-admin-mark-sent').length,clear:window.__qaCalls.filter(c=>c.action==='secondary-admin-clear-sent').length})`);

  await evaluate(`(()=>{const input=document.querySelector('#consultation-at');input.value='2026-10-20T15:00';document.querySelector('[data-save-schedule="consultation"]').click()})()`);
  await waitFor("document.body.innerText.includes('2026. 10. 20')","consultation schedule saved");
  await evaluate(`(()=>{const input=document.querySelector('#next-contact-at');input.value='2026-10-18T11:00';document.querySelector('[data-save-schedule="next_contact"]').click()})()`);
  await waitFor("document.body.innerText.includes('2026. 10. 18')","next-contact schedule saved");
  const scheduleTypes=await evaluate(`window.__qaCalls.filter(c=>c.action==='admin-schedule-add').map(c=>c.body.schedule_type)`);
  await screenshot(`${outputDir}/desktop-detail.png`);

  await evaluate(`navigate('members')`);await waitFor("document.querySelector('[data-member-save]')","approved members page");
  const members=await evaluate(`({cards:document.querySelectorAll('[data-member-save]').length,hasPending:document.body.innerText.includes('승인 대기'),oldSnapshot:document.body.innerText.includes('회원 Snapshot')})`);

  await evaluate(`navigate('matching')`);await waitFor("document.querySelector('#match-create')","matching page");
  await evaluate(`(()=>{const m=document.querySelector('#match-male'),f=document.querySelector('#match-female');m.value='temporary_submission:2';f.value='legacy_snapshot:1';document.querySelector('#repeat-confirm').checked=true;document.querySelector('#match-create').click()})()`);
  await waitFor('document.querySelector(\'[data-match="match-1"]\')',"male-choice match case");
  const matching=await evaluate(`({cases:document.querySelectorAll('[data-match]').length,hasFemaleDecision:/여성\s*(수락|거절)/.test(Array.from(document.querySelectorAll('option')).map(o=>o.textContent).join(' ')),statuses:Array.from(document.querySelectorAll('[data-match-status] option')).map(o=>o.textContent)})`);

  await evaluate(`navigate('social')`);await waitFor("document.body.innerText.includes('QA 프라이빗 소셜')","dynamic social Event");
  const social=await evaluate(`({dynamicEvent:document.body.innerText.includes('QA 프라이빗 소셜'),hardcoded:/8월\s*29일|9월\s*19일/.test(document.body.innerText),nextIntent:document.body.innerText.includes('다음 모임 희망'),eventOptions:Array.from(document.querySelectorAll('[data-social-event] option')).map(o=>o.textContent)})`);

  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(250);
  await evaluate(`document.querySelector('.mobile-toggle').click()`);await waitFor("document.querySelector('.layout').classList.contains('menu-open')","mobile menu open");
  await sleep(300);
  const mobileOpen=await evaluate(`({expanded:document.querySelector('.mobile-toggle').getAttribute('aria-expanded'),controls:document.querySelector('.mobile-toggle').getAttribute('aria-controls'),focus:document.activeElement?.className,overflow:document.body.style.overflow,labels:Array.from(document.querySelectorAll('[data-nav]')).map(n=>n.textContent.trim())})`);
  await screenshot(`${outputDir}/mobile-menu.png`);
  await evaluate(`document.querySelector('.backdrop').click()`);await waitFor("!document.querySelector('.layout').classList.contains('menu-open')","mobile backdrop close");
  await evaluate(`document.querySelector('.mobile-toggle').click()`);await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await waitFor("!document.querySelector('.layout').classList.contains('menu-open')","mobile escape close");
  await sleep(300);
  const mobile=await evaluate(`({expanded:document.querySelector('.mobile-toggle').getAttribute('aria-expanded'),focus:document.activeElement?.className,bodyOverflow:document.body.style.overflow,horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1})`);
  await screenshot(`${outputDir}/mobile-social.png`);

  const result={unauthenticated,list,detail,callsBeforeReason,reviewCalls,sentCalls,scheduleTypes,members,matching,social,mobileOpen,mobile};
  await writeFile(`${outputDir}/result.json`,`${JSON.stringify(result,null,2)}\n`);
  console.log(JSON.stringify(result));

  if(!unauthenticated.login||unauthenticated.layout)throw new Error("Unauthenticated admin gate failed");
  if(list.cards!==3||list.filters!==9||list.duplicateCards!==1||list.oldMenu||list.overflow)throw new Error("Applicant grouping/filter/navigation desktop QA failed");
  if(detail.sections.map(v=>v.join(":" )).join(",")!=="primary-profile:1,secondary-responses:2,secondary-links:3,unified-notes:4,consultation-date:5"||!detail.review||!detail.document||!detail.markSent||!detail.copy||!detail.privatePhoto||detail.currentWork||detail.overflow)throw new Error("Applicant five-section/private operation QA failed");
  if(callsBeforeReason!==0||reviewCalls!==2)throw new Error("Review eligibility/reason guard failed");
  if(sentCalls.mark!==1||sentCalls.clear!==1)throw new Error("Manual sent state QA failed");
  if(scheduleTypes.join(",")!=="consultation,next_contact")throw new Error("Split schedule QA failed");
  if(members.cards<1||!members.hasPending||!members.oldSnapshot)throw new Error("Approved member QA failed");
  if(matching.cases!==1||matching.hasFemaleDecision)throw new Error("Male-choice matching QA failed");
  if(!social.dynamicEvent||social.hardcoded||social.eventOptions.every(v=>!v.includes("QA 프라이빗 소셜")))throw new Error("Dynamic social Event QA failed");
  const expected=["대시보드","신청자","승인 회원","1:1 매칭","모임 신청 현황","할 일·일정","운영 이력"];
  if(mobileOpen.expanded!=="true"||mobileOpen.controls!=="admin-navigation"||!String(mobileOpen.focus).includes("mobile-close")||mobileOpen.overflow!=="hidden"||expected.some(v=>!mobileOpen.labels.includes(v)))throw new Error("Mobile navigation open QA failed");
  if(mobile.expanded!=="false"||mobile.bodyOverflow!==""||mobile.horizontalOverflow||!String(mobile.focus).includes("mobile-toggle"))throw new Error("Mobile navigation close/layout QA failed");
}finally{socket.close();chromium.kill("SIGTERM");server.close();await sleep(250);await rm(profileDir,{recursive:true,force:true})}
