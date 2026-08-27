import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRef = "wiesmommcmwwwkwufgqg";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const outputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve("temp-operational-baseline.json");

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}

const query = `
with
intake as (
  select
    count(*)::int as total,
    count(*) filter (where payload->>'status' = 'submitted')::int as submitted,
    count(*) filter (where payload->>'status' = 'photos_pending')::int as photos_pending,
    count(*) filter (where payload->>'submission_type' = 'matching')::int as matching,
    count(*) filter (where payload->>'submission_type' = 'social')::int as social,
    coalesce(sum(jsonb_array_length(coalesce(payload->'photo_refs', '[]'::jsonb))), 0)::int as photo_refs,
    md5(coalesce(string_agg(id::text, ',' order by id), '')) as id_checksum,
    md5(coalesce(string_agg(id::text || ':' || md5(coalesce(payload::text, 'null')), ',' order by id), '')) as payload_checksum
  from public.temporary_intake_submissions
),
legacy as (
  select
    count(*)::int as total,
    coalesce(sum(jsonb_array_length(coalesce(photo_refs, '[]'::jsonb))), 0)::int as photo_refs,
    md5(coalesce(string_agg(source_application_id::text, ',' order by source_application_id), '')) as id_checksum,
    md5(coalesce(string_agg(source_application_id::text || ':' || source_checksum, ',' order by source_application_id), '')) as payload_checksum,
    md5(coalesce(string_agg(source_application_id::text || ':' || md5(photo_refs::text), ',' order by source_application_id), '')) as photo_refs_checksum
  from public.legacy_consultation_snapshots
),
operations as (
  select
    count(*)::int as total,
    md5(coalesce(string_agg(source_type || ':' || source_id::text, ',' order by source_type, source_id), '')) as id_checksum,
    md5(coalesce(string_agg(source_type || ':' || source_id::text || ':' || source_checksum, ',' order by source_type, source_id), '')) as payload_checksum
  from public.legacy_operational_snapshots
),
consultations as (
  select
    count(*)::int as total,
    count(*) filter (where consultation_status = 'before')::int as before,
    count(*) filter (where consultation_status = 'in_progress')::int as in_progress,
    count(*) filter (where consultation_status = 'completed')::int as completed,
    count(*) filter (where next_action_due_at is not null)::int as with_due_at,
    md5(coalesce(string_agg(id::text, ',' order by id), '')) as id_checksum,
    md5(coalesce(string_agg(id::text || ':' || md5(note_text || ':' || coalesce(consultation_status, '') || ':' || coalesce(next_action, '') || ':' || coalesce(next_action_due_at::text, '')), ',' order by id), '')) as content_checksum
  from public.temporary_consultation_entries
),
forms as (
  select
    count(*)::int as total,
    count(*) filter (where status = 'issued')::int as issued,
    count(*) filter (where status = 'draft')::int as draft,
    count(*) filter (where status = 'submitted')::int as submitted,
    count(*) filter (where status = 'revoked')::int as revoked,
    count(*) filter (where status = 'expired')::int as expired,
    count(*) filter (where sent_at is not null)::int as sent,
    count(*) filter (where first_opened_at is not null)::int as opened,
    count(*) filter (where draft_payload is not null)::int as with_draft_payload,
    count(*) filter (where submitted_payload is not null)::int as with_submitted_payload,
    md5(coalesce(string_agg(id::text, ',' order by id), '')) as id_checksum,
    md5(coalesce(string_agg(id::text || ':' || token_hash || ':' || token_prefix, ',' order by id), '')) as token_checksum,
    md5(coalesce(string_agg(id::text || ':' || md5(coalesce(draft_payload::text, 'null')) || ':' || md5(coalesce(submitted_payload::text, 'null')), ',' order by id), '')) as payload_checksum,
    md5(coalesce(string_agg(id::text || ':' || coalesce(sent_at::text, '') || ':' || coalesce(submitted_at::text, '') || ':' || coalesce(revoked_at::text, ''), ',' order by id), '')) as lifecycle_checksum
  from public.temporary_secondary_profile_forms
),
documents as (
  select
    count(*)::int as total,
    count(*) filter (where status = 'uploaded')::int as uploaded,
    count(*) filter (where status = 'accepted')::int as accepted,
    count(*) filter (where status = 'rejected')::int as rejected,
    md5(coalesce(string_agg(id::text, ',' order by id), '')) as id_checksum,
    md5(coalesce(string_agg(id::text || ':' || storage_path || ':' || file_size::text || ':' || status, ',' order by id), '')) as storage_checksum
  from public.temporary_secondary_profile_documents
),
secondary_events as (
  select
    count(*)::int as total,
    md5(coalesce(string_agg(id::text, ',' order by id), '')) as id_checksum,
    md5(coalesce(string_agg(id::text || ':' || form_id::text || ':' || event_type || ':' || actor_type || ':' || md5(detail::text), ',' order by id), '')) as content_checksum
  from public.temporary_secondary_profile_events
),
storage_summary as (
  select
    count(*)::int as total,
    md5(coalesce(string_agg(bucket_id || ':' || name, ',' order by bucket_id, name), '')) as path_checksum
  from storage.objects
),
admin_users as (
  select
    count(*)::int as total,
    md5(coalesce(string_agg(id::text, ',' order by id), '')) as id_checksum,
    md5(coalesce(string_agg(md5(lower(coalesce(email, ''))), ',' order by id), '')) as email_checksum
  from auth.users
)
select json_build_object(
  'captured_at', now(),
  'intake', (select row_to_json(intake) from intake),
  'legacy_consultation_snapshots', (select row_to_json(legacy) from legacy),
  'legacy_operational_snapshots', (select row_to_json(operations) from operations),
  'consultation_entries', (select row_to_json(consultations) from consultations),
  'secondary_forms', (select row_to_json(forms) from forms),
  'secondary_documents', (select row_to_json(documents) from documents),
  'secondary_events', (select row_to_json(secondary_events) from secondary_events),
  'storage', (select row_to_json(storage_summary) from storage_summary),
  'auth_users', (select row_to_json(admin_users) from admin_users),
  'storage_by_bucket', (
    select coalesce(json_agg(row_to_json(bucket_counts) order by bucket_id), '[]'::json)
    from (
      select bucket_id, count(*)::int as object_count
      from storage.objects
      group by bucket_id
    ) bucket_counts
  ),
  'operational_by_type', (
    select coalesce(json_agg(row_to_json(type_counts) order by source_type), '[]'::json)
    from (
      select source_type, count(*)::int as row_count
      from public.legacy_operational_snapshots
      group by source_type
    ) type_counts
  ),
  'secondary_events_by_type', (
    select coalesce(json_agg(row_to_json(event_counts) order by event_type), '[]'::json)
    from (
      select event_type, count(*)::int as row_count
      from public.temporary_secondary_profile_events
      group by event_type
    ) event_counts
  ),
  'snapshot_exports', json_build_object(
    'consultation_total', (select count(*)::int from public.legacy_consultation_snapshot_exports),
    'operational_total', (select count(*)::int from public.legacy_operational_snapshot_exports)
  )
) as baseline;
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
const baseline = rows?.[0]?.baseline;
if (!baseline) {
  throw new Error("Baseline query returned no data");
}

await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, {
  mode: 0o600,
});

console.log(
  JSON.stringify({
    output: outputPath,
    intake_total: baseline.intake.total,
    legacy_total: baseline.legacy_consultation_snapshots.total,
    secondary_total: baseline.secondary_forms.total,
    document_total: baseline.secondary_documents.total,
    consultation_total: baseline.consultation_entries.total,
    storage_total: baseline.storage.total,
  }),
);
