/* Message threads on quotes and bookings.
   Two threads per booking: "client" (client <-> admin) and "partner" (partner <-> admin). */
(function () {
  const { sb, C, esc, $, toast, errMsg } = window.KZ;
  const MAX = 10 * 1024 * 1024;
  const OK_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

  // Unread counts for the logged-in user: { "<booking id>:<thread>": number }
  async function loadUnread() {
    const { data } = await sb.rpc("my_unread");
    const map = {};
    (data || []).forEach((r) => (map[`${r.booking_id}:${r.thread}`] = r.unread));
    return map;
  }

  function when(ts) {
    const d = new Date(ts), now = new Date();
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? time
      : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " + time;
  }
  const fileName = (p) => p.split("/").pop().replace(/^[0-9a-f-]{36}-/, "");

  /* Show a thread inside `el`.
     opts: { bookingId, thread, myId, myRole, onRead } */
  function mountThread(el, opts) {
    const { bookingId, thread, myId, myRole } = opts;
    const nameFor = (m) => {
      if (m.sender_id === myId) return "You";
      if (m.sender_role === "admin") return C.company;
      return m.sender_role === "partner" ? "Partner" : "Client";
    };
    const intro = myRole === "admin"
      ? (thread === "client" ? "Private to you and the client. The partner can't see this." : "Private to you and the warehouse partner. The client can't see this.")
      : `Messages with ${C.company}. Ask about the quotation, delivery or anything else.`;

    el.innerHTML = `
      <div class="chat">
        <p class="chat-intro">${esc(intro)}</p>
        <div class="chat-log" role="log" aria-live="polite"><p class="muted">Loading messages…</p></div>
        <form class="chat-form" novalidate>
          <label class="sr-only" for="msg-${bookingId}-${thread}">Message</label>
          <textarea id="msg-${bookingId}-${thread}" rows="2" maxlength="5000" placeholder="Write a message"></textarea>
          <div class="chat-files"></div>
          <div class="chat-actions">
            <label class="btn btn-sm btn-plain chat-attach">Attach file
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden>
            </label>
            <span class="muted chat-hint">PDF or image, up to 10 MB</span>
            <button class="btn btn-sm btn-primary" type="submit">Send</button>
          </div>
        </form>
      </div>`;

    const log = $(".chat-log", el), form = $(".chat-form", el), input = $("textarea", el);
    const fileInput = $("input[type=file]", el), filesBox = $(".chat-files", el);
    let files = [], lastCount = -1, timer;

    function renderFiles() {
      filesBox.innerHTML = files.map((f, i) =>
        `<span class="tag">${esc(f.name)} <button type="button" class="linkbtn" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></span>`).join("");
    }
    fileInput.addEventListener("change", () => {
      for (const f of fileInput.files) {
        if (!OK_TYPES.includes(f.type)) { toast(`${f.name}: only PDF or images can be attached.`, true); continue; }
        if (f.size > MAX) { toast(`${f.name} is larger than 10 MB.`, true); continue; }
        files.push(f);
      }
      fileInput.value = ""; renderFiles();
    });
    filesBox.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      files.splice(+b.dataset.rm, 1); renderFiles();
    });

    async function markRead() {
      await sb.from("thread_reads").upsert({ user_id: myId, booking_id: bookingId, thread, last_read_at: new Date().toISOString() });
      opts.onRead && opts.onRead();
    }

    async function load(scroll) {
      const { data, error } = await sb.from("messages").select("*")
        .eq("booking_id", bookingId).eq("thread", thread).order("created_at", { ascending: true });
      if (error) { log.innerHTML = `<p class="notice warn">${esc(errMsg(error))}</p>`; return; }
      if (data.length === lastCount && !scroll) return;
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      lastCount = data.length;
      log.innerHTML = data.length ? data.map((m) => `
        <div class="msg${m.sender_id === myId ? " mine" : ""}">
          <div class="msg-head"><strong>${esc(nameFor(m))}</strong> <span>${when(m.created_at)}</span></div>
          ${m.body ? `<div class="msg-body">${esc(m.body)}</div>` : ""}
          ${m.attachments.length ? `<div class="msg-files">${m.attachments.map((p) =>
            `<button type="button" class="linkbtn" data-file="${esc(p)}">${esc(fileName(p))}</button>`).join("")}</div>` : ""}
        </div>`).join("") : `<p class="muted">No messages yet.</p>`;
      if (scroll || atBottom) log.scrollTop = log.scrollHeight;
      if (data.length) markRead();
    }

    log.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-file]"); if (!b) return;
      const win = window.open("", "_blank");
      const { data, error } = await sb.storage.from("message-files").createSignedUrl(b.dataset.file, 300);
      if (error) { win && win.close(); return toast(errMsg(error), true); }
      if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body && !files.length) { input.focus(); return; }
      const btn = $("button[type=submit]", form);
      btn.disabled = true; btn.textContent = "Sending…";
      try {
        const paths = [];
        for (const f of files) {
          const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
          const path = `${bookingId}/${thread}/${crypto.randomUUID()}-${safe}`;
          const { error } = await sb.storage.from("message-files").upload(path, f, { contentType: f.type });
          if (error) throw new Error(`Couldn't upload ${f.name}: ${error.message}`);
          paths.push(path);
        }
        const { error } = await sb.from("messages").insert({ booking_id: bookingId, thread, body, attachments: paths });
        if (error) throw error;
        input.value = ""; files = []; renderFiles();
        await load(true);
      } catch (err) {
        toast(errMsg(err), true);
      } finally {
        btn.disabled = false; btn.textContent = "Send";
      }
    });

    load(true);
    // Check for new messages while the thread is open
    timer = setInterval(() => { if (!document.hidden && el.isConnected) load(false); else if (!el.isConnected) clearInterval(timer); }, 15000);
    input.focus();
    return { close() { clearInterval(timer); el.innerHTML = ""; } };
  }

  /* A "Messages" toggle button for a card.
     Returns HTML; wire it up with bindThreadButtons(). */
  function threadButton(bookingId, thread, label, unread) {
    return `<button type="button" class="btn btn-sm btn-plain" data-thread="${esc(thread)}" data-booking="${esc(bookingId)}" aria-expanded="false">
      ${esc(label)}${unread ? ` <span class="count">${unread}</span>` : ""}</button>`;
  }

  // Clicking a thread button opens the thread in the card's [data-chat] box
  function bindThreadButtons(container, me, onRead) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-thread]");
      if (!btn) return;
      const card = btn.closest("[data-card]") || btn.closest("article");
      const box = $("[data-chat]", card);
      const key = `${btn.dataset.booking}:${btn.dataset.thread}`;
      const open = box.dataset.open === key;
      card.querySelectorAll("[data-thread]").forEach((b) => b.setAttribute("aria-expanded", "false"));
      if (box._thread) { box._thread.close(); box._thread = null; }
      box.dataset.open = "";
      if (open) return;
      btn.setAttribute("aria-expanded", "true");
      $(".count", btn)?.remove();
      box.dataset.open = key;
      box._thread = mountThread(box, { bookingId: btn.dataset.booking, thread: btn.dataset.thread, myId: me.id, myRole: me.role, onRead });
    });
  }

  Object.assign(window.KZ, { loadUnread, mountThread, threadButton, bindThreadButtons });
})();
