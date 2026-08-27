(function () {
  "use strict";

  const gradeDefinitions = [
    { key: "s", label: "S급", note: "최상위", width: 28 },
    { key: "a", label: "A급", note: "우선", width: 42 },
    { key: "b", label: "B급", note: "일반", width: 56 },
    { key: "c", label: "C급", note: "관리", width: 70 },
    { key: "d", label: "D급", note: "보류", width: 84 },
  ];

  const gradeLabels = Object.fromEntries([
    ...gradeDefinitions.map((grade) => [grade.key, grade.label]),
    ["unassigned", "배정 대기"],
  ]);

  window.installIrumMemberGradeRuntime = function installIrumMemberGradeRuntime(context) {
    const { state, approvedItems, shell, esc, latest, memberLabels, memberTransitions, text, loadAll, toast, bindOpen, invokeAdmin } = context;
    let activeGrade = "all";

    const hasSubject = (item, row) => item.subjects.some((subject) =>
      subject.type === row.subject_type && String(subject.id) === String(row.subject_id)
    );

    const gradeFor = (item) =>
      latest((state.memberGrades || []).filter((row) => hasSubject(item, row)))?.member_grade || "unassigned";

    const gradeOptions = (selected) =>
      ["s", "a", "b", "c", "d", "unassigned"].map((grade) =>
        `<option value="${grade}" ${grade === selected ? "selected" : ""}>${gradeLabels[grade]}</option>`
      ).join("");

    const render = () => {
      const items = approvedItems();
      const counts = Object.fromEntries([
        ...gradeDefinitions.map((grade) => [grade.key, 0]),
        ["unassigned", 0],
      ]);
      items.forEach((item) => { counts[gradeFor(item)] += 1; });
      const listed = activeGrade === "all" ? items : items.filter((item) => gradeFor(item) === activeGrade);

      shell("승인 회원", "MEMBER GRADE", `<section class="page member-grade-page">
        <header class="page-head member-grade-head">
          <div><p class="kicker">MEMBER GRADE</p><h2 class="page-title">승인 회원 등급 관리</h2><p class="desc">2차 승인이 완료된 회원을 S급부터 D급까지 배정합니다. 고객 정보와 기존 회원 상태는 바꾸지 않습니다.</p></div>
          <span class="member-grade-total">승인 회원 ${items.length}명</span>
        </header>
        <section class="member-grade-board" aria-label="승인 회원 등급 피라미드">
          <div class="member-grade-pyramid">
            ${gradeDefinitions.map((grade) => `<button type="button" class="member-grade-tier tier-${grade.key} ${activeGrade === grade.key ? "active" : ""}" style="--tier-width:${grade.width}%" data-grade-filter="${grade.key}" aria-pressed="${activeGrade === grade.key}"><span>${grade.label}</span><b>${counts[grade.key]}명</b><small>${grade.note}</small></button>`).join("")}
          </div>
          <button type="button" class="member-grade-unassigned ${activeGrade === "unassigned" ? "active" : ""}" data-grade-filter="unassigned" aria-pressed="${activeGrade === "unassigned"}"><span>배정 대기</span><b>${counts.unassigned}명</b><small>등급을 선택해 배정할 수 있습니다.</small></button>
        </section>
        <div class="member-grade-list-head"><div><h3>${esc(activeGrade === "all" ? "전체 승인 회원" : gradeLabels[activeGrade])}</h3><p>${activeGrade === "all" ? "등급 선택 후 회원을 배정하거나 이동할 수 있습니다." : "선택된 등급의 회원입니다."}</p></div><button type="button" class="secondary" data-grade-filter="all">전체 보기</button></div>
        <div class="member-grade-roster">${listed.map((item) => {
          const memberStatus = item.member?.member_status || "approval_pending";
          const nextStatuses = memberTransitions[memberStatus] || [];
          const grade = gradeFor(item);
          return `<article class="member-grade-card" data-member-grade-item="${esc(item.key)}">
            <div class="member-grade-card-top"><div><h3>${esc(item.profile.name || "이름 미입력")}</h3><p>${esc(item.profile.gender === "male" ? "남성" : "여성")} · ${esc(item.profile.job || "직업 미입력")} · ${esc(item.profile.region || "지역 미입력")}</p></div><span class="member-grade-chip grade-${grade}">${esc(gradeLabels[grade])}</span></div>
            <div class="member-grade-actions"><label><span>등급</span><select data-member-grade>${gradeOptions(grade)}</select></label><button type="button" class="action" data-member-grade-save>등급 배정</button><button type="button" class="secondary" data-open="${esc(item.key)}">신청자 보기</button></div>
            <div class="member-grade-status"><span>회원 상태 · ${esc(memberLabels[memberStatus])}</span>${nextStatuses.length ? `<select data-member-status>${nextStatuses.map((status) => `<option value="${status}">${esc(memberLabels[status])}</option>`).join("")}</select><input data-member-reason placeholder="상태 변경 메모 (선택)"><button type="button" class="secondary" data-member-status-save>상태 저장</button>` : ""}</div>
          </article>`;
        }).join("") || '<div class="empty">이 등급에 배정된 승인 회원이 없습니다.</div>'}</div>
      </section>`);

      document.querySelectorAll("[data-grade-filter]").forEach((button) => {
        button.onclick = () => { activeGrade = button.dataset.gradeFilter; render(); };
      });
      document.querySelectorAll("[data-member-grade-save]").forEach((button) => {
        button.onclick = async () => {
          const card = button.closest("[data-member-grade-item]");
          const item = items.find((candidate) => candidate.key === card.dataset.memberGradeItem);
          const memberGrade = card.querySelector("[data-member-grade]").value;
          if (!item) return;
          button.disabled = true;
          try {
            await invokeAdmin("admin-member-grade-set", { subject_type: item.canonical.type, subject_id: item.canonical.id, member_grade: memberGrade });
            state.loadedAt = 0;
            await loadAll(true);
            toast(`${gradeLabels[memberGrade]}으로 배정했습니다.`);
            render();
          } catch (error) {
            toast(`등급을 배정하지 못했습니다. (${error.code || "REQUEST_FAILED"})`, true);
          } finally {
            button.disabled = false;
          }
        };
      });
      document.querySelectorAll("[data-member-status-save]").forEach((button) => {
        button.onclick = async () => {
          const card = button.closest("[data-member-grade-item]");
          const item = items.find((candidate) => candidate.key === card.dataset.memberGradeItem);
          if (!item) return;
          const memberStatus = card.querySelector("[data-member-status]").value;
          const reason = text(card.querySelector("[data-member-reason]").value);
          button.disabled = true;
          try {
            await invokeAdmin("admin-member-set", { subject_type: item.canonical.type, subject_id: item.canonical.id, member_status: memberStatus, reason });
            state.loadedAt = 0;
            await loadAll(true);
            toast("회원 상태를 저장했습니다.");
            render();
          } catch (error) {
            toast(`회원 상태를 저장하지 못했습니다. (${error.code || "REQUEST_FAILED"})`, true);
          } finally {
            button.disabled = false;
          }
        };
      });
      bindOpen();
    };

    window.__irumMemberGradeRender = render;
  };
})();
