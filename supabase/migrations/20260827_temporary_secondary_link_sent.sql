alter table public.temporary_secondary_profile_forms
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by_user_id uuid,
  add column if not exists sent_by_email text;

update public.temporary_secondary_profile_forms
set sent_at = coalesce(first_opened_at, submitted_at),
    updated_at = now()
where sent_at is null
  and (first_opened_at is not null or submitted_at is not null);

create index if not exists temporary_secondary_forms_sent_idx
  on public.temporary_secondary_profile_forms (sent_at, subject_type, subject_id);

comment on column public.temporary_secondary_profile_forms.sent_at is
  'Manual customer-delivery completion timestamp. Link issue/copy/open never writes this field.';
comment on column public.temporary_secondary_profile_forms.sent_by_user_id is
  'Supabase Auth user who manually checked delivery complete. Null for historical backfill.';
comment on column public.temporary_secondary_profile_forms.sent_by_email is
  'Administrator email snapshot captured only on explicit manual delivery check.';
