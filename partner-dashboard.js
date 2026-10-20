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
            <h3>${esc(w.name)}</h3>
            <span class="muted">${esc([w.district, w.city].filter(Boolean).join(", "))}</span>
            <div class="chips" style="display:flex;gap:.35rem;flex-wrap:wrap">${typeChips(w.storage_types)}</div>
          </div>
          ${pill(w.status)}
        </div>
        <dl class="kv">
          <div><dt>Pallets free</dt><dd>${fmt(w.pallets_available)} / ${fmt(w.pallets_total)}</dd></div>
          <div><dt>Price</dt><dd>${w.price_per_pallet != null ? money(w.price_per_pallet) : "On request"}</dd></div>
          <div><dt>Area</dt><dd>${w.area_sqm ? fmt(w.area_sqm) + " m²" : "–"}</dd></div>
          <div><dt>Photos</dt><dd>${w.photos.length}</dd></div>
        </dl>
        ${w.status === "pending" ? `<p class="note">Waiting for review by our team.</p>` : ""}
        ${w.status === "rejected" ? `<p class="note">Not approved${w.admin_note ? ": " + esc(w.admin_note) : "."} Edit and save to send it for review again.</p>` : ""}
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
    $("#w-price").value = w.price_per_pallet ?? ""; $("#w-min").value = w.min_months;
    setChecks("w-types", w.storage_types); setChecks("w-features", w.features); setChecks("w-licenses", w.licenses);
    renderFiles();
  }
  $("#cancel-edit").addEventListener("click", () => { resetForm(); openTab("warehouses"); });

  function renderFiles() {
    $("#photo-list").innerHTML = keptPhotos.map((p, i) =>
      `<div class="thumb"><img src="${esc(photoUrl(p))}" alt=""><button type="button" data-rm-photo="${i}" aria-label="Remove photo">×</button></div>`).join("");
    $("#doc-list").innerHTML = keptDocs.map((p, i) =>
      `<li><span class="label">File</span> ${esc(p.split("/").pop().replace(/^[0-9a-f-]{36}-/, ""))} <button type="button" class="linkbtn" data-rm-doc="${i}">Remove</button></li>`).join("");
  }
  $("#photo-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-photo]"); if (!b) return;
    removed.photos.push(...keptPhotos.splice(+b.dataset.rmPhoto, 1)); renderFiles();
  });
  $("#doc-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-doc]"); if (!b) return;
    removed.docs.push(...keptDocs.splice(+b.dataset.rmDoc, 1)); renderFiles();
  });

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
    const status = $(".form-status", form), btn = $("#w-submit"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…"; status.hidden = true;
    try {
      const newPhotos = await upload("warehouse-photos", $("#w-photos").files);
      const newDocs = await upload("warehouse-docs", $("#w-docs").files);
      const price = $("#w-price").value;
      const row = {
        name: $("#w-name").value.trim(), city: $("#w-city").value.trim(),
        district: $("#w-district").value.trim() || null, map_url: $("#w-map").value.trim() || null,
        address: $("#w-address").value.trim() || null, description: $("#w-desc").value.trim() || null,
        area_sqm: $("#w-area").value ? +$("#w-area").value : null,
        pallets_total: +$("#w-pallets").value, price_per_pallet: price === "" ? null : +price,
        min_months: +$("#w-min").value || 1,
        storage_types: types, features: checks("w-features"), licenses: checks("w-licenses"),
        photos: [...keptPhotos, ...newPhotos], documents: [...keptDocs, ...newDocs]
      };
      const { error } = editing
        ? await sb.from("warehouses").update(row).eq("id", editing.id)
        : await sb.from("warehouses").insert({ ...row, owner_id: uid });
      if (error) { await removeFiles(newPhotos, newDocs); throw error; }
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
  async function loadBookings() {
    const box = $("#bk-list");
    const { data, error } = await sb.from("bookings")
      .select("*, warehouse:warehouses!inner(id, name, city, owner_id)")
      .eq("warehouse.owner_id", uid)
      .order("created_at", { ascending: false });
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>No bookings yet</strong><p>Bookings for your approved warehouses will show here.</p></div>`; return; }
    box.innerHTML = data.map((b) => `
      <article class="row-card">
        <div class="row-top">
          <div style="display:grid;gap:.3rem"><span class="label">${esc(b.ref)} · ${date(b.created_at)}</span><h3>${esc(b.warehouse.name)}</h3></div>
          ${pill(b.status)}
        </div>
        <dl class="kv">
          <div><dt>Storage</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)}</dd></div>
          <div><dt>Pallets</dt><dd>${fmt(b.pallets)}</dd></div>
          <div><dt>Start</dt><dd>${date(b.start_date)}</dd></div>
          <div><dt>Duration</dt><dd>${b.months} month${b.months > 1 ? "s" : ""}</dd></div>
        </dl>
        ${b.notes ? `<p class="note">${esc(b.notes)}</p>` : ""}
      </article>`).join("");
  }

  resetForm();
  loadWarehouses();
})();
