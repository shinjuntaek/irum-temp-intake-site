# Pasted Content 6 — Temporary Admin Implementation Model

## Scope and preservation

This model applies only to the active `irum.click` temporary Pages/Supabase system. Existing Applicant subjects, temporary intake payloads, legacy snapshots, secondary drafts/submissions, documents, token hashes, links, private Storage objects, consultation notes, schedules, member history, matching cases/events, social events, reviews, and generic audit records remain immutable. The reference HTML is a layout and information-architecture guide only; its localStorage, JSON export, file export, create/delete customer, and demo-data features are intentionally excluded.

## Detail workspace

The existing applicant detail becomes one workspace with this order: header and workflow; primary intake; secondary submission; phone consultation; internal evaluation; first-meeting feedback; secondary link; unified memo; consultation/contact schedules. First-stage source data stays pinned at the top. The desktop layout places the workspace beside a sticky change-history rail; mobile presents the same history in an accessible drawer. Existing link, manual-sent, review, memo, schedule, member, matching, and social controls are reused rather than recreated.

## Source precedence and correction history

Rendered and matching values resolve in this order: latest correction overlay, customer source value, legacy Snapshot value. A correction never updates a payload or Snapshot. The dedicated RLS-protected correction revision stores subject/form reference, field group/key/label/source, original value, prior effective value, new value, customer-request flag, reason, optional reason note, actor, and timestamp. Reason is mandatory; `other` requires a note. A transaction/RPC writes the correction revision and a generic audit event containing only the correction ID, subject reference, group, and field key. The history rail reads the dedicated table and can filter All, Customer request, Phone consultation confirmation, Verification reflection, and Administrator correction.

## Consultation, evaluation, and feedback

Phone consultation is an append-only subject revision with gender-specific female fields and the common Seoul-meeting, health follow-up, correction summary, follow-up-needed, and completion fields. Internal evaluation is an append-only subject revision: male attitude/consistency; female appearance consistency/attitude/consistency; and common memo/actor/time. Both are admin-only and never flow into a customer form.

First-meeting feedback is an append-only revision keyed to a real matching case with `ON DELETE RESTRICT`. The Edge validates that feedback subject and provider are distinct participants of that case; each feedback record retains meeting date, target, provider, reunion intent, positive/negative tags and notes, next-match adjustment, admin memo, actor, and time. Any legacy Snapshot feedback is surfaced only from existing snapshot fields when available and is read-only.

## Secondary and primary form compatibility

The customer 2nd profile adds only: male `targetTattoo`/`target_tattoo`, `targetSmoking`/`target_smoking`, `targetMarriage`/`target_marriage`, optional `carModel`/`carYear` displayed only when `car=있음`, and common `healthSensitiveConsent`/`health_sensitive_consent`. Existing `healthFlag` and `healthMemo` remain keys and are not duplicated. The sensitivity checkbox is independent of `privacyConsent`; compatibility avoids retroactive required fields for issued drafts/submissions. Female reuses current fields and adds only the common health-sensitive consent. Internal evaluation, phone consultation, and meeting feedback fields never enter public secondary payloads or completion content.

New primary application UI adds common Seoul-meeting availability (`가능`, `일정 조율 시 가능`, `불가능`) and female weight. Existing records remain blank until verified through admin correction.

## Server contract

`temporary-intake-submit` lists the new revisions only for an allowlisted temporary administrator, and exposes create actions for correction, consultation revision, internal-evaluation revision, and match-feedback revision. All actions validate subject/type ownership, form ownership where supplied, matching-case participant ownership for feedback, required reasons, and duplicate requests; they append revisions only. `temporary-secondary-profile` normalizes aliases and preserves current-payload merge/autosave behavior while accepting the new compatible public fields. Both functions preserve CORS, admin verification, and no raw token/signed URL/storage-path logging.
