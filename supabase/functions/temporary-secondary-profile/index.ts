import { createClient } from "npm:@supabase/supabase-js@2";

const FORM_TABLE = "temporary_secondary_profile_forms";
const DOCUMENT_TABLE = "temporary_secondary_profile_documents";
const EVENT_TABLE = "temporary_secondary_profile_events";
const DOCUMENT_BUCKET = "temporary-secondary-profile-documents";
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FORM_TYPES = new Set(["profile_female", "profile_male", "social_event"]);
const ALLOWED_SUBJECT_TYPES = new Set(["temporary_submission", "legacy_snapshot", "restored_application"]);
const BUILD_ID = "secondary-link-reissue-20260826-3";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-snapshot-export-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const hash = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const safeName = (value: string) =>
  value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "document";

const normalizePhone = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const text = (value: unknown) => String(value ?? "").trim();

const limitedText = (value: unknown, max = 160) => text(value).slice(0, max);

const booleanValue = (value: unknown) => value === true;

function normalizeSecondaryPayload(formType: string, rawValue: unknown) {
  const raw = rawValue && typeof rawValue === "object"
    ? rawValue as Record<string, unknown>
    : {};
  const common = {
    name: limitedText(raw.name, 100),
    phone: normalizePhone(raw.phone).slice(0, 11),
    gender: limitedText(raw.gender, 20),
    birthDate: limitedText(raw.birthDate ?? raw.birth, 20),
    height: limitedText(raw.height, 40),
    region: limitedText(raw.region, 100),
    singleStatus: limitedText(raw.singleStatus ?? raw.single, 50),
    maritalStatus: limitedText(raw.maritalStatus ?? raw.marriage, 50),
    children: limitedText(raw.children, 50),
    smoking: limitedText(raw.smoking, 50),
    drinking: limitedText(raw.drinking, 50),
    religion: limitedText(raw.religion, 50),
    tattoo: limitedText(raw.tattoo, 50),
    education: limitedText(raw.education, 120),
    school: limitedText(raw.school, 160),
    healthFlag: limitedText(raw.healthFlag ?? raw.health_flag, 30),
    healthMemo: limitedText(raw.healthMemo ?? raw.health_memo, 2000),
    privacyConsent: booleanValue(raw.privacyConsent ?? raw.privacy_consent ?? raw.profileConsent),
  };
  if (formType === "profile_female") {
    return {
      ...common,
      job: limitedText(raw.job ?? raw.job_female, 160),
      companyIndustry: limitedText(raw.companyIndustry ?? raw.company_industry, 200),
      workType: limitedText(raw.workType ?? raw.work_type, 100),
      workTypeOther: limitedText(raw.workTypeOther ?? raw.work_type_other ?? raw.work_other, 160),
      incomeFemale: limitedText(raw.incomeFemale ?? raw.income_female, 100),
      realCheckMethod: limitedText(raw.realCheckMethod ?? raw.realCheck ?? raw.real_check, 50),
      realCheckDate: limitedText(raw.realCheckDate ?? raw.real_check_date, 20),
      housemate: limitedText(raw.housemate, 50),
      major: limitedText(raw.major, 160),
      serviceSelection: limitedText(raw.serviceSelection ?? raw.serviceFemale ?? raw.service_female, 50),
      femaleNote: limitedText(raw.femaleNote ?? raw.female_note, 2000),
    };
  }
  if (formType === "profile_male") {
    return {
      ...common,
      bodyType: limitedText(raw.bodyType ?? raw.bodytype, 50),
      job: limitedText(raw.job, 160),
      company: limitedText(raw.company, 200),
      position: limitedText(raw.position, 100),
      employment: limitedText(raw.employment, 100),
      employmentOther: limitedText(raw.employmentOther ?? raw.employment_other ?? raw.work_other, 160),
      incomeMale: limitedText(raw.incomeMale ?? raw.income_male, 100),
      asset: limitedText(raw.asset, 100),
      car: limitedText(raw.car, 100),
      housing: limitedText(raw.housing, 100),
      purpose: limitedText(raw.purpose, 50),
      serviceSelection: limitedText(raw.serviceSelection ?? raw.serviceMale ?? raw.service_male, 50),
      preferredAgeMin: limitedText(raw.preferredAgeMin ?? raw.age_min, 10),
      preferredAgeMax: limitedText(raw.preferredAgeMax ?? raw.age_max, 10),
      preferredHeightMin: limitedText(raw.preferredHeightMin ?? raw.height_min, 10),
      preferredHeightMax: limitedText(raw.preferredHeightMax ?? raw.height_max, 10),
      targetTattoo: limitedText(raw.targetTattoo ?? raw.target_tattoo, 50),
      targetSmoking: limitedText(raw.targetSmoking ?? raw.target_smoking, 50),
      targetMarriage: limitedText(raw.targetMarriage ?? raw.target_marriage, 50),
      documentDeferred: booleanValue(raw.documentDeferred ?? raw.document_deferred),
      documentDueDate: limitedText(raw.documentDueDate ?? raw.document_due_date, 20),
    };
  }
  return {
    name: common.name,
    phone: common.phone,
    gender: common.gender,
    job: limitedText(raw.job, 160),
    workplace: limitedText(raw.workplace ?? raw.companyIndustry ?? raw.company, 200),
    privacyConsent: common.privacyConsent,
  };
}

function canonicalizeSecondaryPayloadPatch(formType: string, rawValue: unknown) {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  const patch: Record<string, unknown> = { ...raw };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);
  const alias = (canonical: string, ...legacy: string[]) => {
    if (has(canonical)) return;
    const source = legacy.find(has);
    if (source) patch[canonical] = raw[source];
  };
  alias("birthDate", "birth");
  alias("singleStatus", "single");
  alias("maritalStatus", "marriage");
  alias("healthFlag", "health_flag");
  alias("healthMemo", "health_memo");
  alias("privacyConsent", "privacy_consent", "profileConsent");
  if (formType === "profile_female") {
    alias("job", "job_female");
    alias("companyIndustry", "company_industry");
    alias("workType", "work_type");
    alias("workTypeOther", "work_type_other", "work_other");
    alias("incomeFemale", "income_female");
    alias("realCheckMethod", "realCheck", "real_check");
    alias("realCheckDate", "real_check_date");
    alias("serviceSelection", "serviceFemale", "service_female");
    alias("femaleNote", "female_note");
  } else if (formType === "profile_male") {
    alias("bodyType", "bodytype");
    alias("employmentOther", "employment_other", "work_other");
    alias("incomeMale", "income_male");
    alias("serviceSelection", "serviceMale", "service_male");
    alias("preferredAgeMin", "age_min");
    alias("preferredAgeMax", "age_max");
    alias("preferredHeightMin", "height_min");
    alias("preferredHeightMax", "height_max");
    alias("targetTattoo", "target_tattoo");
    alias("targetSmoking", "target_smoking");
    alias("targetMarriage", "target_marriage");
    alias("documentDeferred", "document_deferred");
    alias("documentDueDate", "document_due_date");
  } else if (formType === "social_event") {
    alias("workplace", "companyIndustry", "company");
  }
  return patch;
}

function normalizePrefillSnapshot(
  formType: string,
  rawPrefill: unknown,
  genderSnapshot: string | null,
) {
  const normalized = normalizeSecondaryPayload(formType, rawPrefill) as Record<string, unknown>;
  const common = {
    name: normalized.name,
    phone: normalized.phone,
    gender: genderSnapshot,
  };
  if (formType === "profile_female") {
    return {
      ...common,
      birthDate: normalized.birthDate,
      height: normalized.height,
      region: normalized.region,
      singleStatus: normalized.singleStatus,
      maritalStatus: normalized.maritalStatus,
      children: normalized.children,
      smoking: normalized.smoking,
      drinking: normalized.drinking,
      religion: normalized.religion,
      tattoo: normalized.tattoo,
      job: normalized.job,
      companyIndustry: normalized.companyIndustry,
      workType: normalized.workType,
      workTypeOther: normalized.workTypeOther,
      incomeFemale: normalized.incomeFemale,
      realCheckMethod: normalized.realCheckMethod,
      realCheckDate: normalized.realCheckDate,
      housemate: normalized.housemate,
      education: normalized.education,
      school: normalized.school,
      major: normalized.major,
      serviceSelection: normalized.serviceSelection,
      femaleNote: normalized.femaleNote,
    };
  }
  if (formType === "profile_male") {
    return {
      ...common,
      birthDate: normalized.birthDate,
      height: normalized.height,
      region: normalized.region,
      singleStatus: normalized.singleStatus,
      maritalStatus: normalized.maritalStatus,
      children: normalized.children,
      smoking: normalized.smoking,
      drinking: normalized.drinking,
      religion: normalized.religion,
      tattoo: normalized.tattoo,
      bodyType: normalized.bodyType,
      job: normalized.job,
      employment: normalized.employment,
      employmentOther: normalized.employmentOther,
      company: normalized.company,
      position: normalized.position,
      incomeMale: normalized.incomeMale,
      asset: normalized.asset,
      car: normalized.car,
      housing: normalized.housing,
      education: normalized.education,
      school: normalized.school,
      serviceSelection: normalized.serviceSelection,
      purpose: normalized.purpose,
      preferredAgeMin: normalized.preferredAgeMin,
      preferredAgeMax: normalized.preferredAgeMax,
      preferredHeightMin: normalized.preferredHeightMin,
      preferredHeightMax: normalized.preferredHeightMax,
      targetTattoo: normalized.targetTattoo,
      targetSmoking: normalized.targetSmoking,
      targetMarriage: normalized.targetMarriage,
    };
  }
  return {
    ...common,
    job: normalized.job,
    workplace: normalized.workplace,
  };
}

const generateRawToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const SECRET_KEYS = new Set([
  "token",
  "token_hash",
  "tokenHash",
  "storage_path",
  "storagePath",
  "signed_url",
  "signedUrl",
  "submit_idempotency_key",
  "submitIdempotencyKey",
]);

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEYS.has(key))
      .map(([key, child]) => [key, stripSecrets(child)]),
  );
}

async function requireTemporaryAdmin(req: Request) {
  const rawAuthorization = req.headers.get("Authorization") ?? "";
  const token = rawAuthorization.startsWith("Bearer ") ? rawAuthorization.slice(7) : "";
  if (!token) return null;
  const publicClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await publicClient.auth.getUser(token);
  const allowlist = (Deno.env.get("TEMP_ADMIN_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (error || !data.user?.email || !allowlist.includes(data.user.email.toLowerCase())) return null;
  return data.user;
}

function requireExporter(req: Request) {
  const expected = Deno.env.get("LEGACY_SNAPSHOT_EXPORT_TOKEN") ?? "";
  const received = req.headers.get("x-snapshot-export-token") ?? "";
  return Boolean(expected) && received.length === expected.length && received === expected;
}

async function appendEvent(
  database: ReturnType<typeof serviceClient>,
  formId: string,
  eventType: string,
  actorType: "public_token" | "temporary_admin" | "exporter" | "system",
  actor?: { id?: string | null; email?: string | null },
  detail: Record<string, unknown> = {},
) {
  const { error } = await database.from(EVENT_TABLE).insert({
    form_id: formId,
    event_type: eventType,
    actor_type: actorType,
    actor_user_id: actor?.id ?? null,
    actor_email: actor?.email ?? null,
    detail: stripSecrets(detail),
  });
  if (error) throw error;
}

async function resolvePublicForm(database: ReturnType<typeof serviceClient>, rawToken: unknown) {
  const token = text(rawToken);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return { error: "INVALID_LINK", status: 404 } as const;
  const tokenHash = await hash(token);
  const { data: form, error } = await database.from(FORM_TABLE).select("*").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw error;
  if (!form) return { error: "INVALID_LINK", status: 404 } as const;
  if (["revoked", "expired"].includes(form.status)) return { error: "LINK_UNAVAILABLE", status: 410 } as const;
  if (new Date(form.expires_at).getTime() <= Date.now()) {
    await database.from(FORM_TABLE).update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", form.id);
    await appendEvent(database, form.id, "expired", "system");
    return { error: "LINK_EXPIRED", status: 410 } as const;
  }
  return { form, tokenHash } as const;
}

async function checkPublicRateLimit(database: ReturnType<typeof serviceClient>, formId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await database.from(EVENT_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId)
    .eq("actor_type", "public_token")
    .gte("created_at", since);
  if (error) throw error;
  return (count ?? 0) < 90;
}

function validateDocumentType(formType: string, documentType: string) {
  if (formType === "profile_male") return ["job", "income", "asset"].includes(documentType);
  if (formType === "social_event") return documentType === "business_card";
  return false;
}

type SubmissionValidationIssue = { code: string; missing: string[] };

function validateSubmission(formType: string, payload: Record<string, unknown>, verifiedTypes: Set<string>): SubmissionValidationIssue | null {
  const missing: string[] = [];
  const requireText = (key: string, value: unknown = payload[key]) => { if (!text(value)) missing.push(key); };
  if (formType === "profile_female") {
    ["birthDate", "height", "region", "singleStatus", "maritalStatus", "realCheckMethod", "realCheckDate", "serviceSelection"].forEach((key) => requireText(key));
    if (text(payload.workType) === "기타") requireText("workTypeOther");
    if (payload.privacyConsent !== true) missing.push("privacyConsent");
    if (!missing.length) return null;
    return { code: missing.length === 1 && missing[0] === "privacyConsent" ? "PRIVACY_CONSENT_REQUIRED" : "FEMALE_REQUIRED_FIELDS_MISSING", missing };
  }
  if (formType === "profile_male") {
    ["birthDate", "height", "region", "singleStatus", "maritalStatus", "job", "incomeMale", "asset", "purpose", "serviceSelection"].forEach((key) => requireText(key));
    if (text(payload.employment) === "기타") requireText("employmentOther");
    const rawDueDate = text(payload.documentDueDate ?? payload.document_due_date);
    const deferred = payload.documentDeferred === true || payload.document_deferred === true || Boolean(rawDueDate);
    if (deferred) {
      const dueDate = new Date(rawDueDate);
      if (!rawDueDate || Number.isNaN(dueDate.getTime())) missing.push("documentDueDate");
    } else {
      if (!verifiedTypes.has("job")) missing.push("jobDocument");
      if (!verifiedTypes.has("income")) missing.push("incomeDocument");
      if (!verifiedTypes.has("asset")) missing.push("assetDocument");
    }
    if (payload.privacyConsent !== true) missing.push("privacyConsent");
    if (!missing.length) return null;
    return { code: missing.length === 1 && missing[0] === "privacyConsent" ? "PRIVACY_CONSENT_REQUIRED" : "MALE_REQUIRED_FIELDS_MISSING", missing };
  }
  if (formType === "social_event") {
    const phone = normalizePhone(payload.phone);
    requireText("name");
    if (!/^01[0-9]{8,9}$/.test(phone)) missing.push("phone");
    requireText("job");
    requireText("workplace", payload.workplace ?? payload.companyIndustry);
    if (!verifiedTypes.has("business_card")) missing.push("businessCardDocument");
    if (payload.privacyConsent !== true) missing.push("privacyConsent");
    return missing.length ? { code: "EVENT_REQUIRED_FIELDS_MISSING", missing } : null;
  }
  return { code: "INVALID_FORM_TYPE", missing: [] };
}

async function detectMime(blob: Blob) {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const has = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (has(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (has(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (has(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (has(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json();
    const action = text(body.action);
    const database = serviceClient();

    if (action === "secondary-build") return json({ ok: true, build_id: BUILD_ID });

    if (action === "secondary-public-get") {
      const resolved = await resolvePublicForm(database, body.token);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { form } = resolved;
      if (!(await checkPublicRateLimit(database, form.id))) return json({ error: "RATE_LIMITED" }, 429);
      const openedAt = new Date().toISOString();
      await database.from(FORM_TABLE).update({
        status: form.status === "pending" ? "in_progress" : form.status,
        first_opened_at: form.first_opened_at ?? openedAt,
        last_opened_at: openedAt,
        updated_at: openedAt,
      }).eq("id", form.id);
      const { data: documents, error: documentError } = await database.from(DOCUMENT_TABLE)
        .select("document_type, status, file_size, verified_mime_type, updated_at")
        .eq("form_id", form.id)
        .order("created_at", { ascending: true });
      if (documentError) throw documentError;
      await appendEvent(database, form.id, "opened", "public_token");
      return json({
        form: {
          form_type: form.form_type,
          status: form.status === "pending" ? "in_progress" : form.status,
          expires_at: form.expires_at,
          gender_snapshot: form.gender_snapshot,
          event_snapshot: form.event_snapshot,
          prefill: {
            ...(form.prefill_snapshot ?? {}),
            gender: form.gender_snapshot ?? form.prefill_snapshot?.gender ?? null,
          },
          draft_payload: form.draft_payload ?? {},
          draft_revision: form.draft_revision,
          documents: documents ?? [],
        },
      });
    }

    if (action === "secondary-draft-save") {
      const resolved = await resolvePublicForm(database, body.token);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { form } = resolved;
      if (form.status === "submitted") return json({ error: "ALREADY_SUBMITTED" }, 409);
      if (!(await checkPublicRateLimit(database, form.id))) return json({ error: "RATE_LIMITED" }, 429);
      const expectedRevision = Number(body.expected_revision);
      const draftPayload = normalizeSecondaryPayload(form.form_type, stripSecrets(body.draft_payload ?? {}));
      if (!Number.isInteger(expectedRevision) || JSON.stringify(draftPayload).length > 200_000) return json({ error: "INVALID_DRAFT" }, 422);
      const savedAt = new Date().toISOString();
      const { data, error } = await database.from(FORM_TABLE).update({
        status: "in_progress",
        draft_payload: draftPayload,
        draft_revision: expectedRevision + 1,
        draft_saved_at: savedAt,
        updated_at: savedAt,
      }).eq("id", form.id).eq("draft_revision", expectedRevision).select("draft_revision, draft_saved_at").maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: current } = await database.from(FORM_TABLE)
          .select("draft_revision")
          .eq("id", form.id)
          .maybeSingle();
        return json({ error: "DRAFT_CONFLICT", current_revision: current?.draft_revision ?? form.draft_revision }, 409);
      }
      await appendEvent(database, form.id, "draft_saved", "public_token", undefined, { revision: data.draft_revision });
      return json(data);
    }

    if (action === "secondary-document-upload-url") {
      const resolved = await resolvePublicForm(database, body.token);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { form } = resolved;
      if (form.status === "submitted") return json({ error: "ALREADY_SUBMITTED" }, 409);
      if (!(await checkPublicRateLimit(database, form.id))) return json({ error: "RATE_LIMITED" }, 429);
      const documentType = text(body.document_type);
      const mimeType = text(body.file?.type);
      const fileSize = Number(body.file?.size);
      if (!validateDocumentType(form.form_type, documentType) || !ALLOWED_DOCUMENT_TYPES.has(mimeType) || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_DOCUMENT_BYTES) {
        return json({ error: "INVALID_DOCUMENT" }, 422);
      }
      const { data: existing, error: existingError } = await database.from(DOCUMENT_TABLE)
        .select("id")
        .eq("form_id", form.id)
        .eq("document_type", documentType)
        .maybeSingle();
      if (existingError) throw existingError;
      const documentId = existing?.id ?? crypto.randomUUID();
      const path = `forms/${form.id}/${documentType}/${documentId}-${safeName(text(body.file?.name))}`;
      const now = new Date().toISOString();
      const { error: upsertError } = await database.from(DOCUMENT_TABLE).upsert({
        id: documentId,
        form_id: form.id,
        document_type: documentType,
        storage_path: path,
        original_name: safeName(text(body.file?.name)),
        declared_mime_type: mimeType,
        verified_mime_type: null,
        file_size: fileSize,
        status: "pending_upload",
        reject_reason: null,
        updated_at: now,
      }, { onConflict: "form_id,document_type" });
      if (upsertError) throw upsertError;
      const { data: signed, error: signedError } = await database.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
      if (signedError) throw signedError;
      await appendEvent(database, form.id, "document_upload_requested", "public_token", undefined, { document_type: documentType, file_size: fileSize });
      return json({ document_id: documentId, signed_url: signed.signedUrl });
    }

    if (action === "secondary-document-complete") {
      const resolved = await resolvePublicForm(database, body.token);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { form } = resolved;
      if (form.status === "submitted") return json({ error: "ALREADY_SUBMITTED" }, 409);
      const documentId = text(body.document_id);
      const { data: document, error: documentError } = await database.from(DOCUMENT_TABLE)
        .select("id, form_id, document_type, storage_path, declared_mime_type, file_size")
        .eq("id", documentId)
        .eq("form_id", form.id)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document || !document.storage_path.startsWith(`forms/${form.id}/`)) return json({ error: "INVALID_DOCUMENT" }, 422);
      const { data: blob, error: downloadError } = await database.storage.from(DOCUMENT_BUCKET).download(document.storage_path);
      if (downloadError) throw downloadError;
      const verifiedMime = await detectMime(blob);
      const valid = Boolean(verifiedMime && verifiedMime === document.declared_mime_type && blob.size === document.file_size && blob.size <= MAX_DOCUMENT_BYTES);
      const { error: updateError } = await database.from(DOCUMENT_TABLE).update({
        verified_mime_type: verifiedMime,
        status: valid ? "verified" : "rejected",
        reject_reason: valid ? null : "FILE_SIGNATURE_MISMATCH",
        updated_at: new Date().toISOString(),
      }).eq("id", document.id).eq("form_id", form.id);
      if (updateError) throw updateError;
      await appendEvent(database, form.id, valid ? "document_verified" : "document_rejected", "public_token", undefined, { document_type: document.document_type });
      return valid ? json({ ok: true, document_type: document.document_type, status: "verified" }) : json({ error: "INVALID_DOCUMENT_CONTENT" }, 422);
    }

    if (action === "secondary-submit") {
      const resolved = await resolvePublicForm(database, body.token);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { form } = resolved;
      const idempotencyKey = text(body.submit_idempotency_key);
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, 422);
      if (form.status === "submitted") {
        return form.submit_idempotency_key === idempotencyKey
          ? json({ ok: true, replayed: true, status: "submitted", submitted_at: form.submitted_at, build_id: BUILD_ID })
          : json({ error: "ALREADY_SUBMITTED" }, 409);
      }
      const storedDraft = normalizeSecondaryPayload(form.form_type, stripSecrets(form.draft_payload ?? {})) as Record<string, unknown>;
      const currentPayload = canonicalizeSecondaryPayloadPatch(form.form_type, stripSecrets(body.payload ?? {}));
      const submittedPayload = normalizeSecondaryPayload(form.form_type, {
        ...storedDraft,
        ...currentPayload,
      }) as Record<string, unknown>;
      if (JSON.stringify(submittedPayload).length > 250_000) return json({ error: "INVALID_SUBMISSION" }, 422);
      const { data: documents, error: documentError } = await database.from(DOCUMENT_TABLE)
        .select("document_type, status")
        .eq("form_id", form.id);
      if (documentError) throw documentError;
      const verifiedTypes = new Set((documents ?? []).filter((document) => document.status === "verified").map((document) => document.document_type));
      const validationError = validateSubmission(form.form_type, submittedPayload, verifiedTypes);
      if (validationError) return json({ error: validationError.code, missing_fields: validationError.missing, build_id: BUILD_ID }, 422);
      const submittedAt = new Date().toISOString();
      const { data, error } = await database.from(FORM_TABLE).update({
        status: "submitted",
        submitted_payload: submittedPayload,
        submit_idempotency_key: idempotencyKey,
        submitted_at: submittedAt,
        consent_version: text(body.consent_version || "temporary-secondary-v1"),
        consent_at: submittedAt,
        updated_at: submittedAt,
      }).eq("id", form.id).in("status", ["pending", "in_progress"]).select("status, submitted_at").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "SUBMIT_CONFLICT" }, 409);
      try {
        await appendEvent(database, form.id, "submitted", "public_token", undefined, { form_type: form.form_type });
      } catch (eventError) {
        console.error("secondary_submit_event_failed", {
          form_id: form.id,
          error: eventError instanceof Error ? eventError.message : "unknown",
        });
      }
      return json({ ok: true, replayed: false, status: data.status, submitted_at: data.submitted_at, build_id: BUILD_ID });
    }

    if (action === "secondary-admin-issue") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const subjectType = text(body.subject_type);
      const subjectId = text(body.subject_id).slice(0, 120);
      const formType = text(body.form_type);
      const genderSnapshot = text(body.gender_snapshot) || null;
      if (!ALLOWED_SUBJECT_TYPES.has(subjectType) || !subjectId || !ALLOWED_FORM_TYPES.has(formType) || (genderSnapshot && !["female", "male"].includes(genderSnapshot))) {
        return json({ error: "INVALID_ISSUE_REQUEST" }, 422);
      }
      if ((formType === "profile_female" && genderSnapshot === "male") || (formType === "profile_male" && genderSnapshot === "female")) {
        return json({ error: "FORM_GENDER_MISMATCH" }, 422);
      }
      const eventSnapshot = formType === "social_event" ? stripSecrets(body.event_snapshot ?? {}) as Record<string, unknown> : null;
      if (formType === "social_event" && (!text(eventSnapshot?.title) || !text(eventSnapshot?.startsAt))) return json({ error: "EVENT_SNAPSHOT_REQUIRED" }, 422);
      const days = Math.min(30, Math.max(1, Number(body.expires_in_days ?? 14)));
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const rawToken = generateRawToken();
      const tokenHash = await hash(rawToken);
      const tokenPrefix = rawToken.slice(0, 10);
      const prefill = stripSecrets(body.prefill ?? {}) as Record<string, unknown>;
      const normalizedPrefill = normalizePrefillSnapshot(formType, prefill, genderSnapshot);
      const { data, error } = await database.from(FORM_TABLE).insert({
        subject_type: subjectType,
        subject_id: subjectId,
        form_type: formType,
        gender_snapshot: genderSnapshot,
        social_event_id: formType === "social_event" ? text(body.social_event_id).slice(0, 120) || null : null,
        event_snapshot: eventSnapshot,
        prefill_snapshot: normalizedPrefill,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        expires_at: expiresAt,
        issued_by_user_id: user.id,
        issued_by_email: user.email,
      }).select("id, form_type, status, expires_at, token_prefix, created_at").single();
      if (error?.code === "23505") return json({ error: "ACTIVE_LINK_EXISTS" }, 409);
      if (error) throw error;
      await appendEvent(database, data.id, "issued", "temporary_admin", { id: user.id, email: user.email }, { form_type: formType, subject_type: subjectType });
      const origin = (Deno.env.get("TEMP_SECONDARY_PUBLIC_ORIGIN") || "https://irum.click").replace(/\/$/, "");
      return json({ form: data, raw_url: `${origin}/profile/#${rawToken}` });
    }

    if (action === "secondary-admin-revoke") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const formId = text(body.form_id);
      const revokedAt = new Date().toISOString();
      const { data, error } = await database.from(FORM_TABLE).update({
        status: "revoked",
        revoked_by_user_id: user.id,
        revoked_at: revokedAt,
        updated_at: revokedAt,
      }).eq("id", formId).in("status", ["pending", "in_progress"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "FORM_NOT_REVOCABLE" }, 409);
      await appendEvent(database, formId, "revoked", "temporary_admin", { id: user.id, email: user.email });
      return json({ ok: true });
    }

    if (action === "secondary-admin-reissue") {
      const user = await requireTemporaryAdmin(req);
      if (!user?.email) return json({ error: "FORBIDDEN" }, 403);
      const formId = text(body.form_id);
      const days = Math.min(30, Math.max(1, Number(body.expires_in_days ?? 14)));
      const rawToken = generateRawToken();
      const tokenHash = await hash(rawToken);
      const tokenPrefix = rawToken.slice(0, 10);
      const updatedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const { data, error } = await database.from(FORM_TABLE).update({
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        expires_at: expiresAt,
        updated_at: updatedAt,
      }).eq("id", formId).in("status", ["pending", "in_progress"])
        .select("id, form_type, status, expires_at, token_prefix, draft_revision, draft_saved_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "FORM_NOT_REISSUABLE" }, 409);
      await appendEvent(database, formId, "reissued", "temporary_admin", { id: user.id, email: user.email }, { expires_in_days: days });
      const origin = (Deno.env.get("TEMP_SECONDARY_PUBLIC_ORIGIN") || "https://irum.click").replace(/\/$/, "");
      return json({ form: data, raw_url: `${origin}/profile/#${rawToken}`, build_id: BUILD_ID });
    }

    if (action === "secondary-admin-list") {
      const user = await requireTemporaryAdmin(req);
      if (!user) return json({ error: "FORBIDDEN" }, 403);
      let query = database.from(FORM_TABLE).select("id, subject_type, subject_id, form_type, gender_snapshot, social_event_id, event_snapshot, prefill_snapshot, token_prefix, status, expires_at, first_opened_at, last_opened_at, draft_payload, draft_revision, draft_saved_at, submitted_payload, submitted_at, consent_version, consent_at, issued_by_email, revoked_at, created_at, updated_at").order("created_at", { ascending: false });
      if (text(body.subject_type)) query = query.eq("subject_type", text(body.subject_type));
      if (text(body.subject_id)) query = query.eq("subject_id", text(body.subject_id));
      const { data: forms, error } = await query;
      if (error) throw error;
      const formIds = (forms ?? []).map((form) => form.id);
      let documents: unknown[] = [];
      if (formIds.length) {
        const documentResult = await database.from(DOCUMENT_TABLE)
          .select("id, form_id, document_type, original_name, declared_mime_type, verified_mime_type, file_size, status, reject_reason, created_at, updated_at")
          .in("form_id", formIds)
          .order("created_at", { ascending: true });
        if (documentResult.error) throw documentResult.error;
        documents = documentResult.data ?? [];
      }
      return json({ forms: forms ?? [], documents });
    }

    if (action === "secondary-admin-document-url") {
      const user = await requireTemporaryAdmin(req);
      if (!user) return json({ error: "FORBIDDEN" }, 403);
      const formId = text(body.form_id);
      const documentId = text(body.document_id);
      const { data: document, error } = await database.from(DOCUMENT_TABLE)
        .select("storage_path, status")
        .eq("id", documentId)
        .eq("form_id", formId)
        .maybeSingle();
      if (error) throw error;
      if (!document || !document.storage_path.startsWith(`forms/${formId}/`)) return json({ error: "INVALID_DOCUMENT" }, 422);
      const { data: signed, error: signedError } = await database.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 600);
      if (signedError) throw signedError;
      await appendEvent(database, formId, "admin_document_opened", "temporary_admin", { id: user.id, email: user.email }, { document_status: document.status });
      return json({ signed_url: signed.signedUrl, expires_in_seconds: 600 });
    }

    if (action === "secondary-import-manifest") {
      if (!requireExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const { data: forms, error } = await database.from(FORM_TABLE)
        .select("id, subject_type, subject_id, form_type, gender_snapshot, social_event_id, event_snapshot, prefill_snapshot, status, expires_at, draft_revision, draft_saved_at, submitted_payload, submitted_at, consent_version, consent_at, issued_by_email, revoked_at, created_at, updated_at")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      const formIds = (forms ?? []).map((form) => form.id);
      let documents: unknown[] = [];
      if (formIds.length) {
        const documentResult = await database.from(DOCUMENT_TABLE)
          .select("id, form_id, document_type, storage_path, original_name, declared_mime_type, verified_mime_type, file_size, status, created_at, updated_at")
          .in("form_id", formIds)
          .order("created_at", { ascending: true });
        if (documentResult.error) throw documentResult.error;
        documents = documentResult.data ?? [];
      }
      return json({ forms: forms ?? [], documents });
    }

    if (action === "secondary-import-document-url") {
      if (!requireExporter(req)) return json({ error: "FORBIDDEN" }, 403);
      const documentId = text(body.document_id);
      const { data: document, error } = await database.from(DOCUMENT_TABLE)
        .select("form_id, storage_path")
        .eq("id", documentId)
        .eq("status", "verified")
        .maybeSingle();
      if (error) throw error;
      if (!document || !document.storage_path.startsWith(`forms/${document.form_id}/`)) return json({ error: "INVALID_DOCUMENT" }, 422);
      const { data: signed, error: signedError } = await database.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 300);
      if (signedError) throw signedError;
      await appendEvent(database, document.form_id, "document_exported", "exporter");
      return json({ signed_url: signed.signedUrl, expires_in_seconds: 300 });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    console.error("temporary-secondary-profile failure", message.slice(0, 300));
    return json({ error: "TEMPORARY_SECONDARY_PROFILE_UNAVAILABLE" }, 500);
  }
});
