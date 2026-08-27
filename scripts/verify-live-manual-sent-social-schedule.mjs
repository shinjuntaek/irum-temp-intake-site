const projectRef = "wiesmommcmwwwkwufgqg";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required");

const query = `
select
  (select count(*)::int from public.temporary_intake_submissions) as intake_total,
  (select count(*)::int from public.temporary_secondary_profile_forms) as secondary_total,
  (select count(*)::int from public.temporary_secondary_profile_forms where sent_at is not null) as secondary_sent,
  (select count(*)::int from public.temporary_secondary_profile_forms where sent_by_user_id is not null or sent_by_email is not null) as manually_attributed,
  (select count(*)::int from information_schema.columns where table_schema='public' and table_name='temporary_secondary_profile_forms' and column_name in ('sent_at','sent_by_user_id','sent_by_email')) as sent_columns,
  (select count(*)::int from pg_indexes where schemaname='public' and tablename='temporary_secondary_profile_forms' and indexname='temporary_secondary_forms_sent_idx') as sent_indexes,
  (select coalesce(json_agg(row_to_json(schedule_counts) order by attendance_intent, social_event_id), '[]'::json) from (
    select coalesce(payload->'profile'->>'socialAttendanceIntent','legacy_missing') as attendance_intent,
           coalesce(payload->'profile'->>'socialEventId','none') as social_event_id,
           count(*)::int as row_count
    from public.temporary_intake_submissions
    where payload->>'submission_type'='social'
    group by 1,2
  ) schedule_counts) as social_schedule_counts;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method:"POST",
  headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
  body:JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`Management SQL failed: ${response.status}`);
const rows = await response.json();
const result = rows?.[0] || {};
if (result.sent_columns !== 3 || result.sent_indexes !== 1) throw new Error("Manual sent migration schema verification failed");
const counts = Object.fromEntries((result.social_schedule_counts || []).map((row) => [`${row.attendance_intent}:${row.social_event_id}`, row.row_count]));
for (const key of ["specific_event:30001", "specific_event:30002", "next_event:none", "legacy_missing:none"]) {
  if (!(key in counts)) throw new Error(`Missing live social schedule bucket: ${key}`);
}
console.log(JSON.stringify({
  intake_total:result.intake_total,
  secondary_total:result.secondary_total,
  secondary_sent:result.secondary_sent,
  manually_attributed:result.manually_attributed,
  sent_columns:result.sent_columns,
  sent_indexes:result.sent_indexes,
  social_schedule_counts:result.social_schedule_counts,
}));
