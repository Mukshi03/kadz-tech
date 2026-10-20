/* Client dashboard: quotation requests, quotations and bookings */
(async function () {
  const { sb, C, TYPES, esc, fmt, money, date, $, pill, bookingPill, quoteExpired, toast, errMsg,
          requireRole, setupTabs, setupProfileForm, loadUnread, threadButton, bindThreadButtons, openQuotePdf } = window.KZ;
  const u = await requireRole(null);
  if (!u) return;
  $("#who").textContent = u.profile?.full_name || u.session.user.email;
  setupTabs();
  setupProfileForm(u.profile);

  const box = $("#bookings");
  let rows = [];
  bindThreadButtons(box, { id: u.session.user.id, role: u.profile?.role });

  async function load() {
    const { data, error } = await sb.from("bookings")
      .select("*")
      .eq("client_id", u.session.user.id)
      .order("created_at", { ascending: false });
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    rows = data;
    const unread = await loadUnread();

    // Warehouse names come from the public listing
    const ids = [...new Set(data.map((b) => b.warehouse_id))];
    const whs = {};
    if (ids.length) {
      const { data: w } = await sb.from("public_warehouses").select("id, name, city, district").in("id", ids);
      (w || []).forEach((x) => (whs[x.id] = x));
    }

    if (!data.length) {
      box.innerHTML = `<div class="empty"><strong>No requests yet</strong>
        <p>Find a warehouse and request a quotation. Your quotations and bookings will show here.</p>
        <a class="btn btn-primary" href="warehouses.html">Find a warehouse</a></div>`;
      return;
    }

    // Quotations waiting for an answer go first
    const order = { quoted: 0, pending: 1, confirmed: 2 };
    data.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

    box.innerHTML = data.map((b) => {
      const w = whs[b.warehouse_id];
      const expired = quoteExpired(b);
      const waiting = b.status === "quoted" && !expired;
      const priced = ["quoted", "confirmed", "completed"].includes(b.status) && b.price_per_pallet != null;
      return `
      <article class="row-card${waiting ? " attention" : ""}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(b.quote_number || b.ref)} · requested ${date(b.created_at)}</span>
            <h3>${w ? `<a href="warehouse.html?id=${esc(w.id)}" style="text-decoration:none">${esc(w.name)}</a>` : "Warehouse"}</h3>
            ${w ? `<span class="muted">${esc([w.district, w.city].filter(Boolean).join(", "))}</span>` : ""}
          </div>
          <div class="actions">${bookingPill(b)} ${["confirmed", "completed"].includes(b.status) ? pill(b.payment_status) : ""}</div>
        </div>
        <dl class="kv">
          <div><dt>Storage</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)}</dd></div>
          <div><dt>Pallets</dt><dd>${fmt(b.pallets)}</dd></div>
          <div><dt>Start</dt><dd>${date(b.start_date)}</dd></div>
          <div><dt>Duration</dt><dd>${b.months} month${b.months > 1 ? "s" : ""}</dd></div>
          ${priced ? `
          <div><dt>Price</dt><dd>${money(b.price_per_pallet)} / pallet / month</dd></div>
          <div><dt>Total</dt><dd><strong>${money(b.total_amount)}</strong> <span class="muted">excl. VAT</span></dd></div>` : ""}
          ${b.status === "quoted" && b.quote_valid_until ? `<div><dt>Valid until</dt><dd>${date(b.quote_valid_until)}</dd></div>` : ""}
        </dl>
        ${b.status === "pending" ? `<p class="note">We're preparing your quotation. You'll see the price here, and we'll email you when it's ready.</p>` : ""}
        ${b.admin_note ? `<p class="note">Message from ${esc(C.company)}: ${esc(b.admin_note)}</p>` : ""}
        ${expired ? `<p class="note">This quotation has expired. Request a new one from the warehouse page.</p>` : ""}
        ${waiting ? `<div class="actions">
            <button class="btn btn-primary" data-reply="confirmed" data-id="${esc(b.id)}">Accept quotation</button>
            <button class="btn btn-plain" data-reply="declined" data-id="${esc(b.id)}">Decline</button>
          </div>` : ""}
        <div class="actions">
          ${b.quote_pdf && priced ? `<button class="btn btn-sm btn-plain" data-pdf="${esc(b.quote_pdf)}">Download quotation${b.quote_number ? " " + esc(b.quote_number) : ""} (PDF)</button>` : ""}
          ${threadButton(b.id, "client", "Messages", unread[`${b.id}:client`])}
          ${b.status === "pending" ? `<button class="btn btn-sm btn-danger" data-reply="cancelled" data-id="${esc(b.id)}">Cancel request</button>` : ""}
        </div>
        <div data-chat></div>
      </article>`;
    }).join("");
  }

  const ASK = {
    confirmed: "Accept this quotation? The space will be reserved and we'll send you an invoice.",
    declined: "Decline this quotation?",
    cancelled: "Cancel this quotation request?"
  };
  const DONE = { confirmed: "Quotation accepted. Your booking is confirmed.", declined: "Quotation declined", cancelled: "Request cancelled" };

  box.addEventListener("click", async (e) => {
    const pdf = e.target.closest("[data-pdf]");
    if (pdf) return openQuotePdf(pdf.dataset.pdf);
    const btn = e.target.closest("[data-reply]");
    if (!btn) return;
    const reply = btn.dataset.reply;
    if (!confirm(ASK[reply])) return;
    btn.disabled = true;
    const { error } = await sb.from("bookings").update({ status: reply }).eq("id", btn.dataset.id);
    if (error) { btn.disabled = false; return toast(errMsg(error), true); }
    toast(DONE[reply]);
    load();
  });

  load();
})();
