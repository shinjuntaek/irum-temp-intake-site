import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRef = "wiesmommcmwwwkwufgqg";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const migrationPath = process.argv[2] ? resolve(process.argv[2]) : null;
const mode = process.argv[3] || "check";

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}
if (!migrationPath) {
  throw new Error("Migration path is required");
}
if (!new Set(["check", "apply"]).has(mode)) {
  throw new Error("Mode must be check or apply");
}

const migration = await readFile(migrationPath, "utf8");
const forbidden = /\b(drop\s+(table|column)|truncate\s+table|delete\s+from|update\s+public\.(temporary_intake_submissions|legacy_consultation_snapshots|legacy_operational_snapshots|temporary_secondary_profile_forms|temporary_secondary_profile_documents|temporary_secondary_profile_events|temporary_consultation_entries))\b/i;

if (forbidden.test(migration)) {
  throw new Error("Migration contains a forbidden destructive or existing-record mutation");
}

const query = mode === "check"
  ? `begin;\n${migration}\nrollback;\nselect 'rollback_validation_ok' as result;`
  : migration;

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  },
);

const body = await response.json().catch(() => null);
if (!response.ok) {
  throw new Error(`Management SQL failed: ${response.status}`);
}

console.log(JSON.stringify({ mode, ok: true, result: body }));
