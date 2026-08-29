(() => {
  const updateConsultantLabels = (root = document) => {
    root.querySelectorAll?.(".app-card .workflow-layer .meta").forEach((node) => {
      const current = String(node.textContent || "").trim();
      if (!current.startsWith("담당 ")) return;
      node.textContent = `상담원 · ${current.slice(3).trim() || "미배정"}`;
    });
  };

  updateConsultantLabels();
  new MutationObserver(() => updateConsultantLabels()).observe(document.documentElement, { childList: true, subtree: true });
})();
