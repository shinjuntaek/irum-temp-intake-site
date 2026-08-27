import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const route = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");

if (source !== route) throw new Error("admin.html and admin/index.html are not synchronized");

const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
for (const script of scripts) new vm.Script(script);

for (const marker of [
  'const issuedLinksKey = "irum-temp-secondary-issued-links-v1"',
  "rememberLink(result.form?.id,result.raw_url)",
  "data-raw-link",
  "data-copy-link",
  "data-reissue",
  "링크 복사",
  "링크 재발급",
  'invokeSecondary("secondary-admin-reissue"',
  'invokeSecondary("secondary-admin-mark-sent"',
  'invokeSecondary("secondary-admin-clear-sent"',
  "raw token은 저장하지 않습니다.",
  "sessionStorage.removeItem(issuedLinksKey)",
]) {
  if (!source.includes(marker)) throw new Error(`missing secondary link UI marker: ${marker}`);
}

const copyStart = source.indexOf("async function copyText");
const copyEnd = source.indexOf("function resetRedirectUrl", copyStart);
const copyBlock = source.slice(copyStart, copyEnd);
if (copyStart < 0 || copyEnd <= copyStart || copyBlock.includes("secondary-admin-mark-sent")) {
  throw new Error("link copy must not auto-mark secondary delivery complete");
}

const edge = fs.readFileSync(path.join(root, "supabase", "functions", "temporary-secondary-profile", "index.ts"), "utf8");
const listStart = edge.indexOf('if (action === "secondary-admin-list")');
const documentStart = edge.indexOf('if (action === "secondary-admin-document-url")');
if (listStart < 0 || documentStart <= listStart) throw new Error("secondary admin list contract not found");
const listContract = edge.slice(listStart, documentStart);
if (listContract.includes("token_hash") || listContract.includes("raw_url")) {
  throw new Error("secondary admin list leaks reusable token material");
}

const reissueStart = edge.indexOf('if (action === "secondary-admin-reissue")');
const reissueEnd = edge.indexOf('if (action === "secondary-admin-mark-sent")', reissueStart);
if (reissueStart < 0 || reissueEnd <= reissueStart) throw new Error("secondary reissue action contract not found");
const reissueContract = edge.slice(reissueStart, reissueEnd);
for (const marker of [
  '.in("status", ["pending", "in_progress"])',
  "token_hash: tokenHash",
  "token_prefix: tokenPrefix",
  "expires_at: expiresAt",
  "sent_at: null",
  "sent_by_user_id: null",
  "sent_by_email: null",
  'appendEvent(database, formId, "reissued"',
  "raw_url:",
  "build_id: BUILD_ID",
]) {
  if (!reissueContract.includes(marker)) throw new Error(`missing secondary reissue marker: ${marker}`);
}
for (const forbidden of ["draft_payload:", "submitted_payload:", "prefill_snapshot:", "status:"]) {
  if (reissueContract.includes(forbidden)) throw new Error(`secondary reissue must not overwrite existing form data: ${forbidden}`);
}

for (const [action, event] of [["secondary-admin-mark-sent", "link_sent_marked"], ["secondary-admin-clear-sent", "link_sent_cleared"]]) {
  const start = edge.indexOf(`if (action === "${action}")`);
  const end = edge.indexOf('if (action === "', start + 10);
  const block = edge.slice(start, end > start ? end : undefined);
  for (const marker of ["requireTemporaryAdmin(req)", "sent_at", "sent_by_user_id", "sent_by_email", event, "build_id: BUILD_ID"]) {
    if (!block.includes(marker)) throw new Error(`missing ${action} marker: ${marker}`);
  }
}

for (const marker of ["sent_at", "sent_by_user_id", "sent_by_email", "reviews", "profile_events"]) {
  if (!listContract.includes(marker)) throw new Error(`secondary admin list missing metadata: ${marker}`);
}

console.log(`secondary_link_ui_qa=pass scripts=${scripts.length} synchronized=true token_list_leak=false manual_sent_independent=true`);
