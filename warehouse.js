/* Warehouse detail page + quotation request */
(async function () {
  const { sb, C, TYPES, esc, fmt, $, typeChips, photoUrl, errMsg, showSetupNotice, ready } = window.KZ;
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

  // Public listing first; owners and admins can also preview unapproved ones
  let { data: w } = await sb.from("public_warehouses").select("*").eq("id", id).maybeSingle();
  let preview = false;
  if (!w) {
    const r = await sb.from("warehouses").select("*").eq("id", id).maybeSingle();
    w = r.data; preview = !!w;
  }
  if (!w) return notFound("This warehouse doesn't exist or isn't listed anymore.");

  document.title = `${w.name} | ${C.company}`;
  $("#wh-name").textContent = w.name;
  $("#wh-place").textContent = [w.district, w.city].filter(Boolean).join(", ");
  $("#wh-types").innerHTML = typeChips(w.storage_types) +
    (preview ? ` <span class="pill warn">${esc(w.status)} – only you can see this</span>` : "");

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
    <div><span class="label">Pallet positions</span><b>${fmt(w.pallets_total)}</b></div>
    <div><span class="label">Area</span><b>${w.area_sqm ? fmt(w.area_sqm) : "–"}</b><span class="muted">m²</span></div>
    <div><span class="label">Minimum rental</span><b>${w.min_months}</b><span class="muted">month${w.min_months > 1 ? "s" : ""}</span></div>`;

  const LIC = { "commercial-registration": "Commercial registration", baladiya: "Municipality (Baladiya)", "civil-defense": "Civil Defense", sfda: "SFDA" };
  const FEAT = { racking: "Racking", "loading-docks": "Loading docks", forklifts: "Forklifts", cctv: "24/7 CCTV", wms: "Warehouse software", security: "Security guards", "fire-system": "Fire suppression" };
  $("#wh-desc").innerHTML = [
    w.description && `<div><h3 style="margin-bottom:.5rem">About</h3><p style="white-space:pre-line;max-width:65ch">${esc(w.description)}</p></div>`,
    w.features?.length && `<div><span class="label">Facilities</span><div class="taglist" style="margin-top:.4rem">${w.features.map((f) => `<span class="tag">${esc(FEAT[f] || f)}</span>`).join("")}</div></div>`,
    w.licenses?.length && `<div><span class="label">Licenses</span><div class="taglist" style="margin-top:.4rem">${w.licenses.map((f) => `<span class="tag">${esc(LIC[f] || f)}</span>`).join("")}</div></div>`,
    w.map_url && /^https?:\/\//.test(w.map_url) && `<p><a href="${esc(w.map_url)}" target="_blank" rel="noopener">Open location in maps →</a></p>`,
    `<p class="note">Prices depend on storage type, quantity and duration. Request a quotation and we'll reply with a price.</p>`
  ].filter(Boolean).join("");

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
    btn.disabled = false; btn.textContent = label;
    if (error) {
      status.className = "form-status notice warn";
      status.textContent = errMsg(error);
    } else {
      form.reset(); bStart.value = bStart.min; bMonths.value = w.min_months; bPal.value = Math.min(10, w.pallets_available || 1);
      status.className = "form-status notice";
      status.innerHTML = `Request <strong>${esc(data.ref)}</strong> sent. We'll send you a quotation soon. <a href="my-bookings.html">View my quotes →</a>`;
    }
    status.hidden = false;
  });
})();
