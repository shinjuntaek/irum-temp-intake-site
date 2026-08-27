import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4177;
const debugPort = 9227;
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".webp":"image/webp" };
const server = createServer(async (request, response) => {
  try {
    let filename = path.join(root, decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname));
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, "index.html");
    response.writeHead(200, { "Content-Type":mime[path.extname(filename)] || "application/octet-stream" });
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

const chrome = spawn("/usr/bin/chromium", ["--headless=new", "--no-sandbox", `--remote-debugging-port=${debugPort}`, "--user-data-dir=/tmp/irum-secondary-qa", "about:blank"], { stdio:"ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let version;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(); break; } catch { await sleep(100); }
  }
  if (!version?.webSocketDebuggerUrl) throw new Error("Chromium DevTools did not start");
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  };
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await call("Target.createTarget", { url:"about:blank" });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten:true });
  await call("Page.enable", {}, sessionId);
  await call("Runtime.enable", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width:390, height:844, deviceScaleFactor:1, mobile:true }, sessionId);
  await call("Page.addScriptToEvaluateOnNewDocument", { source:`
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      if (String(input).includes('temporary-secondary-profile')) {
        const body = JSON.parse(init.body || '{}');
        window.__qaSubmitCalls = window.__qaSubmitCalls || 0;
        window.__qaDraftCalls = window.__qaDraftCalls || 0;
        window.__qaDraftBodies = window.__qaDraftBodies || [];
        window.__qaSubmitBodies = window.__qaSubmitBodies || [];
        window.__qaRevision = window.__qaRevision || 0;
        const kind = new URLSearchParams(location.search).get('qa') || 'female';
        const params = new URLSearchParams(location.search);
        const common = { name:'테스트 신청자', phone:'01012345678', birthDate:'1992-04-15', height:kind === 'male' ? '178' : '165', region:'서울 강남구', singleStatus:'예', maritalStatus:'없음', children:'없음', smoking:'비흡연', drinking:'가끔', religion:'무교', tattoo:'없음' };
        const specific = kind === 'male'
          ? { ...common, gender:'male', job:'정형외과 전문의', company:'OO병원', employment:'정규직', incomeMale:'1억~1.5억원', asset:'5~10억원', serviceSelection:'1:1 소개', purpose:'장기연애' }
          : kind === 'social'
            ? { name:common.name, phone:common.phone, gender:'female', job:'브랜드 마케터', workplace:'패션 브랜드' }
            : { ...common, gender:'female', job:'브랜드 마케터', companyIndustry:'패션 브랜드', workType:'직장인', incomeFemale:'5천~8천만원', education:'대학교 졸업', serviceSelection:'1:1 소개' };
        const documents = kind === 'male' && params.get('docs') === 'verified'
          ? ['job','income','asset'].map(document_type=>({document_type,status:'verified'}))
          : [];
        if (body.action === 'secondary-public-get') return new Response(JSON.stringify({ form:{ id:'qa-form', form_type:kind === 'male' ? 'profile_male' : kind === 'social' ? 'social_event' : 'profile_female', status:'pending', expires_at:'2026-09-09T00:00:00Z', event_snapshot:kind === 'social' ? { title:'IRUM PRIVATE SOCIAL', startsAt:'2026-09-19T11:00:00Z', location:'강남', hostName:'안수빈' } : null, prefill:specific, draft_payload:null, draft_revision:window.__qaRevision, documents } }), { status:200, headers:{'Content-Type':'application/json'} });
        if (body.action === 'secondary-start') return new Response(JSON.stringify({ status:'in_progress' }), { status:200, headers:{'Content-Type':'application/json'} });
        if (body.action === 'secondary-draft-save') {
          window.__qaDraftCalls += 1;
          window.__qaDraftBodies.push(body);
          if (params.get('conflict') === '1' && window.__qaDraftCalls === 1) {
            window.__qaRevision = 1;
            await new Promise(resolve=>setTimeout(resolve,120));
            return new Response(JSON.stringify({ error:'DRAFT_CONFLICT', current_revision:1 }), { status:409, headers:{'Content-Type':'application/json'} });
          }
          if (Number(body.expected_revision) !== window.__qaRevision) return new Response(JSON.stringify({ error:'DRAFT_CONFLICT', current_revision:window.__qaRevision }), { status:409, headers:{'Content-Type':'application/json'} });
          window.__qaRevision += 1;
          return new Response(JSON.stringify({ status:'saved', draft_revision:window.__qaRevision }), { status:200, headers:{'Content-Type':'application/json'} });
        }
        if (body.action === 'secondary-submit') {
          window.__qaSubmitCalls += 1;
          window.__qaSubmitBodies.push(body);
          if (new URLSearchParams(location.search).get('server') === 'missing') return new Response(JSON.stringify({ error:'MALE_REQUIRED_FIELDS_MISSING', missing_fields:['birthDate'] }), { status:422, headers:{'Content-Type':'application/json'} });
          const payload = body.payload || {};
          const missing = [];
          for (const key of ['birthDate','height','region','singleStatus','maritalStatus','serviceSelection']) if (!String(payload[key] || '').trim()) missing.push(key);
          if (kind === 'female') {
            for (const key of ['realCheckMethod','realCheckDate']) if (!String(payload[key] || '').trim()) missing.push(key);
            if (payload.workType === '기타' && !String(payload.workTypeOther || '').trim()) missing.push('workTypeOther');
          }
          if (kind === 'male') {
            for (const key of ['job','incomeMale','asset','purpose']) if (!String(payload[key] || '').trim()) missing.push(key);
            if (payload.employment === '기타' && !String(payload.employmentOther || '').trim()) missing.push('employmentOther');
            if (payload.documentDeferred === true) { if (!String(payload.documentDueDate || '').trim()) missing.push('documentDueDate'); }
            else if (params.get('docs') !== 'verified') missing.push('jobDocument','incomeDocument','assetDocument');
          }
          if (payload.privacyConsent !== true) missing.push('privacyConsent');
          if (missing.length) return new Response(JSON.stringify({ error:kind === 'male' ? 'MALE_REQUIRED_FIELDS_MISSING' : 'FEMALE_REQUIRED_FIELDS_MISSING', missing_fields:missing }), { status:422, headers:{'Content-Type':'application/json'} });
          return new Response(JSON.stringify({ ok:true, status:'submitted', build_id:'secondary-manual-sent-social-schedule-20260827-1', submitted_at:new Date().toISOString() }), { status:200, headers:{'Content-Type':'application/json'} });
        }
      }
      return nativeFetch(input, init);
    };
  ` }, sessionId);
  const token = "q".repeat(48);
  const screenshot = async filename => {
    const image = await call("Page.captureScreenshot", { format:"png", captureBeyondViewport:false }, sessionId);
    await writeFile(path.join(root, filename), Buffer.from(image.data, "base64"));
  };
  const renderProfile = async kind => {
    await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=${kind}#${token}` }, sessionId);
    await sleep(900);
    const invitation = await call("Runtime.evaluate", { expression:"document.body.innerText", returnByValue:true }, sessionId);
    if (!String(invitation.result.value).includes("대표의 편지") || !String(invitation.result.value).includes("테스트 신청자")) throw new Error(`${kind} invitation missing: ${String(invitation.result.value).slice(0,240)}`);
    await call("Runtime.evaluate", { expression:"document.querySelector('[data-entry-start]')?.click()", returnByValue:true }, sessionId);
    await sleep(350);
    const values = await call("Runtime.evaluate", { expression:"JSON.stringify({region:document.querySelector('[data-input=region]')?.value,height:document.querySelector('[data-input=height]')?.value,title:document.querySelector('.step-head h2')?.textContent})", returnByValue:true }, sessionId);
    const parsed = JSON.parse(values.result.value || "{}");
    const expectedHeight = kind === "male" ? "178" : "165";
    if (parsed.region !== "서울 강남구" || parsed.height !== expectedHeight || !String(parsed.title).includes("먼저, 당신에 대해 알려주세요")) throw new Error(`${kind} prefill/heading missing: ${values.result.value}`);
    await screenshot(`qa-secondary-${kind}-form-390.png`);
  };
  await renderProfile("female");
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'165',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',workType:'직장인',realCheckMethod:'대면 확인',realCheckDate:'2026-09-15',serviceSelection:'1:1 소개',privacyConsent:true});step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(350);
  const femaleSuccess = await call("Runtime.evaluate", { expression:"JSON.stringify({text:document.body.innerText,calls:window.__qaSubmitCalls,drafts:window.__qaDraftCalls,payload:window.__qaSubmitBodies?.[0]?.payload,clientBuild:window.__qaSubmitBodies?.[0]?.client_build_id})", returnByValue:true }, sessionId);
  const femaleSuccessParsed = JSON.parse(femaleSuccess.result.value || "{}");
  if (!String(femaleSuccessParsed.text).includes("테스트 신청자님의 프로필이 IRUM에 전달되었습니다") || femaleSuccessParsed.calls !== 1 || femaleSuccessParsed.drafts < 1 || femaleSuccessParsed.payload?.privacyConsent !== true || femaleSuccessParsed.payload?.realCheckMethod !== "대면 확인" || femaleSuccessParsed.payload?.realCheckDate !== "2026-09-15" || femaleSuccessParsed.clientBuild !== "secondary-consultation-crm-fields-20260827-5") throw new Error(`female submit success failed: ${femaleSuccess.result.value}`);
  const personalizedSafety = await call("Runtime.evaluate", { expression:"form.name='<img src=x onerror=window.__xss=1>';feedback(completionProfileTitle(),'완료',true);JSON.stringify({title:document.querySelector('.feedback-card h1')?.textContent,images:document.querySelectorAll('.feedback-card img').length,xss:window.__xss||0});", returnByValue:true }, sessionId);
  const personalizedSafetyParsed = JSON.parse(personalizedSafety.result.value || "{}");
  if (personalizedSafetyParsed.title !== "<img src=x onerror=window.__xss=1>님의 프로필이 IRUM에 전달되었습니다." || personalizedSafetyParsed.images !== 0 || personalizedSafetyParsed.xss !== 0) throw new Error(`personalized completion XSS guard failed: ${personalizedSafety.result.value}`);
  const personalizedFallback = await call("Runtime.evaluate", { expression:"form.name='';data.form.prefill.name='';completionProfileTitle()", returnByValue:true }, sessionId);
  if (personalizedFallback.result.value !== "프로필이 IRUM에 전달되었습니다.") throw new Error(`personalized completion fallback failed: ${personalizedFallback.result.value}`);

  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=female&case=work-type-other#${token}` }, sessionId);
  await sleep(900);
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'165',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',workType:'기타',workTypeOther:'',realCheckMethod:'대면 확인',realCheckDate:'2026-09-15',serviceSelection:'1:1 소개',privacyConsent:true});step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(160);
  const femaleOtherMissing = await call("Runtime.evaluate", { expression:"JSON.stringify({step,error:document.querySelector('#formError')?.textContent,calls:window.__qaSubmitCalls})", returnByValue:true }, sessionId);
  const femaleOtherParsed = JSON.parse(femaleOtherMissing.result.value || "{}");
  if (femaleOtherParsed.step !== 2 || !String(femaleOtherParsed.error).includes("근무 형태 직접 입력") || femaleOtherParsed.calls !== 0) throw new Error(`female workTypeOther guard failed: ${femaleOtherMissing.result.value}`);

  await renderProfile("male");
  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=male&docs=verified#${token}` }, sessionId);
  await sleep(900);
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'178',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',job:'정형외과 전문의',incomeMale:'1억~1.5억원',asset:'5~10억원',purpose:'장기연애',serviceSelection:'1:1 소개',documentDeferred:false,privacyConsent:true});step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(350);
  const maleVerified = await call("Runtime.evaluate", { expression:"JSON.stringify({text:document.body.innerText,calls:window.__qaSubmitCalls,payload:window.__qaSubmitBodies?.[0]?.payload})", returnByValue:true }, sessionId);
  const maleVerifiedParsed = JSON.parse(maleVerified.result.value || "{}");
  if (!String(maleVerifiedParsed.text).includes("테스트 신청자님의 프로필이 IRUM에 전달되었습니다") || maleVerifiedParsed.calls !== 1 || maleVerifiedParsed.payload?.privacyConsent !== true || maleVerifiedParsed.payload?.documentDeferred !== false) throw new Error(`male verified-doc submit failed: ${maleVerified.result.value}`);

  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=male#${token}` }, sessionId);
  await sleep(900);
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'178',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',job:'정형외과 전문의',incomeMale:'1억~1.5억원',asset:'5~10억원',purpose:'장기연애',serviceSelection:'1:1 소개',documentDeferred:false,privacyConsent:true});step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(160);
  const maleDocumentsMissing = await call("Runtime.evaluate", { expression:"JSON.stringify({step,error:document.querySelector('#formError')?.textContent,calls:window.__qaSubmitCalls})", returnByValue:true }, sessionId);
  const maleDocumentsParsed = JSON.parse(maleDocumentsMissing.result.value || "{}");
  if (maleDocumentsParsed.step !== 2 || !String(maleDocumentsParsed.error).includes("인증서류") || maleDocumentsParsed.calls !== 0) throw new Error(`male missing-doc guard failed: ${maleDocumentsMissing.result.value}`);

  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=female#${token}` }, sessionId);
  await sleep(900);
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'165',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',workType:'직장인',realCheckMethod:'대면 확인',realCheckDate:'2026-09-15',serviceSelection:'1:1 소개',privacyConsent:false});step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(160);
  const privacyMissing = await call("Runtime.evaluate", { expression:"JSON.stringify({step,error:document.querySelector('#formError')?.textContent,calls:window.__qaSubmitCalls})", returnByValue:true }, sessionId);
  const privacyParsed = JSON.parse(privacyMissing.result.value || "{}");
  if (privacyParsed.step !== 5 || !String(privacyParsed.error).includes("개인정보 동의") || privacyParsed.calls !== 0) throw new Error(`privacy false guard failed: ${privacyMissing.result.value}`);

  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=male&conflict=1#${token}` }, sessionId);
  await sleep(900);
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'178',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',job:'정형외과 전문의',incomeMale:'1억~1.5억원',asset:'5~10억원',purpose:'결혼',serviceSelection:'1:1 소개',documentDeferred:true,documentDueDate:'2026-09-20',privacyConsent:true});step=5;renderProfile();void saveDraft();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(800);
  const raceSuccess = await call("Runtime.evaluate", { expression:"JSON.stringify({text:document.body.innerText,calls:window.__qaSubmitCalls,drafts:window.__qaDraftCalls,payload:window.__qaSubmitBodies?.[0]?.payload,draftBodies:window.__qaDraftBodies?.length})", returnByValue:true }, sessionId);
  const raceParsed = JSON.parse(raceSuccess.result.value || "{}");
  if (!String(raceParsed.text).includes("프로필이 IRUM에 전달되었습니다") || raceParsed.calls !== 1 || raceParsed.drafts < 3 || raceParsed.payload?.privacyConsent !== true || raceParsed.payload?.documentDeferred !== true || raceParsed.payload?.documentDueDate !== "2026-09-20" || raceParsed.payload?.purpose !== "결혼") throw new Error(`draft conflict/current payload submit failed: ${raceSuccess.result.value}`);

  await renderProfile("male");
  await call("Runtime.evaluate", { expression:"form.birthDate='';form.documentDeferred=true;form.documentDueDate='2026-09-10';form.privacyConsent=true;step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(120);
  const localMissing = await call("Runtime.evaluate", { expression:"JSON.stringify({step,title:document.querySelector('.step-head h2')?.textContent,error:document.querySelector('#formError')?.textContent,height:form.height,calls:window.__qaSubmitCalls})", returnByValue:true }, sessionId);
  const localParsed = JSON.parse(localMissing.result.value || "{}");
  if (localParsed.step !== 1 || !String(localParsed.error).includes("생년월일") || String(localParsed.error).includes("MALE_REQUIRED_FIELDS_MISSING") || localParsed.height !== "178" || localParsed.calls !== 0) throw new Error(`male local missing navigation failed: ${localMissing.result.value}`);

  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=male&server=missing#${token}` }, sessionId);
  await sleep(900);
  await call("Runtime.evaluate", { expression:"entryOpen=false;Object.assign(form,{birthDate:'1992-04-15',height:'178',region:'서울 강남구',singleStatus:'예',maritalStatus:'없음',job:'정형외과 전문의',incomeMale:'1억~1.5억원',asset:'5~10억원',purpose:'장기연애',serviceSelection:'1:1 소개',documentDeferred:true,documentDueDate:'2026-09-10',privacyConsent:true});step=5;renderProfile();document.querySelector('[data-submit]')?.click()", returnByValue:true }, sessionId);
  await sleep(180);
  const serverMissing = await call("Runtime.evaluate", { expression:"JSON.stringify({step,error:document.querySelector('#formError')?.textContent,height:form.height,calls:window.__qaSubmitCalls})", returnByValue:true }, sessionId);
  const serverParsed = JSON.parse(serverMissing.result.value || "{}");
  if (serverParsed.step !== 1 || !String(serverParsed.error).includes("생년월일") || String(serverParsed.error).includes("MALE_REQUIRED_FIELDS_MISSING") || serverParsed.height !== "178" || serverParsed.calls !== 1) throw new Error(`male server missing navigation failed: ${serverMissing.result.value}`);
  await call("Page.navigate", { url:`http://127.0.0.1:${port}/profile/?qa=social#${token}` }, sessionId);
  await sleep(900);
  const social = await call("Runtime.evaluate", { expression:"document.body.innerText", returnByValue:true }, sessionId);
  for (const marker of ["좋은 사람과", "직업 인증", "명함"]) if (!String(social.result.value).includes(marker)) throw new Error(`social marker missing: ${marker}`);
  await screenshot("qa-secondary-social-form-390.png");
  console.log("secondary_mobile_qa=pass viewport=390x844 female_submit=true male_verified_submit=true personalized_name=true personalized_fallback=true personalized_xss_safe=true male_deferred_conflict_submit=true male_document_guard=true privacy_guard=true server_missing_navigation=true latest_payload_preserved=true");
} finally {
  try { ws?.close(); } catch {}
  chrome.kill("SIGTERM");
  server.close();
}
