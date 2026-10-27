/* KADZ Logistics — shared site script (loaded on every page) */
(function () {
  const C = window.KADZ || {};
  const page = document.body.dataset.page;

  /* ---------- Helpers ---------- */
  const TYPES = {
    dry:     { name: "Dry",     range: "25–32 °C" },
    ambient: { name: "Ambient", range: "20–25 °C" },
    chilled: { name: "Chilled", range: "0–5 °C" },
    frozen:  { name: "Frozen",  range: "−18 °C" }
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const money = (n) => (n == null || n === "") ? "On request" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${C.currency || "SAR"}`;
  const AR = window.KZ_LANG === "ar";
  // Arabic pages use Arabic month names with the Gregorian calendar and Western digits
  const date = (d) => d ? new Date(d).toLocaleDateString(AR ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const PILL = {
    pending: "warn", quoted: "info", approved: "ok", confirmed: "ok", paid: "ok", declined: "bad", expired: "muted",
    rejected: "bad", cancelled: "bad", unpaid: "muted", invoiced: "info",
    completed: "muted", new: "warn", handled: "muted",
    client: "muted", partner: "info", admin: "warn",
    requested: "warn", sent: "info", invited: "warn", active: "ok"
  };
  const pill = (s, label) => `<span class="pill ${PILL[s] || "muted"}">${esc(label || s)}</span>`;
  // Booking statuses read better with friendlier names
  const BOOKING_LABEL = { pending: "quote requested", quoted: "quote sent" };
  const quoteExpired = (b) => b.status === "quoted" && b.quote_valid_until && b.quote_valid_until < new Date().toISOString().slice(0, 10);
  const bookingPill = (b) => quoteExpired(b) ? pill("expired", "quote expired") : pill(b.status, BOOKING_LABEL[b.status]);
  const typeChips = (types) => (types || []).map((t) =>
    `<span class="chip ${esc(t)}">${esc(TYPES[t]?.name || t)}</span>`).join("");

  /* ---------- Supabase ---------- */
  let sb = null;
  if (C.supabaseUrl && C.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
  }
  const photoUrl = (path) => sb ? sb.storage.from("warehouse-photos").getPublicUrl(path).data.publicUrl : "";

  // Turn database error messages into something readable
  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || String(e || "Something went wrong.");
    if (/row-level security/i.test(m)) return "You don't have permission to do that.";
    if (/Invalid login credentials/i.test(m)) return "Email or password is incorrect.";
    if (/Email not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for the link.";
    if (/violates foreign key.*bookings/i.test(m)) return "This warehouse has bookings, so it can't be deleted.";
    return m;
  }

  // "Keep me logged in" unticked: log out once the browser has been closed.
  // A cookie with no expiry date disappears when the browser closes.
  const sitePath = location.pathname.replace(/[^/]*$/, "");
  const sessionCheck = (async () => {
    try {
      if (sb && localStorage.getItem("kz-session-only") === "1" && !document.cookie.split("; ").includes("kz-alive=1")) {
        localStorage.removeItem("kz-session-only");
        await sb.auth.signOut({ scope: "local" });
      }
    } catch (e) {}
  })();
  function rememberLogin(keep) {
    try {
      if (keep) localStorage.removeItem("kz-session-only");
      else {
        localStorage.setItem("kz-session-only", "1");
        document.cookie = `kz-alive=1; path=${sitePath}; SameSite=Lax`;
      }
    } catch (e) {}
  }

  let profileCache;
  async function getUser() {
    if (!sb) return { session: null, profile: null };
    await sessionCheck;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { session: null, profile: null };
    if (profileCache === undefined || profileCache?.id !== session.user.id) {
      const { data } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      profileCache = data || null;
    }
    return { session, profile: profileCache };
  }
  const homeFor = (role) => role === "admin" ? "admin.html" : role === "partner" ? "partner-dashboard.html" : "my-bookings.html";

  // Only allow redirects to pages on this site
  function safeNext(n) {
    return n && /^[a-z-]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/i.test(n) ? n : null;
  }

  // Use on protected pages. Redirects to login when needed.
  async function requireRole(roles) {
    if (!sb) { showSetupNotice($("main")); return null; }
    const u = await getUser();
    if (!u.session) {
      location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
      return null;
    }
    if (roles && !roles.includes(u.profile?.role)) {
      location.href = homeFor(u.profile?.role);
      return null;
    }
    return u;
  }

  function showSetupNotice(where) {
    if (!where) return;
    const box = document.createElement("div");
    box.className = "wrap";
    box.innerHTML = `<div class="notice warn" style="margin-block:1.5rem">
      <strong>Database not connected.</strong> Add your Supabase Project URL and anon key to
      <code>config.js</code>. The setup guide explains where to find them.</div>`;
    where.prepend(box);
  }

  // Small message that appears at the bottom of the screen
  function toast(msg, bad) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.className = bad ? "show bad" : "show";
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 4000);
  }

  /* ---------- Header ---------- */
  const navItems = [
    ["index.html", "Home", "home"],
    ["warehouses.html", "Find a warehouse", "warehouses"],
    ["services.html", "Services", "services"],
    ["partners.html", "List your warehouse", "partners"],
    ["software.html", "Software", "software"]
  ];
  // Logo: yellow K badge + first word of the company name, the rest as a small line under it
  const [brandMain, ...brandRest] = (C.company || "KADZ").trim().split(/\s+/);
  const badge = `<svg class="brand-mark" viewBox="0 0 58 58" aria-hidden="true"><rect x="2" y="2" width="54" height="54" rx="6"/><path d="M14 12h7v34h-7zM21 27 34 12h9L21 37zM26 31l5-6 13 21h-9z"/></svg>`;
  const brand = `${badge}<span class="brand-text"><span class="brand-name">${esc(brandMain)}</span>${brandRest.length ? `<span class="brand-sub">${esc(brandRest.join(" "))}</span>` : ""}</span>`;
  // Partner dashboard is a work area: just the logo, no site menu or footer
  const appMode = page === "partner-dash";
  if (appMode) document.body.classList.add("app-mode");
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = appMode ? `
    <div class="wrap">
      <a class="brand" href="partner-dashboard.html" aria-label="${esc(C.company)} partner dashboard">${brand}</a>
    </div>` : `
    <div class="wrap">
      <a class="brand" href="index.html" aria-label="${esc(C.company)} home">
        ${brand}
      </a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav class="nav" id="site-nav">
        ${navItems.map(([href, label, key]) =>
          `<a href="${href}"${key === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        <span id="nav-account"><a href="login.html"${page === "login" ? ' aria-current="page"' : ""}>Log in</a></span>
        ${window.KZ_LANG && !window.KZ_ENGLISH_ONLY ? `<div class="lang-switch" role="group" aria-label="Language">
          <button type="button" data-lang="ar" lang="ar" aria-pressed="${window.KZ_LANG === "ar"}">العربية</button>
          <button type="button" data-lang="en" lang="en" aria-pressed="${window.KZ_LANG !== "ar"}">EN</button>
        </div>` : ""}
        <a class="btn btn-primary" href="quote.html">Get a quote</a>
      </nav>
    </div>`;
  document.body.prepend(header);
  header.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (b && b.dataset.lang !== window.KZ_LANG) window.KZ_setLang(b.dataset.lang);
  });
  const toggle = $(".nav-toggle", header), nav = $(".nav", header);
  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });

  const ready = getUser().then((u) => {
    if (u.session && !appMode) {
      const dash = homeFor(u.profile?.role);
      const label = u.profile?.role === "admin" ? "Admin" : u.profile?.role === "partner" ? "Partner dashboard" : "My bookings";
      $("#nav-account").innerHTML = `<a href="${dash}"${["admin", "partner-dash", "my-bookings"].includes(page) ? ' aria-current="page"' : ""}>${label}</a><a href="#" id="logout">Log out</a>`;
      $("#logout").addEventListener("click", async (e) => {
        e.preventDefault();
        await sb.auth.signOut();
        location.href = "index.html";
      });
    }
    return u;
  });

  /* ---------- Footer ---------- */
  const ct = C.contact || {};
  // Footer: brand + cities + social links | Services | Company | Contact (empty settings are hidden)
  const so = C.social || {};
  const SOCIAL = {
    linkedin: ["LinkedIn", '<path d="M6.5 9h3v9h-3zM8 4.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM12 9h2.9v1.3c.4-.8 1.4-1.5 2.9-1.5 3 0 3.6 1.9 3.6 4.5V18h-3v-4.1c0-1-.1-2.3-1.5-2.3s-1.8 1.1-1.8 2.2V18H12z"/>'],
    x: ["X", '<path d="M4 4h4.5l3.6 5 4.3-5h2.2l-5.5 6.3L19.5 20H15l-3.9-5.4L6.4 20H4.2l5.9-6.8z"/>'],
    instagram: ["Instagram", '<rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.8" cy="7.2" r="1.1"/>']
  };
  const socials = Object.entries(SOCIAL).filter(([k]) => /^https?:\/\//.test(so[k] || "")).map(([k, [label, path]]) =>
    `<a class="soc" href="${esc(so[k])}" target="_blank" rel="noopener" aria-label="${label}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg></a>`).join("");
  const contactRows = [
    ct.phone && ["Phone / WhatsApp", `<a href="tel:${esc(ct.phone.replace(/\s/g, ""))}">${esc(ct.phone)}</a>`],
    ct.email && ["Email", `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>`],
    ct.address && ["Head office", esc(ct.address)],
    ct.hours && ["Hours", esc(ct.hours)]
  ].filter(Boolean).map(([k, v]) => `<div class="foot-kv"><span>${k}</span><b>${v}</b></div>`).join("");
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="wrap">
      <div class="foot-grid">
        <div class="foot-brand">
          <a class="brand" href="index.html">${brand}</a>
          <p>${esc(C.tagline || "Warehouse storage, transportation, freight forwarding and customs clearance across Saudi Arabia.")}</p>
          ${(C.cities || []).length ? `<div class="foot-chips">${C.cities.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
          ${socials ? `<div class="foot-social">${socials}</div>` : ""}
        </div>
        <div>
          <h4>Services</h4>
          <ul>
            <li><a href="service-storage.html">Warehouse storage</a></li>
            <li><a href="service-transport.html">Transportation</a></li>
            <li><a href="service-freight.html">Freight forwarding</a></li>
            <li><a href="service-customs.html">Customs clearance</a></li>
            <li><a href="estimate.html">Space estimator</a></li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><a href="warehouses.html">Find a warehouse</a></li>
            <li><a href="partners.html">List your warehouse</a></li>
            <li><a href="software.html">Software</a></li>
            <li><a href="quote.html">Get a quote</a></li>
            <li><a href="login.html">Log in / Sign up</a></li>
          </ul>
        </div>
        ${contactRows ? `<div><h4>Contact</h4><div class="foot-contact">${contactRows}</div></div>` : ""}
      </div>
      <div class="foot-bottom">© ${new Date().getFullYear()} ${esc(C.company)}. All rights reserved.</div>
    </div>`;
  // No footer on the log in / sign up / reset password page
  if (page !== "login" && !appMode) document.body.append(footer);

  /* ---------- Fill city & storage-type selects ---------- */
  $$("select[data-cities]").forEach((sel) => (C.cities || []).forEach((c) => sel.add(new Option(c, c))));
  $$("select[data-types]").forEach((sel) =>
    Object.entries(TYPES).forEach(([k, t]) => sel.add(new Option(`${t.name} (${t.range})`, k))));
  $$("datalist[data-cities]").forEach((dl) => (C.cities || []).forEach((c) => dl.append(new Option(c))));

  /* ---------- Quote page: fill in numbers from the estimate page ---------- */
  function fillFromEstimate(form) {
    const q = new URLSearchParams(location.search);
    const type = q.get("type"), pallets = +q.get("pallets") || 0, months = +q.get("months") || 0;
    if (!type && !pallets && !months) return false;
    if (type && TYPES[type]) $("#q-type", form).value = type;
    if (pallets > 0) $("#q-pallets", form).value = Math.ceil(pallets);
    if (months > 0) $("#q-months", form).value = Math.ceil(months);
    return true;
  }

  /* ---------- Public quote form → quote_requests table ---------- */
  $$("form[data-kind=quote]").forEach((form) => {
    if (fillFromEstimate(form)) {
      const n = $("#from-estimate");
      if (n) {
        n.innerHTML = `We've filled in your estimate. <a href="estimate.html">Change it</a>`;
        n.hidden = false;
      }
    }
    const btn = $("button[type=submit]", form);
    const label = btn.textContent;
    const status = $(".form-status", form);
    const fs = $("fieldset[data-name=services]", form);
    const sections = $$("fieldset.qsvc", form);

    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    $$("[data-min-today]", form).forEach((i) => (i.min = today.toISOString().slice(0, 10)));

    // Show the detail section for each ticked service (hidden ones are skipped when checking the form)
    function showSections() {
      const on = $$("input:checked", fs).map((i) => i.value);
      sections.forEach((sec) => { const show = on.includes(sec.dataset.for); sec.hidden = !show; sec.disabled = !show; });
    }
    fs.addEventListener("change", () => { showSections(); $(".err", fs).hidden = true; });
    showSections();

    // Radio groups and "one of these" pairs the browser can't check by itself
    function checkExtras(scope) {
      let ok = true;
      $$("fieldset.radio-set[data-required]", scope).forEach((g) => {
        const has = !!$("input:checked", g);
        $(".err", g).hidden = has;
        if (!has && ok) { $("input", g).focus(); ok = false; }
      });
      const groups = {};
      $$("[data-one-of]", scope).forEach((i) => (groups[i.dataset.oneOf] ||= []).push(i));
      Object.entries(groups).forEach(([g, inputs]) => {
        const has = inputs.some((i) => i.value.trim() !== "");
        $(`[data-err="${g}"]`, scope).hidden = has;
        if (!has && ok) { inputs[0].focus(); ok = false; }
      });
      return ok;
    }
    // The answers in one section, e.g. { from: "Jeddah", to: "Riyadh", truck: "frozen" }
    function collect(scope) {
      const out = {};
      $$("input[data-key], select[data-key]", scope).forEach((el) => {
        if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
        const v = el.value.trim();
        if (v !== "") out[el.dataset.key] = el.type === "number" ? Number(v) : v;
      });
      return out;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const services = $$("input:checked", fs).map((i) => i.value);
      $(".err", fs).hidden = services.length > 0;
      if (!services.length) { $("input", fs).focus(); return; }
      const open = sections.filter((sec) => !sec.hidden);
      const extrasOk = open.every((sec) => checkExtras(sec));
      if (!form.reportValidity() || !extrasOk) return;
      if (!sb) {
        status.className = "form-status notice warn";
        status.textContent = "This form isn't connected yet. Add your Supabase details to config.js.";
        status.hidden = false;
        return;
      }
      const f = new FormData(form);
      const storage = services.includes("storage");
      const details = {};
      open.forEach((sec) => { const d = collect(sec); if (Object.keys(d).length) details[sec.dataset.for] = d; });
      const row = {
        name: f.get("name"), company: f.get("company") || null, email: f.get("email"), phone: f.get("phone") || null,
        services, notes: f.get("notes") || null, details,
        storage_type: storage ? f.get("storageType") || null : null, city: storage ? f.get("city") || null : null,
        pallets: storage && f.get("pallets") ? Number(f.get("pallets")) : null,
        months: storage && f.get("months") ? Number(f.get("months")) : null
      };
      btn.disabled = true; btn.textContent = "Sending…";
      const { error } = await sb.from("quote_requests").insert(row);
      if (error) {
        btn.disabled = false; btn.textContent = label;
        status.className = "form-status notice warn";
        status.textContent = "We couldn't send your request: " + errMsg(error);
        status.hidden = false;
        return;
      }
      // Lock the form and show "Request sent" so it isn't sent twice
      const fields = $$("fieldset", form);
      fields.forEach((el) => (el.disabled = true));
      btn.textContent = "Request sent";
      status.className = "form-status notice";
      status.innerHTML = `Thanks. Your request has been sent and our team will contact you soon.<br><button type="button" class="linkbtn" data-again style="margin-top:.4rem">Send another request</button>`;
      status.hidden = false;
      $("[data-again]", status).addEventListener("click", () => {
        form.reset();
        $$("fieldset", form).forEach((el) => (el.disabled = false));
        showSections();
        fillFromEstimate(form);
        btn.disabled = false; btn.textContent = label;
        status.hidden = true;
        $("input", fs)?.focus();
      });
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

    // Numbers band: city count from config.js, and numbers that count up when scrolled into view
    const cities = C.cities || [];
    if (cities.length && $("#kpi-cities")) {
      $("#kpi-cities-n").dataset.count = cities.length;
      $("#kpi-cities").textContent = `${cities.length === 1 ? "City" : "Cities"}: ${cities.join(" · ")}`;
    }
    const counters = $$("[data-count]");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function countUp(el) {
      cancelAnimationFrame(el._raf);
      const end = +el.dataset.count, t0 = performance.now(), dur = end > 100 ? 1800 : 1100;
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(end * eased).toLocaleString("en-US");
        if (k < 1) el._raf = requestAnimationFrame(tick);
      };
      el._raf = requestAnimationFrame(tick);
    }
    // Count up every time the band comes into view; reset to 0 once it has scrolled away
    const band = $(".stats-band");
    if (band && !still && "IntersectionObserver" in window) {
      counters.forEach((el) => (el.textContent = "0"));
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) counters.forEach(countUp);
        else counters.forEach((el) => { cancelAnimationFrame(el._raf); el.textContent = "0"; });
      }, { threshold: .35 }).observe(band);
    }

    // Client logos: repeat the row once so the sliding loop has no gap
    const track = $(".marquee-track");
    if (track) [...track.children].forEach((el) => { const c = el.cloneNode(true); c.setAttribute("aria-hidden", "true"); track.append(c); });

    // Service tabs: Storage | Transportation | Freight | Customs
    const htabs = $$(".htab"), panels = $$(".hero-box [data-hp]");
    function openTab(name, focus) {
      htabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.h === name));
      panels.forEach((p) => (p.hidden = p.dataset.hp !== name));
      $$(".hero-img").forEach((i) => i.classList.toggle("on", i.dataset.bg === name));   // matching background photo
      if (focus) $("input, select", panels.find((p) => p.dataset.hp === name))?.focus();
    }
    htabs.forEach((t) => t.addEventListener("click", () => openTab(t.dataset.h, true)));

    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    $$(".hero-box [data-min-today]").forEach((i) => (i.min = today.toISOString().slice(0, 10)));

    // "Continue" opens the service's request page with what was typed already filled in
    $$(".hero-go").forEach((form) => form.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = new URLSearchParams();
      $$("input, select", form).forEach((el) => { if (el.value.trim()) p.set(el.name, el.value.trim()); });
      location.href = form.dataset.go + (p.toString() ? "?" + p : "");
    }));
  }

  /* ---------- Estimate page ---------- */
  if (page === "estimate") {
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
        $("#r-note").textContent = "Ask for a quote and we'll reply with the price.";
      } else {
        $("#r-rate").textContent = `${fmt(rate)} ${C.currency} / pallet / month`;
        $("#r-total").textContent = money(pallets * rate * months);
        $("#r-note").textContent = "Estimate only, excluding handling, transport and VAT.";
      }
      // "Get a quote for this estimate" carries the numbers to the quote page
      const q = new URLSearchParams({ type, months });
      if (pallets) q.set("pallets", pallets);
      $("#e-quote").href = "quote.html?" + q;
    }
    fields.forEach((f) => f.addEventListener("input", calc));
    calc();
  }

  /* ---------- Transportation / freight / customs requests ---------- */
  const SERVICES = { transport: "Transportation", freight: "Freight forwarding", customs: "Customs clearance" };
  const TRUCK = { standard: "Standard (dry)", refrigerated: "Refrigerated (0–5 °C)", frozen: "Frozen (−18 °C)" };
  const MODE = { air: "Air", sea: "Sea", land: "Land" };
  const cap = (v) => v ? String(v)[0].toUpperCase() + String(v).slice(1) : v;
  // The answers from the request form as [label, value] pairs (empty ones left out)
  function serviceFacts(r) {
    const d = r.details || {}, n = (v, unit) => v == null || v === "" ? null : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`;
    const day = (v) => v ? date(v) : null;
    const rows = {
      transport: [["Pickup city", d.from], ["Delivery city", d.to], ["Pickup date", day(d.date)], ["Truck type", TRUCK[d.truck] || d.truck],
                  ["Pallets", n(d.pallets)], ["Total weight", n(d.weight_kg, "kg")]],
      freight: [["Mode", MODE[d.mode] || d.mode], ["Direction", cap(d.direction)], ["Origin", d.origin], ["Destination", d.destination],
                ["Cargo ready", day(d.ready_date)], ["Incoterm", d.incoterm], ["Cargo", d.cargo], ["Total weight", n(d.weight_kg, "kg")], ["Volume", n(d.volume_cbm, "m³")]],
      customs: [["Direction", cap(d.direction)], ["Port or airport", d.port], ["Cargo", d.cargo], ["HS code", d.hs_code], ["Shipment value", n(d.value_sar, C.currency || "SAR")]]
    }[r.service] || [];
    return rows.filter(([, v]) => v != null && v !== "");
  }
  // One-line summary, e.g. "Jeddah to Riyadh" or "Sea import, Shanghai to Jeddah"
  function serviceLine(r) {
    const d = r.details || {};
    if (r.service === "transport") return [d.from, d.to].filter(Boolean).join(" to ");
    if (r.service === "freight") return [[MODE[d.mode], d.direction].filter(Boolean).join(" "), [d.origin, d.destination].filter(Boolean).join(" to ")].filter(Boolean).join(", ");
    if (r.service === "customs") return [cap(d.direction), d.port].filter(Boolean).join(" at ");
    return "";
  }

  /* ---------- Shared API for page scripts ---------- */
  // Free / total pallet positions for each storage type (empty list = one shared count)
  const typeCounts = (w) => Object.keys(w?.pallets_by_type || {}).length
    ? (w.storage_types || []).filter((t) => t in w.pallets_by_type)
        .map((t) => ({ type: t, name: TYPES[t]?.name || t, free: +(w.free_by_type?.[t] ?? 0), total: +w.pallets_by_type[t] }))
    : [];
  /* Inbound / outbound requests: one card, shared by the client, admin and partner dashboards */
  const MOVE_STATUS = { requested: "waiting for KADZ", sent: "sent to warehouse", completed: "done", rejected: "not accepted", cancelled: "cancelled" };
  const MOVE_STEPS = ["requested", "sent", "completed"];
  function moveCard(m, { title = "", extra = "", actions = "" } = {}) {
    const inb = m.direction === "inbound";
    const step = MOVE_STEPS.indexOf(m.status);
    const steps = ["Requested", "Sent to warehouse", inb ? "Received" : "Dispatched"];
    return `
    <article class="row-card mv${m.status === "requested" || m.status === "sent" ? " attention" : ""}" data-mv="${esc(m.id)}">
      <div class="row-top">
        <div style="display:grid;gap:.3rem;min-width:0">
          <span class="label"><span class="mv-dir ${inb ? "in" : "out"}">${inb ? "↓ Inbound" : "↑ Outbound"}</span> ${esc(m.ref)} · booking ${esc(m.booking_ref)}</span>
          <h3>${title || `${fmt(m.pallets)} pallets · ${esc(TYPES[m.storage_type]?.name || m.storage_type)}`}</h3>
          <span class="muted">${inb ? "Arriving" : "Collecting"} ${date(m.expected_date)}${m.goods ? ` · ${esc(m.goods)}` : ""}</span>
        </div>
        ${pill(m.status, MOVE_STATUS[m.status])}
      </div>
      ${step >= 0 ? `<ol class="mv-steps">${steps.map((t, i) => `<li class="${i <= step ? "done" : ""}">${t}</li>`).join("")}</ol>` : ""}
      <dl class="kv">
        ${m.vehicle_plate || m.driver_name ? `<div><dt>Truck · driver</dt><dd>${esc([m.vehicle_plate, m.driver_name, m.driver_phone].filter(Boolean).join(" · "))}</dd></div>` : ""}
        ${m.status === "completed" ? `<div><dt>${inb ? "Received" : "Dispatched"}</dt><dd><strong>${fmt(m.actual_pallets)} pallets</strong> on ${date(m.done_date)}</dd></div>` : ""}
        ${m.notes ? `<div><dt>Client note</dt><dd>${esc(m.notes)}</dd></div>` : ""}
        ${m.admin_note ? `<div><dt>KADZ note</dt><dd>${esc(m.admin_note)}</dd></div>` : ""}
        ${m.partner_note ? `<div><dt>Warehouse note</dt><dd>${esc(m.partner_note)}</dd></div>` : ""}
        ${extra}
      </dl>
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </article>`;
  }

  window.KZ = { C, sb, rememberLogin, TYPES, typeCounts, moveCard, MOVE_STATUS, esc, fmt, money, date, $, $$, pill, bookingPill, quoteExpired, typeChips, photoUrl, errMsg,
                getUser, requireRole, homeFor, safeNext, toast, showSetupNotice, ready,
                SERVICES, serviceFacts, serviceLine };
})();
