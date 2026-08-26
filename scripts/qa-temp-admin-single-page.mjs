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
    mountSecondaryPanel = async item => {
      const target = document.getElementById('os-secondary-profile-panel');
      if (target) target.innerHTML = '<div data-qa-secondary-links><input data-secondary-url readonly value="https://example.invalid/#qa"/><button data-secondary-copy>링크 복사</button><button data-secondary-document="qa-document" data-secondary-form="qa-form">private 서류</button></div>';
    };
    legacyRecords = [{
      source_application_id:1,
      source_updated_at:'2026-08-26T00:00:00.000Z',
      exported_at:'2026-08-26T00:00:00.000Z',
      photo_refs:[],
      snapshot:{
        profile:{ name:'QA 기존 신청자', phone:'01000000000', birthYear:'1994', gender:'female', job:'전문직', education:'대졸', region:'서울', height:'165', mbti:'INFJ', appealPoints:['차분함'] },
        consultation:{ consultationStatus:'before', nextAction:'' },
        screening:{ finalGrade:'판단 전' },
        notes:[{ content:'기존 상담 메모', source:'원본 CRM', createdAt:'2026-08-25T00:00:00.000Z' }],
        contactLogs:[]
      }
    }];
    records = [{
      id:'2',
      created_at:'2026-08-26T01:00:00.000Z',
      payload:{ submission_type:'matching', profile:{ name:'QA 신규 신청자', phone:'01011112222', birthYear:'1992', gender:'male', job:'대표', education:'대졸', region:'서울', height:'180', mbti:'ENTJ', appealPoints:['리더십'] }, photo_refs:[{ path:'submissions/2/qa.jpg' }] }
    }];
    temporaryConsultationEntries = [];
    operationalRecords = [];
    secondarySubmittedSubjects = new Set(['temporary_submission:2']);
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
    applicantCount:document.querySelectorAll('[data-os-workspace]').length
  })`);
  await screenshot(`${outputDir}/desktop-list.png`);

  await evaluate("document.querySelector('[data-os-workspace=\"temporary-2\"]').click()");
  await waitFor("document.querySelectorAll('[data-temp-applicant-section]').length === 5", "five temp applicant sections");
  await waitFor("document.querySelector('[data-qa-secondary-review]') && document.querySelector('[data-qa-secondary-links]')", "secondary review and link fixtures");
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
    copyButtonCount:document.querySelectorAll('[data-secondary-copy]').length,
    scrollWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth
  })`);
  await screenshot(`${outputDir}/desktop-detail.png`);

  await send("Emulation.setDeviceMetricsOverride", { width:390, height:844, deviceScaleFactor:1, mobile:true });
  await sleep(300);
  const mobile = await evaluate(`({
    sectionCount:document.querySelectorAll('[data-temp-applicant-section]').length,
    scrollWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth,
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    privatePhotoCount:document.querySelectorAll('.os-profile-photo img').length,
    secondaryLinkCount:document.querySelectorAll('#os-secondary-profile-panel').length
  })`);
  await screenshot(`${outputDir}/mobile-detail.png`);

  const result = { unauthenticated, list, detail, mobile };
  await writeFile(`${outputDir}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));

  if (!unauthenticated.hasLoginButton || unauthenticated.hasAdminLayout) throw new Error("Unauthenticated admin gate failed");
  if (list.hasTierLeadMenu || list.hasTemporaryIntakeText || !list.hasNewApplicantLabel) throw new Error("Temporary admin sidebar/card normalization failed");
  if (detail.sectionCount !== 5 || detail.orders.join(",") !== "1,2,3,4,5") throw new Error("Temporary admin five-section order mismatch");
  if (detail.sections.join(",") !== "primary-profile,secondary-responses,secondary-links,unified-notes,consultation-date") throw new Error("Temporary admin section keys mismatch");
  if (detail.hasLegacyTabs || detail.currentWorkCount !== 0) throw new Error("Legacy tabs or CURRENT WORK remain visible");
  if ([detail.secondaryReviewCount, detail.secondaryLinkCount, detail.unifiedMemoCount, detail.consultationDateCount].some(count => count !== 1)) throw new Error("Single-page panel duplication detected");
  if (detail.privatePhotoCount !== 1 || detail.privateDocumentCount !== 1 || detail.copyButtonCount !== 1) throw new Error("Private photo/document or secondary link regression detected");
  if (mobile.horizontalOverflow || mobile.sectionCount !== 5 || mobile.privatePhotoCount !== 1 || mobile.secondaryLinkCount !== 1) throw new Error("Temporary admin mobile layout failed");
} finally {
  socket.close();
  chromium.kill("SIGTERM");
  server.close();
  await sleep(250);
  await rm(profileDir, { recursive:true, force:true });
}
