/* Client dashboard: my bookings */
(async function () {
  const { sb, TYPES, esc, fmt, money, date, $, pill, toast, errMsg, requireRole, setupTabs, setupProfileForm } = window.KZ;
  const u = await requireRole(null);
  if (!u) return;
  $("#who").textContent = u.profile?.full_name || u.session.user.email;
  setupTabs();
  setupProfileForm(u.profile);

  const box = $("#bookings");

  async function load() {
    const { data, error } = await sb.from("bookings")
      .select("*, warehouse:warehouses(id, name, city, district)")
      .eq("client_id", u.session.user.id)
      .order("created_at", { ascending: false });
    if (error) { box.innerHTML = `<div class="notice warn">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) {
      box.innerHTML = `<div class="empty"><strong>No bookings yet</strong>
        <p>Find a warehouse and request the space you need. Your requests will show here.</p>
        <a class="btn btn-primary" href="warehouses.html">Find a warehouse</a></div>`;
      return;
    }
    box.innerHTML = data.map((b) => `
      <article class="row-card${b.status === "pending" ? " attention" : ""}">
        <div class="row-top">
          <div style="display:grid;gap:.3rem;min-width:0">
            <span class="label">${esc(b.ref)} · requested ${date(b.created_at)}</span>
            <h3>${b.warehouse ? `<a href="warehouse.html?id=${esc(b.warehouse.id)}" style="text-decoration:none">${esc(b.warehouse.name)}</a>` : "Warehouse no longer listed"}</h3>
            ${b.warehouse ? `<span class="muted">${esc([b.warehouse.district, b.warehouse.city].filter(Boolean).join(", "))}</span>` : ""}
          </div>
          <div class="actions">${pill(b.status)} ${pill(b.payment_status)}</div>
        </div>
        <dl class="kv">
          <div><dt>Storage</dt><dd>${esc(TYPES[b.storage_type]?.name || b.storage_type)}</dd></div>
          <div><dt>Pallets</dt><dd>${fmt(b.pallets)}</dd></div>
          <div><dt>Start</dt><dd>${date(b.start_date)}</dd></div>
          <div><dt>Duration</dt><dd>${b.months} month${b.months > 1 ? "s" : ""}</dd></div>
          <div><dt>Rate</dt><dd>${b.price_per_pallet != null ? money(b.price_per_pallet) : "On request"}</dd></div>
          <div><dt>Total</dt><dd>${b.total_amount != null ? money(b.total_amount) : "On request"}</dd></div>
        </dl>
        ${b.admin_note ? `<p class="note">Message from ${esc(window.KZ.C.company)}: ${esc(b.admin_note)}</p>` : ""}
        ${b.status === "pending" ? `<div class="actions"><button class="btn btn-sm btn-danger" data-cancel="${esc(b.id)}">Cancel request</button></div>` : ""}
      </article>`).join("");
  }

  box.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (!btn) return;
    if (!confirm("Cancel this booking request?")) return;
    btn.disabled = true;
    const { error } = await sb.from("bookings").update({ status: "cancelled" }).eq("id", btn.dataset.cancel);
    if (error) { btn.disabled = false; return toast(errMsg(error), true); }
    toast("Request cancelled");
    load();
  });

  load();
})();
