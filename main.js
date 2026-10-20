/* KADZ Tech — shared site script (loaded on every page) */
(function () {
  const C = window.KADZ || {};
  const page = document.body.dataset.page;

  /* ---------- Helpers ---------- */
  const TYPES = {
    dry:     { name: "Dry",     range: "No control" },
    ambient: { name: "Ambient", range: "15–25 °C" },
    chilled: { name: "Chilled", range: "2–8 °C" },
    frozen:  { name: "Frozen",  range: "−18 °C" }
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const money = (n) => (n == null || n === "") ? "On request" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${C.currency || "SAR"}`;
  const date = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const PILL = {
    pending: "warn", approved: "ok", confirmed: "ok", paid: "ok",
    rejected: "bad", cancelled: "bad", unpaid: "muted", invoiced: "info",
    completed: "muted", new: "warn", handled: "muted",
    client: "muted", partner: "info", admin: "warn"
  };
  const pill = (s) => `<span class="pill ${PILL[s] || "muted"}">${esc(s)}</span>`;
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

  let profileCache;
  async function getUser() {
    if (!sb) return { session: null, profile: null };
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
        <span id="nav-account"><a href="login.html"${page === "login" ? ' aria-current="page"' : ""}>Log in</a></span>
        <a class="btn btn-primary" href="quote.html">Get a quote</a>
      </nav>
    </div>`;
  document.body.prepend(header);
  const toggle = $(".nav-toggle", header), nav = $(".nav", header);
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });

  const ready = getUser().then((u) => {
    if (u.session) {
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
            <li><a href="login.html">Log in / Sign up</a></li>
          </ul>
        </div>
        ${contactLines ? `<div><h4>Contact</h4><ul>${contactLines}</ul></div>` : ""}
      </div>
      <div class="foot-bottom">© ${new Date().getFullYear()} ${esc(C.company)}. All rights reserved.</div>
    </div>`;
  document.body.append(footer);

  /* ---------- Fill city & storage-type selects ---------- */
  $$("select[data-cities]").forEach((sel) => (C.cities || []).forEach((c) => sel.add(new Option(c, c))));
  $$("select[data-types]").forEach((sel) =>
    Object.entries(TYPES).forEach(([k, t]) => sel.add(new Option(`${t.name} (${t.range})`, k))));
  $$("datalist[data-cities]").forEach((dl) => (C.cities || []).forEach((c) => dl.append(new Option(c))));

  /* ---------- Public quote form → quote_requests table ---------- */
  $$("form[data-kind=quote]").forEach((form) => {
    const btn = $("button[type=submit]", form);
    const label = btn.textContent;
    const status = $(".form-status", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fs = $("fieldset[data-name=services]", form);
      const services = $$("input:checked", fs).map((i) => i.value);
      $(".err", fs).hidden = services.length > 0;
      if (!services.length || !form.reportValidity()) return;
      if (!sb) {
        status.className = "form-status notice warn";
        status.textContent = "This form isn't connected yet. Add your Supabase details to config.js.";
        status.hidden = false;
        return;
      }
      const f = new FormData(form);
      const row = {
        name: f.get("name"), company: f.get("company") || null, email: f.get("email"), phone: f.get("phone") || null,
        services, storage_type: f.get("storageType") || null, city: f.get("city") || null,
        pallets: f.get("pallets") ? Number(f.get("pallets")) : null,
        months: f.get("months") ? Number(f.get("months")) : null, notes: f.get("notes") || null
      };
      btn.disabled = true; btn.textContent = "Sending…";
      const { error } = await sb.from("quote_requests").insert(row);
      btn.disabled = false; btn.textContent = label;
      if (error) {
        status.className = "form-status notice warn";
        status.textContent = "We couldn't send your request: " + errMsg(error);
      } else {
        form.reset();
        status.className = "form-status notice";
        status.textContent = "Thanks. Your request has been sent and our team will contact you soon.";
      }
      status.hidden = false;
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

  /* ---------- Quote page: estimator ---------- */
  if (page === "quote") {
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
        $("#r-note").textContent = "Send the form and we'll reply with a price, or browse warehouses to see their prices.";
      } else {
        $("#r-rate").textContent = `${fmt(rate)} ${C.currency} / pallet / month`;
        $("#r-total").textContent = money(pallets * rate * months);
        $("#r-note").textContent = "Estimate only, excluding handling, transport and VAT.";
      }
      $("#q-type").value = type;
      $("#q-pallets").value = pallets || "";
      $("#q-months").value = months;
    }
    fields.forEach((f) => f.addEventListener("input", calc));
    calc();
  }

  /* ---------- Shared API for page scripts ---------- */
  window.KZ = { C, sb, TYPES, esc, fmt, money, date, $, $$, pill, typeChips, photoUrl, errMsg,
                getUser, requireRole, homeFor, safeNext, toast, showSetupNotice, ready };
})();
