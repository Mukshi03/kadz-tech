/* Partner dashboard: add/edit warehouses, see their bookings */
(async function () {
  const { sb, TYPES, esc, fmt, money, date, $, $$, pill, typeChips, photoUrl, toast, errMsg,
          requireRole, setupTabs, setupProfileForm } = window.KZ;
  const u = await requireRole(["partner", "admin"]);
  if (!u) return;
  const uid = u.session.user.id;
  $("#who").textContent = u.profile?.company || u.profile?.full_name || u.session.user.email;
  setupProfileForm(u.profile);

  let warehouses = [];
  let editing = null;          // warehouse being edited, or null for a new one
  let keptPhotos = [], keptDocs = [], removed = { photos: [], docs: [] };
  let newPhotos = [], newDocs = [];   // files picked but not uploaded yet
  const MAX_FILES = 10, PHOTO_MB = 5, DOC_MB = 10;

  const openTab = setupTabs((name) => { if (name === "bookings") loadBookings(); });
  $("#new-wh").addEventListener("click", () => { resetForm(); openTab("form"); });

  /* ---------------- Warehouses list ---------------- */
  async function loadWarehouses() {
    const { data, error } = await sb.from("warehouses").select("*").eq("owner_id", uid).order("created_at", { ascending: false });
    const box = $("#wh-list");
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    warehouses = data;
    renderStats();
    if (!data.length) {
      box.innerHTML = `<div class="empty"><strong>No warehouses yet</strong>
        <p>Add your first warehouse. Once our team approves it, businesses can find and book it.</p>
        <button class="btn btn-primary" type="button" data-new>Add a warehouse</button></div>`;
      return;
    }
    box.innerHTML = data.map((w) => `
      <article class="row-card${w.status === "rejected" ? " attention" : ""}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            ${w.ref ? `<span class="label">${esc(w.ref)} · shown to clients</span>` : ""}
            <h3>${esc(w.name)}</h3>
            <span class="muted">${esc([w.district, w.city].filter(Boolean).join(", "))}</span>
            <div class="chips" style="display:flex;gap:.35rem;flex-wrap:wrap">${typeChips(w.storage_types)}</div>
          </div>
          ${pill(w.status)}
        </div>
        <dl class="kv">
          <div><dt>Pallets free</dt><dd>${fmt(w.pallets_available)} / ${fmt(w.pallets_total)}</dd></div>
          <div><dt>Minimum rental</dt><dd>${w.min_months} month${w.min_months > 1 ? "s" : ""}</dd></div>
          <div><dt>Price</dt><dd>${Object.keys(w.partner_prices || {}).length ? money(Object.values(w.partner_prices)[0]) + " / pallet / month" : "On request"}</dd></div>
          <div><dt>Area</dt><dd>${w.area_sqm ? fmt(w.area_sqm) + " m²" : "–"}</dd></div>
          <div><dt>Photos</dt><dd>${w.photos.length}</dd></div>
        </dl>
        ${w.status === "pending" ? `<p class="note">Waiting for review by our team.</p>` : ""}
        ${w.status === "rejected" ? `<p class="note">Not approved. We'll email you the details. Edit and save to send it for review again.</p>` : ""}
        <div class="actions">
          <button class="btn btn-sm btn-plain" data-edit="${esc(w.id)}">Edit</button>
          ${w.status === "approved" ? `<a class="btn btn-sm btn-plain" href="warehouse.html?id=${esc(w.id)}">View listing</a>` : ""}
          ${w.status !== "approved" ? `<button class="btn btn-sm btn-danger" data-del="${esc(w.id)}">Delete</button>` : ""}
        </div>
      </article>`).join("");
  }

  function renderStats() {
    const approved = warehouses.filter((w) => w.status === "approved");
    $("#stats").innerHTML = `
      <div class="stat"><span class="label">Warehouses</span><b>${warehouses.length}</b></div>
      <div class="stat"><span class="label">Approved</span><b>${approved.length}</b></div>
      <div class="stat"><span class="label">Pallets free</span><b>${fmt(approved.reduce((s, w) => s + w.pallets_available, 0))}</b></div>
      <div class="stat"><span class="label">Pallets booked</span><b>${fmt(approved.reduce((s, w) => s + (w.pallets_total - w.pallets_available), 0))}</b></div>`;
  }

  $("#wh-list").addEventListener("click", async (e) => {
    if (e.target.closest("[data-new]")) { resetForm(); openTab("form"); return; }
    const ed = e.target.closest("[data-edit]");
    if (ed) { fillForm(warehouses.find((w) => w.id === ed.dataset.edit)); openTab("form"); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      const w = warehouses.find((x) => x.id === del.dataset.del);
      if (!confirm(`Delete "${w.name}"? This can't be undone.`)) return;
      const { error } = await sb.from("warehouses").delete().eq("id", w.id);
      if (error) return toast(errMsg(error), true);
      await removeFiles(w.photos, w.documents);
      toast("Warehouse deleted");
      loadWarehouses();
    }
  });

  /* ---------------- Add / edit form ---------------- */
  const form = $("#wh-form");
  const checks = (id) => $$(`#${id} input:checked`).map((i) => i.value);
  const setChecks = (id, vals) => $$(`#${id} input`).forEach((i) => (i.checked = (vals || []).includes(i.value)));


  function resetForm() {
    editing = null; keptPhotos = []; keptDocs = []; removed = { photos: [], docs: [] };
    newPhotos.forEach((f) => URL.revokeObjectURL(f._url)); newPhotos = []; newDocs = [];
    $("#photos-err").hidden = true; $("#docs-err").hidden = true;
    form.reset();
    $("#form-title").textContent = "Add a warehouse";
    $("#form-tab").textContent = "Add warehouse";
    $("#w-submit").textContent = "Submit for review";
    $("#cancel-edit").hidden = true;
    $(".form-status", form).hidden = true;
    renderFiles();
  }

  function fillForm(w) {
    resetForm();
    editing = w;
    keptPhotos = [...w.photos]; keptDocs = [...w.documents];
    $("#form-title").textContent = "Edit " + w.name;
    $("#form-tab").textContent = "Edit warehouse";
    $("#w-submit").textContent = w.status === "rejected" ? "Save and send for review" : "Save changes";
    $("#cancel-edit").hidden = false;
    $("#w-name").value = w.name; $("#w-city").value = w.city;
    $("#w-district").value = w.district || ""; $("#w-map").value = w.map_url || "";
    $("#w-address").value = w.address || ""; $("#w-desc").value = w.description || "";
    $("#w-area").value = w.area_sqm || ""; $("#w-pallets").value = w.pallets_total;
    $("#w-min").value = w.min_months;
    // One price for the warehouse (stored for each storage type it offers)
    $("#w-price").value = Object.values(w.partner_prices || {})[0] ?? "";
    $("#w-cmethod").value = w.contact_method || ""; $("#w-cname").value = w.contact_name || "";
    $("#w-cinfo").value = w.contact_info || ""; $("#w-ctime").value = w.contact_time || "";
    setChecks("w-types", w.storage_types); setChecks("w-features", w.features); setChecks("w-licenses", w.licenses); setChecks("w-vas", w.vas);
    renderFiles();
  }
  $("#cancel-edit").addEventListener("click", () => { resetForm(); openTab("warehouses"); });

  const fileName = (p) => p.split("/").pop().replace(/^[0-9a-f-]{36}-/, "");
  const sizeText = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  const DOC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>`;

  // Photos: saved ones, then new ones (marked "New"), then the "Add photos" tile
  function renderFiles() {
    const all = [...keptPhotos.map((p, i) => ({ src: photoUrl(p), rm: `k${i}` })),
                 ...newPhotos.map((f, i) => ({ src: f._url, rm: `n${i}`, isNew: true }))];
    $("#photo-list").innerHTML = all.map((p, i) => `
      <div class="pthumb${i === 0 ? " cover" : ""}"><img src="${esc(p.src)}" alt="">
        ${i === 0 ? `<span class="badge">Cover</span>` : p.isNew ? `<span class="badge new">New</span>` : ""}
        <button type="button" data-rm-photo="${p.rm}" aria-label="Remove photo">×</button></div>`).join("") +
      (all.length < MAX_FILES ? `<label class="pthumb add-tile"><input id="w-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add photos</span></label>` : "");
    const docs = [...keptDocs.map((p, i) => ({ name: fileName(p), rm: `k${i}` })),
                  ...newDocs.map((f, i) => ({ name: f.name, size: sizeText(f.size), rm: `n${i}`, isNew: true }))];
    $("#doc-list").innerHTML = docs.map((d) => `
      <li>${DOC_ICON}<span class="dname">${esc(d.name)}</span>${d.size ? `<span class="muted">${d.size}</span>` : ""}
        ${d.isNew ? `<span class="badge new">New</span>` : ""}<button type="button" class="linkbtn" data-rm-doc="${d.rm}">Remove</button></li>`).join("");
    $("#docs-box .add-file").hidden = docs.length >= MAX_FILES;
  }

  // Picking files adds to the list (it doesn't replace earlier picks)
  function addFiles(list, files, mb, types, kind) {
    const total = () => (kind === "photo" ? keptPhotos.length + newPhotos.length : keptDocs.length + newDocs.length);
    const skipped = [];
    [...files].forEach((f) => {
      if (!types.includes(f.type)) skipped.push(`${f.name} (file type)`);
      else if (f.size > mb * 1048576) skipped.push(`${f.name} (over ${mb} MB)`);
      else if (total() >= MAX_FILES) skipped.push(`${f.name} (max ${MAX_FILES})`);
      else { if (kind === "photo") f._url = URL.createObjectURL(f); list.push(f); }
    });
    if (skipped.length) toast("Not added: " + skipped.join(", "), true);
    $(kind === "photo" ? "#photos-err" : "#docs-err").hidden = true;
    renderFiles();
  }
  form.addEventListener("change", (e) => {
    if (e.target.id === "w-photos") { addFiles(newPhotos, e.target.files, PHOTO_MB, ["image/jpeg", "image/png", "image/webp"], "photo"); }
    if (e.target.id === "w-docs") { addFiles(newDocs, e.target.files, DOC_MB, ["application/pdf", "image/jpeg", "image/png"], "doc"); e.target.value = ""; }
  });
  $("#photo-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-photo]"); if (!b) return;
    const k = b.dataset.rmPhoto, i = +k.slice(1);
    if (k[0] === "k") removed.photos.push(...keptPhotos.splice(i, 1));
    else URL.revokeObjectURL(newPhotos.splice(i, 1)[0]._url);
    renderFiles();
  });
  $("#doc-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-doc]"); if (!b) return;
    const k = b.dataset.rmDoc, i = +k.slice(1);
    if (k[0] === "k") removed.docs.push(...keptDocs.splice(i, 1)); else newDocs.splice(i, 1);
    renderFiles();
  });
  renderFiles();

  async function upload(bucket, files) {
    const paths = [];
    for (const f of files) {
      const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
      const path = `${uid}/${crypto.randomUUID()}-${safe}`;
      const { error } = await sb.storage.from(bucket).upload(path, f, { contentType: f.type });
      if (error) throw new Error(`Couldn't upload ${f.name}: ${error.message}`);
      paths.push(path);
    }
    return paths;
  }
  async function removeFiles(photos, docs) {
    if (photos?.length) await sb.storage.from("warehouse-photos").remove(photos);
    if (docs?.length) await sb.storage.from("warehouse-docs").remove(docs);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const types = checks("w-types");
    $("#w-types .err").hidden = types.length > 0;
    if (!types.length || !form.reportValidity()) return;
    // At least one photo and one license document
    const noPhoto = keptPhotos.length + newPhotos.length === 0, noDoc = keptDocs.length + newDocs.length === 0;
    $("#photos-err").hidden = !noPhoto; $("#docs-err").hidden = !noDoc;
    if (noPhoto || noDoc) { $(noPhoto ? "#photos-box" : "#docs-box").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const status = $(".form-status", form), btn = $("#w-submit"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…"; status.hidden = true;
    try {
      const upPhotos = await upload("warehouse-photos", newPhotos);
      const upDocs = await upload("warehouse-docs", newDocs);
      const row = {
        name: $("#w-name").value.trim(), city: $("#w-city").value.trim(),
        district: $("#w-district").value.trim() || null, map_url: $("#w-map").value.trim() || null,
        address: $("#w-address").value.trim() || null, description: $("#w-desc").value.trim() || null,
        area_sqm: $("#w-area").value ? +$("#w-area").value : null,
        pallets_total: +$("#w-pallets").value,
        partner_prices: $("#w-price").value === "" ? {} : Object.fromEntries(types.map((t) => [t, +$("#w-price").value])),
        contact_method: $("#w-cmethod").value || null, contact_name: $("#w-cname").value.trim() || null,
        contact_info: $("#w-cinfo").value.trim() || null, contact_time: $("#w-ctime").value.trim() || null,
        min_months: +$("#w-min").value || 1,
        storage_types: types, features: checks("w-features"), licenses: checks("w-licenses"), vas: checks("w-vas"),
        photos: [...keptPhotos, ...upPhotos], documents: [...keptDocs, ...upDocs]
      };
      const { error } = editing
        ? await sb.from("warehouses").update(row).eq("id", editing.id)
        : await sb.from("warehouses").insert({ ...row, owner_id: uid });
      if (error) { await removeFiles(upPhotos, upDocs); throw error; }
      await removeFiles(removed.photos, removed.docs);
      toast(editing ? "Changes saved" : "Warehouse submitted for review");
      resetForm();
      await loadWarehouses();
      openTab("warehouses");
    } catch (err) {
      status.className = "form-status notice warn";
      status.textContent = errMsg(err);
      status.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });

  /* ---------------- Bookings for my warehouses ---------------- */
  const STATUS_LABEL = { discussing: "price discussion" };
  async function loadBookings() {
    const box = $("#bk-list");
    const res = await sb.rpc("partner_bookings");
    const error = res.error, data = (res.data || []).filter((b) => b.status !== "discussing");
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>Nothing yet</strong><p>When a booking at your warehouse is confirmed, it shows here.</p></div>`; return; }
    box.innerHTML = data.map((b) => `
      <article class="row-card${b.status === "discussing" ? " attention" : ""}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem"><span class="label">${esc(b.ref)}</span><h3>${esc(b.warehouse_name)}</h3></div>
          ${pill(b.status === "discussing" ? "pending" : b.status, STATUS_LABEL[b.status])}
        </div>
        <dl class="kv">
          <div><dt>Storage</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)}</dd></div>
          <div><dt>Pallets</dt><dd>${fmt(b.pallets)}</dd></div>
          <div><dt>Start</dt><dd>${date(b.start_date)}</dd></div>
          <div><dt>Duration</dt><dd>${b.months} month${b.months > 1 ? "s" : ""}</dd></div>
        </dl>
      </article>`).join("");
  }

  resetForm();
  loadWarehouses();
})();
