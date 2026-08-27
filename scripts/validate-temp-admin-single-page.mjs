import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const route = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");

if (source !== route) throw new Error("admin.html and admin/index.html are not synchronized");

const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
for (const script of scripts) new vm.Script(script);

const requiredMarkers = [
  'TEMP_ADMIN_BUILD_ID = "temp-admin-pasted5-operations-20260827-3"',
  "const SLA_HOURS = 24",
  "const API_TIMEOUT_MS = 15000",
  'const READ_RETRY_ACTIONS = new Set(["admin-list","snapshot-list","operational-list","consultation-import-manifest","secondary-admin-list","admin-operations-list"])',
  "const RETRY_DELAYS_MS = [350,900]",
  'error?.code==="TEMPORARY_INTAKE_UNAVAILABLE"',
  'error?.code==="EDGE_TIMEOUT"',
  'error?.code==="NETWORK_UNAVAILABLE"',
  "if(!retryable||!transientError(lastError)||attempt>=attempts-1)throw lastError",
  "if(state.loadPromise)return state.loadPromise",
  'const [temp,legacy]=await Promise.all',
  'const [operational,consultation]=await Promise.all',
  'const [secondary,adminOps]=await Promise.all',
  "일시적인 연결 지연으로 기존 화면을 유지했습니다.",
  'id="retry-load"',
  'data-temp-single-applicant-page',
  'data-temp-applicant-section',
  'data-temp-section-order',
  'section(1,"primary-profile","1차 기본 프로필"',
  'section(2,"secondary-responses","2차 신청폼 응답"',
  'section(3,"secondary-links","2차 신청폼 링크"',
  'section(4,"unified-notes","통메모장"',
  'section(5,"consultation-date","상담·연락 일정"',
  'admin-operations-list',
  'admin-workflow-set',
  'secondary-admin-review',
  'admin-member-set',
  'admin-match-create',
  'admin-match-transition',
  'admin-social-status-set',
  'admin-schedule-add',
  'admin-schedule-cancel',
  'admin-session-start',
  'secondary-admin-document-url',
  'admin-photo-url',
  'snapshot-photo-url',
  'secondary-admin-mark-sent',
  'secondary-admin-clear-sent',
  '링크 복사',
  '신청서 접수 안내',
  '추가 서류 요청',
  '모임 안내',
  '실제 Event 기준 모임 운영',
  '상담 예정일',
  '다음 연락 예정일',
  '기존 데이터 조회',
  '운영 이력',
  'aria-controls="admin-navigation"',
  'aria-expanded="false"',
  'e.key==="Escape"',
  'document.body.style.overflow="hidden"',
  'const filterQueryKeys={q:"q",stage:"stage",service:"service",sent:"secondaryLink",submitted:"secondaryCompletion"',
  "new URLSearchParams(location.search)",
  "history.replaceState",
  "data-filter-result-count",
  "function latestScheduleEvents",
  "function renderMembersV2",
  'const memberTransitions={approval_pending:["converted"]',
  "function renderMatchingV2",
  'i.member?.member_status==="matchable"',
  "function renderSocialV2",
  'payment_pending:"결제 대기"',
  'paid:"결제 완료"',
  "socialEventFee",
  "참가비 미등록",
  "취소·불참 사유",
  'subject_type:form.subject_type,subject_id:String(form.subject_id)',
  'privacyConsent:"개인정보 수집·2차 프로필 활용 동의"',
  'documentTypeLabels={job:"직업 인증서류"',
  'documentStatusLabels={verified:"확인 완료"',
];
for (const marker of requiredMarkers) {
  if (!source.includes(marker)) throw new Error(`missing temporary admin marker: ${marker}`);
}

for (const label of ["대시보드", "신청자", "승인 회원", "1:1 매칭", "모임 신청 현황", "할 일·일정", "운영 이력", "로그아웃"]) {
  if (!source.includes(label)) throw new Error(`missing navigation label: ${label}`);
}
for (const removed of ["티어 확인 리드", "Host 유입 검수", "통계 · Funnel", "관리자 · 권한", "CURRENT WORK", "CRM Import Preview"]) {
  if (source.includes(removed)) throw new Error(`removed navigation or legacy UI remains: ${removed}`);
}

const renderStart = source.indexOf("function renderApplicant(item)");
const renderEnd = source.indexOf("function section(order", renderStart);
if (renderStart < 0 || renderEnd <= renderStart) throw new Error("canonical applicant renderer not found");
const renderBlock = source.slice(renderStart, renderEnd);
const sectionKeys = ["primary-profile", "secondary-responses", "secondary-links", "unified-notes", "consultation-date"];
for (const key of sectionKeys) {
  if ((renderBlock.match(new RegExp(`\"${key}\"`, "g")) || []).length !== 1) {
    throw new Error(`section key must appear exactly once: ${key}`);
  }
}

for (const stage of ["신규 접수", "1차 검토 중", "2차 링크 발송 필요", "2차 작성 대기", "2차 작성 중", "2차 심사 필요", "승인", "보류", "미승인", "회원 전환 완료"]) {
  if (!source.includes(stage)) throw new Error(`missing workflow stage: ${stage}`);
}
for (const memberStatus of ["승인 대기", "매칭 가능", "매칭 진행중", "소개 일정 확정", "일시 중단", "종료"]) {
  if (!source.includes(memberStatus)) throw new Error(`missing member status: ${memberStatus}`);
}
for (const socialStatus of ["신청", "검토 중", "선정", "대기", "결제 대기", "결제 완료", "참석 확정", "취소", "참석", "불참"]) {
  if (!source.includes(socialStatus)) throw new Error(`missing social status: ${socialStatus}`);
}
for (const matchStatus of ["후보 선택", "남성 검토 중", "남성 수락", "남성 거절", "일정 조율", "만남 확정", "만남 완료"]) {
  if (!source.includes(matchStatus)) throw new Error(`missing male-choice matching status: ${matchStatus}`);
}
if (/female_(accepted|rejected)/.test(source) || /<option[^>]*>여성\s*(수락|거절)<\/option>/.test(source)) {
  throw new Error("female accept/reject state must not exist");
}

const copyStart = source.indexOf("async function copyText");
const copyEnd = source.indexOf("function resetRedirectUrl", copyStart);
const copyBlock = source.slice(copyStart, copyEnd);
if (copyStart < 0 || copyEnd <= copyStart || copyBlock.includes("secondary-admin-mark-sent")) {
  throw new Error("copy must not auto-mark a link as sent");
}

const groupingStart = source.indexOf("function groupItems()");
const groupingEnd = source.indexOf("const stageLabels", groupingStart);
const groupingBlock = source.slice(groupingStart, groupingEnd);
if (!groupingBlock.includes("normalizePhone") || !groupingBlock.includes("external_submission_id") || !groupingBlock.includes("g.services.add")) {
  throw new Error("display-only applicant grouping contract is incomplete");
}
if (/\.(insert|update|delete)\(/.test(groupingBlock) || groupingBlock.includes("invokeAdmin(")) {
  throw new Error("display-only grouping must not mutate operational data");
}

if (/8월\s*29일|9월\s*19일/.test(source)) throw new Error("social event dates must not be hardcoded");
if (!source.includes('ops("social_event")') || !source.includes("eventById")) throw new Error("dynamic Event source contract missing");
if (!source.includes("latestScheduleEvents().map") || !source.includes("if(!latestByKey.has(key))")) throw new Error("latest schedule projection contract missing");
if (!source.includes("readFilterQuery()") || !source.includes("writeFilterQuery()")) throw new Error("filter query persistence contract missing");
if (!source.includes('f.status==="submitted"?reviewMarkup') || !source.includes("심사 불가")) throw new Error("review eligibility UI contract missing");
if (!source.includes("보류·미승인·추가 자료 요청은 사유가 필수")) throw new Error("review reason contract missing");
if (!source.includes("raw token은 저장하지 않습니다")) throw new Error("raw token safety notice missing");
if (source.includes("URL.createObjectURL") || source.includes("download =")) throw new Error("raw JSON export UI must not remain");

console.log(`temp_admin_single_page_qa=pass scripts=${scripts.length} synchronized=true sections=${sectionKeys.length} workflow=true review=true member=true male_choice_matching=true dynamic_events=true split_schedules=true audit=true`);
