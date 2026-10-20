/* Log in, sign up and password reset */
(async function () {
  const { sb, $, $$, esc, errMsg, getUser, homeFor, safeNext, showSetupNotice } = window.KZ;
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get("next"));
  const loginF = $("#login-form"), signF = $("#signup-form"), resetF = $("#reset-form");
  const tabs = { login: $("#tab-login"), signup: $("#tab-signup") };

  function show(which) {
    loginF.hidden = which !== "login";
    signF.hidden = which !== "signup";
    resetF.hidden = which !== "reset";
    tabs.login.setAttribute("aria-selected", which === "login");
    tabs.signup.setAttribute("aria-selected", which === "signup");
    $(".tabs").hidden = which === "reset";
  }
  tabs.login.addEventListener("click", () => show("login"));
  tabs.signup.addEventListener("click", () => show("signup"));
  if (params.get("mode") === "signup") show("signup");
  if (params.get("role") === "partner") $('input[name=role][value=partner]').checked = true;

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
  const pageUrl = location.href.split(/[?#]/)[0];

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

  loginF.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loginF.reportValidity()) return;
    busy(loginF, true, "Logging in…");
    const { error } = await sb.auth.signInWithPassword({ email: $("#l-email").value.trim(), password: $("#l-pass").value });
    busy(loginF, false);
    if (error) return say(loginF, esc(errMsg(error)));
    goHome();
  });

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
        data: { role, full_name: $("#s-name").value.trim(), company: $("#s-company").value.trim(), phone: $("#s-phone").value.trim() }
      }
    });
    busy(signF, false);
    if (error) return say(signF, esc(errMsg(error)));
    if (data.session) return goHome();   // email confirmation is turned off
    signF.reset();
    say(signF, `Account created. We sent a confirmation link to <strong>${esc(email)}</strong>. Click it, then log in.`, true);
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
