import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = "/home/ubuntu/irum-temp-intake";
const projectRef = "wiesmommcmwwwkwufgqg";
const buildId = "secondary-manual-sent-social-schedule-20260827-1";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required");
const profile = await readFile(`${root}/profile/index.html`, "utf8");
const endpoint = profile.match(/endpoint:'([^']+)'/)?.[1];
const publishableKey = profile.match(/key:'([^']+)'/)?.[1];
if (!endpoint || !publishableKey) throw new Error("Could not read public Function config");
const manifest = JSON.parse(await readFile("/tmp/irum-secondary-submit-qa-fixtures.json", "utf8"));
const fixtures = Object.fromEntries(manifest.fixtures.map(fixture => [fixture.key, fixture]));

const edge = async (fixture, action, body = {}) => {
  const response = await fetch(endpoint, {
    method:"POST",
    headers:{ "Content-Type":"application/json", apikey:publishableKey, Authorization:`Bearer ${publishableKey}` },
    body:JSON.stringify({ action, token:fixture.token, client_build_id:buildId, ...body }),
  });
  return { status:response.status, body:await response.json().catch(() => ({})) };
};
const managementEndpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const sql = async query => {
  const response = await fetch(managementEndpoint, {
    method:"POST",
    headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
    body:JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Management SQL failed: ${response.status}`);
  return response.json();
};
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const common = { birthDate:"1992-04-15", region:"서울 강남구", singleStatus:"예", maritalStatus:"없음" };
const payloads = {
  female:{ ...common, name:"QA 여성 제출 검증", phone:"00000000000", gender:"female", height:"165", job:"브랜드 마케터", workType:"기타", workTypeOther:"프로젝트 계약", realCheckMethod:"대면 확인", realCheckDate:"2026-09-15", serviceSelection:"1:1 소개", privacyConsent:true },
  male_verified:{ ...common, name:"QA 남성 서류 검증", phone:"00000000000", gender:"male", height:"178", job:"의사", incomeMale:"1억~1.5억원", asset:"5~10억원", purpose:"결혼", serviceSelection:"1:1 소개", documentDeferred:false, privacyConsent:true },
  male_deferred:{ ...common, name:"QA 남성 유예 검증", phone:"00000000000", gender:"male", height:"178", job:"사업가", incomeMale:"1.5억~2억원", asset:"10억원 이상", purpose:"장기연애", serviceSelection:"1:1 소개", documentDeferred:true, documentDueDate:"2026-09-25", privacyConsent:true },
};

for (const type of ["job","income","asset"]) {
  await sql(`insert into public.temporary_secondary_profile_documents
    (form_id, document_type, storage_path, original_name, declared_mime_type, verified_mime_type, file_size, status)
    values (${quote(fixtures.male_verified.id)}::uuid, ${quote(type)}, ${quote(`qa-only/${fixtures.male_verified.id}/${type}.pdf`)}, 'qa-only.pdf', 'application/pdf', 'application/pdf', 1, 'verified');`);
}

const results = {};
for (const key of ["female","male_verified","male_deferred"]) {
  const fixture = fixtures[key];
  const current = payloads[key];
  const opened = await edge(fixture, "secondary-public-get");
  expect(opened.status === 200, `${key} public get failed`);
  const initialRevision = Number(opened.body?.form?.draft_revision ?? 0);
  const stale = { ...current, privacyConsent:false, serviceSelection:"", ...(key === "male_deferred" ? { documentDeferred:false, documentDueDate:"" } : {}) };
  const firstDraft = await edge(fixture, "secondary-draft-save", { expected_revision:initialRevision, draft_payload:stale });
  expect(firstDraft.status === 200, `${key} first draft failed`);
  const conflict = await edge(fixture, "secondary-draft-save", { expected_revision:initialRevision, draft_payload:current });
  expect(conflict.status === 409 && conflict.body?.error === "DRAFT_CONFLICT", `${key} conflict not reproduced`);
  const recovered = await edge(fixture, "secondary-draft-save", { expected_revision:Number(conflict.body.current_revision), draft_payload:current });
  expect(recovered.status === 200, `${key} conflict recovery failed`);
  const idempotencyKey = randomUUID();
  const submitted = await edge(fixture, "secondary-submit", { submit_idempotency_key:idempotencyKey, consent_version:"temporary-secondary-v2-reference", payload:current });
  expect(submitted.status === 200 && submitted.body?.status === "submitted" && submitted.body?.build_id === buildId, `${key} submit failed`);
  const replay = await edge(fixture, "secondary-submit", { submit_idempotency_key:idempotencyKey, consent_version:"temporary-secondary-v2-reference", payload:current });
  expect(replay.status === 200 && replay.body?.replayed === true && replay.body?.build_id === buildId, `${key} idempotency replay failed`);
  const rows = await sql(`select status, submitted_payload, consent_version, consent_at, submit_idempotency_key from public.temporary_secondary_profile_forms where id=${quote(fixture.id)}::uuid limit 1;`);
  const row = rows[0];
  expect(row?.status === "submitted", `${key} DB status is not submitted`);
  expect(row?.submitted_payload?.privacyConsent === true, `${key} DB privacy consent missing`);
  expect(row?.submitted_payload?.serviceSelection === "1:1 소개", `${key} DB current serviceSelection missing`);
  if (key === "female") expect(row.submitted_payload.realCheckMethod === "대면 확인" && row.submitted_payload.realCheckDate === "2026-09-15", "female DB real-check values missing");
  if (key === "male_deferred") expect(row.submitted_payload.documentDeferred === true && row.submitted_payload.documentDueDate === "2026-09-25", "male deferred DB values missing");
  results[key] = { public_get_http:opened.status, conflict_http:conflict.status, conflict_code:conflict.body.error, recovered_draft_http:recovered.status, submit_http:submitted.status, submit_status:submitted.body.status, build_id:submitted.body.build_id, replay_http:replay.status, replayed:replay.body.replayed, db_status:row.status, db_privacy_consent:row.submitted_payload.privacyConsent, db_service_selection:row.submitted_payload.serviceSelection };
}
await writeFile("/tmp/irum-secondary-live-qa-results.json", JSON.stringify({ build_id:buildId, results }, null, 2));
console.log("secondary_live_qa=pass female_submitted=true male_verified_submitted=true male_deferred_submitted=true conflict_recovered=true idempotency_replayed=true db_submitted=true");
