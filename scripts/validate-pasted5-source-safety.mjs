import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = [
  "admin.html",
  "admin/index.html",
  "supabase/functions/temporary-intake-submit/index.ts",
  "supabase/functions/temporary-secondary-profile/index.ts",
  "scripts/validate-secondary-submit-edge.mjs",
];
const entries = await Promise.all(paths.map(async relative => [relative, await readFile(path.join(root, relative), "utf8")]));
const sources = new Map(entries);

assert.equal(sources.get("admin.html"), sources.get("admin/index.html"), "admin canonical route drift");
for (const [relative, source] of entries) {
  assert.ok(!source.includes("YOUR_SUPABASE_"), `placeholder leaked: ${relative}`);
  assert.ok(!source.includes("/home/ubuntu/"), `workspace path leaked: ${relative}`);
}

const admin = sources.get("admin.html");
assert.ok(admin.includes("https://wiesmommcmwwwkwufgqg.supabase.co/functions/v1/temporary-intake-submit"));
assert.ok(admin.includes("https://wiesmommcmwwwkwufgqg.supabase.co/functions/v1/temporary-secondary-profile"));
assert.ok(admin.includes('TEMP_ADMIN_BUILD_ID = "temp-admin-consultation-crm-20260827-1"'));

const validator = sources.get("scripts/validate-secondary-submit-edge.mjs");
assert.ok(validator.includes("fileURLToPath(import.meta.url)"));
assert.ok(validator.includes('path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")'));

console.log("pasted5_source_safety=pass placeholders=false home_paths=false admin_sync=true");
