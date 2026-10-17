/* KADZ Tech — shared site script */
(function () {
  const C = window.KADZ || {};
  const page = document.body.dataset.page;

  const TYPES = {
    dry:     { name: "Dry",     range: "Uncontrolled" },
    ambient: { name: "Ambient", range: "15–25 °C" },
    chilled: { name: "Chilled", range: "2–8 °C" },
    frozen:  { name: "Frozen",  range: "−18 °C and below" }
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const $ = (sel, root = document) => root.querySelector(sel);

  /* ---------- Header ---------- */
  const navItems = [
    ["index.html", "Home", "home"],
    ["warehouses.html", "Find a warehouse", "warehouses"],
    ["services.html", "Services", "services"],
    ["partners.html", "List your warehouse", "partners"]
  ];
  const initial = (C.company || "K").trim().charAt(0).toUpperCase();
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="index.html" aria-label="${esc(C.company)} home">
        <span class="brand-mark">${esc(initial)}</span>
        <span class="brand-name">${esc(C.company)}</span>
      </a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav class="nav" id="site-nav">
        ${navItems.map(([href, label, key]) =>
          `<a href="${href}"${key === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        <a class="btn btn-primary" href="quote.html">Get a quote</a>
      </nav>
    </div>`;
  document.body.prepend(header);
  const toggle = $(".nav-toggle", header), nav = $(".nav", header);
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });

  /* ---------- Footer ---------- */
  const ct = C.contact || {};
  const contactLines = [
    ct.phone && `<li><a href="tel:${esc(ct.phone.replace(/\s/g, ""))}">${esc(ct.phone)}</a></li>`,
    ct.email && `<li><a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></li>`,
    ct.address && `<li>${esc(ct.address)}</li>`
  ].filter(Boolean).join("");
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <a class="brand" href="index.html"><span class="brand-mark">${esc(initial)}</span><span class="brand-name">${esc(C.company)}</span></a>
          ${C.tagline ? `<p style="margin-top:.8rem;opacity:.75;max-width:40ch">${esc(C.tagline)}</p>` : ""}
        </div>
        <div>
          <h4>Platform</h4>
          <ul>
            <li><a href="warehouses.html">Find a warehouse</a></li>
            <li><a href="services.html">Services</a></li>
            <li><a href="quote.html">Price estimator</a></li>
            <li><a href="partners.html">List your warehouse</a></li>
          </ul>
        </div>
        ${contactLines ? `<div><h4>Contact</h4><ul>${contactLines}</ul></div>` : ""}
      </div>
      <div class="foot-bottom">© ${new Date().getFullYear()} ${esc(C.company)}. All rights reserved.</div>
    </div>`;
  document.body.append(footer);

  /* ---------- Shared: fill city & type selects ---------- */
  document.querySelectorAll("select[data-cities]").forEach((sel) => {
    (C.cities || []).forEach((c) => sel.add(new Option(c, c)));
  });
  document.querySelectorAll("select[data-types]").forEach((sel) => {
    Object.entries(TYPES).forEach(([k, t]) => sel.add(new Option(`${t.name} (${t.range})`, k)));
  });

  /* ---------- Shared: form submission ---------- */
  async function submitForm(form, kind) {
    const status = $(".form-status", form);
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll("fieldset[data-name]").forEach((fs) => {
      data[fs.dataset.name] = [...fs.querySelectorAll("input:checked")].map((i) => i.value);
    });
    data.formType = kind;
    data.submittedAt = new Date().toISOString();

    if (!C.formEndpoint) {
      status.className = "form-status notice warn";
      status.textContent = "This form isn't connected yet. Set formEndpoint in assets/config.js to start receiving submissions.";
      console.info("[KADZ] Form data (not sent):", data);
      status.hidden = false;
      return;
    }
    const btn = $("button[type=submit]", form);
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const res = await fetch(C.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      status.className = "form-status notice";
      status.textContent = "Thanks. Your request has been sent and our team will contact you within one business day.";
    } catch (e) {
      status.className = "form-status notice warn";
      status.textContent = "We couldn't send your request. Check your connection and try again.";
    } finally {
      status.hidden = false;
      btn.disabled = false; btn.textContent = btn.dataset.label;
    }
  }
  document.querySelectorAll("form[data-kind]").forEach((form) => {
    const btn = $("button[type=submit]", form);
    if (btn) btn.dataset.label = btn.textContent;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      // require at least one checkbox in required fieldsets
      let ok = true;
      form.querySelectorAll("fieldset[data-required]").forEach((fs) => {
        const err = $(".err", fs);
        const any = fs.querySelector("input:checked");
        if (err) err.hidden = !!any;
        if (!any) ok = false;
      });
      if (!ok || !form.reportValidity()) return;
      submitForm(form, form.dataset.kind);
    });
  });

  /* ---------- Home: hero search ---------- */
  if (page === "home") {
    $("#hero-search").addEventListener("submit", (e) => {
      e.preventDefault();
      const p = new URLSearchParams();
      const city = $("#hs-city").value, type = $("#hs-type").value, pal = $("#hs-pallets").value;
      if (city) p.set("city", city);
      if (type) p.set("type", type);
      if (pal) p.set("pallets", pal);
      location.href = "warehouses.html" + (p.toString() ? "?" + p : "");
    });
  }

  /* ---------- Warehouses: search & listings ---------- */
  if (page === "warehouses") {
    const list = $("#listings"), count = $("#result-count");
    const fCity = $("#f-city"), fType = $("#f-type"), fPal = $("#f-pallets"), fSort = $("#f-sort");
    const q = new URLSearchParams(location.search);
    if (q.get("city")) fCity.value = q.get("city");
    if (q.get("type")) fType.value = q.get("type");
    if (q.get("pallets")) fPal.value = q.get("pallets");

    function render() {
      const all = C.warehouses || [];
      if (!all.length) {
        count.textContent = "0 warehouses";
        list.innerHTML = `
          <div class="empty">
            <strong>No warehouses listed yet</strong>
            <p>Warehouses appear here once they're added. Own a facility? List it and reach businesses looking for space.</p>
            <a class="btn btn-primary" href="partners.html">List your warehouse</a>
          </div>`;
        return;
      }
      const minPal = Number(fPal.value) || 0;
      let rows = all.filter((w) =>
        (!fCity.value || w.city === fCity.value) &&
        (!fType.value || (w.types || []).includes(fType.value)) &&
        (Number(w.palletsAvailable) || 0) >= minPal);
      if (fSort.value === "pallets") rows.sort((a, b) => b.palletsAvailable - a.palletsAvailable);
      if (fSort.value === "area") rows.sort((a, b) => b.areaSqm - a.areaSqm);
      count.textContent = `${rows.length} of ${all.length} warehouse${all.length === 1 ? "" : "s"}`;
      if (!rows.length) {
        list.innerHTML = `<div class="empty"><strong>No matches</strong><p>Try another city or storage type, or lower the pallet count.</p></div>`;
        return;
      }
      list.innerHTML = rows.map((w) => `
        <article class="listing">
          <div>
            <h3>${esc(w.name)}</h3>
            <p class="meta">${esc([w.district, w.city].filter(Boolean).join(", "))}${w.areaSqm ? ` · <span class="num">${fmt(w.areaSqm)}</span> m²` : ""}</p>
            <div class="chips">${(w.types || []).map((t) => `<span class="chip ${esc(t)}">${esc(TYPES[t]?.name || t)}</span>`).join("")}</div>
            ${w.features?.length ? `<p class="features">${w.features.map(esc).join(" · ")}</p>` : ""}
          </div>
          <div class="side">
            <div><div class="big num">${fmt(w.palletsAvailable || 0)}</div><span class="label">pallets free</span></div>
            <a class="btn btn-primary" href="quote.html?warehouse=${encodeURIComponent(w.name)}">Request space</a>
          </div>
        </article>`).join("");
    }
    [fCity, fType, fPal, fSort].forEach((el) => el.addEventListener("input", render));
    render();
  }

  /* ---------- Quote: estimator ---------- */
  if (page === "quote") {
    const q = new URLSearchParams(location.search);
    const wh = q.get("warehouse");
    if (wh) {
      const n = $("#q-notes");
      n.value = `Interested in: ${wh}`;
    }
    const PALLET_M3 = 1.2 * 1.0 * 1.5 * 0.85; // 1.2×1.0 m pallet, 1.5 m load, 85% fill
    const eMode = $("#e-mode"), boxesBlock = $("#e-boxes-block"), palBlock = $("#e-pallets-block");
    const fields = ["e-mode", "e-type", "e-pallets", "e-boxes", "e-l", "e-w", "e-h", "e-months"].map((id) => $("#" + id));

    function calc() {
      const byBoxes = eMode.value === "boxes";
      boxesBlock.hidden = !byBoxes; palBlock.hidden = byBoxes;
      let pallets, volume;
      if (byBoxes) {
        const n = +$("#e-boxes").value || 0, l = +$("#e-l").value || 0, w = +$("#e-w").value || 0, h = +$("#e-h").value || 0;
        volume = n * (l * w * h) / 1e6;
        pallets = volume > 0 ? Math.ceil(volume / PALLET_M3) : 0;
      } else {
        pallets = Math.max(0, Math.ceil(+$("#e-pallets").value || 0));
        volume = pallets * PALLET_M3;
      }
      const months = Math.max(1, +$("#e-months").value || 1);
      const type = $("#e-type").value;
      const rate = (C.rates || {})[type];

      $("#r-pallets").textContent = fmt(pallets);
      $("#r-volume").textContent = volume.toFixed(1) + " m³";
      $("#r-type").textContent = TYPES[type].name + " · " + TYPES[type].range;
      $("#r-months").textContent = months + (months === 1 ? " month" : " months");

      if (rate == null || rate === "") {
        $("#r-rate").textContent = "On request";
        $("#r-total").textContent = "On request";
        $("#r-note").textContent = "Send the form and we'll reply with a price for this space.";
      } else {
        const total = pallets * rate * months;
        $("#r-rate").textContent = `${fmt(rate)} ${C.currency} / pallet / month`;
        $("#r-total").textContent = `${fmt(total)} ${C.currency}`;
        $("#r-note").textContent = "Estimate only, excluding handling, transport and VAT.";
      }
      // carry into quote form
      $("#q-type").value = type;
      $("#q-pallets").value = pallets || "";
      $("#q-months").value = months;
    }
    fields.forEach((f) => f.addEventListener("input", calc));
    calc();
  }
})();
