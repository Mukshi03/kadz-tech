/* Warehouse detail page + booking request */
(async function () {
  const { sb, C, TYPES, esc, fmt, money, $, typeChips, photoUrl, errMsg, showSetupNotice, ready } = window.KZ;
  const id = new URLSearchParams(location.search).get("id");
  const body = $("#wh-body");

  function notFound(msg) {
    $("#wh-name").textContent = "Warehouse not found";
    $("#wh-place").textContent = "";
    body.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>${esc(msg)}</strong>
      <a class="btn btn-primary" href="warehouses.html">Browse warehouses</a></div>`;
  }

  if (!sb) { showSetupNotice($("main")); return notFound("The database isn't connected yet."); }
  if (!id) return notFound("No warehouse was selected.");

  const { data: w, error } = await sb.from("warehouses").select("*").eq("id", id).maybeSingle();
  if (error || !w) return notFound("This warehouse doesn't exist or isn't listed anymore.");

  document.title = `${w.name} | ${C.company}`;
  $("#wh-name").textContent = w.name;
  $("#wh-place").textContent = [w.district, w.city].filter(Boolean).join(", ");
  $("#wh-types").innerHTML = typeChips(w.storage_types) +
    (w.status !== "approved" ? ` <span class="pill warn">${esc(w.status)} – only you can see this</span>` : "");

  /* Gallery */
  const photos = (w.photos || []).map(photoUrl);
  const g = $("#gallery");
  if (photos.length) {
    g.innerHTML = `<div class="main"><img id="g-main" src="${esc(photos[0])}" alt="${esc(w.name)}"></div>` +
      (photos.length > 1 ? `<div class="thumbs">${photos.map((p, i) =>
        `<button type="button" data-i="${i}" aria-current="${i === 0}"><img src="${esc(p)}" alt="Photo ${i + 1}"></button>`).join("")}</div>` : "");
    g.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]"); if (!b) return;
      $("#g-main").src = photos[b.dataset.i];
      g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-current", x === b));
    });
  } else {
    g.innerHTML = `<div class="main" style="display:grid;place-items:center"><span class="label">No photos yet</span></div>`;
  }

  /* Specs */
  $("#spec").innerHTML = `
    <div><span class="label">Pallets free</span><b>${fmt(w.pallets_available)}</b></div>
    <div><span class="label">Price / pallet / month</span><b>${w.price_per_pallet != null ? fmt(w.price_per_pallet) : "–"}</b>${w.price_per_pallet != null ? `<span class="muted">${esc(C.currency)}</span>` : `<span class="muted">On request</span>`}</div>
    <div><span class="label">Area</span><b>${w.area_sqm ? fmt(w.area_sqm) : "–"}</b><span class="muted">m²</span></div>
    <div><span class="label">Minimum rental</span><b>${w.min_months}</b><span class="muted">month${w.min_months > 1 ? "s" : ""}</span></div>`;

  const LIC = { "commercial-registration": "Commercial registration", baladiya: "Municipality (Baladiya)", "civil-defense": "Civil Defense", sfda: "SFDA" };
  const FEAT = { racking: "Racking", "loading-docks": "Loading docks", forklifts: "Forklifts", cctv: "24/7 CCTV", wms: "Warehouse software", security: "Security guards", "fire-system": "Fire suppression" };
  $("#wh-desc").innerHTML = [
    w.description && `<div><h3 style="margin-bottom:.5rem">About</h3><p style="white-space:pre-line;max-width:65ch">${esc(w.description)}</p></div>`,
    w.features?.length && `<div><span class="label">Facilities</span><div class="taglist" style="margin-top:.4rem">${w.features.map((f) => `<span class="tag">${esc(FEAT[f] || f)}</span>`).join("")}</div></div>`,
    w.licenses?.length && `<div><span class="label">Licenses</span><div class="taglist" style="margin-top:.4rem">${w.licenses.map((f) => `<span class="tag">${esc(LIC[f] || f)}</span>`).join("")}</div></div>`,
    w.map_url && /^https?:\/\//.test(w.map_url) && `<p><a href="${esc(w.map_url)}" target="_blank" rel="noopener">Open location in maps →</a></p>`
  ].filter(Boolean).join("");

  /* Booking form */
  const form = $("#book-form"), status = $(".form-status", form), btn = $("#b-submit");
  const bType = $("#b-type"), bPal = $("#b-pallets"), bMonths = $("#b-months"), bStart = $("#b-start");
  (w.storage_types || []).forEach((t) => bType.add(new Option(`${TYPES[t]?.name || t} (${TYPES[t]?.range || ""})`, t)));
  bPal.max = w.pallets_available || 1;
  bPal.value = Math.min(10, w.pallets_available || 1);
  bMonths.min = w.min_months; bMonths.value = w.min_months;
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  bStart.min = today.toISOString().slice(0, 10);
  bStart.value = bStart.min;

  function calc() {
    const p = +bPal.value || 0, m = +bMonths.value || 0;
    $("#b-rate").textContent = w.price_per_pallet != null ? `${money(w.price_per_pallet)} / pallet / month` : "On request";
    $("#b-total").textContent = w.price_per_pallet != null && p && m ? money(w.price_per_pallet * p * m) : (w.price_per_pallet == null ? "On request" : "–");
  }
  [bPal, bMonths].forEach((el) => el.addEventListener("input", calc));
  calc();

  const u = await ready;
  if (w.status !== "approved" || !w.pallets_available) {
    btn.disabled = true;
    btn.textContent = w.status !== "approved" ? "Not open for booking yet" : "Fully booked";
  } else if (!u.session) {
    btn.textContent = "Log in to book";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!u.session) {
      location.href = "login.html?next=" + encodeURIComponent("warehouse.html?id=" + id);
      return;
    }
    if (!form.reportValidity()) return;
    btn.disabled = true; btn.textContent = "Sending…";
    const { data, error } = await sb.from("bookings").insert({
      client_id: u.session.user.id, warehouse_id: w.id, storage_type: bType.value,
      pallets: +bPal.value, months: +bMonths.value, start_date: bStart.value,
      notes: $("#b-notes").value.trim() || null
    }).select("ref").single();
    btn.disabled = false; btn.textContent = "Request booking";
    if (error) {
      status.className = "form-status notice warn";
      status.textContent = errMsg(error);
    } else {
      form.reset(); bStart.value = bStart.min; bMonths.value = w.min_months; calc();
      status.className = "form-status notice";
      status.innerHTML = `Request <strong>${esc(data.ref)}</strong> sent. We'll confirm soon. <a href="my-bookings.html">View my bookings →</a>`;
    }
    status.hidden = false;
  });
})();
