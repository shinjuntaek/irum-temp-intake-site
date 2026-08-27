import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
if (scripts.length < 4) throw new Error(`Expected at least four inline scripts, found ${scripts.length}`);
scripts.forEach((script, index) => new Function(script));
const required = [
  "IRUM_TEMP_API",
  "temporary-intake-submit",
  "assets/irum_promo_480p.mp4",
  'rel="preload" as="image" href="assets/image-01_7aa3bedb.jpg"',
  'preload="none" poster="assets/image-01_7aa3bedb.jpg" data-src="assets/irum_promo_480p.mp4"',
  "requestIdleCallback(startVideo,{timeout:1200})",
  'irum-host-ansubin-intro-optimized.webp" alt="이룸 프라이빗 모임 HOST 안수빈 소개" loading="lazy"',
  'irum-host-ansubin-profile-optimized.webp" alt="IRUM HOST 안수빈" loading="lazy"',
  "var socialRoutes=['/apply/social','/app/social','/social']",
  "var matchingRoutes=['/apply/matching','/app/matching','/matching']",
];
required.forEach(value => {
  if (!html.includes(value)) throw new Error(`Missing required generated content: ${value}`);
});
if (html.includes("홈페이지 점검 기간에도") || html.includes("8월 23일 오전 8시 ~ 8월 25일 오전 8시")) {
  throw new Error("Removed temporary maintenance popup content was restored unexpectedly");
}
if (/class="hero-video"[^>]*\ssrc="assets\/irum_promo_480p\.mp4"/.test(html)) {
  throw new Error("Hero video still competes with first paint through an eager src attribute");
}
if (html.includes("/manus-storage/")) throw new Error("Generated static page still references Manus storage");
for (const asset of html.matchAll(/assets\/([^"')\s]+)/g)) {
  if (!fs.existsSync(path.join(root, "assets", asset[1]))) throw new Error(`Missing local asset: ${asset[1]}`);
}
const compatibleRoutes = [
  "apply/social",
  "apply/matching",
  "app/social",
  "app/matching",
  "social",
  "matching",
];
for (const route of compatibleRoutes) {
  const routeHtml = fs.readFileSync(path.join(root, route, "index.html"), "utf8");
  if (routeHtml !== html) throw new Error(`Route alias drifted from root document: ${route}`);
}
console.log(`static_page_qa=pass scripts=${scripts.length} aliases=${compatibleRoutes.length}`);
