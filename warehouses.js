/* Find a warehouse — loads approved warehouses from the database */
(async function () {
  const { sb, C, esc, fmt, money, $, typeChips, photoUrl, showSetupNotice } = window.KZ;
  const list = $("#listings"), count = $("#result-count");
  const fCity = $("#f-city"), fType = $("#f-type"), fPal = $("#f-pallets"), fSort = $("#f-sort");

  const q = new URLSearchParams(location.search);
  if (q.get("city")) fCity.value = q.get("city");
  if (q.get("type")) fType.value = q.get("type");
  if (q.get("pallets")) fPal.value = q.get("pallets");

  if (!sb) {
    showSetupNotice($("main"));
    count.textContent = "0 warehouses";
    list.innerHTML = `<div class="empty"><strong>No warehouses yet</strong><p>Listings appear here once the database is connected.</p></div>`;
    return;
  }

  const { data, error } = await sb.from("warehouses")
    .select("id,name,city,district,area_sqm,pallets_available,storage_types,features,price_per_pallet,min_months,photos")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<div class="notice warn">Couldn't load warehouses. Refresh the page to try again.</div>`;
    count.textContent = "";
    return;
  }
  const all = data || [];

  // Add any cities from listings that aren't in config.js
  const known = new Set([...fCity.options].map((o) => o.value));
  [...new Set(all.map((w) => w.city))].sort().forEach((c) => { if (!known.has(c)) fCity.add(new Option(c, c)); });
  if (q.get("city")) fCity.value = q.get("city");

  function render() {
    if (!all.length) {
      count.textContent = "0 warehouses";
      list.innerHTML = `
        <div class="empty">
          <strong>No warehouses listed yet</strong>
          <p>Warehouses appear here once they're approved. Own a facility? List it and reach businesses looking for space.</p>
          <a class="btn btn-primary" href="partners.html">List your warehouse</a>
        </div>`;
      return;
    }
    const minPal = Number(fPal.value) || 0;
    const rows = all.filter((w) =>
      (!fCity.value || w.city === fCity.value) &&
      (!fType.value || (w.storage_types || []).includes(fType.value)) &&
      (w.pallets_available || 0) >= minPal);
    if (fSort.value === "pallets") rows.sort((a, b) => b.pallets_available - a.pallets_available);
    if (fSort.value === "area") rows.sort((a, b) => (b.area_sqm || 0) - (a.area_sqm || 0));
    if (fSort.value === "price") rows.sort((a, b) => (a.price_per_pallet ?? 1e9) - (b.price_per_pallet ?? 1e9));

    count.textContent = `${rows.length} of ${all.length} warehouse${all.length === 1 ? "" : "s"}`;
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><strong>No matches</strong><p>Try another city or storage type, or lower the pallet count.</p></div>`;
      return;
    }
    list.innerHTML = rows.map((w) => {
      const href = `warehouse.html?id=${encodeURIComponent(w.id)}`;
      const img = w.photos?.[0] ? `<img src="${esc(photoUrl(w.photos[0]))}" alt="" loading="lazy">` : "";
      return `
      <article class="listing has-photo">
        <a class="ph" href="${href}" tabindex="-1" aria-hidden="true">${img}</a>
        <div style="min-width:0">
          <h3><a href="${href}">${esc(w.name)}</a></h3>
          <p class="meta">${esc([w.district, w.city].filter(Boolean).join(", "))}${w.area_sqm ? ` · <span class="num">${fmt(w.area_sqm)}</span> m²` : ""}</p>
          <div class="chips">${typeChips(w.storage_types)}</div>
          <p class="features">${w.price_per_pallet != null ? `<strong>${money(w.price_per_pallet)}</strong> per pallet / month` : "Price on request"}${w.min_months > 1 ? ` · min. ${w.min_months} months` : ""}</p>
        </div>
        <div class="side">
          <div><div class="big num">${fmt(w.pallets_available)}</div><span class="label">pallets free</span></div>
          <a class="btn btn-primary" href="${href}">View &amp; book</a>
        </div>
      </article>`;
    }).join("");
  }
  [fCity, fType, fPal, fSort].forEach((el) => el.addEventListener("input", render));
  render();
})();
