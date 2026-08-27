const projectRef = "wiesmommcmwwwkwufgqg";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}

const query = `
with key_rows as (
  select 'intake_root'::text as scope, jsonb_object_keys(coalesce(payload, '{}'::jsonb)) as key
  from public.temporary_intake_submissions
  union all
  select 'intake_profile', jsonb_object_keys(coalesce(payload->'profile', '{}'::jsonb))
  from public.temporary_intake_submissions
  union all
  select 'legacy_root', jsonb_object_keys(coalesce(snapshot, '{}'::jsonb))
  from public.legacy_consultation_snapshots
  union all
  select 'legacy_application', jsonb_object_keys(coalesce(snapshot->'application', '{}'::jsonb))
  from public.legacy_consultation_snapshots
  union all
  select 'legacy_applicant', jsonb_object_keys(coalesce(snapshot->'applicant', '{}'::jsonb))
  from public.legacy_consultation_snapshots
  union all
  select 'operational_' || source_type, jsonb_object_keys(coalesce(payload, '{}'::jsonb))
  from public.legacy_operational_snapshots
)
select scope, key, count(*)::int as present_count
from key_rows
group by scope, key
order by scope, key;
`;

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

if (!response.ok) {
  throw new Error(`Management SQL failed: ${response.status}`);
}

const rows = await response.json();
for (const row of rows) {
  console.log(`${row.scope}\t${row.key}\t${row.present_count}`);
}
