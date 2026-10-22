/* KADZ Logistics — quotation PDF, built in the browser with no outside library.
   Uses the standard PDF fonts Helvetica and Helvetica-Bold (Latin text). */
(function () {
  const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2013\u00b0\u00d7\u00b2\u00b7\u2019\u2022\u00e9\u00b3";
  const WIDTHS = {
    F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,556,400,584,333,278,222,350,556,333],
    F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,556,400,584,333,278,278,350,556,333]
  };
  const IDX = {};
  [...CHARS].forEach((c, i) => (IDX[c] = i));
  // Characters outside plain ASCII, mapped to the PDF's WinAnsi codes
  const WIN = { "–": 0x96, "°": 0xB0, "×": 0xD7, "²": 0xB2, "·": 0xB7, "’": 0x92, "•": 0x95, "é": 0xE9, "³": 0xB3 };
  const clean = (s) => String(s ?? "").replace(/[−—]/g, "-").replace(/[‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/[→]/g, "to").replace(/[^\x20-\x7e–°×²·’•é³]/g, "?");

  const width = (text, font, size) => [...clean(text)].reduce((s, c) => s + (WIDTHS[font][IDX[c]] ?? 556), 0) * size / 1000;

  function encode(text) {
    let out = "";
    for (const c of clean(text)) {
      if (WIN[c]) out += "\\" + WIN[c].toString(8).padStart(3, "0");
      else if (c === "(" || c === ")" || c === "\\") out += "\\" + c;
      else out += c;
    }
    return out;
  }

  function wrap(text, font, size, max) {
    const lines = [];
    for (const para of clean(text).split(/\n/)) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? line + " " + word : word;
        if (width(next, font, size) <= max || !line) line = next;
        else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }

  const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)).join(" "); };

  /* ---------- Tiny PDF page writer (A4, top-left coordinates) ---------- */
  function Doc() {
    const W = 595.28, H = 841.89;
    const pages = [];
    let ops;
    const doc = {
      W, H, image: null,
      addPage() { ops = []; pages.push(ops); },
      rect(x, y, w, h, color) { ops.push(`${hex(color)} rg ${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); },
      line(x1, y1, x2, y2, color, lw = 0.6) { ops.push(`${hex(color)} RG ${lw} w ${x1.toFixed(2)} ${(H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(H - y2).toFixed(2)} l S`); },
      text(t, x, y, { font = "F1", size = 10, color = "#15202b", align = "left" } = {}) {
        const w = width(t, font, size);
        const tx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
        ops.push(`BT /${font} ${size} Tf ${hex(color)} rg ${tx.toFixed(2)} ${(H - y).toFixed(2)} Td (${encode(t)}) Tj ET`);
        return w;
      },
      // Run fn(pageNumber, pageCount) on every page (used for footers)
      eachPage(fn) { pages.forEach((p, i) => { ops = p; fn(i + 1, pages.length); }); },
      // Filled shape from a list of [x, y] points (top-left coordinates)
      poly(pts, color) { ops.push(`${hex(color)} rg ` + pts.map(([x, y], i) => `${x.toFixed(2)} ${(H - y).toFixed(2)} ${i ? "l" : "m"}`).join(" ") + " h f"); },
      img(x, y, w, h) { if (doc.image) ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(H - y - h).toFixed(2)} cm /Im1 Do Q`); },
      output() {
        const objs = [];
        const add = (s) => { objs.push(s); return objs.length; };
        const catalog = add(null), pagesId = add(null);
        const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
        const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
        let imgId = null;
        if (doc.image) {
          const im = doc.image;
          imgId = add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${im.data}\nendstream`);
        }
        const kids = [];
        for (const p of pages) {
          const body = p.join("\n");
          const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
          kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${content} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${imgId ? ` /XObject << /Im1 ${imgId} 0 R >>` : ""} >> >>`));
        }
        objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
        objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
        let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        const offsets = [];
        objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
        const xref = out.length;
        out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
        out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
        return bytes;
      }
    };
    doc.addPage();
    return doc;
  }

  // Load the logo from config.js (any image) and turn it into a JPEG for the PDF
  async function loadLogo(src) {
    if (!src) return null;
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const scale = Math.min(1, 300 / img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext("2d");
      g.fillStyle = "#15202b"; g.fillRect(0, 0, c.width, c.height);   // logo sits on the dark header
      g.drawImage(img, 0, 0, c.width, c.height);
      const b64 = c.toDataURL("image/jpeg", 0.92).split(",")[1];
      return { data: atob(b64), w: c.width, h: c.height };
    } catch (e) { return null; }
  }

  const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (d) => d ? new Date(d + (String(d).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "-";

  /* Build the quotation.
     q = { company (config.js), booking, client, city, siteUrl, logo }
     For transportation / freight / customs: booking is the service request, plus
     serviceName, summary, facts ([label, value] pairs) and acceptUrl. */
  function buildQuotePdf(q) {
    const C = q.company, L = C.legal || {}, b = q.booking, cur = C.currency || "SAR";
    const INK = "#15202b", MUTED = "#56636f", LINE = "#d3d9df", AMBER = "#e3a008", BAND = "#15202b";
    const TYPE = { dry: "Dry storage (25–32 °C)", ambient: "Ambient storage (20–25 °C)", chilled: "Chilled storage (0–5 °C)", frozen: "Frozen storage (-18 °C)" };
    const d = Doc(); d.image = q.logo;
    const M = 42, R = d.W - M;
    let y;

    // ---- Header band
    d.rect(0, 0, d.W, 112, BAND);
    d.rect(0, 112, d.W, 4, AMBER);
    let nameX = M;
    if (q.logo) {
      // fit the logo inside 150 x 46 pt, keeping its shape
      const s = Math.min(150 / q.logo.w, 46 / q.logo.h), w = q.logo.w * s, h = q.logo.h * s;
      d.img(M, 56 - h / 2, w, h);
      nameX = M + w + 12;
    } else {
      // K badge logo (same shape as the website logo, drawn on a 58 x 58 grid)
      const k = 40 / 58, P = (pts) => pts.map(([x, y]) => [M + x * k, 36 + y * k]);
      d.rect(M + 2 * k, 36 + 2 * k, 54 * k, 54 * k, AMBER);
      d.poly(P([[14, 12], [21, 12], [21, 46], [14, 46]]), "#14100a");
      d.poly(P([[21, 27], [34, 12], [43, 12], [21, 37]]), "#14100a");
      d.poly(P([[26, 31], [31, 25], [44, 46], [35, 46]]), "#14100a");
      nameX = M + 52;
    }
    d.text((L.legalName || C.company || "").toUpperCase(), nameX, 54, { font: "F2", size: 15, color: "#ffffff" });
    if (C.tagline) d.text(C.tagline, nameX, 70, { size: 9, color: "#c5ced6" });
    d.text("QUOTATION", R, 50, { font: "F2", size: 22, color: AMBER, align: "right" });
    d.text(b.quote_number || "Draft", R, 70, { font: "F2", size: 10, color: "#ffffff", align: "right" });
    d.text(`Date: ${day((b.quoted_at || new Date().toISOString()).slice(0, 10))}`, R, 84, { size: 9, color: "#c5ced6", align: "right" });
    d.text(`Valid until: ${day(b.quote_valid_until)}`, R, 97, { size: 9, color: "#c5ced6", align: "right" });

    // ---- From / To
    y = 150;
    const col2 = d.W / 2 + 10;
    d.text("FROM", M, y, { font: "F2", size: 8, color: MUTED });
    d.text("PREPARED FOR", col2, y, { font: "F2", size: 8, color: MUTED });
    const from = [L.legalName || C.company, L.address || C.contact?.address, L.crNumber && `CR: ${L.crNumber}`, L.vatNumber && `VAT: ${L.vatNumber}`,
                  C.contact?.email, C.contact?.phone].filter(Boolean);
    const to = [q.client?.full_name, q.client?.company, q.client?.email, q.client?.phone].filter(Boolean);
    let yl = y + 16, yr = y + 16;
    from.forEach((t, i) => wrap(t, i ? "F1" : "F2", 10, col2 - M - 20).forEach((l) => { d.text(l, M, yl, { font: i ? "F1" : "F2", size: 10 }); yl += 14; }));
    to.forEach((t, i) => wrap(t, i ? "F1" : "F2", 10, R - col2).forEach((l) => { d.text(l, col2, yr, { font: i ? "F1" : "F2", size: 10 }); yr += 14; }));
    y = Math.max(yl, yr) + 14;

    let sub;
    if (b.service) {
      // ---- Transportation / freight / customs: shipment details, then one price line
      d.line(M, y, R, y, LINE);
      y += 20;
      const facts = [["Request reference", b.ref], ["Service", q.serviceName || b.service], ...(q.facts || [])];
      const per = 4, fw = (R - M) / per;
      for (let r = 0; r < facts.length; r += per) {
        let rowH = 0;
        facts.slice(r, r + per).forEach(([k, v], i) => {
          d.text(k.toUpperCase(), M + i * fw, y, { font: "F2", size: 7.5, color: MUTED });
          const lines = wrap(v, "F1", 10, fw - 12).slice(0, 3);
          lines.forEach((l, j) => d.text(l, M + i * fw, y + 15 + j * 12.5, { size: 10 }));
          rowH = Math.max(rowH, 15 + lines.length * 12.5);
        });
        y += rowH + 14;
      }
      y += 4;
      d.rect(M, y, R - M, 24, BAND);
      d.text("DESCRIPTION", M + 10, y + 16, { font: "F2", size: 8.5, color: "#ffffff" });
      d.text(`AMOUNT (${cur})`, R - 10, y + 16, { font: "F2", size: 8.5, color: "#ffffff", align: "right" });
      y += 24;
      const desc = wrap(b.price_description || [q.serviceName, q.summary].filter(Boolean).join(": "), "F1", 10, R - M - 150);
      desc.forEach((l, i) => d.text(l, M + 10, y + 19 + i * 13, { size: 10 }));
      sub = Number(b.client_price || 0);
      d.text(money(sub), R - 10, y + 19, { align: "right" });
      y += Math.max(30, 14 + desc.length * 13);
      d.line(M, y, R, y, LINE);
    } else {
      // ---- Request details
      d.line(M, y, R, y, LINE);
      y += 20;
      const facts = [["Request reference", b.ref], ["Location", q.city || "-"], ["Start date", day(b.start_date)],
                     ["Duration", `${b.months} month${b.months > 1 ? "s" : ""}`]];
      const fw = (R - M) / facts.length;
      facts.forEach(([k, v], i) => {
        d.text(k.toUpperCase(), M + i * fw, y, { font: "F2", size: 7.5, color: MUTED });
        d.text(v, M + i * fw, y + 15, { size: 10.5 });
      });
      y += 38;

      // ---- Price table
      // right edges of the number columns
      const cPal = 338, cMon = 392, cUnit = 478, descMax = 300 - M - 10;
      d.rect(M, y, R - M, 24, BAND);
      const th = (t, x, align) => d.text(t, x, y + 16, { font: "F2", size: 8.5, color: "#ffffff", align });
      th("DESCRIPTION", M + 10); th("PALLETS", cPal, "right"); th("MONTHS", cMon, "right");
      th(`RATE (${cur})`, cUnit, "right"); th(`AMOUNT (${cur})`, R - 10, "right");
      y += 24;
      const desc = wrap(`${TYPE[b.storage_type] || b.storage_type}, pallet positions per month`, "F1", 10, descMax);
      const rowH = Math.max(30, 14 + desc.length * 13);
      desc.forEach((l, i) => d.text(l, M + 10, y + 19 + i * 13, { size: 10 }));
      const unit = Number(b.price_per_pallet || 0); sub = unit * b.pallets * b.months;
      d.text(String(b.pallets), cPal, y + 19, { align: "right" });
      d.text(String(b.months), cMon, y + 19, { align: "right" });
      d.text(money(unit), cUnit, y + 19, { align: "right" });
      d.text(money(sub), R - 10, y + 19, { align: "right" });
      y += rowH;
      d.line(M, y, R, y, LINE);
    }

    // ---- Totals
    const vat = Number(b.vat_rate ?? 15), vatAmt = sub * vat / 100, total = sub + vatAmt;
    y += 20;
    const tl = R - 210;
    d.text("Subtotal", tl, y, { color: MUTED }); d.text(`${money(sub)} ${cur}`, R - 10, y, { align: "right" });
    y += 18;
    d.text(`VAT ${vat}%`, tl, y, { color: MUTED }); d.text(`${money(vatAmt)} ${cur}`, R - 10, y, { align: "right" });
    y += 10;
    d.rect(tl - 10, y, R - tl + 10, 30, "#fdf3d8");
    d.rect(tl - 10, y, 3, 30, AMBER);
    d.text("Total", tl, y + 20, { font: "F2", size: 12 });
    d.text(`${money(total)} ${cur}`, R - 10, y + 20, { font: "F2", size: 12, align: "right" });
    y += 54;

    // ---- Sections that may need more room
    const ensure = (need) => { if (y + need > d.H - 70) { d.addPage(); y = 60; } };
    const section = (title, lines, bullet) => {
      if (!lines.length) return;
      ensure(30);
      d.text(title.toUpperCase(), M, y, { font: "F2", size: 8, color: MUTED });
      y += 15;
      lines.forEach((t) => {
        const parts = wrap(t, "F1", 9.5, R - M - (bullet ? 12 : 0));
        ensure(parts.length * 13);
        parts.forEach((l, i) => {
          if (bullet && i === 0) d.text("•", M, y, { size: 9.5 });
          d.text(l, M + (bullet ? 12 : 0), y, { size: 9.5 }); y += 13;
        });
        y += 2;
      });
      y += 10;
    };
    section("Terms", C.quoteTerms || [], true);
    const bank = C.legal?.bank || {};
    section("Bank details", [bank.name && `Bank: ${bank.name}`, bank.accountName && `Account name: ${bank.accountName}`, bank.iban && `IBAN: ${bank.iban}`].filter(Boolean));

    ensure(60);
    d.rect(M, y, R - M, 40, "#eceff2");
    if (q.acceptUrl) {
      d.text("To accept or decline this quotation, open this link:", M + 12, y + 16, { size: 9.5 });
      d.text(q.acceptUrl, M + 12, y + 30, { font: "F2", size: width(q.acceptUrl, "F2", 9.5) > R - M - 24 ? 8 : 9.5 });
    } else {
      d.text("To accept this quotation, log in to your account and click Accept quotation:", M + 12, y + 16, { size: 9.5 });
      d.text(`${q.siteUrl || ""}my-bookings.html`, M + 12, y + 30, { font: "F2", size: 9.5 });
    }

    // ---- Footer on every page
    const foot = [L.legalName || C.company, L.crNumber && `CR ${L.crNumber}`, L.vatNumber && `VAT ${L.vatNumber}`].filter(Boolean).join("  \u00b7  ");
    d.eachPage((n, total) => {
      d.line(M, d.H - 40, R, d.H - 40, LINE);
      d.text(foot, M, d.H - 26, { size: 8, color: MUTED });
      d.text(`${b.quote_number || ""}  \u00b7  Page ${n} of ${total}`, R, d.H - 26, { size: 8, color: MUTED, align: "right" });
    });
    return d.output();
  }

  window.KZ = window.KZ || {};
  Object.assign(window.KZ, { buildQuotePdf, loadQuoteLogo: loadLogo });
})();

/* Open a saved quotation PDF (private file, short-lived link) */
(function () {
  window.KZ.openQuotePdf = async function (path) {
    const { sb, toast, errMsg } = window.KZ;
    const win = window.open("", "_blank");
    const { data, error } = await sb.storage.from("quotations").createSignedUrl(path, 300);
    if (error) { win && win.close(); return toast(errMsg(error), true); }
    if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
  };
})();
