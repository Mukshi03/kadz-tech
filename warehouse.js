/* Warehouse detail page + quotation request */
(async function () {
  const { sb, C, TYPES, esc, fmt, $, typeChips, photoUrl, errMsg, showSetupNotice, ready } = window.KZ;
  const id = new URLSearchParams(location.search).get("id");
  const body = $("#wh-body");

  function notFound(msg) {
    $("#wh-name").textContent = "Warehouse not found";
    $("#wh-place").textContent = "";
    ["#wd-sum", "#wd-tabs", "#wd-verified"].forEach((s) => ($(s).hidden = true));
    $("#wd-hero").classList.add("no-photo");
    body.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>${esc(msg)}</strong>
      <a class="btn btn-primary" href="warehouses.html">Browse warehouses</a></div>`;
  }

  if (!sb) { showSetupNotice($("main")); return notFound("The database isn't connected yet."); }
  if (!id) return notFound("No warehouse was selected.");

  // Public listing first; owners and admins can also preview unapproved ones
  let { data: w } = await sb.from("public_warehouses").select("*").eq("id", id).maybeSingle();
  let preview = false;
  if (!w) {
    const r = await sb.from("warehouses").select("*").eq("id", id).maybeSingle();
    w = r.data; preview = !!w;
  }
  if (!w) return notFound("This warehouse doesn't exist or isn't listed anymore.");

  // Clients see the reference number (e.g. KZ-JED-0001), never the warehouse's real name
  const title = w.ref || "Warehouse";
  document.title = `${title} | ${C.company}`;
  const place = [w.district, w.city].filter(Boolean).join(", ");
  $("#wh-name").textContent = title;
  $("#wh-crumb").textContent = title;
  $("#wh-place").textContent = place;
  $("#wh-types").innerHTML = typeChips(w.storage_types) +
    (preview ? ` <span class="pill warn">${esc(w.status)} – only you can see this</span>` : "");
  if (preview) $("#wd-verified").hidden = true;

  /* Summary card */
  $("#wd-free").textContent = fmt(w.pallets_available);
  $("#wd-of").textContent = w.pallets_total ? `of ${fmt(w.pallets_total)} pallet positions` : "";
  $("#wd-share").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); window.KZ.toast("Link copied"); }
    } catch (e) {}
  });

  /* Overview */
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    box: ic('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
    free: ic('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    temp: ic('<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/>'),
    type: ic('<path d="M3 10 12 4l9 6v10H3z"/><path d="M7 20v-6h10v6"/>'),
    area: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>'),
    cal: ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')
  };
  const types = w.storage_types || [];
  const rows = [
    [I.box, "Total capacity", w.pallets_total ? `${fmt(w.pallets_total)} pallets` : ""],
    [I.free, "Available capacity", `${fmt(w.pallets_available)} pallets`],
    [I.temp, "Temperature range", types.map((t) => TYPES[t]?.range).filter(Boolean).join(" · ")],
    [I.type, "Storage type", types.map((t) => TYPES[t]?.name || t).join(", ")],
    [I.area, "Warehouse area", w.area_sqm ? `${fmt(w.area_sqm)} m²` : ""],
    [I.cal, "Minimum rental", `${w.min_months} month${w.min_months > 1 ? "s" : ""}`]
  ].filter((r) => r[2]);
  $("#wd-overview").innerHTML = rows.map(([i, k, v]) => `<div><dt>${i}<span>${k}</span></dt><dd>${esc(v)}</dd></div>`).join("");

  /* Facilities and licenses */
  const LIC = { "commercial-registration": "Commercial registration", baladiya: "Municipality (Baladiya)", "civil-defense": "Civil Defense", sfda: "SFDA" };
  const FEAT = { racking: "Racking system", "loading-docks": "Loading docks", forklifts: "Forklifts", cctv: "24/7 CCTV", wms: "Warehouse software", security: "Security guards", "fire-system": "Fire suppression" };
  const checks = (list, names, none) => list?.length
    ? list.map((f) => `<li>${esc(names[f] || f)}</li>`).join("")
    : `<li class="none">${none}</li>`;
  $("#wd-features").innerHTML = checks(w.features, FEAT, "Ask us about facilities in your quotation request.");
  $("#wd-licenses").innerHTML = checks(w.licenses, LIC, "Licenses are checked by KADZ before a warehouse is listed.");
  /* Value added services (no prices: included in the quotation) */
  const VAS = {
    receiving: ["Receiving / unloading", '<path d="M3 17h13V7H3zM16 10h4l1 3v4h-5"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/><path d="M9.5 9v5M7.5 12l2 2 2-2"/>'],
    picking: ["Picking & packing", '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9M8 6l8 4"/>'],
    palletizing: ["Palletizing", '<rect x="5" y="4" width="14" height="10" rx="1"/><path d="M5 9h14M12 4v10M3 17h18M5 17v3M12 17v3M19 17v3"/>'],
    "shrink-wrapping": ["Shrink wrapping", '<rect x="6" y="3" width="12" height="16" rx="1.5"/><path d="M6 7l12 3M6 11l12 3M6 15l12 3M9 21h6"/>']
  };
  if ((w.vas || []).length) {
    $("#vas").hidden = false;
    $("#wd-vas").innerHTML = w.vas.filter((v) => VAS[v]).map((v) =>
      `<li>${ic(VAS[v][1])}<b>${VAS[v][0]}</b><small>Price on quotation</small></li>`).join("");
  }
  if (w.description) { $("#about").hidden = false; $("#wd-about").textContent = w.description; }

  /* Photos: hero background + gallery + full-size viewer */
  const photos = (w.photos || []).map(photoUrl);
  const hero = $("#wd-hero"), g = $("#gallery");
  if (photos.length) {
    hero.style.backgroundImage = `url("${photos[0].replace(/"/g, "%22")}")`;
    const pb = $("#wd-photos-btn"); pb.hidden = false;
    pb.textContent = photos.length > 1 ? `View all ${photos.length} photos` : "View photo";
    g.innerHTML = photos.map((p, i) => `<button type="button" data-i="${i}"><img src="${esc(p)}" alt="Photo ${i + 1} of ${esc(title)}" loading="lazy"></button>`).join("");
  } else {
    hero.classList.add("no-photo");
    g.innerHTML = `<p class="muted">No photos yet.</p>`;
  }
  const viewer = $("#wd-viewer"), vImg = $("img", viewer);
  let cur = 0;
  const showPhoto = (i) => { cur = (i + photos.length) % photos.length; vImg.src = photos[cur]; };
  const openViewer = (i) => { if (!photos.length) return; showPhoto(i); viewer.hidden = false; document.body.style.overflow = "hidden"; };
  const closeViewer = () => { viewer.hidden = true; document.body.style.overflow = ""; };
  g.addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) openViewer(+b.dataset.i); });
  hero.addEventListener("click", (e) => { if (!e.target.closest("a")) openViewer(0); });
  $(".wd-x", viewer).addEventListener("click", closeViewer);
  $(".wd-prev", viewer).addEventListener("click", () => showPhoto(cur - 1));
  $(".wd-next", viewer).addEventListener("click", () => showPhoto(cur + 1));
  viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
  document.addEventListener("keydown", (e) => {
    if (viewer.hidden) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight") showPhoto(cur + 1);
    if (e.key === "ArrowLeft") showPhoto(cur - 1);
  });

  /* Tabs: highlight the section on screen */
  const tabs = [...document.querySelectorAll("#wd-tabs a")];
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) tabs.forEach((t) => t.classList.toggle("on", t.getAttribute("href") === "#" + en.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  tabs.forEach((t) => { const s = document.querySelector(t.getAttribute("href")); if (s) io.observe(s.closest("section, form") || s); });

  /* Quotation request form */
  const form = $("#book-form"), status = $(".form-status", form), btn = $("#b-submit");
  const bType = $("#b-type"), bPal = $("#b-pallets"), bMonths = $("#b-months"), bStart = $("#b-start");
  (w.storage_types || []).forEach((t) => bType.add(new Option(`${TYPES[t]?.name || t} (${TYPES[t]?.range || ""})`, t)));
  bPal.value = Math.min(10, w.pallets_available || 1);
  bMonths.min = w.min_months; bMonths.value = w.min_months;
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  bStart.min = today.toISOString().slice(0, 10);
  bStart.value = bStart.min;

  const u = await ready;
  const label = !u.session ? "Log in to request a quotation" : "Request quotation";
  btn.textContent = label;
  if (preview && w.status !== "approved") {
    btn.disabled = true;
    btn.textContent = "Not listed yet";
  } else if (!(w.pallets_available > 0)) {
    // Opened from an old link while fully booked
    form.querySelectorAll("select, input, textarea").forEach((f) => (f.disabled = true));
    btn.disabled = true;
    btn.textContent = "Fully booked";
    $("#wd-quote-btn").textContent = "Fully booked";
    status.className = "form-status notice warn";
    status.innerHTML = `This warehouse is fully booked right now. <a href="warehouses.html">See available warehouses →</a>`;
    status.hidden = false;
  }

  // Show the form as "requested" so the client doesn't send the same request twice
  const fields = [...form.querySelectorAll("select, input, textarea")];
  function showRequested(ref, st) {
    fields.forEach((f) => (f.disabled = true));
    btn.disabled = true;
    btn.textContent = st === "quoted" ? "Quotation received" : "Quotation requested";
    status.className = "form-status notice";
    status.innerHTML = st === "quoted"
      ? `Your quotation for request <strong>${esc(ref)}</strong> is ready. <a href="my-bookings.html">View and accept it →</a>`
      : `Request <strong>${esc(ref)}</strong> sent. We'll send you a quotation soon. <a href="my-bookings.html">View my quotes →</a>`;
    status.insertAdjacentHTML("beforeend", `<br><button type="button" class="linkbtn" id="b-again" style="margin-top:.4rem">Request another quotation</button>`);
    status.hidden = false;
    $("#b-again").addEventListener("click", () => {
      fields.forEach((f) => (f.disabled = false));
      btn.disabled = false; btn.textContent = label;
      status.hidden = true;
      bType.focus();
    });
  }

  // Already asked for a quote on this warehouse? Show that instead of an empty form.
  if (u.session && !preview) {
    const { data: open } = await sb.from("bookings").select("ref, status")
      .eq("client_id", u.session.user.id).eq("warehouse_id", w.id).in("status", ["pending", "quoted"])
      .order("created_at", { ascending: false }).limit(1);
    if (open && open.length) showRequested(open[0].ref, open[0].status);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!u.session) {
      location.href = "login.html?next=" + encodeURIComponent("warehouse.html?id=" + id);
      return;
    }
    const contact = $("input[name=b-contact]:checked", form);
    $("#b-contact .err").hidden = !!contact;
    if (!contact) { $("#b-contact input").focus(); return; }
    if (!form.reportValidity()) return;
    btn.disabled = true; btn.textContent = "Sending…";
    const { data, error } = await sb.from("bookings").insert({
      client_id: u.session.user.id, warehouse_id: w.id, storage_type: bType.value,
      pallets: +bPal.value, months: +bMonths.value, start_date: bStart.value,
      notes: $("#b-notes").value.trim() || null, contact_method: contact.value
    }).select("ref").single();
    if (error) {
      btn.disabled = false; btn.textContent = label;
      status.className = "form-status notice warn";
      status.textContent = errMsg(error);
      status.hidden = false;
      return;
    }
    showRequested(data.ref, "pending");
  });
})();
