import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const routeAdmin = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
const edge = fs.readFileSync(path.join(root, "supabase/functions/temporary-intake-submit/index.ts"), "utf8");

if (admin !== routeAdmin) throw new Error("admin route is not synchronized");

const scripts = [...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
for (const source of scripts) new vm.Script(source);

for (const marker of [
  "state.loadedAt&&Date.now()-state.loadedAt<20000",
  "if(state.loading)return",
  'img.loading="lazy"',
  "async function loadThumb(button,item)",
  "async function openGallery(item)",
  'invokeAdmin("admin-photo-url"',
  'invokeAdmin("snapshot-photo-url"',
  "비공개 사진 불러오는 중",
  "사진 보완 대기",
  'id="refresh"',
]) {
  if (!admin.includes(marker)) throw new Error(`missing admin performance marker: ${marker}`);
}

for (const marker of [
  'body.action === "admin-photo-url"',
  'body.action === "snapshot-photo-url"',
  "requireTemporaryAdmin(req)",
  '.createSignedUrl(path, 600)',
  'path.startsWith("legacy/")',
  'path.startsWith(`submissions/${recordId}/`)',
  'appendAdminAudit(database, "photo_opened"',
]) {
  if (!edge.includes(marker)) throw new Error(`missing Edge private-photo marker: ${marker}`);
}

if (/publicUrl|createPublicUrl|getPublicUrl/.test(edge)) throw new Error("private applicant photos must not use public URLs");
if (/appendAdminAudit\([^)]*(path|signed_url|storage_path)/s.test(edge)) throw new Error("photo audit must not persist paths or signed URLs");

console.log(`admin_performance_qa=pass scripts=${scripts.length} synchronized=true data_cache=true lazy_private_photo=true short_signed_url=true`);
