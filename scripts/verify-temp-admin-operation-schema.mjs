const projectRef = "wiesmommcmwwwkwufgqg";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const expectEmpty = process.argv.includes("--expect-empty");

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}

const expectedTables = [
  "temporary_admin_subject_workflows",
  "temporary_admin_workflow_events",
  "temporary_secondary_profile_reviews",
  "temporary_admin_schedule_events",
  "temporary_admin_member_events",
  "temporary_admin_matching_cases",
  "temporary_admin_matching_events",
  "temporary_admin_social_events",
  "temporary_admin_social_participation_events_v2",
  "temporary_admin_audit_events",
];

const tableNames = expectedTables.map((name) => `'${name}'`).join(",");
const query = `
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*)::int from pg_indexes i where i.schemaname = 'public' and i.tablename = c.relname) as index_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (${tableNames})
order by c.relname;
`;

const countQuery = `
select json_build_object(
  'temporary_admin_subject_workflows', (select count(*)::int from public.temporary_admin_subject_workflows),
  'temporary_admin_workflow_events', (select count(*)::int from public.temporary_admin_workflow_events),
  'temporary_secondary_profile_reviews', (select count(*)::int from public.temporary_secondary_profile_reviews),
  'temporary_admin_schedule_events', (select count(*)::int from public.temporary_admin_schedule_events),
  'temporary_admin_member_events', (select count(*)::int from public.temporary_admin_member_events),
  'temporary_admin_matching_cases', (select count(*)::int from public.temporary_admin_matching_cases),
  'temporary_admin_matching_events', (select count(*)::int from public.temporary_admin_matching_events),
  'temporary_admin_social_events', (select count(*)::int from public.temporary_admin_social_events),
  'temporary_admin_social_participation_events_v2', (select count(*)::int from public.temporary_admin_social_participation_events_v2),
  'temporary_admin_audit_events', (select count(*)::int from public.temporary_admin_audit_events)
) as counts;
`;

const distributionQuery = `
select 'workflow' as category, workflow_stage as event, count(*)::int as count
from public.temporary_admin_workflow_events group by workflow_stage
union all
select 'review', result, count(*)::int
from public.temporary_secondary_profile_reviews group by result
union all
select 'schedule', schedule_type || ':' || event_action, count(*)::int
from public.temporary_admin_schedule_events group by schedule_type, event_action
union all
select 'member', member_status, count(*)::int
from public.temporary_admin_member_events group by member_status
union all
select 'matching', status, count(*)::int
from public.temporary_admin_matching_events group by status
union all
select 'social', status, count(*)::int
from public.temporary_admin_social_events group by status
union all
select 'social_v2', status, count(*)::int
from public.temporary_admin_social_participation_events_v2 group by status
union all
select 'audit', action, count(*)::int
from public.temporary_admin_audit_events group by action
order by category, event;
`;

async function managementQuery(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    throw new Error(`Management SQL failed: ${response.status}`);
  }
  return response.json();
}

const schemaRows = await managementQuery(query);
const countRows = await managementQuery(countQuery);
const distributions = await managementQuery(distributionQuery);
const counts = countRows?.[0]?.counts || {};

if (schemaRows.length !== expectedTables.length) {
  throw new Error("Not all operational overlay tables exist");
}
if (schemaRows.some((row) => !row.rls_enabled)) {
  throw new Error("RLS is not enabled on every operational overlay table");
}
if (expectEmpty && expectedTables.some((table) => counts[table] !== 0)) {
  throw new Error("Operational overlay tables were not empty immediately after migration");
}

console.log(JSON.stringify({ tables: schemaRows, counts, distributions, expect_empty: expectEmpty }));
