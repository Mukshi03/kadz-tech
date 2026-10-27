/* Log in, sign up and password reset */
(async function () {
  const { sb, $, $$, esc, errMsg, getUser, homeFor, safeNext, showSetupNotice } = window.KZ;
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get("next"));
  const loginF = $("#login-form"), signF = $("#signup-form"), resetF = $("#reset-form"), verifyF = $("#verify-form");
  const pageUrl = location.href.split(/[?#]/)[0];
  function show(which) {
    loginF.hidden = which !== "login";
    signF.hidden = which !== "signup";
    resetF.hidden = which !== "reset";
    verifyF.hidden = which !== "verify";
    document.title = ({ signup: "Create account", reset: "Set a new password", verify: "Verify your email" }[which] || "Log in") + " | " + window.KZ.C.company;
    const f = { signup: signF, reset: resetF, verify: verifyF }[which] || loginF;
    $("input:not([type=radio]):not([type=checkbox])", f)?.focus();
  }
  $$("[data-show]").forEach((b) => b.addEventListener("click", () => show(b.dataset.show)));

  // Show / hide password
  $$(".pw-toggle").forEach((b) => b.addEventListener("click", () => {
    const input = b.previousElementSibling, hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    b.textContent = hidden ? "Hide" : "Show";
    b.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
  }));

  // "Continue with Google" appears only when it's turned on in config.js
  if (window.KZ.C.googleLogin && sb) {
    $$("[data-google]").forEach((el) => (el.hidden = false));
    $(".auth-google").addEventListener("click", async () => {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: pageUrl + (next ? "?next=" + encodeURIComponent(next) : "") } });
      if (error) say(loginF, esc(errMsg(error)));
    });
  }
  if (params.get("mode") === "signup") show("signup");
  if (params.get("role") === "partner") $('input[name=role][value=partner]').checked = true;
  // Invited employee: no role choice, the account joins the partner who invited them
  if (params.get("invite")) {
    show("signup");
    $("#invite-note").hidden = false; $("#role-pick").hidden = true;
    $('input[name=role][value=client]').checked = true;
    $("#s-company").closest("label").hidden = true;
    $("#s-company").closest(".form-row").style.gridTemplateColumns = "1fr";
    if (params.get("email")) $("#s-email").value = params.get("email");
  }

  // "List my warehouse" asks for first and last name, company, CR and VAT numbers.
  // Hidden fields are switched off so the browser doesn't check them.
  function showRoleFields() {
    const role = $("input[name=role]:checked").value;
    $$("[data-for]", signF).forEach((box) => {
      const on = box.dataset.for === role;
      box.hidden = !on;
      $$("input", box).forEach((i) => (i.disabled = !on));
    });
  }
  $$("input[name=role]").forEach((r) => r.addEventListener("change", showRoleFields));
  // Digits only in the CR and VAT boxes
  ["#s-cr", "#s-vat"].forEach((id) => $(id).addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, ""))));
  showRoleFields();

  function say(form, msg, ok) {
    const s = $(".form-status", form);
    s.className = "form-status notice" + (ok ? "" : " warn");
    s.innerHTML = msg; s.hidden = false;
  }
  function busy(form, on, label) {
    const b = $("button[type=submit]", form);
    if (!b.dataset.label) b.dataset.label = b.textContent;
    b.disabled = on; b.textContent = on ? label : b.dataset.label;
  }

  if (!sb) { showSetupNotice($("main")); return; }

  // Coming back from a password-reset email
  let recovering = /type=recovery/.test(location.hash);
  if (recovering) show("reset");
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") { recovering = true; show("reset"); }
  });

  async function goHome() {
    const u = await getUser();
    location.href = next || homeFor(u.profile?.role);
  }

  // Already logged in? Go to the dashboard.
  const existing = await getUser();
  if (existing.session && !recovering) {
    // small delay so a recovery event can arrive first
    setTimeout(() => { if (!recovering) goHome(); }, 300);
  }

  // Log in = password, then a code sent by email (every time)
  loginF.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loginF.reportValidity()) return;
    const email = $("#l-email").value.trim();
    busy(loginF, true, "Checking…");
    const { error } = await sb.auth.signInWithPassword({ email, password: $("#l-pass").value });
    if (error && /not confirmed/i.test(error.message || "")) {
      // Signed up but never verified: send a fresh sign-up code and ask for it
      await sb.auth.resend({ type: "signup", email });
      busy(loginF, false);
      return askCode(email, "signup", "Your email isn't verified yet. We've sent you a new code.");
    }
    if (error) { busy(loginF, false); return say(loginF, esc(errMsg(error))); }
    // Password is right. Don't keep this session: log in only after the email code.
    await sb.auth.signOut({ scope: "local" });
    busy(loginF, true, "Sending code…");
    const sent = await sendLoginCode(email);
    busy(loginF, false);
    if (sent.error) return say(loginF, esc(errMsg(sent.error)));
    $("#l-pass").value = "";
    askCode(email, "login");
  });
  const sendLoginCode = (email) => sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

  $("#forgot").addEventListener("click", async () => {
    const email = $("#l-email").value.trim();
    if (!email) { $("#l-email").focus(); return say(loginF, "Enter your email above, then click <strong>Forgot password?</strong> again."); }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: pageUrl });
    if (error) return say(loginF, esc(errMsg(error)));
    say(loginF, `If an account exists for <strong>${esc(email)}</strong>, a reset link is on its way. Check your inbox.`, true);
  });

  signF.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!signF.reportValidity()) return;
    busy(signF, true, "Creating account…");
    const role = $("input[name=role]:checked").value;
    const email = $("#s-email").value.trim();
    const { data, error } = await sb.auth.signUp({
      email, password: $("#s-pass").value,
      options: {
        emailRedirectTo: pageUrl + (next ? "?next=" + encodeURIComponent(next) : ""),
        data: role === "partner" ? {
          role, first_name: $("#s-first").value.trim(), last_name: $("#s-last").value.trim(),
          full_name: `${$("#s-first").value.trim()} ${$("#s-last").value.trim()}`,
          company: $("#s-pcompany").value.trim(), cr_number: $("#s-cr").value.trim(), vat_number: $("#s-vat").value.trim(),
          phone: $("#s-phone").value.trim()
        } : { role, full_name: $("#s-name").value.trim(), company: $("#s-company").value.trim(), phone: $("#s-phone").value.trim() }
      }
    });
    busy(signF, false);
    if (error) return say(signF, esc(errMsg(error)));
    if (data.session) return goHome();   // email confirmation is turned off
    // Supabase returns a user with no identities when the email is already registered
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      return say(signF, `An account with <strong>${esc(email)}</strong> already exists. <button type="button" class="linkbtn auth-link" data-show="login">Log in</button> instead.`);
    signF.reset(); showRoleFields();
    askCode(email, "signup");
  });

  /* ---------- Email code: after sign-up ("signup") and at every log in ("login") ---------- */
  let codeEmail = "", codeFor = "signup", cooldown = 0, timer;
  const resendB = $("#v-resend"), codeIn = $("#v-code");
  function startCooldown() {
    cooldown = 60; clearInterval(timer);
    const tick = () => {
      resendB.disabled = cooldown > 0;
      resendB.textContent = cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code";
      if (cooldown-- <= 0) clearInterval(timer);
    };
    tick(); timer = setInterval(tick, 1000);
  }
  function askCode(email, kind, note) {
    codeEmail = email; codeFor = kind;
    $("#v-email").textContent = email;
    $("#v-label").textContent = kind === "login" ? "Two-step log in" : "Verify your email";
    $("#v-intro").textContent = kind === "login" ? ". Enter it below to finish logging in." : ". Enter it below to activate your account.";
    $("#v-submit").textContent = kind === "login" ? "Log in" : "Verify email";
    $("#v-back").dataset.show = kind === "login" ? "login" : "signup";
    codeIn.value = ""; $(".form-status", verifyF).hidden = true;
    show("verify");
    if (note) say(verifyF, note, true);
    startCooldown();
  }
  codeIn.addEventListener("input", () => {
    // The code length is set in Supabase (6–8 digits); submit by itself once 8 are in
    codeIn.value = codeIn.value.replace(/\D/g, "").slice(0, 8);
    if (codeIn.value.length === 8) verifyF.requestSubmit();
  });
  resendB.addEventListener("click", async () => {
    if (cooldown > 0) return;
    const { error } = codeFor === "login" ? await sendLoginCode(codeEmail) : await sb.auth.resend({ type: "signup", email: codeEmail });
    if (error) return say(verifyF, esc(errMsg(error)));
    say(verifyF, `A new code is on its way to <strong>${esc(codeEmail)}</strong>.`, true);
    startCooldown();
  });
  verifyF.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!verifyF.reportValidity()) return;
    busy(verifyF, true, "Verifying…");
    const { data, error } = await sb.auth.verifyOtp({ email: codeEmail, token: codeIn.value, type: codeFor === "login" ? "email" : "signup" });
    busy(verifyF, false);
    if (error || !data?.session) {
      codeIn.select();
      return say(verifyF, /expired|invalid/i.test(error?.message || "")
        ? "That code is wrong or has expired. Check the latest email, or resend a new code."
        : esc(errMsg(error || { message: "We couldn't verify the code. Try again." })));
    }
    if (codeFor === "login") window.KZ.rememberLogin($("#l-keep").checked);
    say(verifyF, codeFor === "login" ? "Logged in. Taking you to your account…" : "Email verified. Taking you to your account…", true);
    setTimeout(goHome, 900);
  });

  resetF.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!resetF.reportValidity()) return;
    busy(resetF, true, "Saving…");
    const { error } = await sb.auth.updateUser({ password: $("#r-pass").value });
    busy(resetF, false);
    if (error) return say(resetF, esc(errMsg(error)));
    say(resetF, "Password updated. Taking you to your account…", true);
    recovering = false;
    setTimeout(goHome, 1200);
  });
})();
