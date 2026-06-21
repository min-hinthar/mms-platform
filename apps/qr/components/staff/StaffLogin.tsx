"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";

/**
 * Staff sign-in (S1.1a) — passwordless magic-link / email-OTP. Two steps: request a 6-digit code to
 * a provisioned staff email, then verify it. `shouldCreateUser: false` means only accounts an owner
 * has already provisioned can sign in — a stranger's email never mints a session. On success the
 * @supabase/ssr browser client persists the session to cookies, so the /staff server shell reads the
 * verified uid and the staff row gates the rest. The PIN fast-path on a shared tablet is S1.1b.
 */
export function StaffLogin({ denied = false }: { denied?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Resend cooldown (seconds): Supabase throttles OTP sends (~60s per address + an hourly cap), so a
  // 429 is easy to trip by re-tapping. Gate the button on a local countdown to stop users spamming it.
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Move focus deliberately on each step change (QA §A) — to the code field when it appears, back to
  // the email field on "use a different email". Also covers the initial mount (step starts 'email').
  useEffect(() => {
    (step === "code" ? codeRef : emailRef).current?.focus();
  }, [step]);

  // Tick the cooldown to zero. Keyed on the boolean (not the value) so the interval is created ONCE
  // when the cooldown starts and torn down when it ends — not rebuilt every second; the functional
  // updater self-stops at 0 (no stale closure on `cooldown`).
  const cooling = cooldown > 0;
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooling]);

  // "Continue with Google" — OAuth redirect flow. On success the browser leaves for Google and comes
  // back to /staff/auth/callback (which exchanges the code → /staff); only an error stays on this page.
  async function google() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/staff/auth/callback` },
    });
    if (err) {
      setBusy(false);
      setError("Couldn’t start Google sign-in. Try again.");
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      // emailRedirectTo makes the magic LINK in the email land on our callback (the email carries both
      // a link and the {{ .Token }} code — either works). shouldCreateUser:false: only a provisioned
      // staff account (provisionStaff pre-creates it) can request a code.
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/staff/auth/callback`,
      },
    });
    setBusy(false);
    if (err) {
      // A 429 is the email rate limit (per-address cooldown + hourly cap), NOT a bad address — say so
      // honestly and start the cooldown so they don't keep tripping it.
      if (err.status === 429) {
        setCooldown(60);
        setError("Too many requests. Wait a minute, then request a new code.");
        return;
      }
      // Otherwise: a non-staff email or a typo — let them fix it and retry (no cooldown).
      setError(
        "We couldn’t send a code to that email. Check it’s your staff address and try again.",
      );
      return;
    }
    setCooldown(60);
    setStep("code");
    setNotice(`We sent a 6-digit code to ${email.trim()}.`);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await browserClient().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (err) {
      setBusy(false);
      setError("That code didn’t match or has expired. Request a new one.");
      return;
    }
    // Session is now in cookies — let the server shell re-gate against the staff row.
    router.replace("/staff");
    router.refresh();
  }

  // Recovery for the "signed in but not staff" case: clear the wrong session so a different email
  // can be tried (otherwise the server would keep bouncing them here).
  async function signOutWrong() {
    await browserClient().auth.signOut();
    router.refresh();
  }

  return (
    <main style={wrap}>
      <div className="card" style={card}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Staff
        </p>
        <h1 style={h1}>Sign in to the floor</h1>
        <p style={sub}>
          {step === "email"
            ? "Enter your staff email and we’ll send a one-time code."
            : "Enter the 6-digit code we emailed you."}
        </p>

        {denied && (
          // A discrete, important state reached via redirect — announce it (distinct from the polite
          // status region below; QA §A's "one live region" guards against redundant aria-live on the
          // SAME message, not an alert + a separate progress region).
          <div role="alert" style={deniedBox}>
            <p style={{ margin: "0 0 8px" }}>
              You’re signed in, but this account isn’t set up as staff. Ask an owner to add you — or
              sign out and use another email.
            </p>
            <button type="button" onClick={signOutWrong} style={linkBtn}>
              Sign out
            </button>
          </div>
        )}

        {step === "email" && (
          <>
            <button type="button" onClick={google} disabled={busy} style={googleBtn}>
              {/* The Google "G" uses Google's official brand colors by mandate — a sanctioned literal-
                  color exception (like email HTML), not a token miss. Decorative → aria-hidden. */}
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
                />
              </svg>
              {busy ? "Starting…" : "Continue with Google"}
            </button>
            <div style={dividerRow} aria-hidden>
              <span style={dividerLine} />
              <span style={{ fontSize: 12, color: "var(--t3)" }}>or use your email</span>
              <span style={dividerLine} />
            </div>
          </>
        )}

        {step === "email" ? (
          <form onSubmit={sendCode} noValidate>
            <label htmlFor="staff-email" style={label}>
              Staff email
            </label>
            <input
              ref={emailRef}
              id="staff-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // Editing the address clears the cooldown: a 429 on the OLD (rate-limited) address
                // must not block sending to a corrected/different one (the server still rate-limits
                // per-address, so this can't be used to actually bypass the limit).
                setCooldown(0);
              }}
              placeholder="you@mandalaymorningstar.com"
              style={input}
            />
            <button
              type="submit"
              disabled={busy || cooldown > 0 || email.trim().length < 3}
              style={primaryBtn}
            >
              {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <label htmlFor="staff-code" style={label}>
              6-digit code
            </label>
            <input
              ref={codeRef}
              id="staff-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              style={{ ...input, letterSpacing: "0.4em", fontVariantNumeric: "tabular-nums" }}
            />
            <button type="submit" disabled={busy || code.trim().length !== 6} style={primaryBtn}>
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
              style={linkBtn}
            >
              Use a different email
            </button>
          </form>
        )}

        {/* One live region for both the success notice and the error (QA §A: no redundant regions). */}
        <p role="status" aria-live="polite" style={{ margin: 0, minHeight: 20 }}>
          {error ? (
            <span style={{ color: "var(--warn)", fontSize: 13 }}>{error}</span>
          ) : notice ? (
            <span style={{ color: "var(--t2)", fontSize: 13 }}>{notice}</span>
          ) : null}
        </p>
      </div>
    </main>
  );
}

const wrap: CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: "var(--s6)",
};
const card: CSSProperties = { width: "100%", maxWidth: 380, padding: "var(--s6)" };
const googleBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  border: "1px solid var(--bd)",
  borderRadius: "var(--r-full)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
const dividerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "var(--s4) 0",
};
const dividerLine: CSSProperties = { flex: 1, height: 1, background: "var(--bd)" };
const deniedBox: CSSProperties = {
  background: "var(--warnb)",
  color: "var(--warn)",
  border: "1px solid var(--bd)",
  borderRadius: "var(--r-sm)",
  padding: "12px 14px",
  marginBottom: "var(--s5)",
  fontSize: 13,
  lineHeight: 1.5,
};
const h1: CSSProperties = { fontSize: 24, margin: "0 0 6px" };
const sub: CSSProperties = { color: "var(--t2)", fontSize: 14, margin: "0 0 var(--s5)" };
const label: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: 16, // ≥16px so iOS doesn't zoom the field on focus
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  marginBottom: "var(--s4)",
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
const linkBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  marginTop: 4,
  border: "none",
  background: "transparent",
  color: "var(--ac)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
