/* Admin panel: approve warehouses, manage bookings, quote requests, users */
(async function () {
  const { sb, C, TYPES, esc, fmt, money, date, $, $$, pill, typeChips, photoUrl, toast, errMsg,
          requireRole, setupTabs } = window.KZ;
  const u = await requireRole(["admin"]);
  if (!u) return;
  $("#who").textContent = u.profile?.full_name || u.session.user.email;

  const contact = (p) => p ? [
    `<strong>${esc(p.full_name || "No name")}</strong>${p.company ? " · " + esc(p.company) : ""}`,
    p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`,
    p.phone && `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`
  ].filter(Boolean).join("<br>") : "<span class='muted'>Unknown</span>";
  const LIC = { "commercial-registration": "Commercial registration", baladiya: "Baladiya", "civil-defense": "Civil Defense", sfda: "SFDA" };

  /* ---------------- Summary ---------------- */
  async function loadStats() {
    const count = (t, f) => { let q = sb.from(t).select("id", { count: "exact", head: true }); if (f) q = f(q); return q; };
    const [wh, bk, qr, act] = await Promise.all([
      count("warehouses", (q) => q.eq("status", "pending")),
      count("bookings", (q) => q.eq("status", "pending")),
      count("quote_requests", (q) => q.eq("status", "new")),
      sb.from("bookings").select("pallets").eq("status", "confirmed")
    ]);
    const n = { wh: wh.count || 0, bk: bk.count || 0, q: qr.count || 0 };
    const pallets = (act.data || []).reduce((s, b) => s + b.pallets, 0);
    $("#stats").innerHTML = `
      <div class="stat"><span class="label">Warehouses to review</span><b>${n.wh}</b></div>
      <div class="stat"><span class="label">Bookings to confirm</span><b>${n.bk}</b></div>
      <div class="stat"><span class="label">New quote requests</span><b>${n.q}</b></div>
      <div class="stat"><span class="label">Pallets in active bookings</span><b>${fmt(pallets)}</b></div>`;
    [["c-wh", n.wh], ["c-bk", n.bk], ["c-q", n.q]].forEach(([id, v]) => { $("#" + id).textContent = v; $("#" + id).hidden = !v; });
  }

  /* ---------------- Warehouses ---------------- */
  let whData = [];
  async function loadWarehouses() {
    const box = $("#wh-list");
    let q = sb.from("warehouses").select("*, owner:profiles(full_name, company, email, phone)").order("created_at", { ascending: false });
    if ($("#wh-filter").value) q = q.eq("status", $("#wh-filter").value);
    const { data, error } = await q;
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    whData = data;
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>Nothing here</strong><p>No warehouses with this status.</p></div>`; return; }
    box.innerHTML = data.map((w) => `
      <article class="row-card${w.status === "pending" ? " attention" : ""}" data-id="${esc(w.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">Submitted ${date(w.created_at)}</span>
            <h3>${esc(w.name)}</h3>
            <span class="muted">${esc([w.address, w.district, w.city].filter(Boolean).join(", "))}</span>
            <div style="display:flex;gap:.35rem;flex-wrap:wrap">${typeChips(w.storage_types)}</div>
          </div>
          ${pill(w.status)}
        </div>
        <dl class="kv">
          <div><dt>Owner</dt><dd>${contact(w.owner)}</dd></div>
          <div><dt>Pallets free / total</dt><dd>${fmt(w.pallets_available)} / ${fmt(w.pallets_total)}</dd></div>
          <div><dt>Price</dt><dd>${w.price_per_pallet != null ? money(w.price_per_pallet) : "On request"}</dd></div>
          <div><dt>Area · min. months</dt><dd>${w.area_sqm ? fmt(w.area_sqm) + " m²" : "–"} · ${w.min_months}</dd></div>
          <div><dt>Licenses</dt><dd>${w.licenses.length ? w.licenses.map((l) => esc(LIC[l] || l)).join(", ") : "None stated"}</dd></div>
          ${w.map_url && /^https?:\/\//.test(w.map_url) ? `<div><dt>Location</dt><dd><a href="${esc(w.map_url)}" target="_blank" rel="noopener">Open map</a></dd></div>` : ""}
        </dl>
        ${w.description ? `<p class="note" style="white-space:pre-line">${esc(w.description)}</p>` : ""}
        ${w.photos.length ? `<div class="thumbs">${w.photos.map((p) => `<a class="thumb" href="${esc(photoUrl(p))}" target="_blank" rel="noopener"><img src="${esc(photoUrl(p))}" alt=""></a>`).join("")}</div>` : `<span class="muted">No photos</span>`}
        ${w.documents.length ? `<ul class="files">${w.documents.map((d) => `<li><button type="button" class="linkbtn" data-doc="${esc(d)}">Open ${esc(d.split("/").pop().replace(/^[0-9a-f-]{36}-/, ""))}</button></li>`).join("")}</ul>` : `<span class="muted">No license documents uploaded</span>`}
        <div class="inline-form">
          <label class="ctrl" style="flex:3"><span class="label">Note to owner <em>shown if rejected</em></span><input data-note value="${esc(w.admin_note || "")}" placeholder="e.g. Please upload the Civil Defense certificate"></label>
          ${w.status !== "approved" ? `<button class="btn btn-sm btn-primary" data-wh-status="approved">Approve</button>` : ""}
          ${w.status !== "rejected" ? `<button class="btn btn-sm btn-danger" data-wh-status="rejected">${w.status === "approved" ? "Unlist" : "Reject"}</button>` : ""}
          <a class="btn btn-sm btn-plain" href="warehouse.html?id=${esc(w.id)}">Preview</a>
        </div>
      </article>`).join("");
  }

  $("#wh-list").addEventListener("click", async (e) => {
    const doc = e.target.closest("[data-doc]");
    if (doc) {
      const win = window.open("", "_blank");
      const { data, error } = await sb.storage.from("warehouse-docs").createSignedUrl(doc.dataset.doc, 300);
      if (error) { win && win.close(); return toast(errMsg(error), true); }
      if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
      return;
    }
    const b = e.target.closest("[data-wh-status]");
    if (!b) return;
    const card = b.closest("[data-id]");
    const status = b.dataset.whStatus;
    if (status === "rejected" && !confirm("Reject or unlist this warehouse? It will be hidden from search.")) return;
    b.disabled = true;
    const { error } = await sb.from("warehouses")
      .update({ status, admin_note: $("[data-note]", card).value.trim() || null })
      .eq("id", card.dataset.id);
    if (error) { b.disabled = false; return toast(errMsg(error), true); }
    toast(status === "approved" ? "Warehouse approved" : "Warehouse rejected");
    loadWarehouses(); loadStats();
  });
  $("#wh-filter").addEventListener("change", loadWarehouses);

  /* ---------------- Bookings ---------------- */
  async function loadBookings() {
    const box = $("#bk-list");
    let q = sb.from("bookings")
      .select("*, client:profiles(full_name, company, email, phone), warehouse:warehouses(id, name, city, pallets_available, owner:profiles(full_name, company, email, phone))")
      .order("created_at", { ascending: false });
    if ($("#bk-filter").value) q = q.eq("status", $("#bk-filter").value);
    const { data, error } = await q;
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>Nothing here</strong><p>No bookings with this status.</p></div>`; return; }
    const opt = (vals, cur) => vals.map((v) => `<option value="${v}"${v === cur ? " selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("");
    box.innerHTML = data.map((b) => `
      <article class="row-card${b.status === "pending" ? " attention" : ""}" data-id="${esc(b.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(b.ref)} · requested ${date(b.created_at)}</span>
            <h3>${b.warehouse ? `<a href="warehouse.html?id=${esc(b.warehouse.id)}" style="text-decoration:none">${esc(b.warehouse.name)}</a>` : "Deleted warehouse"}</h3>
            ${b.warehouse ? `<span class="muted">${esc(b.warehouse.city)} · ${fmt(b.warehouse.pallets_available)} pallets free now</span>` : ""}
          </div>
          <div class="actions">${pill(b.status)} ${pill(b.payment_status)}</div>
        </div>
        <dl class="kv">
          <div><dt>Client</dt><dd>${contact(b.client)}</dd></div>
          <div><dt>Warehouse owner</dt><dd>${contact(b.warehouse?.owner)}</dd></div>
          <div><dt>Storage · pallets</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)} · ${fmt(b.pallets)}</dd></div>
          <div><dt>Start · duration</dt><dd>${date(b.start_date)} · ${b.months} mo</dd></div>
          <div><dt>Total</dt><dd>${b.total_amount != null ? money(b.total_amount) : "Set a price"}</dd></div>
        </dl>
        ${b.notes ? `<p class="note">Client note: ${esc(b.notes)}</p>` : ""}
        <div class="inline-form">
          <label class="ctrl"><span class="label">Status</span><select data-f="status">${opt(["pending", "confirmed", "rejected", "cancelled", "completed"], b.status)}</select></label>
          <label class="ctrl"><span class="label">Payment</span><select data-f="payment_status">${opt(["unpaid", "invoiced", "paid"], b.payment_status)}</select></label>
          <label class="ctrl"><span class="label">${esc(C.currency)} / pallet / month</span><input data-f="price_per_pallet" type="number" min="0" step="0.01" value="${b.price_per_pallet ?? ""}"></label>
          <label class="ctrl" style="flex:2"><span class="label">Message to client</span><input data-f="admin_note" value="${esc(b.admin_note || "")}" placeholder="Shown on the client's booking"></label>
          <button class="btn btn-sm btn-primary" data-save>Save</button>
        </div>
      </article>`).join("");
  }

  $("#bk-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-save]");
    if (!b) return;
    const card = b.closest("[data-id]");
    const v = (f) => $(`[data-f=${f}]`, card).value;
    const price = v("price_per_pallet");
    if (v("status") === "confirmed" && price === "") return toast("Set a price before confirming.", true);
    b.disabled = true; b.textContent = "Saving…";
    const { error } = await sb.from("bookings").update({
      status: v("status"), payment_status: v("payment_status"),
      price_per_pallet: price === "" ? null : +price, admin_note: v("admin_note").trim() || null
    }).eq("id", card.dataset.id);
    b.disabled = false; b.textContent = "Save";
    if (error) return toast(errMsg(error), true);
    toast("Booking updated");
    loadBookings(); loadStats();
  });
  $("#bk-filter").addEventListener("change", loadBookings);

  /* ---------------- Quote requests ---------------- */
  async function loadQuotes() {
    const box = $("#q-list");
    const { data, error } = await sb.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>No quote requests yet</strong><p>Requests from the Get a quote page will show here.</p></div>`; return; }
    box.innerHTML = data.map((r) => `
      <article class="row-card${r.status === "new" ? " attention" : ""}" data-id="${esc(r.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem"><span class="label">${date(r.created_at)}</span><h3>${esc(r.company || r.name)}</h3></div>
          ${pill(r.status)}
        </div>
        <dl class="kv">
          <div><dt>Contact</dt><dd>${contact({ full_name: r.name, email: r.email, phone: r.phone })}</dd></div>
          <div><dt>Services</dt><dd>${esc((r.services || []).join(", ") || "–")}</dd></div>
          <div><dt>Storage · city</dt><dd>${esc(TYPES[r.storage_type]?.name || r.storage_type || "–")} · ${esc(r.city || "Any")}</dd></div>
          <div><dt>Pallets · months</dt><dd>${r.pallets ?? "–"} · ${r.months ?? "–"}</dd></div>
        </dl>
        ${r.notes ? `<p class="note">${esc(r.notes)}</p>` : ""}
        <div class="actions"><button class="btn btn-sm btn-plain" data-q="${r.status === "new" ? "handled" : "new"}">${r.status === "new" ? "Mark as handled" : "Mark as new"}</button></div>
      </article>`).join("");
  }
  $("#q-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-q]"); if (!b) return;
    const { error } = await sb.from("quote_requests").update({ status: b.dataset.q }).eq("id", b.closest("[data-id]").dataset.id);
    if (error) return toast(errMsg(error), true);
    loadQuotes(); loadStats();
  });

  /* ---------------- Users ---------------- */
  let users = [];
  async function loadUsers() {
    const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) { $("#u-list").innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    users = data; renderUsers();
  }
  function renderUsers() {
    const s = $("#u-search").value.trim().toLowerCase(), r = $("#u-role").value;
    const rows = users.filter((p) => (!r || p.role === r) &&
      (!s || [p.full_name, p.company, p.email].some((x) => (x || "").toLowerCase().includes(s))));
    $("#u-list").innerHTML = rows.length ? rows.map((p) => `
      <article class="row-card" data-id="${esc(p.id)}">
        <div class="row-top">
          <div>${contact(p)}<div class="label" style="margin-top:.3rem">Joined ${date(p.created_at)}</div></div>
          <div class="inline-form">
            <label class="ctrl" style="min-width:150px"><span class="label">Role</span>
              <select data-role>${["client", "partner", "admin"].map((x) => `<option${x === p.role ? " selected" : ""}>${x}</option>`).join("")}</select>
            </label>
          </div>
        </div>
      </article>`).join("") : `<div class="empty"><strong>No users found</strong></div>`;
  }
  $("#u-search").addEventListener("input", renderUsers);
  $("#u-role").addEventListener("change", renderUsers);
  $("#u-list").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-role]"); if (!sel) return;
    const id = sel.closest("[data-id]").dataset.id;
    const p = users.find((x) => x.id === id);
    if (id === u.session.user.id && sel.value !== "admin" && !confirm("Remove your own admin access? You'll lose access to this page.")) { sel.value = p.role; return; }
    const { error } = await sb.from("profiles").update({ role: sel.value }).eq("id", id);
    if (error) { sel.value = p.role; return toast(errMsg(error), true); }
    p.role = sel.value;
    toast(`Role changed to ${sel.value}`);
  });

  /* ---------------- Start ---------------- */
  const loaders = { warehouses: loadWarehouses, bookings: loadBookings, quotes: loadQuotes, users: loadUsers };
  const loaded = {};
  setupTabs((name) => { if (!loaded[name]) { loaded[name] = true; loaders[name](); } });
  $("#refresh").addEventListener("click", () => {
    loadStats();
    const open = $(".tab[aria-selected=true]").dataset.tab;
    Object.keys(loaded).forEach((k) => delete loaded[k]);
    loaded[open] = true; loaders[open]();
  });
  loadStats();
})();
