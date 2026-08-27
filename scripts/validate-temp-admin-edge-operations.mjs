import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const intake = await readFile(resolve(root, "supabase/functions/temporary-intake-submit/index.ts"), "utf8");
const secondary = await readFile(resolve(root, "supabase/functions/temporary-secondary-profile/index.ts"), "utf8");
const migration = await readFile(resolve(root, "supabase/migrations/20260827_temporary_admin_operations.sql"), "utf8");

const originalIntakeActions = [
  "create",
  "signed-upload",
  "complete",
  "admin-list",
  "admin-photo-url",
  "snapshot-export-start",
  "snapshot-export-abandon-open",
  "snapshot-export-failed",
  "snapshot-last-completed",
  "snapshot-upload-url",
  "snapshot-upsert",
  "snapshot-export-complete",
  "snapshot-list",
  "snapshot-photo-url",
  "consultation-add",
  "consultation-list",
  "consultation-import-manifest",
  "operational-export-start",
  "operational-export-abandon-open",
  "operational-export-failed",
  "operational-snapshot-upsert",
  "operational-photo-upload-url",
  "operational-export-complete",
  "operational-list",
  "operational-photo-url",
];

const originalSecondaryActions = [
  "secondary-build",
  "secondary-public-get",
  "secondary-draft-save",
  "secondary-document-upload-url",
  "secondary-document-complete",
  "secondary-submit",
  "secondary-admin-issue",
  "secondary-admin-revoke",
  "secondary-admin-reissue",
  "secondary-admin-mark-sent",
  "secondary-admin-clear-sent",
  "secondary-admin-list",
  "secondary-admin-document-url",
  "secondary-import-manifest",
  "secondary-import-document-url",
];

for (const action of originalIntakeActions) {
  assert.ok(intake.includes(`body.action === "${action}"`), `existing intake action missing: ${action}`);
}
for (const action of originalSecondaryActions) {
  assert.ok(secondary.includes(`action === "${action}"`), `existing secondary action missing: ${action}`);
}

for (const action of [
  "admin-operations-build",
  "admin-operations-list",
  "admin-session-start",
  "admin-workflow-set",
  "admin-schedule-add",
  "admin-schedule-cancel",
  "admin-member-set",
  "admin-match-create",
  "admin-match-transition",
  "admin-social-status-set",
]) {
  assert.ok(intake.includes(`body.action === "${action}"`), `new intake action missing: ${action}`);
}

assert.match(intake, /INTAKE_BUILD_ID = "temporary-intake-admin-operations-20260827-1"/);
assert.match(secondary, /BUILD_ID = "secondary-temp-admin-operations-20260827-3"/);
assert.ok(secondary.includes('action === "secondary-admin-review"'));
assert.ok(secondary.includes('form.status !== "submitted"'));
assert.ok(secondary.includes('return json({ error: "FORM_NOT_SUBMITTED" }, 409)'));
assert.ok(secondary.includes('return json({ error: "REVIEW_REASON_REQUIRED" }, 422)'));
assert.ok(secondary.includes("previous_result"));
assert.ok(secondary.includes("reviews, profile_events: profileEvents, build_id: BUILD_ID"));
assert.ok(secondary.includes("profile_events: profileEvents"));

assert.ok(intake.includes('const MATCHING_STATUSES = new Set(["candidate_selected", "male_reviewing", "male_accepted", "male_rejected"'));
assert.ok(!intake.includes("female_accepted"));
assert.ok(!intake.includes("female_rejected"));
assert.ok(intake.includes('return json({ error: "REPEAT_RECOMMENDATION_CONFIRMATION_REQUIRED" }, 409)'));
assert.ok(intake.includes('return json({ error: "MATCH_REJECTION_REASON_REQUIRED" }, 422)'));
assert.ok(intake.includes('return json({ error: "APPROVED_REVIEW_REQUIRED" }, 409)'));

assert.ok(!/\bdelete\s+from\b/i.test(migration));
assert.ok(!/\btruncate\s+table\b/i.test(migration));
assert.ok(!/\bdrop\s+(table|column)\b/i.test(migration));
assert.equal((migration.match(/^create table if not exists/gm) || []).length, 9);
assert.equal((migration.match(/enable row level security/g) || []).length, 9);
assert.ok(migration.includes("on delete restrict"));
assert.ok(migration.includes("temporary_secondary_profile_reviews"));
assert.ok(migration.includes("temporary_admin_schedule_events"));
assert.ok(migration.includes("temporary_admin_matching_cases"));
assert.ok(migration.includes("temporary_admin_social_events"));

const protectedTables = [
  "temporary_intake_submissions",
  "legacy_consultation_snapshots",
  "legacy_operational_snapshots",
  "temporary_secondary_profile_forms",
  "temporary_secondary_profile_documents",
  "temporary_consultation_entries",
];
for (const table of protectedTables) {
  assert.ok(!new RegExp(`(?:update|delete\\s+from|truncate\\s+table|alter\\s+table)\\s+public\\.${table}\\b`, "i").test(migration), `protected table mutation in migration: ${table}`);
}

console.log("Temporary admin Edge operations contract passed");
