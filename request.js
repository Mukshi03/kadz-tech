/* Request a service: transportation, freight forwarding, customs clearance.
   Anyone can send. Saved through the submit_service_request() database function. */
(async function () {
  const { sb, esc, $, $$, errMsg, ready } = window.KZ;
  const form = $("#req-form"), btn = $("#r-submit"), status = $(".form-status", form);
  const tabs = $$(".tab[data-svc]");
  const sets = $$("fieldset.svc-set[data-svc]");
  const NAMES = { transport: "Transportation", freight: "Freight forwarding", customs: "Customs clearance" };
  const MAX_FILES = 5, MAX_SIZE = 10 * 1024 * 1024;
  let svc = "transport";
  let files = [];

  // Dates can't be in the past
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  $$("[data-min-today]", form).forEach((i) => (i.min = today.toISOString().slice(0, 10)));

  /* ---------- Tabs ---------- */
  function open(name, focus) {
    if (!NAMES[name]) name = "transport";
    svc = name;
    tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.svc === name));
    // On phones the tab row scrolls sideways: keep the chosen tab in view
    const t = tabs.find((x) => x.dataset.svc === name), row = t.parentElement;
    if (t.offsetLeft + t.offsetWidth > row.scrollLeft + row.clientWidth || t.offsetLeft < row.scrollLeft) row.scrollLeft = t.offsetLeft - 16;
    // Hidden sections are also disabled so the browser skips their checks
    sets.forEach((s) => { const on = s.dataset.svc === name; s.hidden = !on; s.disabled = !on || locked; });
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
    document.title = `${NAMES[name]} request | ${window.KZ.C.company}`;
    if (focus) $("input, select", sets.find((s) => s.dataset.svc === name))?.focus();
  }
  tabs.forEach((t) => t.addEventListener("click", () => { if (!locked) open(t.dataset.svc, true); }));
  window.addEventListener("hashchange", () => { if (!locked) open(location.hash.slice(1)); });
  let locked = false;
  open(location.hash.slice(1));

  /* ---------- Customs documents ---------- */
  const fileInput = $("#c-docs"), fileList = $("#c-doc-list");
  function showFiles() {
    fileList.innerHTML = files.map((f, i) => `<li><span>${esc(f.name)}</span>
      <span class="muted">${(f.size / 1048576).toFixed(1)} MB</span>
      <button type="button" class="linkbtn" data-rm="${i}">Remove</button></li>`).join("");
  }
  fileInput.addEventListener("change", () => {
    const bad = [];
    [...fileInput.files].forEach((f) => {
      const okType = /^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type);
      if (!okType) bad.push(`${f.name}: only PDF, JPG, PNG or WEBP`);
      else if (f.size > MAX_SIZE) bad.push(`${f.name}: larger than 10 MB`);
      else if (files.length >= MAX_FILES) bad.push(`${f.name}: max ${MAX_FILES} files`);
      else files.push(f);
    });
    fileInput.value = "";
    showFiles();
    if (bad.length) window.KZ.toast(bad.join(" · "), true);
  });
  fileList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]"); if (!b || locked) return;
    files.splice(+b.dataset.rm, 1); showFiles();
  });

  /* ---------- Prefill for logged-in visitors ---------- */
  const u = await ready;
  if (u.session) {
    const p = u.profile || {};
    const set = (id, v) => { const el = $(id); if (el && !el.value && v) el.value = v; };
    set("#r-name", p.full_name); set("#r-company", p.company); set("#r-phone", p.phone);
    set("#r-email", p.email || u.session.user.email);
  }

  /* ---------- Checks the browser can't do ---------- */
  function checkExtras(scope) {
    let ok = true;
    $$("fieldset.radio-set[data-required]", scope).forEach((fs) => {
      const has = !!$("input:checked", fs);
      $(".err", fs).hidden = has;
      if (!has && ok) { $("input", fs).focus(); ok = false; }
    });
    const groups = {};
    $$("[data-one-of]", scope).forEach((i) => (groups[i.dataset.oneOf] ||= []).push(i));
    Object.entries(groups).forEach(([g, inputs]) => {
      const has = inputs.some((i) => i.value.trim() !== "");
      $(`[data-err="${g}"]`, scope).hidden = has;
      if (!has && ok) { inputs[0].focus(); ok = false; }
    });
    return ok;
  }

  function collect(scope) {
    const out = {};
    $$("input, select, textarea", scope).forEach((el) => {
      if (el.type === "file") return;
      if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
      const key = el.dataset.key || el.name;
      const v = el.value.trim();
      if (!key || v === "") return;
      out[key] = el.type === "number" ? Number(v) : v;
    });
    return out;
  }

  function fail(msg) {
    btn.disabled = false; btn.textContent = "Send request";
    status.className = "form-status notice warn";
    status.textContent = msg;
    status.hidden = false;
  }

  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  }

  /* ---------- Send ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const scope = sets.find((s) => s.dataset.svc === svc), contact = $("#contact-set");
    const okExtras = checkExtras(scope) && checkExtras(contact);
    if (!form.reportValidity() || !okExtras) return;
    if (!sb) return fail("This form isn't connected yet. Add your Supabase details to config.js.");

    btn.disabled = true; btn.textContent = "Sending…";
    status.hidden = true;

    // Upload documents first (customs only)
    const docs = [];
    if (svc === "customs" && files.length) {
      const folder = "uploads/" + newId();
      for (const f of files) {
        btn.textContent = `Uploading ${docs.length + 1} of ${files.length}…`;
        const clean = f.name.replace(/[^\w.\-]+/g, "_").replace(/^_+/, "").slice(-80) || "file";
        const path = `${folder}/${docs.length + 1}-${clean}`;
        const { error } = await sb.storage.from("service-docs").upload(path, f, { contentType: f.type });
        if (error) return fail(`We couldn't upload ${f.name}: ${errMsg(error)}`);
        docs.push(path);
      }
      btn.textContent = "Sending…";
    }

    const c = collect(contact);
    const { data: ref, error } = await sb.rpc("submit_service_request", {
      p: {
        service: svc, name: c.name, company: c.company, email: c.email, phone: c.phone,
        contact_method: c.contact_method, notes: c.notes, details: collect(scope), documents: docs
      }
    });
    if (error) return fail("We couldn't send your request: " + errMsg(error));
    showSent(ref, c.email);
  });

  /* ---------- "Request sent" state ---------- */
  function showSent(ref, email) {
    locked = true;
    $$("fieldset.svc-set", form).forEach((s) => (s.disabled = true));
    tabs.forEach((t) => (t.disabled = true));
    btn.disabled = true; btn.textContent = "Request sent";
    status.className = "form-status notice";
    status.innerHTML = `<strong>Request ${esc(ref)} sent.</strong> We'll email your quotation to <strong>${esc(email)}</strong>.
      ${u.session ? ` You can also follow it in <a href="my-bookings.html">My bookings</a>.` : ""}
      <br><button type="button" class="linkbtn" data-again style="margin-top:.4rem">Send another request</button>`;
    status.hidden = false;
    status.scrollIntoView({ block: "nearest", behavior: "smooth" });
    $("[data-again]", status).addEventListener("click", () => {
      locked = false;
      const keep = collect($("#contact-set"));
      form.reset();
      ["name", "company", "email", "phone"].forEach((k) => { if (keep[k]) form.elements[k].value = keep[k]; });
      files = []; showFiles();
      tabs.forEach((t) => (t.disabled = false));
      $("#contact-set").disabled = false;
      btn.disabled = false; btn.textContent = "Send request";
      status.hidden = true;
      open(svc, true);
    });
  }
})();
