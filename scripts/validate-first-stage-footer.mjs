import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = [
  "index.html",
  "apply/matching/index.html",
  "apply/social/index.html",
  "app/matching/index.html",
  "app/social/index.html",
  "matching/index.html",
  "social/index.html",
];
const sources = routes.map((route) => fs.readFileSync(path.join(root, route), "utf8"));
const hashes = sources.map((source) => crypto.createHash("sha256").update(source).digest("hex"));

assert.equal(new Set(hashes).size, 1, "1차 canonical/alias HTML은 byte-identical해야 합니다.");

const html = sources[0];
for (const required of [
  "정책 및 문의",
  "개인정보 처리방침",
  "이용약관",
  "전화 문의 010-8839-3764",
  'href="tel:01088393764"',
  'data-legal-svc="matching" data-legal="policy"',
  'data-legal-svc="matching" data-legal="terms"',
  "data-main-footer-policy",
  "function syncMainFooter(id)",
  "policy.hidden=id!=='main'",
  "syncMainFooter((document.querySelector('.page.on')||{}).id||'main')",
]) {
  assert.ok(html.includes(required), `푸터/약관 계약 누락: ${required}`);
}

for (const existingContract of [
  "temporary-intake-submit",
  "action:'create'",
  "action:'signed-upload'",
  "action:'complete'",
  "idempotency_key:payload.external_submission_id",
  "사진은 8MB 이하만 등록할 수 있습니다.",
  "var legalDocs=",
  '"policy": {"t": "개인정보처리방침"',
  '"terms": {"t": "이용약관"',
]) {
  assert.ok(html.includes(existingContract), `기존 1차 제출/약관 계약 누락: ${existingContract}`);
}

assert.equal((html.match(/010-8839-3764/g) || []).length, 2, "표시 번호는 text와 aria-label에만 있어야 합니다.");

console.log(`main-footer-validation=pass routes=${routes.length} sha256=${hashes[0]} main_only=true`);
