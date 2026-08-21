"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { isRetryableAuthShape } from "@/lib/staff-outage";
import { DEFAULT_NEXT } from "@/lib/safe-next";

/**
 * Staff sign-in (S1.1a) — passwordless magic-link / email-OTP. Two steps: request a 6-digit code to
 * a provisioned staff email, then verify it. `shouldCreateUser: false` means only accounts an owner
 * has already provisioned can sign in — a stranger's email never mints a session. On success the
 * @supabase/ssr browser client persists the session to cookies, so the /staff server shell reads the
 * verified uid and the staff row gates the rest. The PIN fast-path on a shared tablet is S1.1b.
 */
export function StaffLogin({
  denied = false,
  next = DEFAULT_NEXT,
}: {
  denied?: boolean;
  /**
   * Where this sign-in is FOR — already validated by the page against the allowlist, so it is safe
   * to put in a redirect and in the magic link. Signing in on the lobby kiosk or the ready-board TV
   * has to land back on that surface; sending every device to /staff would leave someone re-typing
   * a device URL on a screen with no keyboard.
   */
  next?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Resend cooldown (seconds): after a SUCCESSFUL send, Supabase's per-address window is ~60s, so the
  // "Resend in Ns" countdown is honest. A 429 is different — it's the hourly cap, which 60s won't
  // clear, so we DON'T arm a countdown that re-enables straight into another 429 (see `emailBlocked`).
  const [cooldown, setCooldown] = useState(0);
  // A 429 (`over_email_send_rate_limit`) hit for `sentTo`. Distinct from `cooldown`: there's no honest
  // short timer to show (the cap is hourly), so the button stays disabled and points at Google rather
  // than dangling a "Resend in 60s" that just trips the limit again.
  const [emailBlocked, setEmailBlocked] = useState(false);
  // The address the active cooldown/block belongs to. Both are scoped to THIS address: switching to a
  // genuinely different email lifts them (a different address is a different server bucket), but
  // clearing-and-retyping the SAME one can't — re-tapping the same address is exactly what tripped the
  // rate limit and stranded the user in a "wait a minute" loop.
  const [sentTo, setSentTo] = useState("");
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

  // Gates only bite while the field still holds the address they were sent to — so they can't be wiped
  // by editing the email, but a different address is free to send immediately. `blockedThis` (429) has
  // no honest countdown → steer to Google; `coolingThis` (post-send) shows the real ~60s window.
  // ONE callback URL, read by the Google redirect AND the magic link in the email. Built from the
  // page-validated `next` so both paths land on the same surface; `useMemo` because it reads
  // `window` (client-only) and both callers must see the identical string.
  const callbackUrl = useMemo(() => {
    const base = `${window.location.origin}/staff/auth/callback`;
    return next === DEFAULT_NEXT ? base : `${base}?next=${encodeURIComponent(next)}`;
  }, [next]);

  const norm = (s: string) => s.trim().toLowerCase();
  const sameAddr = norm(email) === sentTo;
  const blockedThis = sameAddr && emailBlocked;
  const coolingThis = sameAddr && cooldown > 0;
  const rateLimited = blockedThis || coolingThis;

  // "Continue with Google" — OAuth redirect flow. On success the browser leaves for Google and comes
  // back to /staff/auth/callback (which exchanges the code → /staff); only an error stays on this page.
  async function google() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (err) {
      setBusy(false);
      // W10b — a transport failure is not a Google problem or a you problem: say whose fault it is.
      setError(
        isRetryableAuthShape(err)
          ? "We can’t reach the sign-in service right now — it’s not you. Try again in a moment."
          : "Couldn’t start Google sign-in. Try again.",
      );
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (rateLimited) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const addr = norm(email); // send + verify + gate on ONE normalized form (matches the staff allowlist)
    const { error: err } = await browserClient().auth.signInWithOtp({
      email: addr,
      // emailRedirectTo makes the magic LINK in the email land on our callback (the email carries both
      // a link and the {{ .Token }} code — either works). shouldCreateUser:false: only a provisioned
      // staff account (provisionStaff pre-creates it) can request a code.
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackUrl,
      },
    });
    setBusy(false);
    if (err) {
      // Move focus back to the editable field so a keyboard/SR user isn't stranded on the now-disabled
      // submit button, and lands on the control the error (via aria-describedby) describes.
      emailRef.current?.focus();
      // A 429 is the email rate limit (per-address + an HOURLY cap), NOT a bad address. 60s won't clear
      // the hourly cap, so block this address (no dangling countdown) and point at Google instead.
      if (err.status === 429) {
        setSentTo(addr);
        setEmailBlocked(true);
        setError(
          "Too many code requests right now. Use “Continue with Google” above, or try again later.",
        );
        return;
      }
      // W10b — a transport failure is NOT a bad address: the old copy told staff to double-check an
      // email that was fine, mid-outage, on the login they'd just been (wrongly) redirected to.
      if (isRetryableAuthShape(err)) {
        setError(
          "We can’t reach the sign-in service right now — your email is fine. Try again in a moment.",
        );
        return;
      }
      // Otherwise: a non-staff email or a typo — let them fix it and retry (no cooldown).
      setError(
        "We couldn’t send a code to that email. Check it’s your staff address and try again.",
      );
      return;
    }
    setSentTo(addr);
    setEmailBlocked(false);
    setCooldown(60);
    setStep("code");
    setNotice(`We sent a sign-in code to ${addr}.`);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await browserClient().auth.verifyOtp({
      email: norm(email), // same normalized form the code was requested under
      token: code.trim(),
      type: "email",
    });
    if (err) {
      setBusy(false);
      // W10b — a transport failure is NOT a wrong code: "request a new one" would burn the send
      // budget against an outage the retry copy names instead.
      setError(
        isRetryableAuthShape(err)
          ? "We can’t reach the sign-in service right now — your code may still be good. Try again in a moment."
          : "That code didn’t match or has expired. Request a new one.",
      );
      return;
    }
    // Session is now in cookies — let the destination shell re-gate (the staff row for /staff,
    // authorizeDevice for /kiosk and /board). The typed-code path never leaves the browser, so it
    // does the routing the callback route does for the link path.
    router.replace(next);
    router.refresh();
  }

  // Recovery for the "signed in but not staff" case: clear the wrong session so a different email
  // can be tried (otherwise the server would keep bouncing them here). W10b: a FAILED sign-out
  // (auth plane down) leaves the session live — say so instead of refreshing into the same bounce.
  async function signOutWrong() {
    const { error: err } = await browserClient().auth.signOut();
    if (err && isRetryableAuthShape(err)) {
      setError(
        "We can’t reach the sign-in service — couldn’t sign out just now. Try again in a moment.",
      );
      return;
    }
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
            : "Enter the code we emailed you."}
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
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
                or use your email
              </span>
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
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mandalaymorningstar.com"
              // Tie the status/error region to the field so it's read when focus lands here on a send
              // error (the error/notice still live-announces independently for non-focused users).
              aria-describedby="staff-auth-msg"
              style={input}
            />
            <button
              type="submit"
              disabled={busy || rateLimited || email.trim().length < 3}
              style={primaryBtn}
            >
              {busy
                ? "Sending…"
                : blockedThis
                  ? "Use Google instead"
                  : coolingThis
                    ? `Resend in ${cooldown}s`
                    : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <label htmlFor="staff-code" style={label}>
              Sign-in code
            </label>
            <input
              ref={codeRef}
              id="staff-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              maxLength={12}
              required
              value={code}
              // Accept the token AS ISSUED — only strip whitespace (autofill can paste "123 456").
              // Do NOT strip non-digits or cap at 6: Supabase's OTP length is configurable, so assuming
              // a 6-digit numeric code is what made a longer/other-format token never match.
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              placeholder="Code from your email"
              style={{ ...input, letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" }}
            />
            <button type="submit" disabled={busy || code.trim().length < 6} style={primaryBtn}>
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

        {/* One live region for both the success notice and the error (QA §A: no redundant regions).
            Also the email field's aria-describedby target — read on focus after a send error. */}
        <p id="staff-auth-msg" role="status" style={{ margin: 0, minHeight: 20 }}>
          {error ? (
            <span style={{ color: "var(--warn)", fontSize: "var(--fs-sm)" }}>{error}</span>
          ) : notice ? (
            <span style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>{notice}</span>
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
  fontSize: "var(--fs-body)",
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
  fontSize: "var(--fs-sm)",
  lineHeight: 1.5,
};
const h1: CSSProperties = { fontSize: "var(--fs-h1)", margin: "0 0 6px" };
const sub: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s5)",
};
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: "var(--fs-body)", // ≥16px so iOS doesn't zoom the field on focus
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
  fontSize: "var(--fs-body)",
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
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
