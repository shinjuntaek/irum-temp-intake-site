import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = "/home/ubuntu/irum-temp-intake";
const profileDir = "/tmp/irum-temp-admin-single-page-chromium";
const outputDir = "/tmp/irum-temp-admin-single-page-qa";
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const port = 4176;
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

await rm(profileDir, { recursive: true, force: true });
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname);
    const candidate = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const filePath = path.resolve(rootDir, `.${candidate}`);
    if (!filePath.startsWith(`${rootDir}${path.sep}`)) throw new Error("PATH_OUTSIDE_ROOT");
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("NOT_A_FILE");
    response.writeHead(200, { "Content-Type": mime.get(path.extname(filePath).toLowerCase()) || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const chromium = spawn(chromiumPath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=9334",
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForDebugPort() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:9334/json/version");
      if (response.ok) return;
    } catch {
      // Chromium is still starting.
    }
    await sleep(100);
  }
  throw new Error("Chromium debugging port did not open");
}

await waitForDebugPort();
const target = await fetch("http://127.0.0.1:9334/json/new?about:blank", { method: "PUT" }).then(response => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

async function waitFor(expression, label, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(filePath) {
  const metrics = await send("Page.getLayoutMetrics");
  const width = Math.ceil(metrics.cssContentSize?.width ?? metrics.contentSize.width);
  const height = Math.min(14_000, Math.ceil(metrics.cssContentSize?.height ?? metrics.contentSize.height));
  const result = await send("Page.captureScreenshot", { format:"png", captureBeyondViewport:true, fromSurface:true, clip:{ x:0, y:0, width, height, scale:1 } });
  await writeFile(filePath, Buffer.from(result.data, "base64"));
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await send("Page.navigate", { url:`http://127.0.0.1:${port}/admin/` });
  await waitFor("document.readyState === 'complete'", "admin document");
  await waitFor("document.querySelector('#login')", "unauthenticated login gate");
  const unauthenticated = await evaluate(`({ hasLoginButton:!!document.querySelector('#login'), hasAdminLayout:!!document.querySelector('.layout') })`);

  await evaluate(`(async () => {
    osGetPhotoUrl = async () => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="100%" height="100%" fill="#d8d0c5"/><text x="50%" y="50%" text-anchor="middle" fill="#28231c">PRIVATE QA</text></svg>');
    osPrimePhotoUrls = async () => {};
    mountSecondaryReview = async item => {
      const target = document.getElementById('os-secondary-review');
      if (target) target.innerHTML = '<article data-qa-secondary-review><b>여성 2차 프로필</b><p>실제 고객 작성값만 표시</p></article>';
    };
    window.__qaSecondaryCalls = [];
    window.__qaReissued = false;
    window.__qaSent = false;
    window.confirm = () => true;
    invokeSecondaryAdmin = async (action, body = {}) => {
      window.__qaSecondaryCalls.push({ action, body });
      if (action === 'secondary-admin-list') return {
        forms:[{ id:'qa-form', subject_type:'temporary_submission', subject_id:'2', form_type:'profile_male', status:'pending', expires_at:'2026-09-09T00:00:00.000Z', token_prefix:window.__qaReissued ? 'newtoken12' : 'oldtoken12', draft_revision:3, draft_saved_at:'2026-08-26T00:00:00.000Z', sent_at:window.__qaSent ? '2026-08-27T00:00:00.000Z' : null, sent_by_user_id:window.__qaSent ? 'qa-admin' : null, sent_by_email:window.__qaSent ? 'qa-admin@example.invalid' : null }],
        documents:[{ id:'qa-document', form_id:'qa-form', document_type:'job', status:'verified' }]
      };
      if (action === 'secondary-admin-reissue') {
        window.__qaReissued = true;
        window.__qaSent = false;
        return { form:{ id:'qa-form', sent_at:null, sent_by_user_id:null, sent_by_email:null }, raw_url:'https://irum.click/profile/#qa-new-token' };
      }
      if (action === 'secondary-admin-mark-sent') { window.__qaSent = true; return { form:{ id:'qa-form', sent_at:'2026-08-27T00:00:00.000Z', sent_by_user_id:'qa-admin', sent_by_email:'qa-admin@example.invalid' } }; }
      if (action === 'secondary-admin-clear-sent') { window.__qaSent = false; return { form:{ id:'qa-form', sent_at:null, sent_by_user_id:null, sent_by_email:null } }; }
      if (action === 'secondary-admin-document-url') return { signed_url:'https://example.invalid/private-document' };
      throw new Error('UNEXPECTED_QA_ACTION:' + action);
    };
    legacyRecords = [{
      source_application_id:1,
      source_updated_at:'2026-08-26T00:00:00.000Z',
      exported_at:'2026-08-26T00:00:00.000Z',
      photo_refs:[],
      snapshot:{
        profile:{ name:'QA 기존 신청자', phone:'01000000000', birthYear:'1994', gender:'female', job:'전문직', education:'대졸', region:'서울', height:'165', mbti:'INFJ', appealPoints:['차분함'], entryPath:'/social' },
        consultation:{ consultationStatus:'before', nextAction:'' },
        screening:{ finalGrade:'판단 전' },
        notes:[{ content:'기존 상담 메모', source:'원본 CRM', createdAt:'2026-08-25T00:00:00.000Z' }],
        contactLogs:[]
      }
    }];
    records = [
      { id:'2', created_at:'2026-08-26T01:00:00.000Z', payload:{ submission_type:'matching', profile:{ name:'QA 신규 신청자', phone:'01011112222', birthYear:'1992', gender:'male', job:'대표', education:'대졸', region:'서울', height:'180', mbti:'ENTJ', appealPoints:['리더십'] }, photo_refs:[{ path:'submissions/2/qa.jpg' }] } },
      { id:'3', created_at:'2026-08-26T02:00:00.000Z', payload:{ submission_type:'social', profile:{ name:'QA 복수 신청자', phone:'01033334444', birthYear:'1995', gender:'female', job:'마케터', region:'서울', socialAttendanceIntent:'specific_event', socialEventId:'30002' }, photo_refs:[] } },
      { id:'4', created_at:'2026-08-26T03:00:00.000Z', payload:{ submission_type:'matching', profile:{ name:'QA 복수 신청자', phone:'01033334444', birthYear:'1995', gender:'female', job:'마케터', region:'서울' }, photo_refs:[] } }
    ];
    temporaryConsultationEntries = [];
    operationalRecords = [];
    secondarySubmittedSubjects = new Set(['temporary_submission:2']);
    secondaryForms = [{ id:'qa-form', subject_type:'temporary_submission', subject_id:'2', form_type:'profile_male', status:'pending', sent_at:null, sent_by_user_id:null, sent_by_email:null, created_at:'2026-08-26T00:00:00.000Z' }];
    osDataLoadedAt = Date.now();
    osDataLoadPromise = null;
    await osApplicants();
    return true;
  })()`);
  await waitFor("document.querySelectorAll('[data-os-workspace]').length >= 2", "fixture applicant list");
  const list = await evaluate(`({
    hasTierLeadMenu:Array.from(document.querySelectorAll('[data-os-nav]')).some(node => node.textContent.includes('티어 확인 리드')),
    hasTemporaryIntakeText:document.body.innerText.includes('임시 접수') || document.body.innerText.includes('temporary_intake'),
    hasNewApplicantLabel:document.body.innerText.includes('신규 신청'),
    hasSentFilter:!!document.querySelector('#os-app-sent-status'),
    hasSecondaryStatusFilter:!!document.querySelector('#os-app-secondary-status'),
    hasServiceFilter:!!document.querySelector('#os-app-service-type'),
    hasSocialSchedule:document.body.innerText.includes('9월 19일'),
    applicantCount:document.querySelectorAll('[data-os-workspace]').length
  })`);
  await screenshot(`${outputDir}/desktop-list.png`);

  await evaluate(`(() => { const select=document.querySelector('#os-app-service-type'); select.value='both'; select.onchange({ target:select }); })()`);
  await waitFor("new URL(location.href).searchParams.get('service') === 'both' && document.querySelectorAll('[data-os-workspace]').length === 2", "both application service filter");
  const bothServiceFilter = await evaluate(`({
    url:new URL(location.href).search,
    count:document.querySelectorAll('[data-os-workspace]').length,
    badges:Array.from(document.querySelectorAll('[data-application-service]')).map(node=>node.dataset.applicationService)
  })`);
  await evaluate(`(() => { const select=document.querySelector('#os-app-service-type'); select.value='all'; select.onchange({ target:select }); })()`);
  await waitFor("document.querySelectorAll('[data-os-workspace]').length >= 4 && !new URL(location.href).searchParams.has('service')", "reset application service filter");

  await evaluate("document.querySelector('[data-os-workspace=\"temporary-2\"]').click()");
  await waitFor("document.querySelectorAll('[data-temp-applicant-section]').length === 5", "five temp applicant sections");
  await waitFor("document.querySelector('[data-qa-secondary-review]') && document.querySelector('[data-secondary-reissue]') && document.querySelector('[data-secondary-document]') && document.querySelector('[data-secondary-mark-sent]')", "secondary review, reissue, and manual sent controls");
  const photoButton = await evaluate("document.querySelector('[data-os-photo-owner]')?.outerHTML || ''");
  if (photoButton) await evaluate("osLoadPhotoThumb(document.querySelector('[data-os-photo-owner]'), osSelectedWorkspace, true)");
  await waitFor("document.querySelector('.os-profile-photo img')", "private photo thumbnail");
  const detail = await evaluate(`({
    sectionCount:document.querySelectorAll('[data-temp-applicant-section]').length,
    orders:Array.from(document.querySelectorAll('[data-temp-applicant-section]')).map(node => Number(node.dataset.tempSectionOrder)),
    sections:Array.from(document.querySelectorAll('[data-temp-applicant-section]')).map(node => node.dataset.tempApplicantSection),
    hasLegacyTabs:!!document.querySelector('.os-detail-tabs'),
    currentWorkCount:(document.body.innerText.match(/CURRENT WORK/g) || []).length,
    secondaryReviewCount:document.querySelectorAll('#os-secondary-review').length,
    secondaryLinkCount:document.querySelectorAll('#os-secondary-profile-panel').length,
    unifiedMemoCount:document.querySelectorAll('[data-temp-unified-memo]').length,
    consultationDateCount:document.querySelectorAll('[data-temp-consultation-date]').length,
    privatePhotoCount:document.querySelectorAll('.os-profile-photo img').length,
    privateDocumentCount:document.querySelectorAll('[data-secondary-document]').length,
    reissueButtonCount:document.querySelectorAll('[data-secondary-reissue]').length,
    issueButtonText:document.querySelector('#secondary-issue')?.textContent?.trim() || '',
    markSentButtonCount:document.querySelectorAll('[data-secondary-mark-sent]').length,
    scrollWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth
  })`);
  await evaluate("document.querySelector('[data-secondary-mark-sent]').click()");
  await waitFor("document.querySelector('[data-secondary-sent-state=sent]') && document.body.innerText.includes('qa-admin@example.invalid')", "manual sent state");
  await evaluate("document.querySelector('[data-secondary-clear-sent]').click()");
  await waitFor("document.querySelector('[data-secondary-sent-state=unsent]')", "manual sent clear state");
  await evaluate("document.querySelector('#secondary-issue').click()");
  await waitFor("document.querySelector('[data-secondary-url]')?.value === 'https://irum.click/profile/#qa-new-token'", "reissued secondary URL");
  const reissue = await evaluate(`({
    reissueCalls:window.__qaSecondaryCalls.filter(call => call.action === 'secondary-admin-reissue').length,
    formId:window.__qaSecondaryCalls.find(call => call.action === 'secondary-admin-reissue')?.body?.form_id,
    expiresInDays:window.__qaSecondaryCalls.find(call => call.action === 'secondary-admin-reissue')?.body?.expires_in_days,
    rawUrl:document.querySelector('[data-secondary-url]')?.value || '',
    copyButtonCount:document.querySelectorAll('[data-secondary-copy]').length,
    draftRevisionText:document.body.innerText.includes('revision 3'),
    markSentCalls:window.__qaSecondaryCalls.filter(call => call.action === 'secondary-admin-mark-sent').length,
    clearSentCalls:window.__qaSecondaryCalls.filter(call => call.action === 'secondary-admin-clear-sent').length,
    sentResetAfterReissue:!!document.querySelector('[data-secondary-sent-state=unsent]')
  })`);
  await screenshot(`${outputDir}/desktop-detail.png`);

  await send("Emulation.setDeviceMetricsOverride", { width:390, height:844, deviceScaleFactor:1, mobile:true });
  await sleep(300);
  await evaluate("document.querySelector('.os-mobile-menu-toggle').click()");
  await waitFor("document.querySelector('.layout').classList.contains('os-mobile-menu-open')", "open mobile admin navigation");
  const mobileMenuOpen = await evaluate(`({
    expanded:document.querySelector('.os-mobile-menu-toggle')?.getAttribute('aria-expanded'),
    controls:document.querySelector('.os-mobile-menu-toggle')?.getAttribute('aria-controls'),
    drawerId:document.querySelector('.side')?.id,
    drawerHidden:document.querySelector('.side')?.getAttribute('aria-hidden'),
    bodyOverflow:document.body.style.overflow,
    focusedLabel:document.activeElement?.getAttribute('aria-label') || '',
    activeLabel:document.querySelector('[data-os-nav][aria-current="page"]')?.textContent?.trim() || '',
    labels:Array.from(document.querySelectorAll('[data-os-nav]')).map(node => node.textContent.trim()),
  })`);
  await screenshot(`${outputDir}/mobile-menu.png`);
  await evaluate("document.querySelector('.os-mobile-menu-backdrop').click()");
  await waitFor("!document.querySelector('.layout').classList.contains('os-mobile-menu-open')", "close mobile navigation from backdrop");
  const overlayClosed = await evaluate("document.querySelector('.os-mobile-menu-toggle').getAttribute('aria-expanded') === 'false' && document.body.style.overflow === ''");
  await evaluate("document.querySelector('.os-mobile-menu-toggle').click()");
  await send("Input.dispatchKeyEvent", { type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27, nativeVirtualKeyCode:27 });
  await send("Input.dispatchKeyEvent", { type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27, nativeVirtualKeyCode:27 });
  await waitFor("!document.querySelector('.layout').classList.contains('os-mobile-menu-open')", "close mobile navigation from escape");
  await waitFor("document.activeElement === document.querySelector('.os-mobile-menu-toggle') && document.body.style.overflow === ''", "restore mobile menu focus after escape");
  const escapeClosed = await evaluate("document.activeElement === document.querySelector('.os-mobile-menu-toggle') && document.body.style.overflow === ''");
  const mobile = await evaluate(`({
    sectionCount:document.querySelectorAll('[data-temp-applicant-section]').length,
    scrollWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth,
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    privatePhotoCount:document.querySelectorAll('.os-profile-photo img').length,
    secondaryLinkCount:document.querySelectorAll('#os-secondary-profile-panel').length
  })`);
  await screenshot(`${outputDir}/mobile-detail.png`);

  await evaluate("osApplicants()");
  await waitFor("document.querySelector('#os-app-service-type')", "mobile application service filter");
  const mobileList = await evaluate(`({
    serviceFilterValue:document.querySelector('#os-app-service-type')?.value || '',
    serviceOptions:Array.from(document.querySelector('#os-app-service-type')?.options || []).map(option=>option.value),
    scrollWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth,
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  })`);
  await screenshot(`${outputDir}/mobile-list.png`);

  await evaluate("document.querySelector('.os-mobile-menu-toggle').click(); document.querySelector('[data-os-nav=dashboard]').click()");
  await waitFor("document.body.innerText.includes('운영 현황') && !document.querySelector('.layout').classList.contains('os-mobile-menu-open')", "navigate from mobile drawer");
  const menuNavigationClosed = await evaluate("document.querySelector('.os-mobile-menu-toggle').getAttribute('aria-expanded') === 'false' && document.body.style.overflow === ''");

  await evaluate("osOperationalPage('social')");
  await waitFor("document.querySelector('[data-social-application-schedules]') && document.body.innerText.includes('9월 19일')", "private social schedule table");
  await screenshot(`${outputDir}/mobile-social.png`);
  await send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await sleep(300);
  await screenshot(`${outputDir}/desktop-social.png`);
  const social = await evaluate(`({ hasScheduleTable:!!document.querySelector('[data-social-application-schedules]'), hasSeptember19:document.body.innerText.includes('9월 19일'), legacyLabelVisible:document.body.innerText.includes('구형 신청 · 일정 미수집') })`);
  const result = { unauthenticated, list, bothServiceFilter, detail, reissue, mobileMenuOpen, overlayClosed, escapeClosed, menuNavigationClosed, mobile, mobileList, social };
  await writeFile(`${outputDir}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));

  if (!unauthenticated.hasLoginButton || unauthenticated.hasAdminLayout) throw new Error("Unauthenticated admin gate failed");
  if (list.hasTierLeadMenu || list.hasTemporaryIntakeText || !list.hasNewApplicantLabel || !list.hasSentFilter || !list.hasSecondaryStatusFilter || !list.hasServiceFilter || !list.hasSocialSchedule) throw new Error("Temporary admin sidebar/card/filter/schedule normalization failed");
  if (bothServiceFilter.url !== '?service=both' || bothServiceFilter.count !== 2 || bothServiceFilter.badges.some(value => value !== 'both')) throw new Error("Temporary admin application service filter or badge failed");
  if (detail.sectionCount !== 5 || detail.orders.join(",") !== "1,2,3,4,5") throw new Error("Temporary admin five-section order mismatch");
  if (detail.sections.join(",") !== "primary-profile,secondary-responses,secondary-links,unified-notes,consultation-date") throw new Error("Temporary admin section keys mismatch");
  if (detail.hasLegacyTabs || detail.currentWorkCount !== 0) throw new Error("Legacy tabs or CURRENT WORK remain visible");
  if ([detail.secondaryReviewCount, detail.secondaryLinkCount, detail.unifiedMemoCount, detail.consultationDateCount].some(count => count !== 1)) throw new Error("Single-page panel duplication detected");
  if (detail.privatePhotoCount !== 1 || detail.privateDocumentCount !== 1 || detail.reissueButtonCount !== 1 || detail.markSentButtonCount !== 1 || detail.issueButtonText !== "기존 링크 재발급") throw new Error("Private photo/document or secondary reissue/manual-sent control regression detected");
  if (reissue.reissueCalls !== 1 || reissue.formId !== "qa-form" || reissue.expiresInDays !== 14 || reissue.rawUrl !== "https://irum.click/profile/#qa-new-token" || reissue.copyButtonCount !== 1 || !reissue.draftRevisionText || reissue.markSentCalls !== 1 || reissue.clearSentCalls !== 1 || !reissue.sentResetAfterReissue) throw new Error("Secondary reissue/manual-sent UI flow failed");
  const expectedMobileLabels = ["대시보드", "신청자", "회원", "1:1 매칭", "프라이빗 소셜", "Host 유입 검수", "할 일 · 일정", "통계 · Funnel", "관리자 · 권한", "감사 로그", "설정"];
  if (mobileMenuOpen.expanded !== "true" || mobileMenuOpen.controls !== "temp-admin-mobile-navigation" || mobileMenuOpen.drawerId !== "temp-admin-mobile-navigation" || mobileMenuOpen.drawerHidden !== "false" || mobileMenuOpen.bodyOverflow !== "hidden" || mobileMenuOpen.focusedLabel !== "메뉴 닫기" || !mobileMenuOpen.activeLabel.includes("신청자") || expectedMobileLabels.some(label => !mobileMenuOpen.labels.some(entry => entry.includes(label)))) throw new Error("Temporary admin mobile navigation open/accessibility state failed");
  if (!overlayClosed || !escapeClosed || !menuNavigationClosed) throw new Error("Temporary admin mobile navigation close behavior failed");
  if (mobile.horizontalOverflow || mobile.sectionCount !== 5 || mobile.privatePhotoCount !== 1 || mobile.secondaryLinkCount !== 1) throw new Error("Temporary admin mobile layout failed");
  if (mobileList.serviceFilterValue !== "all" || mobileList.serviceOptions.join(",") !== "all,matching,social,both" || mobileList.horizontalOverflow) throw new Error("Temporary admin mobile application service filter layout failed");
  if (!social.hasScheduleTable || !social.hasSeptember19 || !social.legacyLabelVisible) throw new Error("Private social schedule rendering failed");
} finally {
  socket.close();
  chromium.kill("SIGTERM");
  server.close();
  await sleep(250);
  await rm(profileDir, { recursive:true, force:true });
}
