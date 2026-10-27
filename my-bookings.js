/* Client dashboard: quotation requests, quotations and bookings */
(async function () {
  const { sb, C, TYPES, esc, fmt, money, date, $, pill, bookingPill, quoteExpired, toast, errMsg,
          requireRole, setupTabs, setupProfileForm, openQuotePdf, SERVICES, serviceFacts, serviceLine } = window.KZ;
  const u = await requireRole(null);
  if (!u) return;
  $("#who").textContent = u.profile?.full_name || u.session.user.email;
  setupTabs((name) => { if (name === "moves") loadMoves(); });
  setupProfileForm(u.profile);

  const box = $("#bookings");
  let rows = [];

  async function load() {
    const { data, error } = await sb.from("bookings")
      .select("*")
      .eq("client_id", u.session.user.id)
      .order("created_at", { ascending: false });
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    rows = data;
    const waitingN = data.filter((b) => b.status === "quoted" && !quoteExpired(b)).length;
    $("#c-bk").textContent = waitingN; $("#c-bk").hidden = !waitingN;

    // Warehouse names come from the public listing
    const ids = [...new Set(data.map((b) => b.warehouse_id))];
    const whs = {};
    if (ids.length) {
      const { data: w } = await sb.from("public_warehouses").select("id, ref, city, district").in("id", ids);
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
            <h3>${w ? `<a href="warehouse.html?id=${esc(w.id)}" style="text-decoration:none">${esc(w.ref)}</a>` : "Warehouse"}</h3>
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
        ${expired ? `<p class="note">This quotation has expired. Request a new one from the warehouse page.</p>` : ""}
        ${waiting ? `<div class="actions">
            <button class="btn btn-primary" data-reply="confirmed" data-id="${esc(b.id)}">Accept quotation</button>
            <button class="btn btn-plain" data-reply="declined" data-id="${esc(b.id)}">Decline</button>
          </div>` : ""}
        <div class="actions">
          ${b.quote_pdf && priced ? `<button class="btn btn-sm btn-plain" data-pdf="${esc(b.quote_pdf)}">Download quotation${b.quote_number ? " " + esc(b.quote_number) : ""} (PDF)</button>` : ""}
          ${b.status === "pending" ? `<button class="btn btn-sm btn-danger" data-reply="cancelled" data-id="${esc(b.id)}">Cancel request</button>` : ""}
        </div>
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

  /* ---------- Transportation, freight and customs requests ---------- */
  const sbox = $("#services");
  let srows = [];
  async function loadServices() {
    const { data, error } = await sb.from("service_requests").select("*")
      .eq("client_id", u.session.user.id).order("created_at", { ascending: false });
    if (error) { sbox.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    srows = data;
    const waitingN = data.filter((r) => r.status === "quoted" && !quoteExpired(r)).length;
    $("#c-sr").textContent = waitingN; $("#c-sr").hidden = !waitingN;
    if (!data.length) {
      sbox.innerHTML = `<div class="empty"><strong>No requests yet</strong>
        <p>Need a truck, freight forwarding or customs clearance? Send a request and your quotations will show here.</p>
        <a class="btn btn-primary" href="services.html#transportation">Request a service</a></div>`;
      return;
    }
    const order = { quoted: 0, pending: 1, confirmed: 2 };
    data.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
    sbox.innerHTML = data.map((r) => {
      const expired = quoteExpired(r);
      const waiting = r.status === "quoted" && !expired;
      const priced = ["quoted", "confirmed", "completed"].includes(r.status) && r.client_price != null;
      const vat = Number(r.vat_rate ?? 15);
      return `
      <article class="row-card${waiting ? " attention" : ""}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(r.quote_number || r.ref)} · requested ${date(r.created_at)}</span>
            <h3>${esc(SERVICES[r.service] || r.service)}</h3>
            <span class="muted">${esc(serviceLine(r))}</span>
          </div>
          <div class="actions">${bookingPill(r)}</div>
        </div>
        <dl class="kv">
          ${serviceFacts(r).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
          ${priced ? `
          <div><dt>Price</dt><dd><strong>${money(r.client_price)}</strong> <span class="muted">excl. VAT</span></dd></div>
          <div><dt>Total incl. VAT ${vat}%</dt><dd>${money(Math.round(r.client_price * (100 + vat)) / 100)}</dd></div>` : ""}
          ${r.status === "quoted" && r.quote_valid_until ? `<div><dt>Valid until</dt><dd>${date(r.quote_valid_until)}</dd></div>` : ""}
        </dl>
        ${r.status === "pending" ? `<p class="note">We're preparing your quotation. We'll email it to ${esc(r.email)} and it will show here.</p>` : ""}
        ${expired ? `<p class="note">This quotation has expired. <a href="request-${esc(r.service)}.html">Send a new request</a>.</p>` : ""}
        ${waiting ? `<div class="actions">
            <button class="btn btn-primary" data-sreply="confirmed" data-id="${esc(r.id)}">Accept quotation</button>
            <button class="btn btn-plain" data-sreply="declined" data-id="${esc(r.id)}">Decline</button>
          </div>` : ""}
        ${r.quote_pdf && priced ? `<div class="actions"><button class="btn btn-sm btn-plain" data-pdf="${esc(r.quote_pdf)}">Download quotation ${esc(r.quote_number || "")} (PDF)</button></div>` : ""}
      </article>`;
    }).join("");
  }
  sbox.addEventListener("click", async (e) => {
    const pdf = e.target.closest("[data-pdf]");
    if (pdf) return openQuotePdf(pdf.dataset.pdf);
    const btn = e.target.closest("[data-sreply]");
    if (!btn) return;
    const reply = btn.dataset.sreply, r = srows.find((x) => x.id === btn.dataset.id);
    if (!confirm(reply === "confirmed" ? "Accept this quotation? We'll contact you to arrange the details." : "Decline this quotation?")) return;
    btn.disabled = true;
    const { error } = await sb.rpc("respond_service_quote", { p_token: r.access_token, p_answer: reply });
    if (error) { btn.disabled = false; return toast(errMsg(error), true); }
    toast(reply === "confirmed" ? "Quotation accepted. We'll be in touch to arrange it." : "Quotation declined");
    loadServices();
  });

  load();
  loadServices();

  /* ---------- Inbound / outbound requests ---------- */
  const mbox = $("#moves");
  const { moveCard } = window.KZ;
  async function loadMoves() {
    const [bk, mv] = await Promise.all([
      sb.from("bookings").select("id, ref, warehouse_id, storage_type, pallets, start_date, months, status")
        .eq("client_id", u.session.user.id).in("status", ["confirmed", "completed"]).order("start_date", { ascending: false }),
      sb.from("stock_movements").select("*").eq("client_id", u.session.user.id).order("created_at", { ascending: false })
    ]);
    if (bk.error || mv.error) { mbox.innerHTML = `<div class="notice warn">${esc(errMsg(bk.error || mv.error))}</div>`; return; }
    const moves = mv.data || [];
    const open = moves.filter((m) => ["requested", "sent"].includes(m.status)).length;
    $("#c-mv").textContent = open; $("#c-mv").hidden = !open;
    if (!bk.data.length) {
      mbox.innerHTML = `<div class="empty"><strong>No confirmed bookings yet</strong><p>Once a storage booking is confirmed, you can request inbound and outbound here.</p></div>`;
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    mbox.innerHTML = bk.data.map((b) => {
      const mine = moves.filter((m) => m.booking_id === b.id);
      const done = (d) => mine.filter((m) => m.direction === d && m.status === "completed").reduce((s, m) => s + (m.actual_pallets || 0), 0);
      const inStock = done("inbound") - done("outbound");
      const live = b.status === "confirmed";
      return `
      <section class="mv-booking" data-bk="${esc(b.id)}">
        <div class="mv-stock">
          <span><span class="label">${esc(b.ref)}</span><br>${esc(TYPES[b.storage_type]?.name || b.storage_type)} · ${fmt(b.pallets)} pallets booked from ${date(b.start_date)}</span>
          <span style="margin-left:auto">In the warehouse now: <b class="num">${fmt(inStock)}</b> pallets</span>
          ${live ? `<span class="actions"><button class="btn btn-sm btn-primary" data-new-mv="inbound">↓ Request inbound</button>
            <button class="btn btn-sm btn-plain" data-new-mv="outbound" ${inStock > 0 ? "" : "disabled title='Nothing in the warehouse yet'"}>↑ Request outbound</button></span>` : ""}
        </div>
        <form class="mv-form" hidden novalidate>
          <h3 class="mv-form-title"></h3>
          <div class="form-row">
            <label class="ctrl"><span class="mv-date-label">Arrival date</span><input name="expected_date" type="date" min="${today}" required></label>
            <label class="ctrl"><span>Pallets</span><input name="pallets" type="number" min="1" required inputmode="numeric"></label>
          </div>
          <label class="ctrl"><span>Goods <em>what is in the pallets</em></span><input name="goods" required maxlength="200" placeholder="e.g. Frozen chicken, 20 kg cartons"></label>
          <div class="form-row">
            <label class="ctrl"><span>Truck plate <em>optional</em></span><input name="vehicle_plate" maxlength="40"></label>
            <label class="ctrl"><span>Driver name <em>optional</em></span><input name="driver_name" maxlength="80"></label>
            <label class="ctrl"><span>Driver phone <em>optional</em></span><input name="driver_phone" type="tel" maxlength="40"></label>
          </div>
          <label class="ctrl"><span>Notes <em>optional</em></span><textarea name="notes" maxlength="1000" placeholder="Arrival time, handling instructions"></textarea></label>
          <div class="actions"><button class="btn btn-primary" type="submit">Send request</button><button class="btn btn-plain" type="button" data-cancel-mv>Cancel</button></div>
        </form>
        <div class="rows">${mine.map((m) => moveCard(m, {
          actions: m.status === "requested" ? `<button class="btn btn-sm btn-danger" data-cancel-req="${esc(m.id)}">Cancel request</button>` : ""
        })).join("") || `<p class="muted">No inbound or outbound requests for this booking yet.</p>`}</div>
      </section>`;
    }).join("");
    mbox._stock = Object.fromEntries(bk.data.map((b) => {
      const mine = moves.filter((m) => m.booking_id === b.id && m.status === "completed");
      return [b.id, mine.reduce((s, m) => s + (m.direction === "inbound" ? 1 : -1) * (m.actual_pallets || 0), 0)];
    }));
  }

  mbox.addEventListener("click", async (e) => {
    const sec = e.target.closest("[data-bk]");
    const nw = e.target.closest("[data-new-mv]");
    if (nw && sec) {
      const f = $(".mv-form", sec), out = nw.dataset.newMv === "outbound";
      f.reset(); f.hidden = false; f.dataset.dir = nw.dataset.newMv;
      $(".mv-form-title", f).textContent = out ? "Request outbound (goods leaving)" : "Request inbound (goods arriving)";
      $(".mv-date-label", f).textContent = out ? "Collection date" : "Arrival date";
      f.elements.pallets.max = out ? mbox._stock[sec.dataset.bk] : "";
      f.elements.expected_date.focus();
      return;
    }
    if (e.target.closest("[data-cancel-mv]")) { e.target.closest("form").hidden = true; return; }
    const c = e.target.closest("[data-cancel-req]");
    if (c) {
      if (!confirm("Cancel this request?")) return;
      const { error } = await sb.from("stock_movements").update({ status: "cancelled" }).eq("id", c.dataset.cancelReq);
      if (error) return toast(errMsg(error), true);
      toast("Request cancelled"); loadMoves();
    }
  });
  mbox.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, sec = f.closest("[data-bk]");
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "Sending…";
    const { error } = await sb.from("stock_movements").insert({
      booking_id: sec.dataset.bk, direction: f.dataset.dir, expected_date: v.expected_date, pallets: +v.pallets,
      goods: v.goods.trim(), vehicle_plate: v.vehicle_plate.trim() || null, driver_name: v.driver_name.trim() || null,
      driver_phone: v.driver_phone.trim() || null, notes: v.notes.trim() || null
    });
    btn.disabled = false; btn.textContent = "Send request";
    if (error) return toast(errMsg(error), true);
    toast("Request sent. We'll send it to the warehouse team.");
    loadMoves();
  });
  loadMoves();
})();
