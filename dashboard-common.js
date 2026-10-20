/* Shared bits for the three dashboards: tabs and the "My details" form */
(function () {
  const { sb, $, $$, toast, errMsg } = window.KZ;

  // Tabs: buttons with data-tab, panels with data-panel
  function setupTabs(onChange) {
    const tabs = $$(".tab[data-tab]");
    function open(name) {
      tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === name));
      $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
      try { history.replaceState(null, "", "#" + name); } catch (e) {}
      onChange && onChange(name);
    }
    tabs.forEach((t) => t.addEventListener("click", () => open(t.dataset.tab)));
    const start = location.hash.slice(1);
    open(tabs.some((t) => t.dataset.tab === start) ? start : tabs[0].dataset.tab);
    return open;
  }

  // "My details" form (name, company, phone)
  function setupProfileForm(profile) {
    const f = $("#profile-form");
    if (!f) return;
    $("#p-name").value = profile.full_name || "";
    $("#p-company").value = profile.company || "";
    $("#p-phone").value = profile.phone || "";
    $("#p-email").value = profile.email || "";
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const { error } = await sb.from("profiles").update({
        full_name: $("#p-name").value.trim(),
        company: $("#p-company").value.trim() || null,
        phone: $("#p-phone").value.trim() || null
      }).eq("id", profile.id);
      error ? toast(errMsg(error), true) : toast("Details saved");
    });
  }

  window.KZ.setupTabs = setupTabs;
  window.KZ.setupProfileForm = setupProfileForm;
})();
