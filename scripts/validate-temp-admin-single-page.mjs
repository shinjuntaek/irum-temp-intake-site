import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = "/home/ubuntu/irum-temp-intake";
const source = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const route = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");

if (source !== route) throw new Error("admin.html and admin/index.html are not synchronized");

const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
for (const script of scripts) new vm.Script(script);

const requiredMarkers = [
  'document.querySelector(\'[data-os-nav="prechecks"]\')?.remove()',
  'item.kind === "legacy_snapshot" ? "기존 신청" : "신규 신청"',
  'data-temp-single-applicant-page',
  'data-temp-applicant-section',
  'data-temp-section-order',
  '"primary-profile","1차 기본 프로필"',
  '"secondary-responses","2차 신청폼 응답"',
  '"secondary-links","2차 신청폼 링크"',
  '"unified-notes","통메모장"',
  '"consultation-date","상담일자"',
  'data-temp-unified-memo',
  'data-temp-consultation-date',
  'invokeAdmin("consultation-add"',
  'await Promise.all([mountSecondaryReview(item), mountSecondaryPanel(item)])',
  'osPhotoThumbMarkup(item)',
  'data-secondary-document',
  'invokeSecondaryAdmin("secondary-admin-document-url"',
  'data-secondary-copy',
  'data-secondary-mark-sent',
  'data-secondary-clear-sent',
  'invokeSecondaryAdmin("secondary-admin-mark-sent"',
  'invokeSecondaryAdmin("secondary-admin-clear-sent"',
  'data-secondary-list-filters',
  'id="os-app-sent-status"',
  'id="os-app-secondary-status"',
  'data-social-application-schedules',
  '8월 29일',
  '9월 19일',
  '다음 모임 희망',
  '구형 신청 · 일정 미수집',
  '.os-mobile-menu-toggle',
  'side.id="temp-admin-mobile-navigation"',
  'aria-controls="temp-admin-mobile-navigation"',
  'aria-expanded="false"',
  'side.setAttribute("aria-label","관리자 전체 메뉴")',
  'event.key==="Escape"',
  'document.body.style.overflow="hidden"',
  'layout.classList.contains("os-mobile-menu-open")',
  'osInitMobileMenu()',
];
for (const marker of requiredMarkers) {
  if (!source.includes(marker)) throw new Error(`missing temp admin single-page marker: ${marker}`);
}

const singlePageStart = source.indexOf("const osSinglePageTemporaryPattern");
const secondaryMountStart = source.indexOf("const osRenderWorkspaceWithoutSecondary", singlePageStart);
if (singlePageStart < 0 || secondaryMountStart <= singlePageStart) {
  throw new Error("temp admin single-page override block not found");
}
const singlePageBlock = source.slice(singlePageStart, secondaryMountStart);
if (singlePageBlock.includes("osDetailTab") || singlePageBlock.includes("CURRENT WORK")) {
  throw new Error("legacy tab/current-work UI remains in effective single-page override");
}

const sectionKeys = [
  "primary-profile",
  "secondary-responses",
  "secondary-links",
  "unified-notes",
  "consultation-date",
];
for (const key of sectionKeys) {
  if ((singlePageBlock.match(new RegExp(`\\\"${key}\\\"`, "g")) || []).length !== 1) {
    throw new Error(`section key must appear once in effective single-page block: ${key}`);
  }
}

const reviewStart = source.indexOf("const secondaryReviewPayload");
const reviewEnd = source.indexOf("const secondaryHiddenReviewKeys", reviewStart);
const reviewBlock = source.slice(reviewStart, reviewEnd);
if (!reviewBlock.includes("return written") || reviewBlock.includes("currentPrefill") || reviewBlock.includes("prefill_snapshot")) {
  throw new Error("secondary response panel must render only customer-written values");
}

if (!singlePageBlock.includes("osSinglePageTemporaryPattern.test(action) ? \"담당자 배정\"")) {
  throw new Error("temporary intake placeholder action is not normalized for display");
}

const copyStart = source.indexOf("const copySecondaryIssuedLink");
const copyEnd = source.indexOf("const secondaryEvents", copyStart);
const copyBlock = source.slice(copyStart, copyEnd);
if (copyStart < 0 || copyEnd <= copyStart || copyBlock.includes("secondary-admin-mark-sent")) {
  throw new Error("link copy must not auto-mark secondary delivery complete");
}

const latestFormStart = source.indexOf("const secondaryLatestValidForm");
const latestFormEnd = source.indexOf("const secondaryWorkspaceState", latestFormStart);
const latestFormBlock = source.slice(latestFormStart, latestFormEnd);
if (latestFormStart < 0 || latestFormEnd <= latestFormStart || latestFormBlock.includes("forms[0]")) {
  throw new Error("revoked or expired secondary forms must not count as the current sent/submitted state");
}

const mobileMenuStart = source.indexOf("function osInitMobileMenu()");
const mobileMenuEnd = source.indexOf("const osShellWithTierLead", mobileMenuStart);
const mobileMenuBlock = source.slice(mobileMenuStart, mobileMenuEnd);
if (mobileMenuStart < 0 || mobileMenuEnd <= mobileMenuStart) throw new Error("temp admin mobile menu initializer not found");
for (const contract of ["focusable", "event.shiftKey", "closeButton.focus()", "trigger.focus()", "os-mobile-menu-lock", "[data-os-nav]", "aria-current"]) {
  if (!mobileMenuBlock.includes(contract)) throw new Error(`missing temp admin mobile navigation contract: ${contract}`);
}
for (const label of ["대시보드", "신청자", "회원", "1:1 매칭", "프라이빗 소셜", "Host 유입 검수", "할 일 · 일정", "통계 · Funnel", "관리자 · 권한", "감사 로그", "설정", "로그아웃"]) {
  if (!source.includes(label)) throw new Error(`missing temp admin navigation label: ${label}`);
}

console.log(
  `temp_admin_single_page_qa=pass scripts=${scripts.length} synchronized=true sections=${sectionKeys.length} private_media_preserved=true secondary_links_preserved=true mobile_navigation=true`,
);
