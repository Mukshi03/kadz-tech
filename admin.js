/* Admin panel: approve warehouses, manage bookings, quote requests, users */
(async function () {
  const { sb, C, TYPES, esc, fmt, money, date, $, $$, pill, bookingPill, typeChips, photoUrl, toast, errMsg,
          requireRole, setupTabs, buildQuotePdf, loadQuoteLogo, openQuotePdf, SERVICES, serviceFacts, serviceLine } = window.KZ;
  const u = await requireRole(["admin"]);
  if (!u) return;
  $("#who").textContent = u.profile?.full_name || u.session.user.email;

  const contact = (p) => p ? [
    `<strong>${esc(p.full_name || "No name")}</strong>${p.company ? " · " + esc(p.company) : ""}`,
    p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`,
    p.phone && `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`
  ].filter(Boolean).join("<br>") : "<span class='muted'>Unknown</span>";
  // Partner's listed prices, e.g. "Dry 35.00 SAR · Chilled 55.00 SAR"
  function partnerPriceText(w, only) {
    const p = w?.partner_prices || {};
    const vals = Object.entries(p).filter(([t]) => !only || t === only);
    const same = vals.length && vals.every(([, v]) => v === vals[0][1]);
    const parts = same ? [money(vals[0][1])] : vals.map(([t, v]) => `${esc(TYPES[t]?.name || t)} ${money(v)}`);
    return parts.join(" · ");
  }
  const METHOD = { whatsapp: "WhatsApp", phone: "Phone call", email: "Email" };
  // WhatsApp / phone / email link for a number or address
  function reach(method, value) {
    if (!value) return "";
    const v = String(value).trim();
    if (method === "whatsapp" && /\d{6,}/.test(v.replace(/\D/g, ""))) return `<a href="https://wa.me/${v.replace(/\D/g, "")}" target="_blank" rel="noopener">${esc(v)}</a>`;
    if (/@/.test(v)) return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    return `<a href="tel:${esc(v.replace(/\s/g, ""))}">${esc(v)}</a>`;
  }
  const LIC = { "commercial-registration": "Commercial registration", baladiya: "Baladiya", "civil-defense": "Civil Defense", sfda: "SFDA" };

  /* ---------------- Desktop alerts ----------------
     While this page is open, it checks every 30 seconds. When something new
     arrives it shows a message on the page and, if turned on, a desktop alert
     with a short sound. */
  let prev = null;
  const alertBtn = $("#alerts-btn");
  const canNotify = "Notification" in window;
  const alertsOn = () => { try { return canNotify && Notification.permission === "granted" && localStorage.getItem("kz-alerts") !== "off"; } catch (e) { return false; } };
  function showAlertBtn() {
    if (!canNotify) return;
    alertBtn.hidden = false;
    alertBtn.textContent = Notification.permission === "denied" ? "Desktop alerts blocked" : alertsOn() ? "Desktop alerts on" : "Turn on desktop alerts";
    alertBtn.disabled = Notification.permission === "denied";
    alertBtn.title = Notification.permission === "denied" ? "Allow notifications for this site in your browser settings" : "";
  }
  alertBtn.addEventListener("click", async () => {
    if (alertsOn()) { try { localStorage.setItem("kz-alerts", "off"); } catch (e) {} showAlertBtn(); return toast("Desktop alerts off"); }
    const p = await Notification.requestPermission();
    try { localStorage.setItem("kz-alerts", "on"); } catch (e) {}
    showAlertBtn();
    if (p === "granted") { beep(); toast("Desktop alerts on. Keep this page open in a tab."); }
  });
  function beep() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.12, a.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.25);
        o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.26);
      });
    } catch (e) {}
  }
  function announce(now) {
    if (prev) {
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      const news = [];
      if (now.bk > prev.bk) news.push(plural(now.bk - prev.bk, "new quotation request", "new quotation requests"));
      if (now.accepted > prev.accepted) news.push(plural(now.accepted - prev.accepted, "quotation accepted", "quotations accepted"));
      if (now.wh > prev.wh) news.push(plural(now.wh - prev.wh, "warehouse to review", "warehouses to review"));
      if (now.sr > prev.sr) news.push(plural(now.sr - prev.sr, "new service request", "new service requests"));
      if (now.srOk > prev.srOk) news.push(plural(now.srOk - prev.srOk, "service quotation accepted", "service quotations accepted"));
      if (now.q > prev.q) news.push(plural(now.q - prev.q, "new quote form request", "new quote form requests"));
      if (news.length) {
        toast(news.join(" · "));
        if (alertsOn()) {
          const n = new Notification(`${C.company} admin`, { body: news.join("\n"), tag: "kadz-admin" });
          n.onclick = () => { window.focus(); n.close(); };
          beep();
        }
      }
    }
    prev = now;
    const total = now.bk + now.wh + now.q + now.sr;
    document.title = (total ? `(${total}) ` : "") + `Admin | ${C.company}`;
  }
  showAlertBtn();
  setInterval(() => loadStats(), 30000);

  /* ---------------- Summary ---------------- */
  async function loadStats() {
    const count = (t, f) => { let q = sb.from(t).select("id", { count: "exact", head: true }); if (f) q = f(q); return q; };
    const [wh, bk, qd, qr, act, sr, srOk] = await Promise.all([
      count("warehouses", (q) => q.eq("status", "pending")),
      count("bookings", (q) => q.eq("status", "pending")),
      count("bookings", (q) => q.eq("status", "quoted")),
      count("quote_requests", (q) => q.eq("status", "new")),
      sb.from("bookings").select("pallets").eq("status", "confirmed"),
      count("service_requests", (q) => q.eq("status", "pending")),
      count("service_requests", (q) => q.eq("status", "confirmed"))
    ]);
    announce({ wh: wh.count || 0, bk: bk.count || 0, q: qr.count || 0, accepted: (act.data || []).length,
               sr: sr.count || 0, srOk: srOk.count || 0 });
    const n = { wh: wh.count || 0, bk: bk.count || 0, qd: qd.count || 0, q: qr.count || 0, sr: sr.count || 0 };
    const pallets = (act.data || []).reduce((s, b) => s + b.pallets, 0);
    $("#stats").innerHTML = `
      <div class="stat"><span class="label">Warehouses to review</span><b>${n.wh}</b></div>
      <div class="stat"><span class="label">Quotations to send</span><b>${n.bk}</b></div>
      <div class="stat"><span class="label">Service requests to quote</span><b>${n.sr}</b></div>
      <div class="stat"><span class="label">Waiting for client</span><b>${n.qd}</b></div>
      <div class="stat"><span class="label">New quote requests</span><b>${n.q}</b></div>
      <div class="stat"><span class="label">Pallets in active bookings</span><b>${fmt(pallets)}</b></div>`;
    [["c-wh", n.wh], ["c-bk", n.bk], ["c-q", n.q], ["c-sr", n.sr]].forEach(([id, v]) => { $("#" + id).textContent = v; $("#" + id).hidden = !v; });
  }

  /* ---------------- Warehouses ---------------- */
  let whData = [];
  async function loadWarehouses() {
    const box = $("#wh-list");
    let q = sb.from("warehouses").select("*, owner:profiles!warehouses_owner_id_fkey(full_name, company, email, phone)").order("created_at", { ascending: false });
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
          <div><dt>Partner price <span class="muted">/ pallet / month</span></dt><dd>${partnerPriceText(w) || "<span class='muted'>Not set</span>"}</dd></div>
          <div><dt>Site contact</dt><dd>${w.contact_method || w.contact_name || w.contact_info
              ? [w.contact_method && `<strong>${esc(METHOD[w.contact_method])}</strong>`, w.contact_name && esc(w.contact_name), reach(w.contact_method, w.contact_info), w.contact_time && `<span class="muted">${esc(w.contact_time)}</span>`].filter(Boolean).join("<br>")
              : "<span class='muted'>Not given</span>"}</dd></div>
          <div><dt>Licenses</dt><dd>${w.licenses.length ? w.licenses.map((l) => esc(LIC[l] || l)).join(", ") : "None stated"}</dd></div>
          ${w.map_url && /^https?:\/\//.test(w.map_url) ? `<div><dt>Location</dt><dd><a href="${esc(w.map_url)}" target="_blank" rel="noopener">Open map</a></dd></div>` : ""}
        </dl>
        ${w.description ? `<p class="note" style="white-space:pre-line">${esc(w.description)}</p>` : ""}
        ${w.photos.length ? `<div class="thumbs">${w.photos.map((p) => `<a class="thumb" href="${esc(photoUrl(p))}" target="_blank" rel="noopener"><img src="${esc(photoUrl(p))}" alt=""></a>`).join("")}</div>` : `<span class="muted">No photos</span>`}
        ${w.documents.length ? `<ul class="files">${w.documents.map((d) => `<li><button type="button" class="linkbtn" data-doc="${esc(d)}">Open ${esc(d.split("/").pop().replace(/^[0-9a-f-]{36}-/, ""))}</button></li>`).join("")}</ul>` : `<span class="muted">No license documents uploaded</span>`}
        <div class="inline-form">
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
      .update({ status })
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
  async function loadBookings() {
    const box = $("#bk-list");
    let q = sb.from("bookings")
      .select("*, cost:booking_costs(partner_price_per_pallet), client:profiles!bookings_client_id_fkey(full_name, company, email, phone), warehouse:warehouses!bookings_warehouse_id_fkey(id, name, city, pallets_available, partner_prices, handling_in, handling_out, owner:profiles!warehouses_owner_id_fkey(full_name, company, email, phone))")
      .order("created_at", { ascending: false });
    if ($("#bk-filter").value) q = q.eq("status", $("#bk-filter").value);
    const { data, error } = await q;
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    bkData = data;
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>Nothing here</strong><p>No requests or bookings with this status.</p></div>`; return; }
    const pay = (cur) => ["unpaid", "invoiced", "paid"].map((v) => `<option value="${v}"${v === cur ? " selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("");

    box.innerHTML = data.map((b) => {
      const saved = (Array.isArray(b.cost) ? b.cost[0] : b.cost)?.partner_price_per_pallet;
      const listed = b.warehouse?.partner_prices?.[b.storage_type];
      // Use the saved partner price; otherwise start from the partner's listed price
      const cost = saved ?? listed ?? "";
      const quoting = ["pending", "quoted"].includes(b.status);
      const booked = ["confirmed", "completed"].includes(b.status);
      return `
      <article class="row-card${b.status === "pending" ? " attention" : ""}" data-id="${esc(b.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(b.ref)}${b.quote_number ? " · " + esc(b.quote_number) : ""} · requested ${date(b.created_at)}</span>
            <h3>${b.warehouse ? `<a href="warehouse.html?id=${esc(b.warehouse.id)}" style="text-decoration:none">${esc(b.warehouse.name)}</a>` : "Deleted warehouse"}</h3>
            ${b.warehouse ? `<span class="muted">${esc(b.warehouse.city)} · ${fmt(b.warehouse.pallets_available)} pallets free now</span>` : ""}
          </div>
          <div class="actions">${bookingPill(b)} ${booked ? pill(b.payment_status) : ""}</div>
        </div>
        <dl class="kv">
          <div><dt>Client</dt><dd>${contact(b.client)}</dd></div>
          <div><dt>Contact client by</dt><dd>${b.contact_method
              ? `<strong>${esc(METHOD[b.contact_method])}</strong><br>${reach(b.contact_method, b.contact_method === "email" ? b.client?.email : b.client?.phone) || "<span class='muted'>No " + (b.contact_method === "email" ? "email" : "phone") + " on account</span>"}`
              : "<span class='muted'>Not given</span>"}</dd></div>
          <div><dt>Warehouse owner</dt><dd>${contact(b.warehouse?.owner)}</dd></div>
          <div><dt>Storage · pallets</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)} · ${fmt(b.pallets)}</dd></div>
          <div><dt>Start · duration</dt><dd>${date(b.start_date)} · ${b.months} mo</dd></div>
          <div><dt>Partner's listed price</dt><dd>${partnerPriceText(b.warehouse, b.storage_type) || "<span class='muted'>Not set</span>"}</dd></div>
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
          ${(ACTIONS[b.status] || []).map(([st, label, cls]) => `<button class="btn btn-sm ${cls}" data-act="${st}">${label}</button>`).join("")}
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-plain" data-preview>Preview PDF</button>
          ${b.quote_pdf ? `<button class="btn btn-sm btn-plain" data-pdf="${esc(b.quote_pdf)}">Download ${esc(b.quote_number || "quotation")}</button>` : ""}
        </div>
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

  // Build the quotation PDF for a booking. save=true stores it, which emails it to the client.
  async function makeQuotePdf(id, save, draft) {
    const { data: bk, error } = await sb.from("bookings")
      .select("*, client:profiles!bookings_client_id_fkey(full_name, company, email, phone), warehouse:warehouses!bookings_warehouse_id_fkey(city)").eq("id", id).single();
    if (error) throw error;
    const booking = { ...bk, ...(draft || {}) };
    const bytes = buildQuotePdf({ company: C, booking, client: bk.client, city: bk.warehouse?.city,
                                  siteUrl: location.href.replace(/[^/]*$/, ""), logo: await loadQuoteLogo(C.logo) });
    const blob = new Blob([bytes], { type: "application/pdf" });
    if (!save) return blob;
    if (!bk.quote_number) throw new Error("This quotation has no number yet. Make sure update-4-quote-pdf.sql was run in Supabase.");
    const path = `${bk.id}/${bk.quote_number}-${Date.now()}.pdf`;
    const up = await sb.storage.from("quotations").upload(path, blob, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const r = await sb.from("bookings").update({ quote_pdf: path }).eq("id", bk.id);
    if (r.error) throw r.error;
    return bk.quote_number;
  }

  $("#bk-list").addEventListener("click", async (e) => {
    const pdf = e.target.closest("[data-pdf]");
    if (pdf) return openQuotePdf(pdf.dataset.pdf);
    const prev = e.target.closest("[data-preview]");
    if (prev) {
      const card = prev.closest("[data-id]");
      const v = (f) => { const el = $(`[data-f=${f}]`, card); return el ? el.value : ""; };
      if (v("price_per_pallet") === "") return toast("Enter the client price to preview the PDF.", true);
      const win = window.open("", "_blank");
      try {
        const b = bkData.find((x) => x.id === card.dataset.id);
        const blob = await makeQuotePdf(b.id, false, {
          price_per_pallet: +v("price_per_pallet"), quote_valid_until: v("quote_valid_until") || b.quote_valid_until || null,
          admin_note: null, quote_number: b.quote_number || "DRAFT"
        });
        const url = URL.createObjectURL(blob);
        if (win) win.location = url; else location.href = url;
      } catch (err) { win && win.close(); toast(errMsg(err), true); }
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    const b = bkData.find((x) => x.id === card.dataset.id);
    const status = btn.dataset.act;
    const val = (f) => { const el = $(`[data-f=${f}]`, card); return el ? el.value : undefined; };

    if (status === "quoted" && val("price_per_pallet") === "") { $("[data-f=price_per_pallet]", card).focus(); return toast("Enter the client price first.", true); }
    if (status !== b.status && CONFIRM[status] && !confirm(CONFIRM[status])) return;

    const update = { status };
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
    let number;
    if (!err && status === "quoted") {
      btn.textContent = "Creating PDF…";
      try { number = await makeQuotePdf(b.id, true); }
      catch (pdfErr) { err = new Error("The quotation was saved, but the PDF couldn't be created: " + errMsg(pdfErr) + " Click Update quotation to try again."); }
    }
    btn.disabled = false; btn.textContent = label;
    if (err) { loadBookings(); return toast(errMsg(err), true); }
    toast(status === "quoted" ? `Quotation ${number} ${b.status === "pending" ? "sent" : "updated"}` : "Saved");
    loadBookings(); loadStats();
  });
  $("#bk-filter").addEventListener("change", loadBookings);

  /* ---------------- Service requests (transportation, freight, customs) ---------------- */
  const SR_ACTIONS = {
    pending:   [["quoted", "Send quotation", "btn-primary"], ["rejected", "Reject request", "btn-danger"]],
    quoted:    [["quoted", "Update quotation", "btn-primary"], ["confirmed", "Mark as accepted", "btn-plain"], ["cancelled", "Withdraw quotation", "btn-danger"]],
    confirmed: [["confirmed", "Save", "btn-primary"], ["completed", "Mark completed", "btn-plain"], ["cancelled", "Cancel job", "btn-danger"]],
    completed: [["completed", "Save", "btn-primary"]],
    declined:  [["declined", "Save", "btn-plain"]],
    rejected:  [["rejected", "Save", "btn-plain"]],
    cancelled: [["cancelled", "Save", "btn-plain"]]
  };
  const SR_CONFIRM = {
    rejected: "Reject this request? The client will be told we can't offer it.",
    cancelled: "Cancel this? The client will no longer be able to accept the quotation.",
    confirmed: "Mark this quotation as accepted for the client?",
    completed: "Mark this job as completed?"
  };
  const docName = (path) => path.split("/").pop().replace(/^\d+-/, "");

  let srData = [];
  async function loadServices() {
    const box = $("#sr-list");
    let q = sb.from("service_requests").select("*, cost:service_costs(cost)").order("created_at", { ascending: false });
    if ($("#sr-service").value) q = q.eq("service", $("#sr-service").value);
    if ($("#sr-filter").value) q = q.eq("status", $("#sr-filter").value);
    const { data, error } = await q;
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    srData = data;
    if (!data.length) { box.innerHTML = `<div class="empty"><strong>Nothing here</strong><p>Requests from the Request a service page will show here.</p></div>`; return; }

    box.innerHTML = data.map((r) => {
      const cost = (Array.isArray(r.cost) ? r.cost[0] : r.cost)?.cost ?? "";
      const quoting = ["pending", "quoted"].includes(r.status);
      const facts = serviceFacts(r);
      return `
      <article class="row-card${r.status === "pending" ? " attention" : ""}" data-id="${esc(r.id)}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(r.ref)}${r.quote_number ? " · " + esc(r.quote_number) : ""} · requested ${date(r.created_at)}</span>
            <h3>${esc(SERVICES[r.service] || r.service)}</h3>
            <span class="muted">${esc(serviceLine(r))}</span>
          </div>
          <div class="actions">${bookingPill(r)}${r.client_id ? ` <span class="pill muted">has account</span>` : ""}</div>
        </div>
        <dl class="kv">
          <div><dt>Client</dt><dd>${contact({ full_name: r.name, company: r.company, email: r.email, phone: r.phone })}</dd></div>
          <div><dt>Contact client by</dt><dd>${r.contact_method
              ? `<strong>${esc(METHOD[r.contact_method])}</strong><br>${reach(r.contact_method, r.contact_method === "email" ? r.email : r.phone) || "<span class='muted'>Not given</span>"}`
              : "<span class='muted'>Not given</span>"}</dd></div>
          ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
          ${r.status === "quoted" ? `<div><dt>Quote valid until</dt><dd>${date(r.quote_valid_until)}</dd></div>` : ""}
        </dl>
        ${r.documents?.length ? `<ul class="files">${r.documents.map((d) => `<li><button type="button" class="linkbtn" data-sdoc="${esc(d)}">Open ${esc(docName(d))}</button></li>`).join("")}</ul>` : ""}
        ${r.notes ? `<p class="note">Client note: ${esc(r.notes)}</p>` : ""}
        <div class="inline-form">
          <label class="ctrl"><span class="label">Supplier cost <em>admin only</em></span><input data-f="cost" type="number" min="0" step="0.01" value="${cost}" placeholder="${esc(C.currency)} total"></label>
          <label class="ctrl"><span class="label">Client price</span><input data-f="client_price" type="number" min="0" step="0.01" value="${r.client_price ?? ""}" placeholder="${esc(C.currency)} total, excl. VAT"${quoting ? "" : " disabled"}></label>
          ${quoting ? `<label class="ctrl"><span class="label">Valid until</span><input data-f="quote_valid_until" type="date" min="${inDays(0)}" value="${r.quote_valid_until && r.quote_valid_until >= inDays(0) ? r.quote_valid_until : inDays(7)}"></label>` : ""}
        </div>
        ${quoting ? `<div class="inline-form"><label class="ctrl" style="flex:1 1 100%;max-width:none"><span class="label">Description on quotation <em>optional</em></span><input data-f="price_description" maxlength="300" value="${esc(r.price_description || "")}" placeholder="${esc(SERVICES[r.service] + ": " + serviceLine(r))}"></label></div>` : ""}
        <p class="muted" data-calc style="font-size:.9rem"></p>
        <div class="inline-form">
          ${(SR_ACTIONS[r.status] || []).map(([st, label, cls]) => `<button class="btn btn-sm ${cls}" data-act="${st}">${label}</button>`).join("")}
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-plain" data-preview>Preview PDF</button>
          ${r.quote_pdf ? `<button class="btn btn-sm btn-plain" data-pdf="${esc(r.quote_pdf)}">Download ${esc(r.quote_number || "quotation")}</button>` : ""}
        </div>
      </article>`;
    }).join("");
    $$("#sr-list [data-id]").forEach(srCalc);
  }

  function srCalc(card) {
    const n = (f) => { const el = $(`[data-f=${f}]`, card); return el && el.value !== "" ? +el.value : null; };
    const client = n("client_price"), cost = n("cost"), parts = [];
    if (client != null) parts.push(`Client price <strong>${money(client)}</strong>`);
    if (cost != null) parts.push(`Supplier cost ${money(cost)}`);
    if (client != null && cost != null) {
      const m = client - cost;
      parts.push(`Margin <strong style="color:var(${m < 0 ? "--bad" : "--ok"})">${money(m)}</strong>${client ? ` (${Math.round(m / client * 100)}%)` : ""}`);
    }
    $("[data-calc]", card).innerHTML = parts.length ? parts.join(" · ") + ` <span class="muted">(excl. VAT)</span>` : "Enter prices to see the margin.";
  }
  $("#sr-list").addEventListener("input", (e) => { const c = e.target.closest("[data-id]"); if (c) srCalc(c); });

  // Build the quotation PDF for a service request. save=true stores it, which emails it to the client.
  async function makeServicePdf(id, save, draft) {
    const { data: row, error } = await sb.from("service_requests").select("*").eq("id", id).single();
    if (error) throw error;
    const r = { ...row, ...(draft || {}) };
    const site = location.href.replace(/[^/]*$/, "");
    const bytes = buildQuotePdf({
      company: C, booking: r, client: { full_name: r.name, company: r.company, email: r.email, phone: r.phone },
      serviceName: SERVICES[r.service], summary: serviceLine(r), facts: serviceFacts(r),
      acceptUrl: `${site}service-quote.html?t=${r.access_token}`, siteUrl: site, logo: await loadQuoteLogo(C.logo)
    });
    const blob = new Blob([bytes], { type: "application/pdf" });
    if (!save) return blob;
    if (!row.quote_number) throw new Error("This quotation has no number yet. Make sure update-7-service-requests.sql was run in Supabase.");
    const path = `services/${row.id}/${row.quote_number}-${Date.now()}.pdf`;
    const up = await sb.storage.from("quotations").upload(path, blob, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const u2 = await sb.from("service_requests").update({ quote_pdf: path }).eq("id", row.id);
    if (u2.error) throw u2.error;
    return row.quote_number;
  }

  $("#sr-list").addEventListener("click", async (e) => {
    const doc = e.target.closest("[data-sdoc]");
    if (doc) {
      const win = window.open("", "_blank");
      const { data, error } = await sb.storage.from("service-docs").createSignedUrl(doc.dataset.sdoc, 300);
      if (error) { win && win.close(); return toast(errMsg(error), true); }
      if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
      return;
    }
    const pdf = e.target.closest("[data-pdf]");
    if (pdf) return openQuotePdf(pdf.dataset.pdf);
    const card = e.target.closest("[data-id]");
    if (!card) return;
    const r = srData.find((x) => x.id === card.dataset.id);
    const val = (f) => { const el = $(`[data-f=${f}]`, card); return el ? el.value : undefined; };

    if (e.target.closest("[data-preview]")) {
      if (!val("client_price")) return toast("Enter the client price to preview the PDF.", true);
      const win = window.open("", "_blank");
      try {
        const blob = await makeServicePdf(r.id, false, {
          client_price: +val("client_price"), quote_valid_until: val("quote_valid_until") || r.quote_valid_until || null,
          price_description: val("price_description") !== undefined ? (val("price_description").trim() || null) : r.price_description,
          quote_number: r.quote_number || "DRAFT"
        });
        const url = URL.createObjectURL(blob);
        if (win) win.location = url; else location.href = url;
      } catch (err) { win && win.close(); toast(errMsg(err), true); }
      return;
    }

    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const status = btn.dataset.act;
    if (status === "quoted" && !val("client_price")) { $("[data-f=client_price]", card).focus(); return toast("Enter the client price first.", true); }
    if (status !== r.status && SR_CONFIRM[status] && !confirm(SR_CONFIRM[status])) return;

    const update = { status };
    if (val("client_price") !== undefined && !$("[data-f=client_price]", card).disabled)
      update.client_price = val("client_price") === "" ? null : +val("client_price");
    if (val("quote_valid_until") !== undefined) update.quote_valid_until = val("quote_valid_until") || null;
    if (val("price_description") !== undefined) update.price_description = val("price_description").trim() || null;

    btn.disabled = true; const label = btn.textContent; btn.textContent = "Saving…";
    let { error: err } = await sb.from("service_requests").update(update).eq("id", r.id);
    if (!err) {
      const cost = val("cost"), old = (Array.isArray(r.cost) ? r.cost[0] : r.cost)?.cost ?? "";
      if (String(cost) !== String(old)) {
        const c = await sb.from("service_costs").upsert({ request_id: r.id, cost: cost === "" ? null : +cost, updated_at: new Date().toISOString() });
        err = c.error;
      }
    }
    let number;
    if (!err && status === "quoted") {
      btn.textContent = "Creating PDF…";
      try { number = await makeServicePdf(r.id, true); }
      catch (pdfErr) { err = new Error("The quotation was saved, but the PDF couldn't be created: " + errMsg(pdfErr) + " Click Update quotation to try again."); }
    }
    btn.disabled = false; btn.textContent = label;
    if (err) { loadServices(); return toast(errMsg(err), true); }
    toast(status === "quoted" ? `Quotation ${number} ${r.status === "pending" ? "sent" : "updated"}` : "Saved");
    loadServices(); loadStats();
  });
  $("#sr-service").addEventListener("change", loadServices);
  $("#sr-filter").addEventListener("change", loadServices);

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
  const loaders = { warehouses: loadWarehouses, bookings: loadBookings, services: loadServices, quotes: loadQuotes, users: loadUsers };
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
