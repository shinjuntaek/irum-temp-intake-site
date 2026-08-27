import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = "/tmp/irum-admin-refresh-chromium";
const chromium = process.env.CHROMIUM_PATH || ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!chromium) throw new Error("Chromium executable not found");
const port = 4191;
const debugPort = 9341;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname);
    const candidate = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = path.resolve(root, `.${candidate}`);
    if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) throw new Error("NOT_FOUND");
    response.writeHead(200, { "Content-Type": file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
await rm(profile, { recursive: true, force: true });
const chromeProcess = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let socket;
try {
  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json()); break; } catch { await sleep(100); }
  }
  if (!target?.webSocketDebuggerUrl) throw new Error("Chromium debugging port did not open");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const job = pending.get(message.id);
    pending.delete(message.id);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 12000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/admin/` });
  await waitFor("document.querySelector('#login-button')", "login gate");

  const success = JSON.parse(await evaluate(`(async()=>{
    sessionStorage.setItem(sessionKey,JSON.stringify({access_token:'qa-token',expires_at:Math.floor(Date.now()/1000)+3600}));
    window.__refreshQa={mode:'recover',counts:{},calls:[]};
    window.fetch=async(_url,init={})=>{
      const action=JSON.parse(init.body||'{}').action;
      const qa=window.__refreshQa;
      qa.counts[action]=(qa.counts[action]||0)+1;
      qa.calls.push({action,at:Date.now()});
      if(qa.mode==='recover'&&action==='admin-list'&&qa.counts[action]<3)return new Response(JSON.stringify({error:'TEMPORARY_INTAKE_UNAVAILABLE'}),{status:500,headers:{'Content-Type':'application/json'}});
      if(qa.mode==='stale'&&action==='admin-list')return new Response(JSON.stringify({error:'TEMPORARY_INTAKE_UNAVAILABLE'}),{status:500,headers:{'Content-Type':'application/json'}});
      if(qa.mode==='forbidden'&&action==='admin-list')return new Response(JSON.stringify({error:'FORBIDDEN'}),{status:403,headers:{'Content-Type':'application/json'}});
      const payload=action==='secondary-admin-list'?{forms:[],documents:[],reviews:[],profile_events:[]}:action==='admin-operations-list'?{workflows:[],workflow_events:[],schedule_events:[],member_events:[],matching_cases:[],matching_events:[],social_events:[],audit_events:[]}:{records:[]};
      return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
    };
    await navigate('dashboard',true);
    return JSON.stringify({counts:window.__refreshQa.counts,calls:window.__refreshQa.calls,title:document.querySelector('.page-title')?.textContent||'',error:document.body.innerText.includes('운영 데이터를 불러오지 못했습니다')});
  })()`));

  if (success.counts["admin-list"] !== 3 || success.counts["snapshot-list"] !== 1 || success.counts["secondary-admin-list"] !== 1 || success.title !== "처리해야 할 일을 먼저 봅니다" || success.error) {
    throw new Error(`transient recovery failed: ${JSON.stringify(success)}`);
  }
  const adminSuccessAt = success.calls.filter((call) => call.action === "admin-list").at(-1).at;
  const secondBatchAt = success.calls.find((call) => call.action === "operational-list")?.at || 0;
  if (secondBatchAt < adminSuccessAt) throw new Error("load batches overlapped before first batch recovered");

  const stale = JSON.parse(await evaluate(`(async()=>{
    const before=state.loadedAt;
    window.__refreshQa={mode:'stale',counts:{},calls:[]};
    await navigate('dashboard',true);
    return JSON.stringify({counts:window.__refreshQa.counts,loadedAt:state.loadedAt,before,title:document.querySelector('.page-title')?.textContent||'',toast:document.querySelector('.toast')?.textContent||''});
  })()`));
  if (stale.counts["admin-list"] !== 3 || stale.loadedAt !== stale.before || stale.title !== "처리해야 할 일을 먼저 봅니다" || !stale.toast.includes("기존 화면을 유지했습니다")) {
    throw new Error(`stale data preservation failed: ${JSON.stringify(stale)}`);
  }

  const forbidden = JSON.parse(await evaluate(`(async()=>{
    window.__refreshQa={mode:'forbidden',counts:{},calls:[]};
    await navigate('dashboard',true);
    return JSON.stringify({counts:window.__refreshQa.counts,text:document.body.innerText,retry:!!document.querySelector('#retry-load')});
  })()`));
  if (forbidden.counts["admin-list"] !== 1 || !forbidden.text.includes("로그인 권한을 확인해 주세요") || !forbidden.retry) {
    throw new Error(`permanent permission error handling failed: ${JSON.stringify(forbidden)}`);
  }

  console.log("admin_refresh_resilience_qa=pass transient_retry=3 batched_reads=true stale_data_preserved=true forbidden_retry=1 write_calls=0");
} finally {
  try { socket?.close(); } catch {}
  chromeProcess.kill("SIGTERM");
  server.close();
  await sleep(200);
  await rm(profile, { recursive: true, force: true });
}
