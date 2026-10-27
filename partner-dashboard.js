/* Partner dashboard: add/edit warehouses, see their bookings */
(async function () {
  const { sb, TYPES, esc, fmt, money, date, $, $$, pill, typeChips, photoUrl, toast, errMsg,
          requireRole, setupTabs, setupProfileForm } = window.KZ;
  const u = await requireRole(["partner", "admin"]);
  if (!u) return;
  // Employees work on their company's account: everything belongs to the partner who invited them
  const uid = u.profile?.partner_id || u.session.user.id;
  const isOwner = !u.profile?.partner_id;
  if (!isOwner) $("#team-tab").hidden = true;
  $("#who").textContent = u.profile?.company || u.profile?.full_name || u.session.user.email;
  setupProfileForm(u.profile);
  $("#pd-logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "login.html";
  });

  let warehouses = [];
  let editing = null;          // warehouse being edited, or null for a new one
  let keptPhotos = [], keptDocs = [], removed = { photos: [], docs: [] };
  let newPhotos = [], newDocs = [];   // files picked but not uploaded yet
  const MAX_FILES = 10, PHOTO_MB = 5, DOC_MB = 10;

  const openTab = setupTabs((name) => {
    if (name === "bookings") loadBookings();
    if (name === "moves") loadMoves();
    if (name === "bids") loadBids();
    if (name === "team") loadTeam();
  });
  $("#new-wh").addEventListener("click", () => { resetForm(); openTab("form"); });

  /* ---------------- Warehouses list ---------------- */
  async function loadWarehouses() {
    const { data, error } = await sb.from("warehouses").select("*").eq("owner_id", uid).order("created_at", { ascending: false });
    const box = $("#wh-list");
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    warehouses = data;
    renderStats();
    if (!data.length) {
      renderOverview(); $("#wh-count").textContent = "";
      box.innerHTML = `<div class="empty"><strong>No warehouses yet</strong>
        <p>Add your first warehouse. Once our team approves it, businesses can find and book it.</p>
        <button class="btn btn-primary" type="button" data-new>Add a warehouse</button></div>`;
      return;
    }
    renderList();
    renderOverview();
    if (bidRows.length) renderBids();   // the bid form lists your approved warehouses
  }

  /* Free / total for each storage type, or one shared count for older listings */
  const rowsFor = (w) => {
    const c = window.KZ.typeCounts(w);
    return c.length ? c : [{ type: "", name: "All types", free: w.pallets_available, total: w.pallets_total }];
  };
  const bar = (r) => {
    const used = r.total ? Math.round(((r.total - r.free) / r.total) * 100) : 0;
    return `<div class="pd-bar-row"><span>${r.type ? `<i class="chip ${esc(r.type)}">${esc(r.name)}</i>` : `<i class="chip">${esc(r.name)}</i>`}</span>
      <div class="pd-meter" title="${used}% booked"><i style="width:${used}%"></i></div>
      <span class="pd-num"><b class="num">${fmt(r.free)}</b> / ${fmt(r.total)} free</span></div>`;
  };
  const needsTypes = (w) => w.storage_types.length > 1 && !Object.keys(w.pallets_by_type || {}).length;
  const STATUS_TXT = { pending: "Waiting for review by our team.", rejected: "Not approved. Check the email we sent, then edit and save to send it again." };

  let wView = "cards";
  try { wView = localStorage.getItem("kz-pd-view") || "cards"; } catch (e) {}
  $$("[data-wview]").forEach((b) => b.addEventListener("click", () => {
    wView = b.dataset.wview;
    try { localStorage.setItem("kz-pd-view", wView); } catch (e) {}
    renderList();
  }));

  function renderList() {
    const box = $("#wh-list");
    $$("[data-wview]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.wview === wView)));
    $("#wh-count").textContent = `${warehouses.length} warehouse${warehouses.length === 1 ? "" : "s"}`;
    if (!warehouses.length) return;
    const actions = (w) => `
      <button class="btn btn-sm btn-plain" data-edit="${esc(w.id)}">Edit</button>
      ${w.status === "approved" ? `<a class="btn btn-sm btn-plain" href="warehouse.html?id=${esc(w.id)}">View listing</a>` : ""}
      ${w.status !== "approved" ? `<button class="btn btn-sm btn-danger" data-del="${esc(w.id)}">Delete</button>` : ""}`;
    if (wView === "table") {
      box.innerHTML = `<div class="wh-table-wrap"><table class="wh-table pd-table"><thead><tr>
        <th>Warehouse</th><th>Status</th><th>Free / total</th><th class="r">Min. rental</th><th></th></tr></thead><tbody>
        ${warehouses.map((w) => `<tr>
          <td><b class="pd-name">${esc(w.name)}</b><small>${esc(w.ref || "")} · ${esc(w.city)}</small></td>
          <td>${pill(w.status)}</td>
          <td>${rowsFor(w).map((r) => `<div>${esc(r.type ? r.name : "All")} <b class="num">${fmt(r.free)}</b> / ${fmt(r.total)}</div>`).join("")}</td>
          <td class="r">${w.min_months} mo</td>
          <td class="r pd-acts">${actions(w)}</td></tr>`).join("")}</tbody></table></div>`;
      return;
    }
    box.innerHTML = warehouses.map((w) => `
      <article class="pd-wh${w.status === "rejected" || needsTypes(w) ? " attention" : ""}">
        <div class="pd-thumb">${w.photos?.[0] ? `<img src="${esc(photoUrl(w.photos[0]))}" alt="" loading="lazy">` : ""}<span>${w.photos.length} photo${w.photos.length === 1 ? "" : "s"}</span></div>
        <div class="pd-wh-body">
          <div class="pd-wh-top">
            <div style="min-width:0"><span class="label">${esc(w.ref || "")}${w.ref && w.status === "approved" ? " · shown to clients" : ""}</span>
              <h3>${esc(w.name)}</h3><span class="muted">${esc([w.district, w.city].filter(Boolean).join(", "))}</span></div>
            ${pill(w.status)}
          </div>
          <div class="pd-bars">${rowsFor(w).map(bar).join("")}</div>
          <div class="pd-facts"><span>Min. ${w.min_months} month${w.min_months > 1 ? "s" : ""}</span>
            <span>${Object.keys(w.partner_prices || {}).length ? money(Object.values(w.partner_prices)[0]) + " / pallet / month" : "Price on request"}</span>
            <span>${w.area_sqm ? fmt(w.area_sqm) + " m²" : "Area not set"}</span></div>
          ${STATUS_TXT[w.status] ? `<p class="note">${STATUS_TXT[w.status]}</p>` : ""}
          ${needsTypes(w) ? `<p class="note">Add pallet positions for each storage type so clients can book the right space.</p>` : ""}
          <div class="pd-wh-acts">${actions(w)}</div>
        </div>
      </article>`).join("");
  }

  /* ---------------- Overview ---------------- */
  const I = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  function renderStats() {
    const approved = warehouses.filter((w) => w.status === "approved");
    const total = approved.reduce((s, w) => s + w.pallets_total, 0);
    const free = approved.reduce((s, w) => s + w.pallets_available, 0);
    const booked = total - free, occ = total ? Math.round((booked / total) * 100) : 0;
    $("#n-wh").textContent = warehouses.length || "";
    $("#stats").innerHTML = `
      <div class="pd-stat">${I('<path d="M3 10 12 4l9 6v10H3z"/><path d="M7 20v-6h10v6"/>')}<span class="label">Warehouses</span><b>${warehouses.length}</b><small>${approved.length} approved</small></div>
      <div class="pd-stat">${I('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>')}<span class="label">Pallets free</span><b>${fmt(free)}</b><small>of ${fmt(total)} positions</small></div>
      <div class="pd-stat">${I('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>')}<span class="label">Pallets booked</span><b>${fmt(booked)}</b><small>in confirmed bookings</small></div>
      <div class="pd-stat">${I('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>')}<span class="label">Occupancy</span><b>${occ}%</b><div class="pd-meter"><i style="width:${occ}%"></i></div></div>`;
  }
  function renderOverview() {
    const items = [];
    warehouses.forEach((w) => {
      if (w.status === "rejected") items.push(["warn", `<b>${esc(w.name)}</b> was not approved. Make the changes and save it again.`, w.id, "Edit"]);
      if (needsTypes(w)) items.push(["warn", `<b>${esc(w.name)}</b> needs pallet positions for each storage type.`, w.id, "Add numbers"]);
      if (!w.photos.length) items.push(["warn", `<b>${esc(w.name)}</b> has no photos.`, w.id, "Add photos"]);
      if (w.status === "pending") items.push(["info", `<b>${esc(w.name)}</b> is waiting for review by our team.`, null]);
    });
    $("#attn").innerHTML = items.length
      ? items.map(([k, t, id, btn]) => `<li class="${k}"><span>${t}</span>${id ? `<button type="button" class="btn btn-sm" data-edit="${esc(id)}">${btn}</button>` : ""}</li>`).join("")
      : `<li class="ok"><span>All good. Nothing needs your attention.</span></li>`;
    renderAttnMoves(mvTodo);
  }
  $("#attn").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) { fillForm(warehouses.find((w) => w.id === ed.dataset.edit)); openTab("form"); }
  });
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.go)));
  $("#hello").textContent = `Welcome back, ${u.profile?.company || u.profile?.full_name || "partner"}`;

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
  /* Pallet positions per storage type: one box for each ticked type */
  function showTypePallets() {
    const on = $$("#w-types .checks input:checked").map((i) => i.value);
    $("#w-type-pallets").hidden = !on.length;
    $$("#w-type-pallets .tp").forEach((l) => {
      const show = on.includes(l.dataset.type), inp = $("input", l);
      l.hidden = !show; inp.required = show; inp.disabled = !show;
    });
    $("#w-pallets-total").textContent = $$("#w-type-pallets .tp:not([hidden]) input").reduce((s, i) => s + (+i.value || 0), 0).toLocaleString("en-US");
  }
  $("#w-types").addEventListener("change", showTypePallets);
  $("#w-type-pallets").addEventListener("input", showTypePallets);
  showTypePallets();

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
    showTypePallets();
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
    $("#w-area").value = w.area_sqm || "";
    // Pallet positions per type (older single-type listings: the total belongs to that one type)
    const byType = Object.keys(w.pallets_by_type || {}).length ? w.pallets_by_type
      : (w.storage_types.length === 1 ? { [w.storage_types[0]]: w.pallets_total } : {});
    $$("#w-type-pallets .tp").forEach((l) => ($("input", l).value = byType[l.dataset.type] ?? ""));
    $("#w-min").value = w.min_months;
    // One price for the warehouse (stored for each storage type it offers)
    $("#w-price").value = Object.values(w.partner_prices || {})[0] ?? "";
    $("#w-cmethod").value = w.contact_method || ""; $("#w-cname").value = w.contact_name || "";
    $("#w-cinfo").value = w.contact_info || ""; $("#w-ctime").value = w.contact_time || "";
    setChecks("w-types", w.storage_types); setChecks("w-features", w.features); setChecks("w-licenses", w.licenses); setChecks("w-vas", w.vas);
    showTypePallets();
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
        pallets_by_type: Object.fromEntries(types.map((t) => [t, +$(`#w-type-pallets [data-type="${t}"] input`).value])),
        pallets_total: types.reduce((s, t) => s + (+$(`#w-type-pallets [data-type="${t}"] input`).value || 0), 0),
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
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; $("#recent").innerHTML = ""; return; }
    $("#n-bk").textContent = data.length || "";
    // Overview: the latest 5
    $("#recent").innerHTML = data.length ? `<ul class="pd-recent">${data.slice(0, 5).map((b) => `
      <li><span><b>${esc(b.ref)}</b> · ${esc(b.warehouse_name)}<small>${esc(TYPES[b.storage_type]?.name || b.storage_type)} · ${fmt(b.pallets)} pallets · from ${date(b.start_date)}</small></span>${pill(b.status)}</li>`).join("")}</ul>`
      : `<p class="muted">No bookings yet. Confirmed bookings at your warehouses show here.</p>`;
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
  loadBookings();

  /* ---------------- Inbound / outbound ---------------- */
  let pmFilter = "sent";
  $$("[data-pmf]").forEach((b) => b.addEventListener("click", () => {
    pmFilter = b.dataset.pmf;
    $$("[data-pmf]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    loadMoves();
  }));
  let moves = [], mvTodo = 0;
  async function loadMoves() {
    const box = $("#mv-list");
    // Only requests KADZ has sent on. Client names stay private: the booking reference is enough.
    let q = sb.from("stock_movements").select("*, warehouse:warehouses!stock_movements_warehouse_id_fkey(name, ref)")
      .in("status", ["sent", "completed"]).order("expected_date", { ascending: true });
    const { data, error } = await q;
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    moves = data;
    const todo = mvTodo = data.filter((m) => m.status === "sent").length;
    $("#n-mv").textContent = todo || "";
    renderAttnMoves(todo);
    const rows = pmFilter ? data.filter((m) => m.status === pmFilter) : data;
    if (!rows.length) { box.innerHTML = `<div class="empty"><strong>${pmFilter === "sent" ? "Nothing to do" : "Nothing here"}</strong><p>${pmFilter === "sent" ? "New inbound and outbound requests from KADZ show here." : "No requests with this status."}</p></div>`; return; }
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = rows.map((m) => {
      const inb = m.direction === "inbound";
      return window.KZ.moveCard(m, {
        title: `${fmt(m.pallets)} pallets · ${esc(TYPES[m.storage_type]?.name || m.storage_type)} · ${esc(m.warehouse?.name || "")}`,
        actions: m.status === "sent" ? `
          <button class="btn btn-sm btn-primary" data-done="${esc(m.id)}">${inb ? "Mark as received" : "Mark as dispatched"}</button>
          <form class="mv-form" data-done-form="${esc(m.id)}" hidden novalidate style="width:100%">
            <div class="form-row">
              <label class="ctrl"><span>${inb ? "Received on" : "Dispatched on"}</span><input name="done_date" type="date" value="${today}" max="${today}" required></label>
              <label class="ctrl"><span>Pallets ${inb ? "received" : "dispatched"}</span><input name="actual_pallets" type="number" min="0" value="${m.pallets}" required></label>
            </div>
            <label class="ctrl"><span>Note <em>optional, e.g. damaged pallets</em></span><input name="partner_note" maxlength="500"></label>
            <div class="actions"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-plain" type="button" data-done-cancel>Cancel</button></div>
          </form>` : ""
      });
    }).join("");
  }
  $("#mv-list").addEventListener("click", (e) => {
    const d = e.target.closest("[data-done]");
    if (d) { d.hidden = true; const f = $(`[data-done-form="${d.dataset.done}"]`); f.hidden = false; f.elements.actual_pallets.focus(); return; }
    if (e.target.closest("[data-done-cancel]")) { const f = e.target.closest("form"); f.hidden = true; $(`[data-done="${f.dataset.doneForm}"]`).hidden = false; }
  });
  $("#mv-list").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const { error } = await sb.from("stock_movements").update({
      status: "completed", done_date: v.done_date, actual_pallets: +v.actual_pallets, partner_note: v.partner_note.trim() || null
    }).eq("id", f.dataset.doneForm);
    if (error) return toast(errMsg(error), true);
    toast("Saved. The client can see it now.");
    loadMoves();
  });
  // Overview: add open requests to "Needs your attention"
  function renderAttnMoves(todo) {
    $("#attn [data-mv-attn]")?.remove();
    if (!todo) return;
    $("#attn .ok")?.remove();
    $("#attn").insertAdjacentHTML("afterbegin", `<li class="warn" data-mv-attn><span><b>${todo} inbound / outbound request${todo === 1 ? "" : "s"}</b> waiting for your team.</span><button type="button" class="btn btn-sm" data-go-mv>Open</button></li>`);
  }
  $("#attn").addEventListener("click", (e) => { if (e.target.closest("[data-go-mv]")) openTab("moves"); });

  /* ---------------- Users: the partner's employees ---------------- */
  async function loadTeam() {
    const box = $("#team-list");
    const { data, error } = await sb.from("partner_staff").select("*").eq("partner_id", uid).order("created_at");
    if (error) { box.innerHTML = `<li class="notice warn">${esc(errMsg(error))}</li>`; return; }
    const me = u.profile || {};
    box.innerHTML = `
      <li><span class="pd-avatar">${esc((me.full_name || "?").slice(0, 1))}</span><span><b>${esc(me.full_name || "")}</b> <small class="you">(you)</small><small>${esc(me.email || u.session.user.email)}</small></span>${pill("partner", "owner")}</li>
      ${data.map((s) => `
      <li data-staff="${esc(s.id)}"><span class="pd-avatar">${esc((s.full_name || "?").slice(0, 1))}</span>
        <span><b>${esc(s.full_name)}</b><small>${esc(s.email)}${s.status === "invited" ? ` · invited ${date(s.created_at)}` : ""}</small></span>
        ${pill(s.status, s.status === "invited" ? "invite sent" : "active")}
        <span class="actions">
          ${s.status === "invited" ? `<button class="btn btn-sm btn-plain" data-copy="${esc(s.email)}">Copy invite link</button>` : ""}
          <button class="btn btn-sm btn-danger" data-remove="${esc(s.id)}">Remove</button>
        </span></li>`).join("")}`;
  }
  const inviteLink = (email) => new URL(`login.html?mode=signup&invite=1&email=${encodeURIComponent(email)}`, location.href).href;
  $("#team-list").addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) { try { await navigator.clipboard.writeText(inviteLink(c.dataset.copy)); toast("Invite link copied"); } catch (err) { prompt("Copy this link:", inviteLink(c.dataset.copy)); } return; }
    const r = e.target.closest("[data-remove]");
    if (r) {
      if (!confirm("Remove this person? They will lose access to your dashboard straight away.")) return;
      const { error } = await sb.from("partner_staff").delete().eq("id", r.dataset.remove);
      if (error) return toast(errMsg(error), true);
      toast("Removed"); loadTeam();
    }
  });
  $("#invite-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, st = $(".form-status", f);
    if (!f.reportValidity()) return;
    const name = $("#i-name").value.trim(), email = $("#i-email").value.trim().toLowerCase();
    const { error } = await sb.from("partner_staff").insert({ partner_id: uid, full_name: name, email });
    st.hidden = false;
    if (error) { st.className = "form-status notice warn"; st.textContent = errMsg(error); return; }
    const link = inviteLink(email);
    const company = u.profile?.company || "our company";
    const mail = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Join ${company} on KADZ Logistics`)}&body=${encodeURIComponent(`Hi ${name},\n\nI've added you to ${company}'s warehouse account on KADZ Logistics.\nCreate your account with this email address here:\n${link}\n\nThanks`)}`;
    st.className = "form-status notice";
    st.innerHTML = `<strong>${esc(name)}</strong> can now join. Send them this link. They create an account with <strong>${esc(email)}</strong> and verify it with the code we email them.
      <div class="actions" style="margin-top:.6rem"><a class="btn btn-sm btn-primary" href="${esc(mail)}">Email the invite</a><button type="button" class="btn btn-sm btn-plain" data-copy-new>Copy link</button></div>`;
    $("[data-copy-new]", st).addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); toast("Invite link copied"); } catch (err) { prompt("Copy this link:", link); } });
    f.reset(); loadTeam();
  });

  loadMoves();

  /* ---------------- Bidding ---------------- */
  let pbf = "open", bidRows = [];
  $$("[data-pbf]").forEach((b) => b.addEventListener("click", () => {
    pbf = b.dataset.pbf;
    $$("[data-pbf]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderBids();
  }));
  async function loadBids() {
    const { data, error } = await sb.rpc("partner_bid_requests");
    if (error) { $("#bid-list").innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    bidRows = data || [];
    const open = bidRows.filter((r) => r.status === "open" && !r.my_bid_id).length;
    $("#n-bid").textContent = open || "";
    renderBids();
  }
  function renderBids() {
    const box = $("#bid-list");
    const rows = bidRows.filter((r) => pbf === "open" ? r.status === "open" : r.status !== "open");
    if (!rows.length) { box.innerHTML = `<div class="empty"><strong>${pbf === "open" ? "No open requests" : "Nothing yet"}</strong><p>${pbf === "open" ? "New storage requests from KADZ show here." : "Requests you bid on show here once bidding closes."}</p></div>`; return; }
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = rows.map((r) => {
      const items = r.items || [];
      const types = items.map((i) => i.type);
      // Warehouses that can store every type in the request
      const mine = warehouses.filter((w) => w.status === "approved" && types.every((t) => w.storage_types.includes(t)));
      const daysLeft = Math.round((new Date(r.closes_on) - new Date(today)) / 864e5);
      const active = r.my_status === "active";
      const iLead = active && r.my_total != null && +r.my_total <= +r.lowest_total;
      const result = r.my_status === "won" ? `<p class="notice"><strong>You won this request.</strong> KADZ will contact you to confirm the booking.</p>`
        : r.my_status === "lost" ? `<p class="note">Another bid was chosen this time.</p>`
        : r.status !== "open" ? `<p class="note">Bidding is closed. KADZ is choosing a warehouse.</p>` : "";
      return `
      <article class="row-card bid-card${r.status === "open" && !r.my_bid_id ? " attention" : ""}" data-bidreq="${esc(r.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(r.ref)} · ${r.status === "open" ? (daysLeft <= 0 ? "closes today" : `closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`) : "closed"} (${date(r.closes_on)})</span>
            <h3>${esc(r.subject || "")}</h3>
            <span class="muted">${esc(r.city)} · from ${date(r.start_date)} for ${r.months} month${r.months > 1 ? "s" : ""}</span>
            <div class="chips" style="display:flex;gap:.35rem;flex-wrap:wrap">${items.map((i) => `<span class="chip ${esc(i.type)}">${esc(TYPES[i.type]?.name || i.type)} · ${fmt(i.pallets)} pallets</span>`).join("")}</div>
          </div>
          ${r.my_status ? pill(r.my_status === "won" ? "confirmed" : r.my_status === "lost" ? "completed" : r.my_status === "withdrawn" ? "cancelled" : "quoted", active ? "bid placed" : r.my_status === "won" ? "won" : r.my_status === "lost" ? "not chosen" : "withdrawn") : pill("pending", "open")}
        </div>
        ${r.details ? `<p class="note">${esc(r.details)}</p>` : ""}
        <div class="bid-stats">
          <div><span class="label">Lowest bid now</span><b class="num">${r.lowest_total != null ? money(r.lowest_total) : "No bids yet"}</b><small class="muted">per month, all types</small></div>
          <div><span class="label">Bids</span><b class="num">${r.bid_count || 0}</b></div>
          <div><span class="label">Your bid</span><b class="num">${r.my_total != null && r.my_status !== "withdrawn" ? money(r.my_total) : "–"}</b>${iLead ? `<small class="lead-tag">lowest</small>` : `<small class="muted">per month</small>`}</div>
        </div>
        ${result}
        ${r.status === "open" ? (mine.length ? `
        <form class="mv-form bid-form" novalidate>
          <label class="ctrl"><span>Warehouse</span><select name="warehouse_id" required>${mine.map((w) => `<option value="${esc(w.id)}" ${w.id === r.my_warehouse ? "selected" : ""}>${esc(w.name)} · ${esc(w.city)}${w.city !== r.city ? " (other city)" : ""}</option>`).join("")}</select></label>
          <div class="bid-prices">
            ${items.map((i) => `<label class="ctrl"><span><i class="chip ${esc(i.type)}">${esc(TYPES[i.type]?.name || i.type)}</i> SAR / pallet / month <em>${fmt(i.pallets)} pallets</em></span>
              <input name="p_${esc(i.type)}" data-type="${esc(i.type)}" data-pallets="${i.pallets}" type="number" min="1" step="0.01" required value="${active && r.my_prices?.[i.type] != null ? esc(r.my_prices[i.type]) : ""}"></label>`).join("")}
          </div>
          <p class="tp-total">Your total per month: <b class="bid-total">${money(active ? r.my_total : 0)}</b> <small class="muted">excl. VAT</small></p>
          <label class="ctrl"><span>Note <em>optional, e.g. what's included</em></span><input name="note" maxlength="500" value="${esc(r.my_note || "")}"></label>
          <div class="actions"><button class="btn btn-primary" type="submit">${r.my_bid_id && active ? "Update bid" : "Place bid"}</button>
            ${r.my_bid_id && active ? `<button class="btn btn-plain" type="button" data-withdraw="${esc(r.my_bid_id)}">Withdraw</button>` : ""}</div>
        </form>` : `<p class="note">You need an approved warehouse with ${items.map((i) => esc(TYPES[i.type]?.name || i.type)).join(" and ")} storage to bid.</p>`) : ""}
      </article>`;
    }).join("");
  }
  const bidTotal = (f) => $$("input[data-type]", f).reduce((s, i) => s + (+i.value || 0) * +i.dataset.pallets, 0);
  $("#bid-list").addEventListener("input", (e) => {
    const f = e.target.closest(".bid-form");
    if (f) $(".bid-total", f).textContent = money(bidTotal(f));
  });
  $("#bid-list").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, card = f.closest("[data-bidreq]"), r = bidRows.find((x) => x.id === card.dataset.bidreq);
    if (!f.reportValidity()) return;
    const prices = Object.fromEntries($$("input[data-type]", f).map((i) => [i.dataset.type, +i.value]));
    const total = bidTotal(f);
    if (r.lowest_total != null && total > +r.lowest_total && !confirm(`The lowest bid is ${money(r.lowest_total)} per month. Send ${money(total)} anyway?`)) return;
    const row = { warehouse_id: f.elements.warehouse_id.value, prices, note: f.elements.note.value.trim() || null, status: "active" };
    const { error } = r.my_bid_id
      ? await sb.from("bids").update(row).eq("id", r.my_bid_id)
      : await sb.from("bids").insert({ ...row, request_id: r.id, partner_id: uid });
    if (error) return toast(errMsg(error), true);
    toast(r.my_bid_id ? "Bid updated" : "Bid placed");
    loadBids();
  });
  $("#bid-list").addEventListener("click", async (e) => {
    const w = e.target.closest("[data-withdraw]");
    if (!w) return;
    if (!confirm("Withdraw your bid?")) return;
    const { error } = await sb.from("bids").update({ status: "withdrawn" }).eq("id", w.dataset.withdraw);
    if (error) return toast(errMsg(error), true);
    toast("Bid withdrawn"); loadBids();
  });
  loadBids();
})();
