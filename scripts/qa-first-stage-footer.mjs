import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4187;
const debugPort = 9237;
const output = "/tmp/irum-first-stage-footer-qa";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    let filename = path.join(root, decodeURIComponent(url.pathname));
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, "index.html");
    response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream" });
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const chrome = spawn("/usr/bin/chromium", ["--headless=new", "--no-sandbox", `--remote-debugging-port=${debugPort}`, "--user-data-dir=/tmp/irum-first-stage-footer-chrome", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  ws.onmessage = (event) => {
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
  const { targetId } = await call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Page.enable", {}, sessionId);
  await call("Runtime.enable", {}, sessionId);
  await call("Network.enable", {}, sessionId);
  await call("Network.setBlockedURLs", { urls: ["*connect.facebook.net*", "*facebook.com/tr*", "*supabase.co*"] }, sessionId);

  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    return result.result.value;
  };
  const screenshot = async (name) => {
    const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(path.join(output, name), Buffer.from(image.data, "base64"));
  };
  await import("node:fs/promises").then(({ mkdir }) => mkdir(output, { recursive: true }));

  const verifyRoute = async ({ route, width, height, expectedPage, expectPolicy, screenshotName }) => {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 520 }, sessionId);
    await call("Page.navigate", { url: `http://127.0.0.1:${port}${route}` }, sessionId);
    await sleep(900);
    await evaluate("var formModal=document.getElementById('applyModal'); if(formModal) formModal.hidden=true; document.body.style.overflow=''; document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,document.body.scrollHeight); true");
    await sleep(180);
    const footer = JSON.parse(await evaluate(`JSON.stringify({
      text:document.querySelector('footer')?.innerText||'',
      page:document.querySelector('.page.on')?.id||'',
      phone:document.querySelector('footer a[href="tel:01088393764"]')?.textContent.trim()||'',
      policy:document.querySelector('footer [data-legal="policy"]')?.textContent.trim()||'',
      terms:document.querySelector('footer [data-legal="terms"]')?.textContent.trim()||'',
      policyVisible:!document.querySelector('[data-main-footer-policy]')?.hidden,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      minTouch:Math.min(...Array.from(document.querySelectorAll('footer a.fl')).map(a=>a.getBoundingClientRect().height))
    })`));
    if (footer.page !== expectedPage) throw new Error(`${route} active page mismatch: ${footer.page}`);
    if (footer.overflow > 1) throw new Error(`${route} horizontal overflow: ${footer.overflow}`);
    if (footer.policyVisible !== expectPolicy) throw new Error(`${route} main-only policy visibility mismatch: ${footer.policyVisible}`);
    if (!expectPolicy) return;
    for (const marker of ["정책 및 문의", "개인정보 처리방침", "이용약관", "전화 문의 010-8839-3764"]) if (!footer.text.includes(marker)) throw new Error(`${route} footer missing: ${marker}`);
    if (footer.phone !== "전화 문의 010-8839-3764" || footer.policy !== "개인정보 처리방침" || footer.terms !== "이용약관") throw new Error(`${route} footer link mismatch`);

    await evaluate("document.querySelector('footer [data-legal=terms]').click(); true");
    await sleep(80);
    const termsTitle = await evaluate("document.querySelector('#legalBody .lg-title')?.textContent||''");
    if (termsTitle !== "이룸 신청·심사 이용약관") throw new Error(`${route} terms mismatch: ${termsTitle}`);
    await evaluate("document.querySelector('#legalClose').click(); true");
    await evaluate("document.querySelector('footer [data-legal=policy]').click(); true");
    await sleep(80);
    const policyTitle = await evaluate("document.querySelector('#legalBody .lg-title')?.textContent||''");
    if (policyTitle !== "이룸 개인정보처리방침") throw new Error(`${route} policy mismatch: ${policyTitle}`);
    await evaluate("document.querySelector('#legalClose').click(); window.scrollTo(0,document.body.scrollHeight); true");
    await sleep(100);
    await screenshot(screenshotName);
  };

  await verifyRoute({ route: "/", width: 1280, height: 800, expectedPage: "main", expectPolicy: true, screenshotName: "main-footer-desktop.png" });
  await verifyRoute({ route: "/", width: 390, height: 844, expectedPage: "main", expectPolicy: true, screenshotName: "main-footer-mobile.png" });
  await verifyRoute({ route: "/apply/matching/", width: 390, height: 844, expectedPage: "matching", expectPolicy: false });
  await verifyRoute({ route: "/apply/social/", width: 390, height: 844, expectedPage: "social", expectPolicy: false });

  console.log("main_footer_chromium_qa=pass desktop=1280x800 mobile=390x844 policy_modal=true terms_modal=true tel_link=true apply_routes_hidden=true overflow=false");
} finally {
  try { ws?.close(); } catch {}
  chrome.kill("SIGTERM");
  server.close();
}
