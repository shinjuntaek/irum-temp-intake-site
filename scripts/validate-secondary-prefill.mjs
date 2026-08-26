import fs from "node:fs";
import path from "node:path";

const root = "/home/ubuntu/irum-temp-intake";
const edge = fs.readFileSync(path.join(root, "supabase/functions/temporary-secondary-profile/index.ts"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const adminRoute = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
const profile = fs.readFileSync(path.join(root, "profile/index.html"), "utf8");
const mobileQa = fs.readFileSync(path.join(root, "scripts/qa-secondary-mobile.mjs"), "utf8");

if (admin !== adminRoute) throw new Error("admin.html and admin/index.html are not synchronized");

const edgeRequired = [
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
  'const BUILD_ID = "secondary-link-reissue-20260826-3"',
  'select("draft_revision")',
  'status: "submitted"',
];
for (const marker of edgeRequired) {
  if (!edge.includes(marker)) throw new Error(`Missing Edge prefill contract: ${marker}`);
}

const adminRequired = [
  "const secondaryPrefill = (item, formType) =>",
  'formType === "profile_female"',
  'formType === "profile_male"',
  "companyIndustry:company",
  "incomeFemale:income",
  "incomeMale:income",
  "asset,",
  "workTypeOther:profile.workTypeOther",
  "employmentOther:profile.employmentOther",
  "workplace:company",
  "serviceSelection:item.service",
  "const secondaryAnswerSections = (type)",
  "const secondaryObject = (value)",
  "const secondaryCanonicalReview = (type, value)",
  "const secondaryReviewPayload = (form, item = null)",
  "const secondaryHiddenReviewKeys = new Set(",
  "const secondaryFallbackLabel = (key)",
  "const secondaryHasReview = (form)",
  "const secondaryReviewMarkup = (form, item = null)",
  'document.getElementById("os-secondary-review")',
  "기타 응답",
  "희망 확인일",
  "근무 형태 직접 입력",
  "서류 제출 예정일",
  "secondaryHiddenReviewKeys.has(key)",
  "prefill:secondaryPrefill(item, formType)",
];
for (const marker of adminRequired) {
  if (!admin.includes(marker)) throw new Error(`Missing admin prefill mapping: ${marker}`);
}

const reviewStart = admin.indexOf("const secondaryObject =");
const reviewEnd = admin.indexOf("const secondaryReviewMarkup =", reviewStart);
if (reviewStart < 0 || reviewEnd < 0) throw new Error("Could not isolate secondary review payload helpers");
const { secondaryObject, secondaryCanonicalReview, secondaryReviewPayload, secondaryHiddenReviewKeys, secondaryFallbackLabel, secondaryHasReview } = new Function(`${admin.slice(reviewStart, reviewEnd)}; return { secondaryObject, secondaryCanonicalReview, secondaryReviewPayload, secondaryHiddenReviewKeys, secondaryFallbackLabel, secondaryHasReview };`)();
const revisionOnly = { status:"in_progress", draft_revision:9, draft_saved_at:"2026-08-26T00:54:00.000Z", prefill_snapshot:{ job:"전문직", region:"서울" }, draft_payload:{} };
if (!secondaryHasReview(revisionOnly) || Object.keys(secondaryReviewPayload(revisionOnly)).length !== 0) {
  throw new Error("Revision-only draft must keep progress state without duplicating first-stage prefill");
}
const legacyDraft = { status:"in_progress", draft_revision:2, prefill_snapshot:{ job:"전문직" }, draft_payload:'{"job":"대표","purpose":"marriage"}' };
if (secondaryObject(legacyDraft.draft_payload).job !== "대표" || secondaryReviewPayload(legacyDraft).job !== "대표") {
  throw new Error("Legacy JSON draft parsing or override failed");
}
const submitted = { status:"submitted", prefill_snapshot:{ job:"전문직", region:"서울" }, submitted_payload:{ job:"대표" } };
if (!secondaryHasReview(submitted) || secondaryReviewPayload(submitted).job !== "대표" || secondaryReviewPayload(submitted).region !== undefined) {
  throw new Error("Submitted review must render customer-written values without duplicating first-stage prefill");
}
if (secondaryHasReview({ status:"pending", draft_revision:0, prefill_snapshot:{ job:"전문직" }, draft_payload:{} })) {
  throw new Error("Unopened form must not appear as customer-written review");
}
if (secondaryHasReview({ status:"in_progress", draft_revision:0, draft_payload:{} })) {
  throw new Error("Empty in-progress form must not appear as customer-written review");
}
const legacyCanonical = secondaryCanonicalReview("profile_male", {
  occupation:"전문직",
  location:"서울",
  assets:"3억원",
  desiredService:"matching",
  datingPurpose:"결혼",
});
if (legacyCanonical.job !== "전문직" || legacyCanonical.region !== "서울" || legacyCanonical.asset !== "3억원" || legacyCanonical.serviceSelection !== "matching" || legacyCanonical.purpose !== "결혼") {
  throw new Error("Legacy secondary review canonical mapping failed");
}
if (!secondaryHiddenReviewKeys.has("token") || !secondaryHiddenReviewKeys.has("storage_path") || !secondaryHiddenReviewKeys.has("documents") || secondaryFallbackLabel("charmPoints") !== "매력 포인트") {
  throw new Error("Fallback review label or sensitive-key exclusion failed");
}

const mapperStart = admin.indexOf("const secondaryFirstValue =");
const mapperEnd = admin.indexOf("async function mountSecondaryPanel", mapperStart);
if (mapperStart < 0 || mapperEnd < 0) throw new Error("Could not isolate admin prefill mapper");
const { secondaryPrefill } = new Function(`${admin.slice(mapperStart, mapperEnd)}; return { secondaryPrefill };`)();
const male = secondaryPrefill({
  service:"matching",
  profile:{ name:"테스트", phone:"01012345678", gender:"male", height:"178", region:"서울", job:"기획", company:"테스트사", income:"7천만원", assets:"3억원", economicActivityType:"직장인", datingPurpose:"결혼" },
}, "profile_male");
if (male.incomeMale !== "7천만원" || male.asset !== "3억원" || male.serviceSelection !== "matching" || male.purpose !== "marriage") {
  throw new Error("Male prefill mapping failed");
}
const female = secondaryPrefill({
  service:"social",
  profile:{ name:"테스트", phone:"01012345678", gender:"female", job:"디자이너", businessDetail:"브랜드", education:"대학교", incomeRange:"5천만원" },
}, "profile_female");
if (female.companyIndustry !== "브랜드" || female.education !== "대학교" || female.school !== "" || female.serviceSelection !== "meeting") {
  throw new Error("Female prefill mapping failed");
}
const event = secondaryPrefill({
  service:"social",
  profile:{ name:"테스트", phone:"01012345678", gender:"female", job:"의사", company:"병원" },
}, "social_event");
if (event.job !== "의사" || event.workplace !== "병원") throw new Error("Event prefill mapping failed");

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
  "좋은 사람과",
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
for (const marker of [
  "secondary-admin-list",
  "secondarySubmittedSubjects",
  "data-secondary-complete-chip",
  "2차 신청 완료",
]) {
  if (!admin.includes(marker) && !edge.includes(marker)) throw new Error(`Missing secondary completion badge contract: ${marker}`);
}
if (profile.includes("form={...(data.form.draft_payload||{}),name:data.form.prefill.name")) {
  throw new Error("Legacy name/phone-only prefill initialization remains");
}
if (profile.includes("showError(e.message||'제출에 실패했습니다.')")) {
  throw new Error("Raw server error code must not be exposed to customers");
}
const validationStart = profile.indexOf("const missingMeta=");
const validationEnd = profile.indexOf("const showError=", validationStart);
if (validationStart < 0 || validationEnd < 0) throw new Error("Could not isolate profile missing-field helpers");
const validationHelpers = profile.slice(validationStart, validationEnd);
const { allMissing } = new Function(`
  const data={form:{form_type:'profile_male',documents:[]}};
  const form={birthDate:'',height:'178',region:'서울',singleStatus:'예',maritalStatus:'초혼',job:'기획',incomeMale:'8천~1억원',asset:'3~5억원',employment:'기타',employmentOther:'',documentDeferred:true,documentDueDate:'',purpose:'결혼',serviceSelection:'1:1 소개',privacyConsent:true};
  let step=5;
  const val=k=>form[k]??'';
  const docState=()=>undefined;
  const showError=()=>{};
  const renderProfile=()=>{};
  const requestAnimationFrame=()=>{};
  const scrollTo=()=>{};
  ${validationHelpers}
  return { allMissing };
`)();
const maleMissing = allMissing();
for (const expected of [["birthDate",1],["employmentOther",2],["documentDueDate",2]]) {
  const found = maleMissing.find(item => item.key === expected[0]);
  if (!found || found.step !== expected[1]) throw new Error(`Missing-field step mapping failed: ${expected[0]}`);
}
const customerQuestions = profile.slice(profile.indexOf("function stepContent()"), profile.indexOf("function invitation()"));
for (const legacyQuestion of ["타투에 대한 선호", "흡연에 대한 선호", "결혼 의향에 대한 기준"]) {
  if (customerQuestions.includes(legacyQuestion)) throw new Error(`Legacy question remains in customer form: ${legacyQuestion}`);
}

const inlineScripts = [...profile.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
inlineScripts.forEach((script) => new Function(script));

const forbiddenPublicPrefill = [
  "photo_refs",
  "storage_path",
  "signed_url",
  "consultation",
  "screening",
  "issued_by_email",
];
const normalizeBlock = edge.slice(edge.indexOf("function normalizeSecondaryPayload("), edge.indexOf("const generateRawToken"));
for (const marker of forbiddenPublicPrefill) {
  if (normalizeBlock.includes(marker)) throw new Error(`Forbidden prefill field found: ${marker}`);
}

console.log(`secondary_prefill_qa=pass profile_scripts=${inlineScripts.length} admin_sync=true`);
