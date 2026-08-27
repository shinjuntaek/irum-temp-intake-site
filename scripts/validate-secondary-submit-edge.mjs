import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "supabase/functions/temporary-secondary-profile/index.ts"), "utf8");
const helperStart = source.indexOf("const normalizePhone =");
const helperEnd = source.indexOf("function normalizePrefillSnapshot(");
const validationStart = source.indexOf("type SubmissionValidationIssue");
const validationEnd = source.indexOf("async function detectMime(");
if ([helperStart, helperEnd, validationStart, validationEnd].some(index => index < 0)) throw new Error("Could not isolate Edge submit helpers");

const harness = `${source.slice(helperStart, helperEnd)}\n${source.slice(validationStart, validationEnd)}\nexport { normalizeSecondaryPayload, canonicalizeSecondaryPayloadPatch, validateSubmission };\n`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "irum-edge-submit-"));
const input = path.join(dir, "harness.ts");
const output = path.join(dir, "harness.mjs");
fs.writeFileSync(input, harness);
execFileSync("npx", ["--yes", "esbuild", input, "--platform=node", "--format=esm", `--outfile=${output}`], { stdio:"ignore" });
const { normalizeSecondaryPayload, canonicalizeSecondaryPayloadPatch, validateSubmission } = await import(`${pathToFileURL(output).href}?v=${Date.now()}`);

const female = {
  birthDate:"1992-04-15", height:"165", region:"서울", singleStatus:"예", maritalStatus:"없음",
  workType:"직장인", realCheckMethod:"대면 확인", realCheckDate:"2026-09-15",
  serviceSelection:"1:1 소개", privacyConsent:true,
};
if (validateSubmission("profile_female", female, new Set()) !== null) throw new Error("Complete female payload rejected");
const femaleOther = validateSubmission("profile_female", { ...female, workType:"기타", workTypeOther:"" }, new Set());
if (!femaleOther?.missing.includes("workTypeOther")) throw new Error("Female workTypeOther omission not blocked");
const femaleConsent = validateSubmission("profile_female", { ...female, privacyConsent:false }, new Set());
if (femaleConsent?.code !== "PRIVACY_CONSENT_REQUIRED" || femaleConsent.missing.join() !== "privacyConsent") throw new Error("Female privacy-only validation failed");

const male = {
  birthDate:"1990-03-12", height:"178", region:"서울", singleStatus:"예", maritalStatus:"없음",
  job:"의사", incomeMale:"1억~1.5억원", asset:"5~10억원", purpose:"결혼",
  serviceSelection:"1:1 소개", privacyConsent:true,
};
if (validateSubmission("profile_male", male, new Set(["job","income","asset"])) !== null) throw new Error("Male verified documents rejected");
if (validateSubmission("profile_male", { ...male, documentDeferred:true, documentDueDate:"2026-09-20" }, new Set()) !== null) throw new Error("Male deferred documents rejected");
const maleDocs = validateSubmission("profile_male", male, new Set());
for (const key of ["jobDocument","incomeDocument","assetDocument"]) if (!maleDocs?.missing.includes(key)) throw new Error(`Male missing document not blocked: ${key}`);

const stored = normalizeSecondaryPayload("profile_male", { ...male, purpose:"연애", privacyConsent:false, document_deferred:false });
const current = canonicalizeSecondaryPayloadPatch("profile_male", { purpose:"결혼", privacy_consent:true, document_deferred:true, document_due_date:"2026-09-25" });
const submitted = normalizeSecondaryPayload("profile_male", { ...stored, ...current });
if (submitted.purpose !== "결혼" || submitted.privacyConsent !== true || submitted.documentDeferred !== true || submitted.documentDueDate !== "2026-09-25") throw new Error("Current payload did not override stored draft aliases");
if (validateSubmission("profile_male", submitted, new Set()) !== null) throw new Error("Merged current payload rejected");

fs.rmSync(dir, { recursive:true, force:true });
console.log("secondary_edge_submit_qa=pass female=true female_other_guard=true male_verified=true male_deferred=true male_docs_guard=true privacy_guard=true current_payload_alias_override=true");
