/* Private quotation page for transportation / freight / customs requests.
   Opened from the link in the quotation email: service-quote.html?t=<private code>.
   No login needed: the code itself is the key. */
(async function () {
  const { sb, C, esc, money, date, $, bookingPill, quoteExpired, toast, errMsg, showSetupNotice,
          SERVICES, serviceFacts, serviceLine, buildQuotePdf, loadQuoteLogo } = window.KZ;
  const body = $("#sq-body");
  const token = new URLSearchParams(location.search).get("t") || "";
  const bad = (msg) => {
    $("#sq-number").textContent = "Not found";
    body.innerHTML = `<div class="empty"><strong>${esc(msg)}</strong>
      <p>Check that you opened the full link from your email, or contact us for help.</p>
      <a class="btn btn-primary" href="services.html#transportation">Our services</a></div>`;
  };
  if (!sb) { showSetupNotice($("main")); return bad("The database isn't connected yet."); }
  if (!/^[0-9a-f-]{36}$/i.test(token)) return bad("This link isn't complete.");

  let r;
  async function load() {
    const { data, error } = await sb.rpc("get_service_quote", { p_token: token });
    if (error) return bad(errMsg(error));
    if (!data) return bad("We couldn't find this quotation.");
    r = data;
    render();
  }

  function render() {
    const name = SERVICES[r.service] || r.service;
    document.title = `${r.quote_number || r.ref} | ${C.company}`;
    $("#sq-number").textContent = r.quote_number || r.ref;
    $("#sq-title").textContent = name;
    $("#sq-line").textContent = serviceLine(r);
    const expired = quoteExpired(r);
    const waiting = r.status === "quoted" && !expired;
    const priced = ["quoted", "confirmed", "completed", "declined"].includes(r.status) && r.client_price != null;
    const vat = Number(r.vat_rate ?? 15), vatAmt = Math.round(r.client_price * vat) / 100;
    const msg = {
      pending: "We're preparing your quotation. We'll email it to you when it's ready.",
      confirmed: "You accepted this quotation. Our team will contact you to arrange the details.",
      completed: "This job is completed. Thank you for working with us.",
      declined: "You declined this quotation. Need something different? Send us a new request.",
      rejected: "Sorry, we can't offer this service for your request. Feel free to send a new request.",
      cancelled: "This quotation was withdrawn. Contact us or send a new request."
    }[r.status];

    body.innerHTML = `
      <div class="req-layout">
        <article class="row-card${waiting ? " attention" : ""}" style="min-width:0">
          <div class="row-top">
            <div style="display:grid;gap:.3rem;min-width:0">
              <span class="label">Request ${esc(r.ref)} · sent ${date(r.created_at)}</span>
              <h3>${esc([r.name, r.company].filter(Boolean).join(" · "))}</h3>
            </div>
            <div class="actions">${bookingPill(r)}</div>
          </div>
          <dl class="kv">${serviceFacts(r).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          ${r.price_description ? `<p class="note">${esc(r.price_description)}</p>` : ""}
          ${expired ? `<p class="notice warn">This quotation expired on ${date(r.quote_valid_until)}. <a href="request-${esc(r.service)}.html">Send a new request</a> and we'll quote again.</p>` : ""}
          ${msg && !expired ? `<p class="notice${["rejected", "cancelled", "declined"].includes(r.status) ? " warn" : ""}">${esc(msg)}</p>` : ""}
          <div class="form-status" hidden role="status"></div>
        </article>

        ${priced ? `
        <aside class="estimate quote-total">
          <span class="label">Quotation total</span>
          <div class="row"><span>Price</span><strong>${money(r.client_price)}</strong></div>
          <div class="row"><span>VAT ${vat}%</span><strong>${money(vatAmt)}</strong></div>
          <div><span class="label">Total</span><div class="total num">${money(Math.round((Number(r.client_price) + vatAmt) * 100) / 100)}</div></div>
          ${r.status === "quoted" && r.quote_valid_until ? `<small>Valid until ${date(r.quote_valid_until)}</small>` : ""}
          ${waiting ? `<div class="actions">
              <button class="btn btn-primary" data-reply="confirmed">Accept quotation</button>
              <button class="btn btn-plain" data-reply="declined">Decline</button>
            </div>` : ""}
          <button class="btn btn-sm btn-plain" data-pdf>Download PDF</button>
        </aside>` : ""}
      </div>`;
  }

  body.addEventListener("click", async (e) => {
    if (e.target.closest("[data-pdf]")) {
      try {
        const site = location.href.replace(/[^/]*$/, "");
        const bytes = buildQuotePdf({
          company: C, booking: r, client: { full_name: r.name, company: r.company, email: r.email, phone: r.phone },
          serviceName: SERVICES[r.service], summary: serviceLine(r), facts: serviceFacts(r),
          acceptUrl: `${site}service-quote.html?t=${token}`, siteUrl: site, logo: await loadQuoteLogo(C.logo)
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        a.download = `${r.quote_number || r.ref}.pdf`;
        document.body.append(a); a.click(); a.remove();
      } catch (err) { toast(errMsg(err), true); }
      return;
    }
    const btn = e.target.closest("[data-reply]");
    if (!btn) return;
    const reply = btn.dataset.reply;
    if (!confirm(reply === "confirmed" ? "Accept this quotation? We'll contact you to arrange the details." : "Decline this quotation?")) return;
    btn.disabled = true;
    const { error } = await sb.rpc("respond_service_quote", { p_token: token, p_answer: reply });
    if (error) { btn.disabled = false; return toast(errMsg(error), true); }
    toast(reply === "confirmed" ? "Quotation accepted. Thank you!" : "Quotation declined");
    load();
  });

  load();
})();
