/* Admin panel: approve warehouses, manage bookings, quote requests, users */
(async function () {
  const { sb, C, TYPES, esc, fmt, money, date, $, $$, pill, bookingPill, typeChips, photoUrl, toast, errMsg,
          requireRole, setupTabs, loadUnread, threadButton, bindThreadButtons } = window.KZ;
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
    const [wh, bk, qd, qr, act, unread] = await Promise.all([
      count("warehouses", (q) => q.eq("status", "pending")),
      count("bookings", (q) => q.eq("status", "pending")),
      count("bookings", (q) => q.eq("status", "quoted")),
      count("quote_requests", (q) => q.eq("status", "new")),
      sb.from("bookings").select("pallets").eq("status", "confirmed"),
      loadUnread()
    ]);
    const msgs = Object.values(unread).reduce((s, x) => s + x, 0);
    const n = { wh: wh.count || 0, bk: bk.count || 0, qd: qd.count || 0, q: qr.count || 0 };
    const pallets = (act.data || []).reduce((s, b) => s + b.pallets, 0);
    $("#stats").innerHTML = `
      <div class="stat"><span class="label">Warehouses to review</span><b>${n.wh}</b></div>
      <div class="stat"><span class="label">Quotations to send</span><b>${n.bk}</b></div>
      <div class="stat"><span class="label">Waiting for client</span><b>${n.qd}</b></div>
      <div class="stat"><span class="label">Unread messages</span><b>${msgs}</b></div>
      <div class="stat"><span class="label">New quote requests</span><b>${n.q}</b></div>
      <div class="stat"><span class="label">Pallets in active bookings</span><b>${fmt(pallets)}</b></div>`;
    [["c-wh", n.wh], ["c-bk", n.bk + msgs], ["c-q", n.q]].forEach(([id, v]) => { $("#" + id).textContent = v; $("#" + id).hidden = !v; });
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

  /* ---------------- Bookings & quotations ---------------- */
  const iso = (d) => d.toISOString().slice(0, 10);
  const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

  // Which buttons each status gets: [new status, label, style]
  const ACTIONS = {
    pending:   [["quoted", "Send quotation", "btn-primary"], ["rejected", "Reject request", "btn-danger"]],
    quoted:    [["quoted", "Update quotation", "btn-primary"], ["confirmed", "Mark as accepted", "btn-plain"], ["cancelled", "Withdraw quotation", "btn-danger"]],
    confirmed: [["confirmed", "Save", "btn-primary"], ["completed", "Mark completed", "btn-plain"], ["cancelled", "Cancel booking", "btn-danger"]],
    completed: [["completed", "Save", "btn-primary"]],
    declined:  [["declined", "Save note", "btn-plain"]],
    rejected:  [["rejected", "Save note", "btn-plain"]],
    cancelled: [["cancelled", "Save note", "btn-plain"]]
  };
  const CONFIRM = {
    rejected: "Reject this request? The client will be told we can't offer it.",
    cancelled: "Cancel this? Any reserved pallets go back to the warehouse.",
    confirmed: "Mark this quotation as accepted for the client? The pallets will be reserved.",
    completed: "Mark this booking as completed? The pallets go back to the warehouse."
  };

  let bkData = [];
  bindThreadButtons($("#bk-list"), { id: u.session.user.id, role: "admin" }, () => loadStats());
  async function loadBookings() {
    const box = $("#bk-list");
    let q = sb.from("bookings")
      .select("*, cost:booking_costs(partner_price_per_pallet), client:profiles(full_name, company, email, phone), warehouse:warehouses(id, name, city, pallets_available, owner:profiles(full_name, company, email, phone))")
      .order("created_at", { ascending: false });
    if ($("#bk-filter").value) q = q.eq("status", $("#bk-filter").value);
    const [{ data, error }, unread] = await Promise.all([q, loadUnread()]);
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    bkData = data;
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>Nothing here</strong><p>No requests or bookings with this status.</p></div>`; return; }
    const pay = (cur) => ["unpaid", "invoiced", "paid"].map((v) => `<option value="${v}"${v === cur ? " selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("");

    box.innerHTML = data.map((b) => {
      const cost = (Array.isArray(b.cost) ? b.cost[0] : b.cost)?.partner_price_per_pallet ?? "";
      const quoting = ["pending", "quoted"].includes(b.status);
      const booked = ["confirmed", "completed"].includes(b.status);
      return `
      <article class="row-card${b.status === "pending" ? " attention" : ""}" data-id="${esc(b.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(b.ref)} · requested ${date(b.created_at)}</span>
            <h3>${b.warehouse ? `<a href="warehouse.html?id=${esc(b.warehouse.id)}" style="text-decoration:none">${esc(b.warehouse.name)}</a>` : "Deleted warehouse"}</h3>
            ${b.warehouse ? `<span class="muted">${esc(b.warehouse.city)} · ${fmt(b.warehouse.pallets_available)} pallets free now</span>` : ""}
          </div>
          <div class="actions">${bookingPill(b)} ${booked ? pill(b.payment_status) : ""}</div>
        </div>
        <dl class="kv">
          <div><dt>Client</dt><dd>${contact(b.client)}</dd></div>
          <div><dt>Warehouse owner</dt><dd>${contact(b.warehouse?.owner)}</dd></div>
          <div><dt>Storage · pallets</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)} · ${fmt(b.pallets)}</dd></div>
          <div><dt>Start · duration</dt><dd>${date(b.start_date)} · ${b.months} mo</dd></div>
          ${b.status === "quoted" ? `<div><dt>Quote valid until</dt><dd>${date(b.quote_valid_until)}</dd></div>` : ""}
        </dl>
        ${b.notes ? `<p class="note">Client note: ${esc(b.notes)}</p>` : ""}
        <div class="inline-form">
          <label class="ctrl"><span class="label">Partner price <em>admin only</em></span><input data-f="cost" type="number" min="0" step="0.01" value="${cost}" placeholder="${esc(C.currency)} / pallet / month"></label>
          <label class="ctrl"><span class="label">Client price</span><input data-f="price_per_pallet" type="number" min="0" step="0.01" value="${b.price_per_pallet ?? ""}" placeholder="${esc(C.currency)} / pallet / month"${quoting ? "" : " disabled"}></label>
          ${quoting ? `<label class="ctrl"><span class="label">Valid until</span><input data-f="quote_valid_until" type="date" min="${inDays(0)}" value="${b.quote_valid_until && b.quote_valid_until >= inDays(0) ? b.quote_valid_until : inDays(7)}"></label>` : ""}
          ${booked ? `<label class="ctrl"><span class="label">Payment</span><select data-f="payment_status">${pay(b.payment_status)}</select></label>` : ""}
        </div>
        <p class="muted" data-calc style="font-size:.9rem"></p>
        <div class="inline-form">
          <label class="ctrl" style="flex:3"><span class="label">Message to client</span><input data-f="admin_note" value="${esc(b.admin_note || "")}" placeholder="Shown with the quotation or booking"></label>
          ${(ACTIONS[b.status] || []).map(([st, label, cls]) => `<button class="btn btn-sm ${cls}" data-act="${st}">${label}</button>`).join("")}
        </div>
        <div class="actions">
          ${threadButton(b.id, "client", "Chat with client", unread[`${b.id}:client`])}
          ${threadButton(b.id, "partner", "Chat with partner", unread[`${b.id}:partner`])}
        </div>
        <div data-chat></div>
      </article>`;
    }).join("");
    $$("#bk-list [data-id]").forEach(calc);
  }

  // Show client total, partner total and margin as prices are typed
  function calc(card) {
    const b = bkData.find((x) => x.id === card.dataset.id); if (!b) return;
    const n = (f) => { const el = $(`[data-f=${f}]`, card); return el && el.value !== "" ? +el.value : null; };
    const units = b.pallets * b.months, client = n("price_per_pallet"), cost = n("cost");
    const parts = [];
    if (client != null) parts.push(`Client total <strong>${money(client * units)}</strong>`);
    if (cost != null) parts.push(`Partner total ${money(cost * units)}`);
    if (client != null && cost != null) {
      const m = (client - cost) * units;
      parts.push(`Margin <strong style="color:var(${m < 0 ? "--bad" : "--ok"})">${money(m)}</strong>`);
    }
    $("[data-calc]", card).innerHTML = parts.length ? parts.join(" · ") + ` <span class="muted">(${fmt(b.pallets)} pallets × ${b.months} mo, excl. VAT)</span>` : "Enter prices to see totals and margin.";
  }
  $("#bk-list").addEventListener("input", (e) => { const c = e.target.closest("[data-id]"); if (c) calc(c); });

  $("#bk-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    const b = bkData.find((x) => x.id === card.dataset.id);
    const status = btn.dataset.act;
    const val = (f) => { const el = $(`[data-f=${f}]`, card); return el ? el.value : undefined; };

    if (status === "quoted" && val("price_per_pallet") === "") { $("[data-f=price_per_pallet]", card).focus(); return toast("Enter the client price first.", true); }
    if (status !== b.status && CONFIRM[status] && !confirm(CONFIRM[status])) return;

    const update = { status, admin_note: val("admin_note").trim() || null };
    if (val("price_per_pallet") !== undefined && !$("[data-f=price_per_pallet]", card).disabled)
      update.price_per_pallet = val("price_per_pallet") === "" ? null : +val("price_per_pallet");
    if (val("quote_valid_until") !== undefined) update.quote_valid_until = val("quote_valid_until") || null;
    if (val("payment_status") !== undefined) update.payment_status = val("payment_status");

    btn.disabled = true; const label = btn.textContent; btn.textContent = "Saving…";
    const { error } = await sb.from("bookings").update(update).eq("id", b.id);
    let err = error;
    if (!err) {
      const cost = val("cost");
      const old = (Array.isArray(b.cost) ? b.cost[0] : b.cost)?.partner_price_per_pallet ?? "";
      if (String(cost) !== String(old)) {
        const r = await sb.from("booking_costs").upsert({ booking_id: b.id, partner_price_per_pallet: cost === "" ? null : +cost, updated_at: new Date().toISOString() });
        err = r.error;
      }
    }
    btn.disabled = false; btn.textContent = label;
    if (err) return toast(errMsg(err), true);
    toast(status === "quoted" && b.status === "pending" ? "Quotation sent to the client" : "Saved");
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
