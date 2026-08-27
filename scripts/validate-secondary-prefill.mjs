import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/temporary-secondary-profile/index.ts"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const adminRoute = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
const profile = fs.readFileSync(path.join(root, "profile/index.html"), "utf8");
const mobileQa = fs.readFileSync(path.join(root, "scripts/qa-secondary-mobile.mjs"), "utf8");

if (admin !== adminRoute) throw new Error("admin.html and admin/index.html are not synchronized");

for (const marker of [
  "function normalizeSecondaryPayload(",
  "function canonicalizeSecondaryPayloadPatch(",
  "function normalizePrefillSnapshot(",
  'formType === "profile_female"',
  'formType === "profile_male"',
  "companyIndustry: limitedText(raw.companyIndustry ?? raw.company_industry, 200)",
  "incomeMale: limitedText(raw.incomeMale ?? raw.income_male, 100)",
  "workTypeOther: limitedText(raw.workTypeOther ?? raw.work_type_other ?? raw.work_other, 160)",
  "realCheckDate: limitedText(raw.realCheckDate ?? raw.real_check_date, 20)",
  "employmentOther: limitedText(raw.employmentOther ?? raw.employment_other ?? raw.work_other, 160)",
  "workplace: limitedText(raw.workplace ?? raw.companyIndustry ?? raw.company, 200)",
  "normalizeSecondaryPayload(form.form_type, stripSecrets(body.draft_payload ?? {}))",
  "const storedDraft = normalizeSecondaryPayload(form.form_type, stripSecrets(form.draft_payload ?? {}))",
  "const currentPayload = canonicalizeSecondaryPayloadPatch(form.form_type, stripSecrets(body.payload ?? {}))",
  "...storedDraft",
  "...currentPayload",
  "const normalizedPrefill = normalizePrefillSnapshot(formType, prefill, genderSnapshot)",
  "...(form.prefill_snapshot ?? {})",
  "draft_payload, draft_revision",
  "type SubmissionValidationIssue = { code: string; missing: string[] }",
  'missing.push("jobDocument")',
  'missing.push("incomeDocument")',
  'missing.push("assetDocument")',
  "missing_fields: validationError.missing",
  '"realCheckDate"',
  'const BUILD_ID = "secondary-temp-admin-operations-20260827-3"',
  'select("draft_revision")',
  'status: "submitted"',
]) {
  if (!edge.includes(marker)) throw new Error(`Missing Edge prefill contract: ${marker}`);
}

for (const marker of [
  'const formTypeLabel=',
  'function formAnswers(form)',
  'form.status==="submitted"?(form.submitted_payload||{}):(form.draft_payload||{})',
  'const hiddenKeys=new Set(',
  'prefill:item.profile',
  'secondary-admin-review',
  'item.form?.status==="submitted"?"완료":"미완료"',
  '2차 제출',
  '제출 완료',
]) {
  if (!admin.includes(marker)) throw new Error(`Missing admin prefill/review contract: ${marker}`);
}
const answerStart = admin.indexOf("function formAnswers(form)");
const answerEnd = admin.indexOf("function reviewMarkup", answerStart);
const answerBlock = admin.slice(answerStart, answerEnd);
if (answerStart < 0 || answerEnd <= answerStart || answerBlock.includes("prefill_snapshot")) {
  throw new Error("secondary answer panel must render only customer-written draft/submitted values");
}

const profileRequired = [
  "대표의 <em>편지</em>",
  "IRUM 공동 대표 소개 사진",
  "IRUM 프라이빗 모임 HOST 안수빈 소개",
  "const examples=",
  "IRUM의 첫 번째 검토를 통과하셨습니다.",
  "1차 신청 내용은 미리 입력해두었습니다. 변경된 정보만 수정해 주세요.",
  "function invitation()",
  "canonicalChoices(normalizeLegacy(data.form.prefill||{}))",
  "form={...prefill,...draft,name:prefill.name||'',phone:prefill.phone||''",
  "healthFlag:draft.healthFlag||''",
  "privacyConsent:bool(draft.privacyConsent??prefill.privacyConsent??false)",
  "documentDeferred:bool(draft.documentDeferred??prefill.documentDeferred??false)",
  "const CLIENT_BUILD_ID='secondary-submit-cas-current-payload-20260826-2'",
  "activeDraftSave=null",
  "const saveDraft=async({retryConflict=true}={})=>",
  "if(previous)await previous",
  "const currentPayload={...form,privacyConsent:form.privacyConsent===true,documentDeferred:form.documentDeferred===true}",
  "const completionProfileTitle=()=>",
  "`${name}님의 프로필이 IRUM에 전달되었습니다.`",
  ":'프로필이 IRUM에 전달되었습니다.'",
  "IRUM에 프로필 전달하기",
  "근무 형태 직접 입력",
  "희망 확인일",
  "인증서류를 추후 제출하겠습니다.",
  "직업 인증",
  "명함",
  "const allMissing=()",
  "const focusMissing=items=>",
  "const serverMissing=e=>",
];
for (const marker of profileRequired) {
  if (!profile.includes(marker)) throw new Error(`Missing reference-form or merge contract: ${marker}`);
}

if (!mobileQa.includes("body.action === 'secondary-draft-save'")) throw new Error("Mobile QA does not intercept the real secondary-draft-save action");
if (mobileQa.includes("body.action === 'secondary-save-draft'")) throw new Error("Legacy secondary-save-draft mock remains in mobile QA");
if (edge.includes('if (formType === "profile_female" || formType === "profile_male")')) throw new Error("Invalid privacy-only early return remains in validateSubmission");
if (profile.includes("form={...(data.form.draft_payload||{}),name:data.form.prefill.name")) throw new Error("Legacy name/phone-only prefill initialization remains");
if (profile.includes("showError(e.message||'제출에 실패했습니다.')")) throw new Error("Raw server error code must not be exposed to customers");

const validationStart = profile.indexOf("const missingMeta=");
const validationEnd = profile.indexOf("const showError=", validationStart);
if (validationStart < 0 || validationEnd < 0) throw new Error("Could not isolate profile missing-field helpers");
const validationHelpers = profile.slice(validationStart, validationEnd);
const { allMissing } = new Function(`
  const data={form:{form_type:'profile_male',documents:[]}};
  const form={birthDate:'',height:'178',region:'서울',singleStatus:'예',maritalStatus:'초혼',job:'기획',incomeMale:'8천~1억원',asset:'3~5억원',employment:'기타',employmentOther:'',documentDeferred:true,documentDueDate:'',purpose:'결혼',serviceSelection:'1:1 소개',privacyConsent:true};
  let step=5; const val=k=>form[k]??''; const docState=()=>undefined; const showError=()=>{}; const renderProfile=()=>{}; const requestAnimationFrame=()=>{}; const scrollTo=()=>{};
  ${validationHelpers}
  return { allMissing };
`)();
const maleMissing = allMissing();
for (const [key, expectedStep] of [["birthDate",1],["employmentOther",2],["documentDueDate",2]]) {
  const found = maleMissing.find((item) => item.key === key);
  if (!found || found.step !== expectedStep) throw new Error(`Missing-field step mapping failed: ${key}`);
}

const customerQuestions = profile.slice(profile.indexOf("function stepContent()"), profile.indexOf("function invitation()"));
for (const legacyQuestion of ["타투에 대한 선호", "흡연에 대한 선호", "결혼 의향에 대한 기준"]) {
  if (customerQuestions.includes(legacyQuestion)) throw new Error(`Legacy question remains in customer form: ${legacyQuestion}`);
}

for (const script of [...profile.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1])) new vm.Script(script);
for (const script of [...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1])) new vm.Script(script);

const normalizeBlock = edge.slice(edge.indexOf("function normalizeSecondaryPayload("), edge.indexOf("const generateRawToken"));
for (const marker of ["photo_refs", "storage_path", "signed_url", "consultation", "screening", "issued_by_email"]) {
  if (normalizeBlock.includes(marker)) throw new Error(`Forbidden public prefill field found: ${marker}`);
}

console.log("secondary_prefill_qa=pass admin_sync=true current_payload_merge=true customer_answers_only=true");
