import { createClient } from "npm:@supabase/supabase-js@2";

const TABLE = "temporary_intake_submissions";
const BUCKET = "temporary-intake-photos";
const LEGACY_SNAPSHOT_TABLE = "legacy_consultation_snapshots";
const LEGACY_EXPORT_TABLE = "legacy_consultation_snapshot_exports";
const LEGACY_BUCKET = "legacy-consultation-photos";
const TEMP_CONSULTATION_TABLE = "temporary_consultation_entries";
const OPERATIONAL_SNAPSHOT_TABLE = "legacy_operational_snapshots";
const OPERATIONAL_EXPORT_TABLE = "legacy_operational_snapshot_exports";
const WORKFLOW_TABLE = "temporary_admin_subject_workflows";
const WORKFLOW_EVENT_TABLE = "temporary_admin_workflow_events";
const SCHEDULE_EVENT_TABLE = "temporary_admin_schedule_events";
const MEMBER_EVENT_TABLE = "temporary_admin_member_events";
const MATCHING_CASE_TABLE = "temporary_admin_matching_cases";
const MATCHING_EVENT_TABLE = "temporary_admin_matching_events";
const SOCIAL_EVENT_TABLE = "temporary_admin_social_events";
const ADMIN_AUDIT_TABLE = "temporary_admin_audit_events";
const REVIEW_TABLE = "temporary_secondary_profile_reviews";
const INTAKE_BUILD_ID = "temporary-intake-admin-operations-20260827-2";
const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUBJECT_TYPES = new Set(["temporary_submission", "legacy_snapshot", "restored_application"]);
const EXPLICIT_WORKFLOW_STAGES = new Set(["first_review", "approved", "hold", "rejected", "member_converted"]);
const REVIEW_RESULTS = new Set(["approved", "hold", "rejected", "materials_requested"]);
const SCHEDULE_TYPES = new Set(["consultation", "next_contact"]);
const MEMBER_STATUSES = new Set(["approval_pending", "converted", "matchable", "matching", "meeting_scheduled", "paused", "ended"]);
const MATCHING_STATUSES = new Set(["candidate_selected", "male_reviewing", "male_accepted", "male_rejected", "scheduling", "meeting_confirmed", "meeting_completed", "cancelled", "closed"]);
const SOCIAL_STATUSES = new Set(["applied", "reviewing", "selected", "waitlisted", "confirmed", "cancelled", "attended", "no_show"]);
const AUDIT_SECRET_KEYS = new Set(["token", "token_hash", "raw_url", "signed_url", "storage_path", "payload", "draft_payload", "submitted_payload"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const normPhone = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const safeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-80);
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const serviceClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

async function requireTemporaryAdmin(req: Request) {
  const rawAuthorization = req.headers.get("Authorization") ?? "";
  const token = rawAuthorization.startsWith("Bearer ")
    ? rawAuthorization.slice(7)
    : "";
  if (!token) return null;

  const publicClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await publicClient.auth.getUser(token);
  const allowlist = (Deno.env.get("TEMP_ADMIN_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (
    error ||
    !data.user?.email ||
    !allowlist.includes(data.user.email.toLowerCase())
  )
    return null;
  return data.user;
}

function requireSnapshotExporter(req: Request) {
  const expected = Deno.env.get("LEGACY_SNAPSHOT_EXPORT_TOKEN") ?? "";
  const received = req.headers.get("x-snapshot-export-token") ?? "";
  return Boolean(expected) && received.length === expected.length && received === expected;
}

function safeAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeAuditDetail);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !AUDIT_SECRET_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, safeAuditDetail(child)]),
  );
}

async function appendAdminAudit(
  database: ReturnType<typeof serviceClient>,
  action: string,
  entityType: string,
  entityId: string | null,
  user: { id: string; email?: string | null },
  detail: Record<string, unknown> = {},
) {
  const { error } = await database.from(ADMIN_AUDIT_TABLE).insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    actor_user_id: user.id,
    actor_email: user.email ?? "temporary-admin",
    detail: safeAuditDetail(detail),
  });
  if (error) throw error;
}

const cleanText = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

const subjectFromBody = (body: Record<string, unknown>) => ({
  subjectType: cleanText(body.subject_type, 40),
  subjectId: cleanText(body.subject_id, 120),
});

const validSubject = (subjectType: string, subjectId: string) =>
  SUBJECT_TYPES.has(subjectType) && Boolean(subjectId);

async function subjectGender(
  database: ReturnType<typeof serviceClient>,
  subjectType: string,
  subjectId: string,
) {
  if (subjectType === "temporary_submission") {
    const numericId = Number(subjectId);
    if (!Number.isInteger(numericId)) return null;
    const { data, error } = await database.from(TABLE).select("payload").eq("id", numericId).maybeSingle();
    if (error) throw error;
    return cleanText(data?.payload?.profile?.gender, 20) || null;
  }
  if (subjectType === "legacy_snapshot") {
    const numericId = Number(subjectId);
    if (!Number.isInteger(numericId)) return null;
    const { data, error } = await database.from(LEGACY_SNAPSHOT_TABLE).select("snapshot").eq("source_application_id", numericId).maybeSingle();
    if (error) throw error;
    return cleanText(data?.snapshot?.profile?.gender, 20) || null;
  }
  return null;
}

async function latestApprovedReview(
  database: ReturnType<typeof serviceClient>,
  subjectType: string,
  subjectId: string,
) {
  const { data, error } = await database.from(REVIEW_TABLE)
    .select("id, result, reviewed_at")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.result === "approved" ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json();
    const database = serviceClient();

    if (body.action === "admin-operations-build") {
      return json({ ok: true, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-operations-list") {
      if (!(await requireTemporaryAdmin(req))) return json({ error: "FORBIDDEN" }, 403);
      const [workflowResult, workflowEventResult, scheduleResult, memberResult, matchingCaseResult, matchingEventResult, socialResult, auditResult] = await Promise.all([
        database.from(WORKFLOW_TABLE).select("id, subject_type, subject_id, workflow_stage, decision, reason, assigned_to, reviewed_by_email, reviewed_at, updated_at").order("updated_at", { ascending: false }),
        database.from(WORKFLOW_EVENT_TABLE).select("id, subject_type, subject_id, previous_stage, workflow_stage, decision, reason, assigned_to, actor_email, created_at").order("created_at", { ascending: false }).limit(2000),
        database.from(SCHEDULE_EVENT_TABLE).select("id, subject_type, subject_id, schedule_type, event_action, scheduled_at, replaces_event_id, reason, actor_email, created_at").order("created_at", { ascending: false }).limit(2000),
        database.from(MEMBER_EVENT_TABLE).select("id, subject_type, subject_id, review_id, event_type, previous_status, member_status, reason, actor_email, created_at").order("created_at", { ascending: false }).limit(2000),
        database.from(MATCHING_CASE_TABLE).select("id, male_subject_type, male_subject_id, female_subject_type, female_subject_id, status, created_by_email, created_at, updated_at").order("updated_at", { ascending: false }).limit(1000),
        database.from(MATCHING_EVENT_TABLE).select("id, matching_case_id, previous_status, status, reason, scheduled_at, actor_email, created_at").order("created_at", { ascending: false }).limit(2000),
        database.from(SOCIAL_EVENT_TABLE).select("id, social_event_id, subject_type, subject_id, previous_status, status, reason, actor_email, created_at").order("created_at", { ascending: false }).limit(2000),
        database.from(ADMIN_AUDIT_TABLE).select("id, action, entity_type, entity_id, actor_email, detail, created_at").order("created_at", { ascending: false }).limit(2000),
      ]);
      const failure = [workflowResult, workflowEventResult, scheduleResult, memberResult, matchingCaseResult, matchingEventResult, socialResult, auditResult].find((result) => result.error);
      if (failure?.error) throw failure.error;
      return json({
        build_id: INTAKE_BUILD_ID,
        workflows: workflowResult.data ?? [],
        workflow_events: workflowEventResult.data ?? [],
        schedule_events: scheduleResult.data ?? [],
        member_events: memberResult.data ?? [],
        matching_cases: matchingCaseResult.data ?? [],
        matching_events: matchingEventResult.data ?? [],
        social_events: socialResult.data ?? [],
        audit_events: auditResult.data ?? [],
      });
    }

    if (body.action === "admin-session-start") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      await appendAdminAudit(database, "login", "admin_session", null, user);
      return json({ ok: true, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-workflow-set") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const { subjectType, subjectId } = subjectFromBody(body);
      const workflowStage = cleanText(body.workflow_stage, 40);
      const reason = cleanText(body.reason, 2000) || null;
      const assignedTo = cleanText(body.assigned_to, 160) || null;
      if (!validSubject(subjectType, subjectId) || !EXPLICIT_WORKFLOW_STAGES.has(workflowStage)) {
        return json({ error: "INVALID_WORKFLOW_REQUEST" }, 422);
      }
      if (["hold", "rejected"].includes(workflowStage) && !reason) {
        return json({ error: "WORKFLOW_REASON_REQUIRED" }, 422);
      }
      const decision = workflowStage === "approved" ? "approved" : workflowStage === "hold" ? "hold" : workflowStage === "rejected" ? "rejected" : null;
      if (decision) {
        const { data: latestReview, error: reviewError } = await database.from(REVIEW_TABLE)
          .select("result")
          .eq("subject_type", subjectType)
          .eq("subject_id", subjectId)
          .order("reviewed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reviewError) throw reviewError;
        if (latestReview?.result !== decision) return json({ error: "REVIEW_RESULT_REQUIRED" }, 409);
      }
      if (workflowStage === "member_converted") {
        const { data: latestMember, error: memberError } = await database.from(MEMBER_EVENT_TABLE)
          .select("member_status")
          .eq("subject_type", subjectType)
          .eq("subject_id", subjectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (memberError) throw memberError;
        if (latestMember?.member_status !== "converted") return json({ error: "MEMBER_CONVERSION_REQUIRED" }, 409);
      }
      const { data: current, error: currentError } = await database.from(WORKFLOW_TABLE)
        .select("workflow_stage")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .maybeSingle();
      if (currentError) throw currentError;
      const now = new Date().toISOString();
      const { data, error } = await database.from(WORKFLOW_TABLE).upsert({
        subject_type: subjectType,
        subject_id: subjectId,
        workflow_stage: workflowStage,
        decision,
        reason,
        assigned_to: assignedTo,
        reviewed_by_user_id: decision ? user.id : null,
        reviewed_by_email: decision ? user.email : null,
        reviewed_at: decision ? now : null,
        updated_at: now,
      }, { onConflict: "subject_type,subject_id" }).select("id, subject_type, subject_id, workflow_stage, decision, reason, assigned_to, reviewed_by_email, reviewed_at, updated_at").single();
      if (error) throw error;
      const { error: eventError } = await database.from(WORKFLOW_EVENT_TABLE).insert({
        subject_type: subjectType,
        subject_id: subjectId,
        previous_stage: current?.workflow_stage ?? null,
        workflow_stage: workflowStage,
        decision,
        reason,
        assigned_to: assignedTo,
        actor_user_id: user.id,
        actor_email: user.email,
      });
      if (eventError) throw eventError;
      await appendAdminAudit(database, "workflow_changed", "applicant_subject", `${subjectType}:${subjectId}`, user, { previous_stage: current?.workflow_stage ?? null, workflow_stage: workflowStage, decision });
      return json({ workflow: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-schedule-add") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const { subjectType, subjectId } = subjectFromBody(body);
      const scheduleType = cleanText(body.schedule_type, 40);
      const scheduledAt = new Date(cleanText(body.scheduled_at, 80));
      const reason = cleanText(body.reason, 1000) || null;
      if (!validSubject(subjectType, subjectId) || !SCHEDULE_TYPES.has(scheduleType) || Number.isNaN(scheduledAt.getTime())) {
        return json({ error: "INVALID_SCHEDULE_REQUEST" }, 422);
      }
      const { data: previous, error: previousError } = await database.from(SCHEDULE_EVENT_TABLE)
        .select("id, event_action, scheduled_at")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .eq("schedule_type", scheduleType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw previousError;
      const { data, error } = await database.from(SCHEDULE_EVENT_TABLE).insert({
        subject_type: subjectType,
        subject_id: subjectId,
        schedule_type: scheduleType,
        event_action: previous ? "updated" : "created",
        scheduled_at: scheduledAt.toISOString(),
        replaces_event_id: previous?.id ?? null,
        reason,
        actor_user_id: user.id,
        actor_email: user.email,
      }).select("id, subject_type, subject_id, schedule_type, event_action, scheduled_at, replaces_event_id, reason, actor_email, created_at").single();
      if (error) throw error;
      await appendAdminAudit(database, "schedule_saved", "applicant_subject", `${subjectType}:${subjectId}`, user, { schedule_type: scheduleType, event_action: previous ? "updated" : "created" });
      return json({ event: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-schedule-cancel") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const { subjectType, subjectId } = subjectFromBody(body);
      const scheduleType = cleanText(body.schedule_type, 40);
      const reason = cleanText(body.reason, 1000) || null;
      if (!validSubject(subjectType, subjectId) || !SCHEDULE_TYPES.has(scheduleType)) return json({ error: "INVALID_SCHEDULE_REQUEST" }, 422);
      const { data: previous, error: previousError } = await database.from(SCHEDULE_EVENT_TABLE)
        .select("id, event_action")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .eq("schedule_type", scheduleType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw previousError;
      if (!previous || previous.event_action === "cancelled") return json({ error: "ACTIVE_SCHEDULE_NOT_FOUND" }, 409);
      const { data, error } = await database.from(SCHEDULE_EVENT_TABLE).insert({
        subject_type: subjectType,
        subject_id: subjectId,
        schedule_type: scheduleType,
        event_action: "cancelled",
        scheduled_at: null,
        replaces_event_id: previous.id,
        reason,
        actor_user_id: user.id,
        actor_email: user.email,
      }).select("id, subject_type, subject_id, schedule_type, event_action, scheduled_at, replaces_event_id, reason, actor_email, created_at").single();
      if (error) throw error;
      await appendAdminAudit(database, "schedule_cancelled", "applicant_subject", `${subjectType}:${subjectId}`, user, { schedule_type: scheduleType });
      return json({ event: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-member-set") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const { subjectType, subjectId } = subjectFromBody(body);
      const memberStatus = cleanText(body.member_status, 40);
      const reason = cleanText(body.reason, 1000) || null;
      if (!validSubject(subjectType, subjectId) || !MEMBER_STATUSES.has(memberStatus)) return json({ error: "INVALID_MEMBER_REQUEST" }, 422);
      const review = await latestApprovedReview(database, subjectType, subjectId);
      if (!review) return json({ error: "APPROVED_REVIEW_REQUIRED" }, 409);
      const { data: previous, error: previousError } = await database.from(MEMBER_EVENT_TABLE)
        .select("member_status")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw previousError;
      const eventType = memberStatus === "approval_pending" ? "approved" : memberStatus === "converted" ? "converted" : "status_changed";
      const { data, error } = await database.from(MEMBER_EVENT_TABLE).insert({
        subject_type: subjectType,
        subject_id: subjectId,
        review_id: review.id,
        event_type: eventType,
        previous_status: previous?.member_status ?? null,
        member_status: memberStatus,
        reason,
        actor_user_id: user.id,
        actor_email: user.email,
      }).select("id, subject_type, subject_id, review_id, event_type, previous_status, member_status, reason, actor_email, created_at").single();
      if (error) throw error;
      if (memberStatus === "converted") {
        const now = new Date().toISOString();
        const { data: currentWorkflow } = await database.from(WORKFLOW_TABLE).select("workflow_stage").eq("subject_type", subjectType).eq("subject_id", subjectId).maybeSingle();
        const { error: workflowError } = await database.from(WORKFLOW_TABLE).upsert({
          subject_type: subjectType,
          subject_id: subjectId,
          workflow_stage: "member_converted",
          decision: "approved",
          reviewed_by_user_id: user.id,
          reviewed_by_email: user.email,
          reviewed_at: now,
          updated_at: now,
        }, { onConflict: "subject_type,subject_id" });
        if (workflowError) throw workflowError;
        const { error: workflowEventError } = await database.from(WORKFLOW_EVENT_TABLE).insert({
          subject_type: subjectType,
          subject_id: subjectId,
          previous_stage: currentWorkflow?.workflow_stage ?? "approved",
          workflow_stage: "member_converted",
          decision: "approved",
          actor_user_id: user.id,
          actor_email: user.email,
        });
        if (workflowEventError) throw workflowEventError;
      }
      await appendAdminAudit(database, "member_status_changed", "applicant_subject", `${subjectType}:${subjectId}`, user, { previous_status: previous?.member_status ?? null, member_status: memberStatus });
      return json({ event: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-match-create") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const maleSubjectType = cleanText(body.male_subject_type, 40);
      const maleSubjectId = cleanText(body.male_subject_id, 120);
      const femaleSubjectType = cleanText(body.female_subject_type, 40);
      const femaleSubjectId = cleanText(body.female_subject_id, 120);
      const repeatConfirmed = body.repeat_confirmed === true;
      const reason = cleanText(body.reason, 2000) || null;
      if (!validSubject(maleSubjectType, maleSubjectId) || !validSubject(femaleSubjectType, femaleSubjectId)) return json({ error: "INVALID_MATCH_REQUEST" }, 422);
      const [maleGender, femaleGender, maleReview, femaleReview] = await Promise.all([
        subjectGender(database, maleSubjectType, maleSubjectId),
        subjectGender(database, femaleSubjectType, femaleSubjectId),
        latestApprovedReview(database, maleSubjectType, maleSubjectId),
        latestApprovedReview(database, femaleSubjectType, femaleSubjectId),
      ]);
      if (maleGender !== "male" || femaleGender !== "female") return json({ error: "MATCH_GENDER_MISMATCH" }, 422);
      if (!maleReview || !femaleReview) return json({ error: "APPROVED_REVIEW_REQUIRED" }, 409);
      const { data: previousPair, error: pairError } = await database.from(MATCHING_CASE_TABLE)
        .select("id, status")
        .eq("male_subject_type", maleSubjectType)
        .eq("male_subject_id", maleSubjectId)
        .eq("female_subject_type", femaleSubjectType)
        .eq("female_subject_id", femaleSubjectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pairError) throw pairError;
      if (previousPair?.status === "male_rejected" && (!repeatConfirmed || !reason)) return json({ error: "REPEAT_RECOMMENDATION_CONFIRMATION_REQUIRED" }, 409);
      const { data, error } = await database.from(MATCHING_CASE_TABLE).insert({
        male_subject_type: maleSubjectType,
        male_subject_id: maleSubjectId,
        female_subject_type: femaleSubjectType,
        female_subject_id: femaleSubjectId,
        status: "candidate_selected",
        created_by_user_id: user.id,
        created_by_email: user.email,
      }).select("id, male_subject_type, male_subject_id, female_subject_type, female_subject_id, status, created_by_email, created_at, updated_at").single();
      if (error) throw error;
      const { error: eventError } = await database.from(MATCHING_EVENT_TABLE).insert({
        matching_case_id: data.id,
        previous_status: previousPair?.status ?? null,
        status: "candidate_selected",
        reason,
        actor_user_id: user.id,
        actor_email: user.email,
      });
      if (eventError) throw eventError;
      await appendAdminAudit(database, "matching_case_created", "matching_case", data.id, user, { repeated_pair: Boolean(previousPair), repeat_confirmed: repeatConfirmed });
      return json({ matching_case: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-match-transition") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const matchingCaseId = cleanText(body.matching_case_id, 80);
      const status = cleanText(body.status, 40);
      const reason = cleanText(body.reason, 2000) || null;
      const scheduledAtValue = cleanText(body.scheduled_at, 80);
      const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : null;
      if (!matchingCaseId || !MATCHING_STATUSES.has(status) || (scheduledAt && Number.isNaN(scheduledAt.getTime()))) return json({ error: "INVALID_MATCH_TRANSITION" }, 422);
      if (status === "male_rejected" && !reason) return json({ error: "MATCH_REJECTION_REASON_REQUIRED" }, 422);
      if (status === "meeting_confirmed" && !scheduledAt) return json({ error: "MATCH_SCHEDULE_REQUIRED" }, 422);
      const allowed: Record<string, string[]> = {
        candidate_selected: ["male_reviewing", "cancelled"],
        male_reviewing: ["male_accepted", "male_rejected", "cancelled"],
        male_accepted: ["scheduling", "cancelled"],
        male_rejected: ["closed"],
        scheduling: ["meeting_confirmed", "cancelled"],
        meeting_confirmed: ["meeting_completed", "cancelled"],
        meeting_completed: ["closed"],
        cancelled: ["closed"],
        closed: [],
      };
      const { data: current, error: currentError } = await database.from(MATCHING_CASE_TABLE).select("id, status").eq("id", matchingCaseId).maybeSingle();
      if (currentError) throw currentError;
      if (!current) return json({ error: "MATCH_NOT_FOUND" }, 404);
      if (!(allowed[current.status] ?? []).includes(status)) return json({ error: "INVALID_MATCH_TRANSITION" }, 409);
      const now = new Date().toISOString();
      const { data, error } = await database.from(MATCHING_CASE_TABLE).update({ status, updated_at: now }).eq("id", matchingCaseId).eq("status", current.status).select("id, status, updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "MATCH_TRANSITION_CONFLICT" }, 409);
      const { error: eventError } = await database.from(MATCHING_EVENT_TABLE).insert({
        matching_case_id: matchingCaseId,
        previous_status: current.status,
        status,
        reason,
        scheduled_at: scheduledAt?.toISOString() ?? null,
        actor_user_id: user.id,
        actor_email: user.email,
      });
      if (eventError) throw eventError;
      await appendAdminAudit(database, "matching_status_changed", "matching_case", matchingCaseId, user, { previous_status: current.status, status });
      return json({ matching_case: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "admin-social-status-set") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const { subjectType, subjectId } = subjectFromBody(body);
      const socialEventId = cleanText(body.social_event_id, 120);
      const status = cleanText(body.status, 40);
      const reason = cleanText(body.reason, 1000) || null;
      const numericEventId = Number(socialEventId);
      if (!validSubject(subjectType, subjectId) || !SOCIAL_STATUSES.has(status) || !Number.isInteger(numericEventId)) return json({ error: "INVALID_SOCIAL_STATUS_REQUEST" }, 422);
      const { data: eventSnapshot, error: eventSnapshotError } = await database.from(OPERATIONAL_SNAPSHOT_TABLE)
        .select("source_id")
        .eq("source_type", "social_event")
        .eq("source_id", numericEventId)
        .maybeSingle();
      if (eventSnapshotError) throw eventSnapshotError;
      if (!eventSnapshot) return json({ error: "SOCIAL_EVENT_NOT_FOUND" }, 404);
      const { data: previous, error: previousError } = await database.from(SOCIAL_EVENT_TABLE)
        .select("status")
        .eq("social_event_id", socialEventId)
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw previousError;
      const { data, error } = await database.from(SOCIAL_EVENT_TABLE).insert({
        social_event_id: socialEventId,
        subject_type: subjectType,
        subject_id: subjectId,
        previous_status: previous?.status ?? null,
        status,
        reason,
        actor_user_id: user.id,
        actor_email: user.email,
      }).select("id, social_event_id, subject_type, subject_id, previous_status, status, reason, actor_email, created_at").single();
      if (error) throw error;
      await appendAdminAudit(database, "social_status_changed", "social_event", socialEventId, user, { subject_type: subjectType, subject_id: subjectId, previous_status: previous?.status ?? null, status });
      return json({ event: data, build_id: INTAKE_BUILD_ID });
    }

    if (body.action === "snapshot-export-start") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { data, error } = await database
        .from(LEGACY_EXPORT_TABLE)
        .insert({ export_mode: body.export_mode === "delta" ? "delta" : "baseline", status: "started" })
        .select("id")
        .single();
      if (error) throw error;
      return json({ export_batch_id: data.id });
    }

    if (body.action === "snapshot-export-abandon-open") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { error } = await database.from(LEGACY_EXPORT_TABLE).update({
        status: "failed",
        error_summary: "Exporter stopped before completion; no completed cursor was issued.",
        completed_at: new Date().toISOString(),
      }).eq("status", "started");
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "snapshot-export-failed") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { error } = await database.from(LEGACY_EXPORT_TABLE).update({
        status: "failed",
        error_summary: String(body.error_summary ?? "Exporter failed.").slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).eq("id", String(body.export_batch_id)).eq("status", "started");
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "snapshot-last-completed") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { data, error } = await database.from(LEGACY_EXPORT_TABLE)
        .select("source_max_updated_at")
        .eq("status", "completed")
        .eq("failure_count", 0)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return json({ source_max_updated_at: data?.source_max_updated_at ?? null });
    }

    if (body.action === "snapshot-upload-url") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const sourceApplicationId = Number(body.source_application_id);
      const fileName = safeName(String(body.file_name ?? "photo.jpg"));
      const contentType = String(body.content_type ?? "");
      if (!Number.isInteger(sourceApplicationId) || !IMAGE_TYPES.has(contentType)) {
        return json({ error: "INVALID_PHOTO" }, 422);
      }
      const path = `legacy/${sourceApplicationId}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await database.storage.from(LEGACY_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return json({ path, signed_url: data.signedUrl });
    }

    if (body.action === "snapshot-upsert") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const sourceApplicationId = Number(body.source_application_id);
      if (!Number.isInteger(sourceApplicationId) || !body.snapshot || !body.source_checksum) {
        return json({ error: "INVALID_SNAPSHOT" }, 422);
      }
      const { error } = await database.from(LEGACY_SNAPSHOT_TABLE).upsert({
        source_application_id: sourceApplicationId,
        snapshot: body.snapshot,
        photo_refs: Array.isArray(body.photo_refs) ? body.photo_refs : [],
        source_created_at: body.source_created_at ?? null,
        source_updated_at: body.source_updated_at ?? null,
        source_checksum: String(body.source_checksum),
        export_batch_id: body.export_batch_id ?? null,
        exported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "source_application_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "snapshot-export-complete") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { error } = await database.from(LEGACY_EXPORT_TABLE).update({
        status: "completed",
        row_count: Number(body.row_count ?? 0),
        photo_count: Number(body.photo_count ?? 0),
        failure_count: Number(body.failure_count ?? 0),
        error_summary: body.error_summary ? String(body.error_summary).slice(0, 1000) : null,
        source_max_updated_at: body.source_max_updated_at ?? null,
        completed_at: new Date().toISOString(),
      }).eq("id", String(body.export_batch_id));
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "operational-export-start") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { data, error } = await database.from(OPERATIONAL_EXPORT_TABLE)
        .insert({ export_mode: body.export_mode === "delta" ? "delta" : "baseline", status: "started" })
        .select("id")
        .single();
      if (error) throw error;
      return json({ export_batch_id: data.id });
    }

    if (body.action === "operational-export-abandon-open") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { error } = await database.from(OPERATIONAL_EXPORT_TABLE).update({
        status: "failed",
        error_summary: "Exporter stopped before completion; no completed cursor was issued.",
        completed_at: new Date().toISOString(),
      }).eq("status", "started");
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "operational-export-failed") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { error } = await database.from(OPERATIONAL_EXPORT_TABLE).update({
        status: "failed",
        error_summary: String(body.error_summary ?? "Exporter failed.").slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).eq("id", String(body.export_batch_id)).eq("status", "started");
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "operational-snapshot-upsert") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const sourceType = String(body.source_type ?? "").slice(0, 80);
      const sourceId = Number(body.source_id);
      if (!sourceType || !Number.isInteger(sourceId) || !body.payload || !body.source_checksum) {
        return json({ error: "INVALID_OPERATIONAL_SNAPSHOT" }, 422);
      }
      const { error } = await database.from(OPERATIONAL_SNAPSHOT_TABLE).upsert({
        source_type: sourceType,
        source_id: sourceId,
        payload: body.payload,
        source_updated_at: body.source_updated_at ?? null,
        source_checksum: String(body.source_checksum),
        export_batch_id: body.export_batch_id ?? null,
        exported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "source_type,source_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "operational-photo-upload-url") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const sourceType = String(body.source_type ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
      const sourceId = Number(body.source_id);
      const contentType = String(body.content_type ?? "");
      const fileName = safeName(String(body.file_name ?? "photo.jpg"));
      if (!sourceType || !Number.isInteger(sourceId) || !IMAGE_TYPES.has(contentType)) {
        return json({ error: "INVALID_PHOTO" }, 422);
      }
      const path = `operational/${sourceType}/${sourceId}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await database.storage.from(LEGACY_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return json({ path, signed_url: data.signedUrl });
    }

    if (body.action === "operational-export-complete") {
      if (!requireSnapshotExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { error } = await database.from(OPERATIONAL_EXPORT_TABLE).update({
        status: "completed",
        row_count: Number(body.row_count ?? 0),
        source_max_updated_at: body.source_max_updated_at ?? null,
        completed_at: new Date().toISOString(),
      }).eq("id", String(body.export_batch_id));
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "operational-list") {
      if (!(await requireTemporaryAdmin(req))) return json({ error: "FORBIDDEN" }, 403);
      const sourceType = String(body.source_type ?? "").trim();
      let query = database.from(OPERATIONAL_SNAPSHOT_TABLE)
        .select("source_type, source_id, payload, source_updated_at, exported_at")
        .order("source_updated_at", { ascending: false });
      if (sourceType) query = query.eq("source_type", sourceType);
      const { data, error } = await query;
      if (error) throw error;
      return json({ records: data ?? [] });
    }

    if (body.action === "operational-photo-url") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const path = String(body.path ?? "");
      if (!path.startsWith("operational/")) return json({ error: "INVALID_PHOTO_PATH" }, 422);
      const { data, error } = await database.storage.from(LEGACY_BUCKET).createSignedUrl(path, 600);
      if (error) throw error;
      await appendAdminAudit(database, "photo_opened", "operational_photo", null, user);
      return json({ signed_url: data.signedUrl, expires_in_seconds: 600 });
    }

    if (body.action === "create") {
      const profile = body.payload?.profile ?? {};
      const phone = normPhone(profile.phone);
      const submissionType = body.payload?.submission_type;
      const idempotencyKey = String(
        body.idempotency_key ?? crypto.randomUUID(),
      );
      if (
        !profile.name ||
        !["male", "female"].includes(profile.gender) ||
        !/^01[0-9]{8,9}$/.test(phone) ||
        !/^\d{4}$/.test(String(profile.birthYear ?? "")) ||
        !["matching", "social"].includes(submissionType) ||
        !body.payload?.consent_at
      ) {
        return json({ error: "INVALID_SUBMISSION" }, 422);
      }

      const phoneHash = await hash(phone);
      const { data: previousByIdempotency, error: idempotencyError } =
        await database
          .from(TABLE)
          .select("id")
          .filter("payload->>idempotency_key", "eq", idempotencyKey)
          .maybeSingle();
      if (idempotencyError) throw idempotencyError;
      if (previousByIdempotency)
        return json({
          submission_id: previousByIdempotency.id,
          duplicate: true,
        });

      const { data: previousByPhone, error: phoneError } = await database
        .from(TABLE)
        .select("id")
        .filter("payload->>phone_hash", "eq", phoneHash)
        .filter("payload->>submission_type", "eq", submissionType)
        .maybeSingle();
      if (phoneError) throw phoneError;
      if (previousByPhone) return json({ error: "DUPLICATE_PHONE" }, 409);

      const externalSubmissionId = crypto.randomUUID();
      const payload = {
        ...body.payload,
        external_submission_id: externalSubmissionId,
        idempotency_key: idempotencyKey,
        phone_hash: phoneHash,
        profile: { ...profile, phone },
        status: "photos_pending",
        received_at: new Date().toISOString(),
      };
      const { data, error } = await database
        .from(TABLE)
        .insert({ payload })
        .select("id")
        .single();
      if (error) throw error;
      return json({
        submission_id: data.id,
        external_submission_id: externalSubmissionId,
      });
    }

    if (body.action === "signed-upload") {
      const recordId = Number(body.submission_id);
      const photo = body.photo ?? {};
      if (
        !Number.isInteger(recordId) ||
        !IMAGE_TYPES.has(photo.type) ||
        !Number.isFinite(photo.size) ||
        photo.size <= 0 ||
        photo.size > MAX_BYTES
      ) {
        return json({ error: "INVALID_PHOTO" }, 422);
      }
      const path = `submissions/${recordId}/${crypto.randomUUID()}-${safeName(String(photo.name || "photo"))}`;
      const { data, error } = await database.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (error) throw error;
      return json({ path, signed_url: data.signedUrl });
    }

    if (body.action === "complete") {
      const recordId = Number(body.submission_id);
      const photos = Array.isArray(body.photos)
        ? body.photos.slice(0, 2).map(String)
        : [];
      if (
        !Number.isInteger(recordId) ||
        photos.some((path) => !path.startsWith(`submissions/${recordId}/`))
      ) {
        return json({ error: "INVALID_COMPLETION" }, 422);
      }
      const { data: row, error: readError } = await database
        .from(TABLE)
        .select("payload")
        .eq("id", recordId)
        .single();
      if (readError) throw readError;
      const { error: updateError } = await database
        .from(TABLE)
        .update({
          payload: {
            ...row.payload,
            photo_refs: photos,
            status: "submitted",
            submitted_at: new Date().toISOString(),
          },
        })
        .eq("id", recordId);
      if (updateError) throw updateError;
      return json({ ok: true });
    }

    if (body.action === "admin-list") {
      if (!(await requireTemporaryAdmin(req)))
        return json({ error: "FORBIDDEN" }, 403);
      const { data, error } = await database
        .from(TABLE)
        .select("id, created_at, payload")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ records: data });
    }

    if (body.action === "admin-photo-url") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email)
        return json({ error: "FORBIDDEN" }, 403);
      const recordId = Number(body.submission_id);
      const path = String(body.path ?? "");
      if (
        !Number.isInteger(recordId) ||
        !path.startsWith(`submissions/${recordId}/`)
      )
        return json({ error: "INVALID_PHOTO_PATH" }, 422);
      const { data, error } = await database.storage
        .from(BUCKET)
        .createSignedUrl(path, 600);
      if (error) throw error;
      if (cleanText(body.purpose, 20) === "gallery") {
        await appendAdminAudit(database, "photo_opened", "temporary_submission", String(recordId), user);
      }
      return json({ signed_url: data.signedUrl, expires_in_seconds: 600 });
    }

    if (body.action === "snapshot-list") {
      if (!(await requireTemporaryAdmin(req))) return json({ error: "FORBIDDEN" }, 403);
      const { data, error } = await database.from(LEGACY_SNAPSHOT_TABLE)
        .select("source_application_id, snapshot, photo_refs, source_updated_at, exported_at")
        .order("source_updated_at", { ascending: false });
      if (error) throw error;
      return json({ records: data });
    }

    if (body.action === "snapshot-photo-url") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const path = String(body.path ?? "");
      if (!path.startsWith("legacy/")) return json({ error: "INVALID_PHOTO_PATH" }, 422);
      const { data, error } = await database.storage.from(LEGACY_BUCKET).createSignedUrl(path, 600);
      if (error) throw error;
      if (cleanText(body.purpose, 20) === "gallery") {
        await appendAdminAudit(database, "photo_opened", "legacy_snapshot", null, user);
      }
      return json({ signed_url: data.signedUrl, expires_in_seconds: 600 });
    }

    if (body.action === "consultation-list") {
      const user = await requireTemporaryAdmin(req);
      if (!user) return json({ error: "FORBIDDEN" }, 403);
      const subjectType = String(body.subject_type ?? "");
      const subjectId = String(body.subject_id ?? "").slice(0, 120);
      if (!['temporary_submission', 'legacy_snapshot'].includes(subjectType) || !subjectId) {
        return json({ error: "INVALID_CONSULTATION_SUBJECT" }, 422);
      }
      const { data, error } = await database.from(TEMP_CONSULTATION_TABLE)
        .select("id, subject_type, subject_id, note_text, consultation_status, next_action, next_action_due_at, created_by_email, created_at")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ records: data ?? [] });
    }

    if (body.action === "consultation-add") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const subjectType = String(body.subject_type ?? "");
      const subjectId = String(body.subject_id ?? "").slice(0, 120);
      const noteText = String(body.note_text ?? "").trim();
      const status = body.consultation_status == null ? null : String(body.consultation_status);
      const nextAction = String(body.next_action ?? "").trim().slice(0, 500) || null;
      const dueAt = body.next_action_due_at ? new Date(String(body.next_action_due_at)) : null;
      if (!['temporary_submission', 'legacy_snapshot'].includes(subjectType) || !subjectId || !noteText) {
        return json({ error: "INVALID_CONSULTATION_ENTRY" }, 422);
      }
      if (noteText.length > 10000 || (status && !['before', 'in_progress', 'completed'].includes(status))) {
        return json({ error: "INVALID_CONSULTATION_ENTRY" }, 422);
      }
      if (dueAt && Number.isNaN(dueAt.getTime())) return json({ error: "INVALID_NEXT_ACTION_DATE" }, 422);
      const { data, error } = await database.from(TEMP_CONSULTATION_TABLE).insert({
        subject_type: subjectType,
        subject_id: subjectId,
        note_text: noteText,
        consultation_status: status,
        next_action: nextAction,
        next_action_due_at: dueAt?.toISOString() ?? null,
        created_by_user_id: user.id,
        created_by_email: user.email,
      }).select("id, subject_type, subject_id, note_text, consultation_status, next_action, next_action_due_at, created_by_email, created_at").single();
      if (error) throw error;
      await appendAdminAudit(database, "consultation_note_added", "applicant_subject", `${subjectType}:${subjectId}`, user, {
        consultation_status: status,
        has_next_action: Boolean(nextAction),
      });
      return json({ record: data });
    }

    if (body.action === "consultation-import-manifest") {
      const user = await requireTemporaryAdmin(req);
      if (!user) return json({ error: "FORBIDDEN" }, 403);
      const { data, error } = await database.from(TEMP_CONSULTATION_TABLE)
        .select("id, subject_type, subject_id, note_text, consultation_status, next_action, next_action_due_at, created_by_email, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ records: data ?? [] });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "TEMPORARY_INTAKE_UNAVAILABLE" }, 500);
  }
});
