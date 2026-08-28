(() => {
  "use strict";

  window.installIrumCrmRuntime = () => {
    const registry = window.IRUM_CRM_REGISTRY;
    if (!registry) throw new Error("IRUM_CRM_REGISTRY_MISSING");
    let missingOnly = false;
    let historyFilter = "all";

    const owns = (item, row) => item.subjects.some((subject) => subject.type === row.subject_type && String(subject.id) === String(row.subject_id));
    const itemKeys = (item) => new Set(item.subjects.map((subject) => `${subject.type}:${subject.id}`));
    const genderOf = (item) => item.profile.gender === "female" ? "female" : "male";
    const matchingCases = (item) => {
      const keys = itemKeys(item);
      return state.matchingCases.filter((matchingCase) => ["meeting_completed", "closed"].includes(matchingCase.status) && (
        keys.has(`${matchingCase.male_subject_type}:${matchingCase.male_subject_id}`) ||
        keys.has(`${matchingCase.female_subject_type}:${matchingCase.female_subject_id}`)
      ));
    };
    const correctionRows = (item) => state.fieldCorrections.filter((row) => owns(item, row)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const addedPhotosFor = (item) => (state.addedPhotos || []).filter((row) => owns(item, row)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const allPhotoCount = (item) => (item.photoBase?.photoRefs?.length || 0) + addedPhotosFor(item).length;
    const profileForm = (item) => {
      const expected = `profile_${genderOf(item)}`;
      return item.forms.find((form) => form.form_type === expected && ["submitted", "in_progress"].includes(form.status)) ||
        item.forms.find((form) => form.form_type === expected) || null;
    };
    const payloadForForm = (form) => form ? (form.status === "submitted" ? form.submitted_payload || {} : form.draft_payload || {}) : {};
    const firstDefined = (payload, keys) => {
      for (const key of keys) if (Object.prototype.hasOwnProperty.call(payload || {}, key)) return { key, value: payload[key] };
      return { key: keys[0], value: null };
    };
    const sourceFor = (item, field) => {
      if (field.stage === "secondary") {
        const form = profileForm(item);
        const found = firstDefined(payloadForForm(form), [field.key, ...(field.aliases || [])]);
        return { form, subject: form ? { type: form.subject_type, id: String(form.subject_id) } : item.canonical, key: field.key, original: found.value };
      }
      const base = item.bases.find((entry) => entry.subject.type === item.canonical.type && String(entry.subject.id) === String(item.canonical.id)) || item.bases[0];
      const found = firstDefined(base?.profile || {}, [field.key, ...(field.aliases || [])]);
      return { form: null, subject: base?.subject || item.canonical, key: field.key, original: found.value };
    };
    const correctionFor = (item, field) => {
      const source = sourceFor(item, field);
      return correctionRows(item).find((row) => row.field_group === field.group && row.field_key === source.key &&
        row.subject_type === source.subject.type && String(row.subject_id) === String(source.subject.id) &&
        String(row.form_id || "") === String(source.form?.id || "")) || null;
    };
    const currentFor = (item, field) => field.kind === "photos" ? (allPhotoCount(item) ? "attached" : null) : correctionFor(item, field)?.corrected_value ?? sourceFor(item, field).original;
    const filled = (value) => Array.isArray(value) ? value.length > 0 : value === true || value === false || (value !== null && value !== undefined && String(value).trim() !== "");
    const secondaryGetter = (item) => (key) => {
      const all = registry.secondary[genderOf(item)];
      const field = all.find((entry) => entry.key === key || (entry.aliases || []).includes(key));
      return field ? currentFor(item, field) : null;
    };
    const activeCustomerFields = (item) => {
      const fields = [...registry.primary];
      if (profileForm(item)) fields.push(...registry.secondary[genderOf(item)]);
      const get = secondaryGetter(item);
      return fields.filter((field) => !field.when || field.when({ get }));
    };
    const overallCustomerFields = (item) => {
      const fields = [...registry.primary, ...registry.secondary[genderOf(item)]];
      const get = secondaryGetter(item);
      return fields.filter((field) => !field.when || field.when({ get }));
    };
    const latestValues = (rows, item) => latest(rows.filter((row) => owns(item, row)))?.values || {};
    const healthFollowupRequired = (item) => String(secondaryGetter(item)("healthFlag") || "") === "있음";
    const consultationStarted = (item) => item.consultationStatus !== "before" || state.phoneConsultations.some((row) => owns(item, row));
    const internalStarted = (item) => Boolean(item.reviewed || item.member || state.internalEvaluations.some((row) => owns(item, row)));
    const completion = (item, scope = "current") => {
      const allManagement = scope === "overall";
      const rows = (allManagement ? overallCustomerFields(item) : activeCustomerFields(item)).map((field) => ({ id: field.id, label: field.label, stage: field.stage, required: Boolean(field.required), value: currentFor(item, field) }));
      const phoneValues = latestValues(state.phoneConsultations, item);
      if (allManagement || consultationStarted(item)) registry.phone[genderOf(item)].filter((field) => !field.conditionalHealth || healthFollowupRequired(item) || filled(phoneValues[field.key])).forEach((field) => rows.push({ id: `phone-${field.key}`, label: field.label, stage: "phone", required: Boolean(field.required), value: phoneValues[field.key] }));
      const internalValues = latestValues(state.internalEvaluations, item);
      if (allManagement || internalStarted(item)) registry.internal[genderOf(item)].forEach((field) => rows.push({ id: `internal-${field.key}`, label: field.label, stage: "internal", required: Boolean(field.required), value: internalValues[field.key] }));
      if (matchingCases(item).length) {
        const feedback = latest(state.matchingFeedback.filter((row) => matchingCases(item).some((matchingCase) => matchingCase.id === row.matching_case_id)));
        [["meeting_at", "만남 일시"], ["reunion_intent", "다시 만날 의향"], ["positive_points", "좋았던 점"], ["negative_points", "아쉬웠던 점·거절 이유"], ["next_match_adjustment", "다음 소개 조정사항"], ["admin_note", "운영자 메모"]].forEach(([key, label]) => rows.push({ id: `feedback-${key}`, label, stage: "feedback", required: true, value: feedback?.[key] }));
      }
      const done = rows.filter((row) => filled(row.value)).length;
      return { rows, done, total: rows.length, missing: rows.length - done, percent: rows.length ? Math.round(done / rows.length * 100) : 0 };
    };

    const completionMarkup = (item) => {
      const count = completion(item, "overall");
      return `<section class="crm-completion" data-crm-completion><div class="crm-completion-top"><div><h3>입력 현황</h3><p class="desc">전체 상담 관리 항목 기준</p></div><strong>${count.percent}%</strong></div><div class="crm-progress" role="progressbar" aria-label="입력 완성도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${count.percent}"><i style="width:${count.percent}%"></i></div><div class="crm-completion-meta"><span>${count.done} / ${count.total} 입력</span><span>${count.missing ? `미입력 ${count.missing}개` : "입력 완료"}</span></div><button type="button" class="crm-toggle ${missingOnly ? "active" : ""}" data-missing-toggle>${missingOnly ? "전체 보기" : "미입력만 보기"}</button></section>`;
    };
    const valueForDisplay = (value, key = "") => valueLabel(value, key);
    const normalizedControlValue = (node) => {
      if (node.dataset.valueType === "boolean") return node.value === "true";
      return node.value;
    };
    const optionValue = (value) => typeof value === "boolean" ? String(value) : String(value ?? "");
    const controlMarkup = (field, value) => {
      const current = optionValue(value);
      if (field.control === "chips" && (field.options || []).length >= 3) return `<select data-edit-value><option value="">선택</option>${(field.options || []).map((option) => `<option value="${esc(optionValue(option))}" ${optionValue(option) === current ? "selected" : ""}>${esc(valueForDisplay(option, field.key))}</option>`).join("")}</select>`;
      if (field.control === "chips") return `<div class="crm-option-row" data-option-group data-value="${esc(current)}" data-value-type="${typeof field.options?.[0] === "boolean" ? "boolean" : "string"}">${(field.options || []).map((option) => `<button type="button" class="crm-option ${optionValue(option) === current ? "selected" : ""}" data-option-value="${esc(optionValue(option))}"><span>${esc(valueForDisplay(option, field.key))}</span><i class="crm-chip-mark"></i></button>`).join("")}</div>`;
      if (field.control === "select") return `<select data-edit-value><option value="">선택</option>${(field.options || []).map((option) => `<option value="${esc(optionValue(option))}" ${optionValue(option) === current ? "selected" : ""}>${esc(valueForDisplay(option, field.key))}</option>`).join("")}</select>`;
      if (field.control === "textarea") return `<textarea data-edit-value maxlength="4000" placeholder="${esc(field.placeholder || "")}">${esc(Array.isArray(value) ? value.join(", ") : value ?? "")}</textarea>`;
      return `<input data-edit-value type="${field.control === "date" ? "date" : field.control === "number" ? "number" : "text"}" value="${esc(value ?? "")}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.max !== undefined ? `max="${field.max}"` : ""} placeholder="${esc(field.placeholder || "")}">`;
    };
    const fieldCard = (item, field) => {
      const source = sourceFor(item, field);
      const correction = correctionFor(item, field);
      const current = correction?.corrected_value ?? source.original;
      if (field.kind === "photos") {
        const photoCount = allPhotoCount(item);
        const originalCount = item.photoBase?.photoRefs?.length || 0;
        const added = addedPhotosFor(item);
        if (missingOnly && photoCount) return "";
        return `<article class="crm-field crm-photo-field ${photoCount ? "" : "missing"}" data-photo-field><div class="crm-field-head"><label>첨부 사진 <small class="crm-required">필수</small></label><span class="crm-source">사진 관리</span></div><div class="crm-photo-card"><div class="crm-photo-collection">${originalCount ? photoMarkup(item) : ""}${added.map((photo, index) => `<button type="button" class="crm-added-photo" data-added-photo="${esc(photo.id)}" aria-label="추가 사진 ${index + 1} 보기">불러오는 중</button>`).join("")}${!photoCount ? '<div class="crm-photo-empty">등록된 사진이 없습니다.</div>' : ""}</div></div><div class="crm-photo-actions"><input type="file" data-add-photo-input accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="secondary" data-add-photo>사진 추가</button><span>${photoCount ? `총 ${photoCount}장 · 눌러서 크게 보기` : "JPG · PNG · WEBP / 8MB 이하"}</span></div></article>`;
      }
      if (missingOnly && filled(current)) return "";
      return `<article class="crm-field ${filled(current) ? "" : "missing"}" data-direct-field="${esc(field.id)}"><div class="crm-field-head"><label>${esc(field.label)} <small class="crm-required">${field.required ? "필수" : "선택"}</small></label><span class="crm-source">${esc(field.sourceLabel)}</span></div><div class="crm-original">신청 내용 · ${esc(valueForDisplay(source.original, source.key))}</div><div class="crm-current">전화 상담 확인 · ${esc(valueForDisplay(current, source.key))}</div>${field.locked ? '<div class="crm-readonly">기본 정보는 수정할 수 없습니다.</div>' : `<div class="crm-control" data-direct-autosave>${controlMarkup(field, current)}</div>`}</article>`;
    };
    const customerSections = (item) => {
      const all = activeCustomerFields(item);
      const groups = new Map();
      all.forEach((field) => {
        if (!groups.has(`${field.stage}:${field.category}`)) groups.set(`${field.stage}:${field.category}`, []);
        groups.get(`${field.stage}:${field.category}`).push(field);
      });
      return [...groups.entries()].map(([groupKey, fields]) => {
        const [stage, category] = groupKey.split(":");
        const cards = fields.map((field) => fieldCard(item, field)).join("");
        const done = fields.filter((field) => filled(currentFor(item, field))).length, missing = fields.length - done;
        if (!cards && missingOnly) return "";
        return `<section class="crm-category ${stage === "primary" ? "crm-first-stage" : ""}" data-field-category="${esc(category)}"><div class="crm-category-head"><div><h3>${esc(category)} <em class="${missing ? "crm-miss-count" : "crm-ok-count"}">${done}/${fields.length}${missing ? ` · 미입력 ${missing}` : " · 완료"}</em></h3><p class="desc">${stage === "primary" ? "처음 신청 때 작성한 기본 정보" : "2차 신청에서 작성한 정보"}</p></div><small>${stage === "primary" ? "1차 신청" : "2차 신청"}</small></div><div class="crm-field-grid">${cards || '<p class="desc">현재 조건에 해당하는 미입력 항목이 없습니다.</p>'}</div></section>`;
      }).join("");
    };

    const revisionControl = (field, value, prefix) => {
      if (field.control === "chips" && field.options.length >= 3) return `<select data-revision-select data-field="${esc(field.key)}"><option value="">선택</option>${field.options.map((option) => `<option value="${esc(optionValue(option))}" ${optionValue(option) === optionValue(value) ? "selected" : ""}>${esc(option)}</option>`).join("")}</select>`;
      if (field.control === "chips") return `<div class="crm-option-row" data-revision-options data-value="${esc(optionValue(value))}" data-field="${esc(field.key)}">${field.options.map((option) => `<button type="button" class="crm-option ${optionValue(option) === optionValue(value) ? "selected" : ""}" data-option-value="${esc(optionValue(option))}"><span>${esc(option)}</span><i class="crm-chip-mark"></i></button>`).join("")}</div>`;
      return `<textarea data-${prefix}-field="${esc(field.key)}" maxlength="4000">${esc(Array.isArray(value) ? value.join(", ") : value ?? "")}</textarea>`;
    };
    const priorRevisionMarkup = (rows, item, labelMap) => {
      const revisions = rows.filter((row) => owns(item, row)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return `<details class="details"><summary>이전 상담 기록 ${revisions.length}건</summary><div class="panel-body history">${revisions.map((row) => `<article><b>${esc(date(row.created_at))} · ${esc(row.actor_email || "운영자")}</b><p>${Object.entries(row.values || {}).map(([key, value]) => `${labelMap[key] || secondaryFieldLabel(key)}: ${valueForDisplay(value, key)}`).join("\n")}</p></article>`).join("") || '<p class="desc">이전 상담 기록이 없습니다.</p>'}</div></details>`;
    };
    const phoneSection = (item) => {
      const fields = registry.phone[genderOf(item)].filter((field) => !field.conditionalHealth || healthFollowupRequired(item) || filled(latestValues(state.phoneConsultations, item)[field.key]));
      const values = latestValues(state.phoneConsultations, item);
      const labels = Object.fromEntries(registry.phone[genderOf(item)].map((field) => [field.key, field.label]));
      const grouped = new Map();
      fields.forEach((field) => { const category = field.category || "사실 확인"; if (!grouped.has(category)) grouped.set(category, []); grouped.get(category).push(field); });
      const input = (field) => `<div class="crm-revision-field ${field.control === "textarea" || field.control === "tags" ? "wide" : ""}"><label>${esc(field.label)}</label>${field.control === "tags" ? `<input data-phone-field="${esc(field.key)}" value="${esc(Array.isArray(values[field.key]) ? values[field.key].join(", ") : values[field.key] || "")}" placeholder="쉼표로 구분 · 최대 ${field.max}개">` : revisionControl(field, values[field.key], "phone")}</div>`;
      return `<section class="crm-category" data-crm-phone><div class="crm-category-head"><div><h3>전화상담 확인 항목</h3><p class="desc">${genderOf(item) === "female" ? "여성 고객 전화상담 확인 항목" : "남성 고객 사실 확인 항목"}</p></div><small>상담 기록</small></div>${!consultationStarted(item) ? '<div class="crm-stage-note">아직 전화상담 전입니다. 처음 저장한 내용부터 상담 기록에 반영됩니다.</div>' : ""}<form id="phone-consultation-form"><div class="crm-phone-groups">${[...grouped.entries()].map(([category, group]) => `<section class="crm-phone-group"><h4>${esc(category)}</h4><div class="crm-revision-form">${group.map(input).join("")}</div></section>`).join("")}</div><button class="action" style="margin-top:11px">전화상담 저장</button></form>${priorRevisionMarkup(state.phoneConsultations, item, labels)}</section>`;
    };
    const internalSection = (item) => {
      const fields = registry.internal[genderOf(item)], values = latestValues(state.internalEvaluations, item);
      const labels = Object.fromEntries(fields.map((field) => [field.key, field.label]));
      return `<section class="crm-category" data-crm-internal><div class="crm-category-head"><div><h3>내부 검토</h3><p class="desc">상담 내용을 바탕으로 운영팀에서 확인하는 항목입니다.</p></div><small>운영팀 확인</small></div>${!internalStarted(item) ? '<div class="crm-stage-note">아직 내부 검토 전이므로 완성도에는 포함되지 않습니다.</div>' : ""}<form id="internal-evaluation-form"><div class="crm-revision-form">${fields.map((field) => `<div class="crm-revision-field ${field.control === "textarea" ? "wide" : ""}"><label>${esc(field.label)}</label>${revisionControl(field, values[field.key], "internal")}</div>`).join("")}</div><button class="action" style="margin-top:11px">내부 검토 저장</button></form>${priorRevisionMarkup(state.internalEvaluations, item, labels)}</section>`;
    };
    const subjectOption = (type, id, label) => `<option value="${esc(`${type}:${id}`)}">${esc(label)}</option>`;
    const feedbackSection = (item) => {
      const cases = matchingCases(item);
      if (!cases.length) return `<section class="crm-category" data-crm-feedback><div class="crm-category-head"><div><h3>첫 만남 피드백</h3><p class="desc">실제 만남을 마친 매칭 건별 기록입니다.</p></div><small>매칭 기록</small></div><div class="crm-stage-note">현재 연결된 만남 완료 매칭 건이 없어 입력 항목을 표시하지 않습니다.</div></section>`;
      return `<section class="crm-category" data-crm-feedback><div class="crm-category-head"><div><h3>첫 만남 피드백</h3><p class="desc">피드백 제공자를 선택하면 상대방을 피드백 대상으로 저장합니다.</p></div><small>매칭 기록</small></div><form id="matching-feedback-form"><div class="crm-revision-form"><div class="crm-revision-field wide"><label>피드백 대상 매칭</label><select id="feedback-case">${cases.map((matchingCase) => `<option value="${esc(matchingCase.id)}">매칭 ${esc(matchingCase.id.slice(0, 8))} · ${esc(date(matchingCase.updated_at))}</option>`).join("")}</select></div><div class="crm-revision-field"><label>피드백 제공자</label><select id="feedback-provider"></select></div><div class="crm-revision-field"><label>만남 일시</label><input id="feedback-meeting-at" type="datetime-local" required></div><div class="crm-revision-field wide"><label>다시 만날 의향</label><select id="feedback-intent">${registry.feedback.intents.map(([value, label]) => `<option value="${esc(value)}" ${value === "positive" ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></div><div class="crm-revision-field wide"><label>좋았던 점 · 다중선택</label><div class="crm-tags">${registry.feedback.positivePoints.map((point) => `<label><input type="checkbox" name="feedback-positive" value="${esc(point)}">${esc(point)}</label>`).join("")}</div><textarea id="feedback-positive-note" placeholder="좋았던 점 추가 메모"></textarea></div><div class="crm-revision-field wide"><label>아쉬웠던 점·거절 이유 · 다중선택</label><div class="crm-tags">${registry.feedback.negativePoints.map((point) => `<label><input type="checkbox" name="feedback-negative" value="${esc(point)}">${esc(point)}</label>`).join("")}</div><textarea id="feedback-negative-note" placeholder="아쉬웠던 점 추가 메모"></textarea></div><div class="crm-revision-field wide"><label>다음 소개 조정사항</label><textarea id="feedback-adjustment" maxlength="2000"></textarea></div><div class="crm-revision-field wide"><label>운영자 메모</label><textarea id="feedback-note" maxlength="2000"></textarea></div></div><button class="action" style="margin-top:11px">첫 만남 피드백 저장</button></form></section>`;
    };

    const phoneLabels = Object.fromEntries([...registry.phone.female, ...registry.phone.male].map((field) => [field.key, field.label]));
    const internalLabels = Object.fromEntries([...registry.internal.female, ...registry.internal.male].map((field) => [field.key, field.label]));
    const legacyLabels = { consultationConfidence: "상담 신뢰도", marriageView: "결혼관", relationshipValues: "연애 가치관", pastRelationship: "과거 연애", sensitivePoints: "민감 확인사항", familyReaction: "가족 반응", femaleWeightConfirmed: "여성 몸무게 상담 확인", maleToneManner: "말투·매너", maleRelationshipConsistency: "관계관 일치", femaleAppearanceConsistency: "사진·실물 일치", femaleToneManner: "말투·매너", femaleRelationshipConsistency: "관계관 일치", evaluationMemo: "내부평가 메모" };
    const diffRevisionRows = (rows, item, kind, labelMap) => {
      const sorted = rows.filter((row) => owns(item, row)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const first = {}, events = [];
      sorted.forEach((row, index) => {
        const previous = sorted[index - 1]?.values || {};
        Object.entries(row.values || {}).forEach(([key, value]) => {
          if (!(key in first)) first[key] = value;
          if (JSON.stringify(previous[key] ?? null) === JSON.stringify(value)) return;
          events.push({ filter: kind, title: labelMap[key] || legacyLabels[key] || secondaryFieldLabel(key), source: kind === "phone" ? "전화상담" : "내부평가", original: first[key], previous: previous[key] ?? null, next: value, reason: kind === "phone" ? "전화상담 확인" : "내부평가", requested: false, who: row.actor_email, at: row.created_at });
        });
      });
      return events;
    };
    const historyRows = (item) => {
      const corrections = correctionRows(item).map((row) => ({ filter: row.customer_requested ? "customer" : row.correction_reason === "phone_consultation" ? "phone" : row.correction_reason === "verification" ? "verification" : "all", title: row.field_label, source: row.data_source === "secondary" ? "2차 신청" : row.data_source === "legacy_snapshot" ? "기존 Snapshot" : "1차 신청", original: row.original_value, previous: row.previous_value, next: row.corrected_value, reason: { customer_request: "고객 요청", phone_consultation: "전화상담 확인", verification: "서류·사실 확인", admin_correction: "정보 반영", other: "기타" }[row.correction_reason] || row.correction_reason, reasonNote: row.reason_note, requested: row.customer_requested, who: row.actor_email, at: row.created_at }));
      const phone = diffRevisionRows(state.phoneConsultations, item, "phone", phoneLabels);
      const internal = diffRevisionRows(state.internalEvaluations, item, "internal", internalLabels);
      const feedback = state.matchingFeedback.filter((row) => matchingCases(item).some((matchingCase) => matchingCase.id === row.matching_case_id)).map((row) => ({ filter: "feedback", title: `첫 만남 피드백 · 매칭 ${row.matching_case_id.slice(0, 8)}`, source: "실제 매칭 건", original: null, previous: null, next: { "만남 일시": date(row.meeting_at), "다시 만날 의향": Object.fromEntries(registry.feedback.intents)[row.reunion_intent] || row.reunion_intent, "좋았던 점": row.positive_points, "좋았던 점 메모": row.positive_note, "아쉬웠던 점": row.negative_points, "아쉬웠던 점 메모": row.negative_note, "다음 소개 조정사항": row.next_match_adjustment, "운영자 메모": row.admin_note }, reason: "첫 만남 피드백", requested: false, who: row.actor_email, at: row.created_at }));
      return [...corrections, ...phone, ...internal, ...feedback].sort((a, b) => new Date(b.at) - new Date(a.at));
    };
    const completionRail = (item) => {
      const count = completion(item, "overall");
      const stageOrder = { primary: 0, secondary: 1, phone: 2, internal: 3, feedback: 4 };
      const stageLabel = { primary: "1차 기본정보", secondary: "2차 프로필", phone: "전화 상담", internal: "내부 평가", feedback: "첫 만남" };
      const missing = count.rows.filter((row) => !filled(row.value)).sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)) || (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99)).slice(0, 3);
      return `<section class="crm-rail-completion" data-rail-completion><div class="crm-rail-completion-head"><div><h4>프로필 완성도</h4><p>전체 상담 관리 항목 기준</p></div><strong>${count.percent}%</strong></div><div class="crm-rail-progress" role="progressbar" aria-label="프로필 완성도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${count.percent}"><i style="width:${count.percent}%"></i></div><p>${count.done} / ${count.total} 입력 · 미입력 ${count.missing}개</p>${missing.length ? `<p class="crm-rail-missing-title">우선 보완할 정보</p><ol class="crm-rail-missing">${missing.map((row) => `<li data-rail-missing-item="${esc(row.id)}"><span>${esc(row.label)}</span><small>${esc(stageLabel[row.stage] || "프로필")}</small></li>`).join("")}</ol>` : '<div class="crm-rail-complete">전체 관리 항목이 모두 입력되었습니다.</div>'}</section>`;
    };
    const historyRail = (item) => {
      const rows = historyRows(item).filter((row) => historyFilter === "all" || row.filter === historyFilter);
      const filterOptions = [["all", "전체"], ["customer", "고객 요청"], ["phone", "전화상담 확인"], ["verification", "서류·사실 확인"], ["internal", "내부평가"], ["feedback", "첫 만남 피드백"]];
      return `<aside class="crm-change-rail" aria-label="정보 변경 이력"><header><h3>정보 변경 이력</h3><p>신청 내용과 이후 확인 내용을 비교합니다.</p></header>${completionRail(item)}<div class="crm-history-filters">${filterOptions.map(([value, label]) => `<button type="button" class="${historyFilter === value ? "active" : ""}" data-history-filter="${value}">${label}</button>`).join("")}</div><ul class="crm-history-list">${rows.map((row) => `<li><b>${esc(row.title)}</b><small>${esc(row.source)} · ${esc(row.reason)}${row.reasonNote ? ` · ${esc(row.reasonNote)}` : ""}</small>${row.requested ? '<span class="customer-request-badge">고객 요청 변경</span>' : ""}<div class="crm-history-values"><div><span>신청 내용</span><strong>${esc(valueForDisplay(row.original))}</strong></div><div><span>이전 확인 내용</span><strong>${esc(valueForDisplay(row.previous))}</strong></div><div><span>수정 내용</span><strong>${esc(valueForDisplay(row.next))}</strong></div></div><small>${esc(row.who || "운영자")} · ${esc(date(row.at))}</small></li>`).join("") || '<li><small>선택한 조건의 변경 이력이 없습니다.</small></li>'}</ul></aside>`;
    };
    const operationalSections = (item) => {
      const forms = item.forms.filter((form) => ["submitted", "in_progress"].includes(form.status));
      return `<details class="crm-operations" open><summary>2차 링크·응답·서류·심사</summary><div class="panel-body">${linkPanel(item)}${forms.map((form) => `<article class="form-card"><div class="form-card-head"><div><h4>${esc(formTypeLabel(form.form_type))}</h4><p class="meta">${esc(formStatusLabel(form.status))} · ${esc(date(form.submitted_at || form.draft_saved_at))}</p></div>${form.status === "submitted" ? '<span class="chip green">심사 가능</span>' : '<span class="chip blue">작성 중</span>'}</div><dl class="fields">${formAnswers(form)}</dl>${documentMarkup(form)}${form.status === "submitted" ? reviewMarkup(item, form) : '<div class="notice" style="margin-top:12px">제출 완료 전에는 심사 결과를 저장할 수 없습니다.</div>'}</article>`).join("") || '<p class="desc">작성 중이거나 제출된 2차 신청이 없습니다.</p>'}</div></details><details class="crm-operations"><summary>통메모장</summary><div class="panel-body">${memoPanel(item)}</div></details><details class="crm-operations"><summary>상담일자·다음 연락일</summary><div class="panel-body">${schedulePanel(item)}</div></details>`;
    };

    const render = (item) => {
      state.selected = item;
      const p = item.profile;
      document.querySelector(".layout")?.classList.remove("crm-reference-layout");
      shell("이룸 상담·심사 CRM", "고객 관리", `<section class="page" data-temp-single-applicant-page data-consultation-crm-detail data-crm-registry="${registry.version}"><button class="secondary" id="back">목록으로</button><section class="profile-head" style="margin-top:14px"><div class="profile-photo">${photoMarkup(item)}</div><div class="profile-copy"><div class="crm-client-summary"><p class="kicker">상담·심사 CRM</p><h2>${esc(p.name || "이름 미입력")} <span class="crm-gender-label">${genderOf(item) === "female" ? "여성" : "남성"}</span></h2><div class="chips">${stageChip(item.stage)}<span class="chip">${esc(serviceLabel(item.services))}</span>${item.duplicate ? '<span class="chip amber">같은 연락처의 신청 기록</span>' : ""}</div><div class="crm-client-details"><p>${esc(formatPhone(p.phone))}</p><p>${esc(p.job || "직업 미입력")} · ${esc(p.region || "지역 미입력")}</p></div></div>${completionMarkup(item)}<div class="quick-grid"><div><span>2차 링크</span><b>${item.form?.sent_at ? "발송 완료" : item.form ? "발송 전" : "미발급"}</b></div><div><span>2차 제출</span><b>${item.form?.status === "submitted" ? "완료" : "미완료"}</b></div><div><span>상담 상태</span><b>${esc({ before: "상담전", in_progress: "상담중", completed: "상담완료" }[item.consultationStatus] || "상담전")}</b></div><div><span>다음 업무</span><b>${esc(nextTask(item))}</b></div></div><div class="workspace-controls"><select id="workflow-stage"><option value="first_review">1차 검토 중</option>${item.reviewed?.result === "approved" ? '<option value="approved">승인</option>' : ""}${item.reviewed?.result === "hold" ? '<option value="hold">보류</option>' : ""}${item.reviewed?.result === "rejected" ? '<option value="rejected">미승인</option>' : ""}</select><input id="workflow-owner" placeholder="담당자" value="${esc(item.workflow?.assigned_to || item.legacyConsult.consultantName || "")}"><button class="action" id="workflow-save">처리 단계 저장</button></div></div></section><div class="crm-flow"><main class="crm-main-flow">${customerSections(item)}${phoneSection(item)}${internalSection(item)}${feedbackSection(item)}${operationalSections(item)}</main>${historyRail(item)}</div></section>`);
      const profileCopy = document.querySelector("[data-consultation-crm-detail] .profile-copy"), crmCompletion = document.querySelector("[data-consultation-crm-detail] .crm-main-flow > [data-crm-completion]"), backButton = document.getElementById("back"), workflowControls = document.querySelector("[data-consultation-crm-detail] .workspace-controls");
      if (workflowControls && backButton) workflowControls.prepend(backButton);
      document.getElementById("back").onclick = () => renderApplicants();
      const workflowStage = document.getElementById("workflow-stage");
      if ([...workflowStage.options].some((option) => option.value === item.workflow?.workflow_stage)) workflowStage.value = item.workflow.workflow_stage;
      document.getElementById("workflow-save").onclick = () => saveWorkflow(item);
      bindPhotos(); bindAddedPhotos(item); bindReview(item); bindDocuments(); bindLinks(item); bindMemo(item); bindSchedules(item); bindContinuous(item);
    };

    const refreshSelected = async (item, message) => {
      state.loadedAt = 0;
      await loadAll(true);
      if (message) toast(message);
      render(groupItems().find((candidate) => candidate.key === item.key) || item);
    };
    const bindOptionRows = () => document.querySelectorAll("[data-option-group],[data-revision-options],[data-feedback-intent]").forEach((group) => group.querySelectorAll("[data-option-value]").forEach((button) => button.onclick = () => {
      group.dataset.value = button.dataset.optionValue;
      group.querySelectorAll("[data-option-value]").forEach((option) => option.classList.toggle("selected", option === button));
    }));
    const addedPhotoUrl = async (photo, purpose = "thumbnail") => (await invokeAdmin("admin-added-photo-url", { photo_id: photo.id, purpose })).signed_url;
    const openAddedPhoto = async (photo) => {
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.innerHTML = '<section class="modal-dialog" role="dialog" aria-modal="true"><header class="modal-head"><b>추가 사진</b><button data-close>닫기</button></header><div class="modal-stage">불러오는 중</div></section>';
      document.body.appendChild(modal); document.body.style.overflow = "hidden";
      const close = () => { modal.remove(); document.body.style.overflow = ""; };
      modal.querySelector("[data-close]").onclick = close; modal.onclick = (event) => { if (event.target === modal) close(); };
      try { const img = document.createElement("img"); img.alt = "추가 사진"; img.src = await addedPhotoUrl(photo, "gallery"); modal.querySelector(".modal-stage").replaceChildren(img); } catch { modal.querySelector(".modal-stage").textContent = "사진을 불러오지 못했습니다."; }
    };
    const bindAddedPhotos = (item) => {
      const added = addedPhotosFor(item);
      document.querySelectorAll("[data-added-photo]").forEach((button) => {
        const photo = added.find((row) => row.id === button.dataset.addedPhoto); if (!photo) return;
        button.onclick = () => openAddedPhoto(photo);
        addedPhotoUrl(photo).then((url) => { if (!button.isConnected) return; const img = document.createElement("img"); img.alt = "추가 사진"; img.loading = "lazy"; img.src = url; button.replaceChildren(img); }).catch(() => { if (button.isConnected) button.textContent = "사진을 불러오지 못했습니다."; });
      });
      const input = document.querySelector("[data-add-photo-input]"), trigger = document.querySelector("[data-add-photo]");
      if (!input || !trigger) return;
      trigger.onclick = () => input.click();
      input.onchange = async () => {
        const file = input.files?.[0]; input.value = "";
        if (!file) return;
        if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) { toast("JPG·PNG·WEBP 형식, 8MB 이하 사진만 추가할 수 있습니다.", true); return; }
        trigger.disabled = true; trigger.textContent = "사진 추가 중";
        try {
          const upload = await invokeAdmin("admin-added-photo-upload-url", { subject_type: item.canonical.type, subject_id: item.canonical.id, file_name: file.name, content_type: file.type });
          const response = await fetch(upload.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
          if (!response.ok) throw Object.assign(new Error("PHOTO_UPLOAD_FAILED"), { code: "PHOTO_UPLOAD_FAILED" });
          await invokeAdmin("admin-added-photo-complete", { subject_type: item.canonical.type, subject_id: item.canonical.id, upload_path: upload.upload_path });
          await refreshSelected(item, "사진을 추가했습니다.");
        } catch (error) { toast(`사진 추가 실패 (${error.code || "UPLOAD_FAILED"})`, true); }
        finally { trigger.disabled = false; trigger.textContent = "사진 추가"; }
      };
    };
    const bindContinuous = (item) => {
      document.querySelector("[data-missing-toggle]").onclick = () => { missingOnly = !missingOnly; render(item); };
      bindOptionRows();
      const saveDirectCard = async (card) => {
        if (card.dataset.saving === "true") return;
        const field = activeCustomerFields(item).find((entry) => entry.id === card.dataset.directField), source = sourceFor(item, field);
        const control = card.querySelector("[data-edit-value]"), option = card.querySelector("[data-option-group]");
        let value = option ? normalizedControlValue(option) : control.value;
        if (!filled(value) || JSON.stringify(value) === JSON.stringify(currentFor(item, field))) return;
        card.dataset.saving = "true";
        try {
          await invokeAdmin("admin-field-correction-add", { subject_type: source.subject.type, subject_id: source.subject.id, form_id: source.form?.id || null, field_group: field.group, field_key: source.key, field_label: field.label, corrected_value: value, customer_requested: false, correction_reason: "admin_correction", reason_note: null });
          await refreshSelected(item);
        } catch (error) { card.dataset.saving = ""; toast(`입력값 저장 실패 (${error.code})`, true); }
      };
      document.querySelectorAll("[data-direct-field] [data-edit-value]").forEach((control) => control.onchange = () => saveDirectCard(control.closest("[data-direct-field]")));
      document.querySelectorAll("[data-direct-field] [data-option-group]").forEach((group) => group.querySelectorAll("[data-option-value]").forEach((button) => button.onclick = () => {
        group.dataset.value = button.dataset.optionValue;
        group.querySelectorAll("[data-option-value]").forEach((option) => option.classList.toggle("selected", option === button));
        saveDirectCard(button.closest("[data-direct-field]"));
      }));
      document.getElementById("phone-consultation-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = {};
        document.querySelectorAll("[data-phone-field]").forEach((node) => { const value = text(node.value); if (value) values[node.dataset.phoneField] = node.dataset.phoneField === "femaleAvoidConditions" ? value.split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 3) : value; });
        document.querySelectorAll("[data-crm-phone] [data-revision-options]").forEach((node) => { if (node.dataset.value) values[node.dataset.field] = node.dataset.value; });
        document.querySelectorAll("[data-crm-phone] [data-revision-select]").forEach((node) => { if (node.value) values[node.dataset.field] = node.value; });
        if (!Object.keys(values).length) { toast("저장할 전화상담 기록을 입력해 주세요.", true); return; }
        try { await invokeAdmin("admin-phone-consultation-save", { subject_type: item.canonical.type, subject_id: item.canonical.id, values }); await refreshSelected(item, "전화상담 내용을 저장했습니다."); } catch (error) { toast(`전화상담 저장 실패 (${error.code})`, true); }
      });
      document.getElementById("internal-evaluation-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = {};
        document.querySelectorAll("[data-internal-field]").forEach((node) => { const value = text(node.value); if (value) values[node.dataset.internalField] = value; });
        document.querySelectorAll("[data-crm-internal] [data-revision-options]").forEach((node) => { if (node.dataset.value) values[node.dataset.field] = node.dataset.value; });
        document.querySelectorAll("[data-crm-internal] [data-revision-select]").forEach((node) => { if (node.value) values[node.dataset.field] = node.value; });
        if (!Object.keys(values).length) { toast("저장할 내부평가를 입력해 주세요.", true); return; }
        try { await invokeAdmin("admin-internal-evaluation-save", { subject_type: item.canonical.type, subject_id: item.canonical.id, values }); await refreshSelected(item, "내부 검토 내용을 저장했습니다."); } catch (error) { toast(`내부 검토 저장 실패 (${error.code})`, true); }
      });
      const feedbackCase = document.getElementById("feedback-case"), provider = document.getElementById("feedback-provider");
      const syncProvider = () => {
        if (!feedbackCase || !provider) return;
        const matchingCase = state.matchingCases.find((entry) => entry.id === feedbackCase.value);
        provider.innerHTML = subjectOption(matchingCase.male_subject_type, matchingCase.male_subject_id, "남성 회원") + subjectOption(matchingCase.female_subject_type, matchingCase.female_subject_id, "여성 회원");
      };
      if (feedbackCase) { feedbackCase.onchange = syncProvider; syncProvider(); }
      document.getElementById("matching-feedback-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const matchingCase = state.matchingCases.find((entry) => entry.id === feedbackCase.value), [providerType, ...providerIdParts] = provider.value.split(":"), providerId = providerIdParts.join(":"), providerIsMale = `${providerType}:${providerId}` === `${matchingCase.male_subject_type}:${matchingCase.male_subject_id}`;
        const target = providerIsMale ? { type: matchingCase.female_subject_type, id: String(matchingCase.female_subject_id) } : { type: matchingCase.male_subject_type, id: String(matchingCase.male_subject_id) };
        const meeting = document.getElementById("feedback-meeting-at").value;
        if (!meeting) { toast("만남 일시를 입력해 주세요.", true); return; }
        const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((node) => node.value);
        try {
          await invokeAdmin("admin-matching-feedback-add", { matching_case_id: matchingCase.id, feedback_subject_type: target.type, feedback_subject_id: target.id, provider_subject_type: providerType, provider_subject_id: providerId, meeting_at: new Date(meeting).toISOString(), reunion_intent: document.getElementById("feedback-intent").value, positive_points: checked("feedback-positive"), positive_note: text(document.getElementById("feedback-positive-note").value), negative_points: checked("feedback-negative"), negative_note: text(document.getElementById("feedback-negative-note").value), next_match_adjustment: text(document.getElementById("feedback-adjustment").value), admin_note: text(document.getElementById("feedback-note").value) });
          await refreshSelected(item, "첫 만남 피드백을 저장했습니다.");
        } catch (error) { toast(`첫 만남 피드백 저장 실패 (${error.code})`, true); }
      });
      document.querySelectorAll("[data-history-filter]").forEach((button) => button.onclick = () => { historyFilter = button.dataset.historyFilter; render(item); });
    };

    const originalApplicants = window.renderApplicants;
    window.renderApplicants = function renderApplicantsWithCompletion() {
      originalApplicants();
      const items = groupItems();
      document.querySelectorAll(".app-card[data-subject]").forEach((card) => {
        const item = items.find((candidate) => candidate.key === card.dataset.subject);
        if (!item) return;
        const count = completion(item), block = document.createElement("div");
        block.className = "crm-card-completion";
        block.innerHTML = `<p><span>${count.done} / ${count.total} 입력</span><span>${count.missing ? `미입력 ${count.missing}개` : `${count.percent}%`}</span></p><div class="crm-progress"><i style="width:${count.percent}%"></i></div>`;
        card.querySelector(".next-layer")?.before(block);
      });
    };
    window.renderApplicant = render;
  };
})();
