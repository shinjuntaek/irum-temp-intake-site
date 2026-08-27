create extension if not exists pgcrypto;

create table if not exists public.temporary_admin_field_corrections (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('temporary_submission', 'legacy_snapshot', 'restored_application')),
  subject_id text not null,
  form_id uuid references public.temporary_secondary_profile_forms(id) on delete restrict,
  field_group text not null check (field_group in ('primary', 'secondary')),
  field_key text not null,
  field_label text not null,
  data_source text not null check (data_source in ('intake', 'secondary', 'legacy_snapshot')),
  original_value jsonb not null,
  previous_value jsonb,
  corrected_value jsonb not null,
  customer_requested boolean not null default false,
  correction_reason text not null check (correction_reason in ('customer_request', 'phone_consultation', 'verification', 'admin_correction', 'other')),
  reason_note text,
  actor_user_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  check (correction_reason <> 'other' or nullif(btrim(coalesce(reason_note, '')), '') is not null)
);

create index if not exists temporary_admin_field_corrections_subject_idx
  on public.temporary_admin_field_corrections (subject_type, subject_id, created_at desc);
create index if not exists temporary_admin_field_corrections_filter_idx
  on public.temporary_admin_field_corrections (correction_reason, customer_requested, created_at desc);
create index if not exists temporary_admin_field_corrections_form_idx
  on public.temporary_admin_field_corrections (form_id, created_at desc);

create table if not exists public.temporary_admin_phone_consultation_revisions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('temporary_submission', 'legacy_snapshot', 'restored_application')),
  subject_id text not null,
  values jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists temporary_admin_phone_consultation_revisions_subject_idx
  on public.temporary_admin_phone_consultation_revisions (subject_type, subject_id, created_at desc);

create table if not exists public.temporary_admin_internal_evaluation_revisions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('temporary_submission', 'legacy_snapshot', 'restored_application')),
  subject_id text not null,
  values jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists temporary_admin_internal_evaluation_revisions_subject_idx
  on public.temporary_admin_internal_evaluation_revisions (subject_type, subject_id, created_at desc);

create table if not exists public.temporary_admin_matching_feedback_revisions (
  id uuid primary key default gen_random_uuid(),
  matching_case_id uuid not null references public.temporary_admin_matching_cases(id) on delete restrict,
  feedback_subject_type text not null check (feedback_subject_type in ('temporary_submission', 'legacy_snapshot', 'restored_application')),
  feedback_subject_id text not null,
  provider_subject_type text not null check (provider_subject_type in ('temporary_submission', 'legacy_snapshot', 'restored_application')),
  provider_subject_id text not null,
  meeting_at timestamptz not null,
  reunion_intent text not null check (reunion_intent in ('very_positive', 'positive', 'unsure', 'negative')),
  positive_points jsonb not null default '[]'::jsonb,
  positive_note text,
  negative_points jsonb not null default '[]'::jsonb,
  negative_note text,
  next_match_adjustment text,
  admin_note text,
  actor_user_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  check (feedback_subject_type <> provider_subject_type or feedback_subject_id <> provider_subject_id)
);

create index if not exists temporary_admin_matching_feedback_revisions_case_idx
  on public.temporary_admin_matching_feedback_revisions (matching_case_id, created_at desc);
create index if not exists temporary_admin_matching_feedback_revisions_subject_idx
  on public.temporary_admin_matching_feedback_revisions (feedback_subject_type, feedback_subject_id, created_at desc);

alter table public.temporary_admin_field_corrections enable row level security;
alter table public.temporary_admin_phone_consultation_revisions enable row level security;
alter table public.temporary_admin_internal_evaluation_revisions enable row level security;
alter table public.temporary_admin_matching_feedback_revisions enable row level security;

create or replace function public.temporary_admin_append_correction_and_audit(
  p_correction jsonb,
  p_audit jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(nullif(p_correction->>'id', '')::uuid, gen_random_uuid());
begin
  insert into public.temporary_admin_field_corrections (
    id, subject_type, subject_id, form_id, field_group, field_key, field_label, data_source,
    original_value, previous_value, corrected_value, customer_requested, correction_reason,
    reason_note, actor_user_id, actor_email
  ) values (
    v_id,
    p_correction->>'subject_type',
    p_correction->>'subject_id',
    nullif(p_correction->>'form_id', '')::uuid,
    p_correction->>'field_group',
    p_correction->>'field_key',
    p_correction->>'field_label',
    p_correction->>'data_source',
    coalesce(p_correction->'original_value', 'null'::jsonb),
    p_correction->'previous_value',
    coalesce(p_correction->'corrected_value', 'null'::jsonb),
    coalesce((p_correction->>'customer_requested')::boolean, false),
    p_correction->>'correction_reason',
    nullif(p_correction->>'reason_note', ''),
    nullif(p_correction->>'actor_user_id', '')::uuid,
    p_correction->>'actor_email'
  );

  insert into public.temporary_admin_audit_events (
    action, entity_type, entity_id, actor_user_id, actor_email, detail
  ) values (
    'field_correction_added',
    'applicant_subject',
    concat(p_correction->>'subject_type', ':', p_correction->>'subject_id'),
    nullif(p_correction->>'actor_user_id', '')::uuid,
    p_correction->>'actor_email',
    jsonb_build_object(
      'correction_id', v_id,
      'field_group', p_correction->>'field_group',
      'field_key', p_correction->>'field_key',
      'data_source', p_correction->>'data_source'
    )
  );
  return v_id;
end;
$$;

revoke all on function public.temporary_admin_append_correction_and_audit(jsonb, jsonb) from public;
grant execute on function public.temporary_admin_append_correction_and_audit(jsonb, jsonb) to service_role;

comment on table public.temporary_admin_field_corrections is
  'RLS-protected append-only correction revisions. Original Applicant payloads and Snapshots are never updated.';
comment on table public.temporary_admin_phone_consultation_revisions is
  'RLS-protected append-only phone consultation values separate from customer forms and legacy notes.';
comment on table public.temporary_admin_internal_evaluation_revisions is
  'RLS-protected append-only internal-only evaluations that never enter customer submissions.';
comment on table public.temporary_admin_matching_feedback_revisions is
  'RLS-protected append-only first-meeting feedback bound to a real matching case, never to a standalone Applicant.';
comment on function public.temporary_admin_append_correction_and_audit(jsonb, jsonb) is
  'Atomically saves one correction revision and a minimal generic audit record without personal values.';
