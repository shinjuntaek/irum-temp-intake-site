(() => {
  const install = () => {
    const side = document.querySelector("#admin-navigation");
    if (!side || side.querySelector("[data-support-inbox-link]")) return;
    const label = [...side.querySelectorAll(".menu-label")].find((node) => node.textContent.trim() === "업무");
    const link = document.createElement("a");
    link.className = "menu irum-support-inbox-link";
    link.href = "/admin/support/";
    link.dataset.supportInboxLink = "true";
    link.textContent = "고객센터 문의";
    if (label) label.after(link); else side.querySelector(".side-bottom")?.before(link);
  };
  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  install();
})();
