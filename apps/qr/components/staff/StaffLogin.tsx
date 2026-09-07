"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { isRetryableAuthShape } from "@/lib/staff-outage";
import { DEFAULT_NEXT, NEXT_COOKIE } from "@/lib/safe-next";
import { BRAND_EMAIL, BRAND_NAME } from "@/lib/brand";
import { ts } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";

/** The OAuth provider's own name — a brand term the sentences interpolate, never a dictionary value. */
const GOOGLE = "Google";

/**
 * Staff sign-in (S1.1a) — passwordless magic-link / email-OTP. Two steps: request a 6-digit code to
 * a provisioned staff email, then verify it. `shouldCreateUser: false` means only accounts an owner
 * has already provisioned can sign in — a stranger's email never mints a session. On success the
 * @supabase/ssr browser client persists the session to cookies, so the /staff server shell reads the
 * verified uid and the staff row gates the rest. The PIN fast-path on a shared tablet is S1.1b.
 *
 * P7·2 — the FIRST screen Dad sees, in Burmese. Every sentence is an `entry.*` key rendered through
 * `<Chrome>`; the two live-region states (`error`, `notice`) are `StaffMsg`s so the region can carry a
 * key with its slots — the sent-to address rides `{x}` and arrives wrapped `lang="en"`. The page owns
 * the bar and the column; this is the card beneath them.
 *
 * ⚠️ NO CONTROL HERE IS EVER NATIVELY `disabled`. Disabling the button that was just tapped drops
 * focus to `<body>` (the language switch's measured rule), and on THIS screen it also stranded the
 * old copy: a 429 disabled Send under a message telling the person to tap it. Every gate is
 * `aria-disabled` + a refusal inside the handler, so the button keeps its place and its name.
 */
export function StaffLogin({
  lang,
  denied = false,
  next = DEFAULT_NEXT,
}: {
  lang: StaffLang;
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
  const [error, setError] = useState<StaffMsg | null>(null);
  const [notice, setNotice] = useState<StaffMsg | null>(null);
  // Resend cooldown (seconds): after a SUCCESSFUL send, Supabase's per-address window is ~60s, so the
  // "Resend in Ns" countdown is honest. A 429 is different — it's the hourly cap, which 60s won't
  // clear, so we DON'T arm a countdown that re-enables straight into another 429 (see `emailBlocked`).
  const [cooldown, setCooldown] = useState(0);
  // A 429 (`over_email_send_rate_limit`) hit for `sentTo`. Distinct from `cooldown`: there's no honest
  // short timer to show (the cap is hourly), so the button stays refused and points at Google rather
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
  // ONE callback URL, read by the Google redirect AND the magic link in the email. It is the BARE
  // callback — no query string — because Supabase glob-matches `redirectTo` against the project's
  // Redirect URL allow list and a query string makes an exact entry miss (see `safe-next.ts`). The
  // destination rides in a cookie instead.
  //
  // ⚠️ A FUNCTION, called from the event handlers — never a `useMemo`. This is a Client Component,
  // but Next still SERVER-renders it on first load, and a useMemo factory runs during that render,
  // where `window` is undefined. Written as a memo it threw before the page could paint, taking the
  // whole sign-in surface down for every anonymous visit (Codex round 1, P1). The original code read
  // `window` inside the handlers for exactly this reason; moving it "somewhere tidier" broke it.
  const callbackUrl = () => `${window.location.origin}/staff/auth/callback`;

  /**
   * Park the destination where the callback can read it, right before any sign-in leaves this page.
   * 10 minutes covers the walk to a mailbox and expires well inside the link's own lifetime; Lax so
   * the top-level navigation back from a mail client still carries it.
   *
   * The DEFAULT case actively CLEARS rather than returning early. A stale cookie from an abandoned
   * `?next=/kiosk` attempt would otherwise still be sitting there, and the next ordinary sign-in —
   * which parks nothing — would have its callback consume that stale destination and send someone to
   * the kiosk instead of the console (Codex round 1, P2).
   */
  const parkNext = () => {
    document.cookie =
      next === DEFAULT_NEXT
        ? `${NEXT_COOKIE}=; Path=/staff; Max-Age=0; SameSite=Lax`
        : `${NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/staff; Max-Age=600; SameSite=Lax`;
  };

  /** The typed-code path never reaches the callback, so it clears the parked destination itself. */
  const clearParkedNext = () => {
    document.cookie = `${NEXT_COOKIE}=; Path=/staff; Max-Age=0; SameSite=Lax`;
  };

  const norm = (s: string) => s.trim().toLowerCase();
  const sameAddr = norm(email) === sentTo;
  const blockedThis = sameAddr && emailBlocked;
  const coolingThis = sameAddr && cooldown > 0;
  const rateLimited = blockedThis || coolingThis;
  const emailTooShort = email.trim().length < 3;
  const codeTooShort = code.trim().length < 6;
  const sendRefused = busy || rateLimited || emailTooShort;
  const verifyRefused = busy || codeTooShort;

  // "Continue with Google" — OAuth redirect flow. On success the browser leaves for Google and comes
  // back to /staff/auth/callback (which exchanges the code → /staff); only an error stays on this page.
  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    parkNext();
    const { error: err } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (err) {
      setBusy(false);
      // W10b — a transport failure is not a Google problem or a you problem: say whose fault it is.
      setError(
        isRetryableAuthShape(err)
          ? { k: "entry.login.err.googleOutage" }
          : { k: "entry.login.err.google", vars: { x: GOOGLE } },
      );
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (sendRefused) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const addr = norm(email); // send + verify + gate on ONE normalized form (matches the staff allowlist)
    parkNext();
    const { error: err } = await browserClient().auth.signInWithOtp({
      email: addr,
      // emailRedirectTo makes the magic LINK in the email land on our callback (the email carries both
      // a link and the {{ .Token }} code — either works). shouldCreateUser:false: only a provisioned
      // staff account (provisionStaff pre-creates it) can request a code.
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackUrl(),
      },
    });
    setBusy(false);
    if (err) {
      // Move focus back to the editable field so a keyboard/SR user isn't stranded on the refused
      // submit button, and lands on the control the error (via aria-describedby) describes.
      emailRef.current?.focus();
      // A 429 is the email rate limit (per-address + an HOURLY cap), NOT a bad address. 60s won't clear
      // the hourly cap, so block this address (no dangling countdown) and point at Google instead.
      if (err.status === 429) {
        setSentTo(addr);
        setEmailBlocked(true);
        setError({ k: "entry.login.err.rateLimited", vars: { x: GOOGLE } });
        return;
      }
      // W10b — a transport failure is NOT a bad address: the old copy told staff to double-check an
      // email that was fine, mid-outage, on the login they'd just been (wrongly) redirected to.
      if (isRetryableAuthShape(err)) {
        setError({ k: "entry.login.err.sendOutage" });
        return;
      }
      // Otherwise: a non-staff email or a typo — let them fix it and retry (no cooldown).
      setError({ k: "entry.login.err.send" });
      return;
    }
    setSentTo(addr);
    setEmailBlocked(false);
    setCooldown(60);
    setStep("code");
    setNotice({ k: "entry.login.sent", vars: { x: addr } });
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (verifyRefused) return;
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
          ? { k: "entry.login.err.verifyOutage" }
          : { k: "entry.login.err.verify" },
      );
      return;
    }
    // Session is now in cookies — let the destination shell re-gate (the staff row for /staff,
    // authorizeDevice for /kiosk and /board). The typed-code path never leaves the browser, so it
    // does the routing the callback route does for the link path.
    clearParkedNext(); // single-use, exactly like the callback route's clear on the link path
    router.replace(next);
    router.refresh();
  }

  // Recovery for the "signed in but not staff" case: clear the wrong session so a different email
  // can be tried (otherwise the server would keep bouncing them here). W10b: a FAILED sign-out
  // (auth plane down) leaves the session live — say so instead of refreshing into the same bounce.
  async function signOutWrong() {
    const { error: err } = await browserClient().auth.signOut();
    if (err && isRetryableAuthShape(err)) {
      setError({ k: "entry.err.signOutOutage" });
      return;
    }
    router.refresh();
  }

  const shown = error ?? notice;

  return (
    <section className="card card-textured entry-card" aria-labelledby="entry-h">
      <p className="entry-brand">{BRAND_NAME}</p>
      <h2 id="entry-h" className="entry-h">
        <Chrome lang={lang} k="entry.login.head" echo="stack" />
      </h2>
      <p className="entry-sub">
        <Chrome
          lang={lang}
          k={step === "email" ? "entry.login.sub.email" : "entry.login.sub.code"}
          echo="stack"
        />
      </p>

      {denied && (
        // A discrete, important state reached via redirect — announce it (distinct from the polite
        // status region below; QA §A's "one live region" guards against redundant aria-live on the
        // SAME message, not an alert + a separate progress region).
        <div role="alert" className="entry-alert">
          <p style={{ margin: "0 0 8px" }}>
            <Chrome lang={lang} k="entry.login.denied" echo="stack" />
          </p>
          <button type="button" onClick={signOutWrong} className="entry-link">
            <Chrome lang={lang} k="entry.signOut" echo="inline" />
          </button>
        </div>
      )}

      {step === "email" && (
        <>
          <button
            type="button"
            onClick={google}
            aria-disabled={busy || undefined}
            className="entry-secondary staff-press"
          >
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
            {busy ? (
              <Chrome lang={lang} k="entry.login.starting" echo="inline" />
            ) : (
              <Chrome lang={lang} k="entry.login.google" vars={{ x: GOOGLE }} echo="inline" />
            )}
          </button>
          <div className="entry-divider" aria-hidden>
            <Chrome lang={lang} k="entry.login.or" echo="inline" />
          </div>
        </>
      )}

      {step === "email" ? (
        <form onSubmit={sendCode} noValidate>
          <label htmlFor="staff-email" className="entry-label">
            <Chrome lang={lang} k="entry.login.email.label" echo="stack" />
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
            // An example address on the restaurant's own domain — the brand singleton, not copy.
            placeholder={`you@${BRAND_EMAIL.split("@")[1]}`}
            // Tie the status/error region to the field so it's read when focus lands here on a send
            // error (the error/notice still live-announces independently for non-focused users).
            aria-describedby="staff-auth-msg"
            className="entry-input"
          />
          <button
            type="submit"
            aria-disabled={sendRefused || undefined}
            className="entry-primary staff-press"
          >
            {busy ? (
              <Chrome lang={lang} k="entry.login.sending" echo="inline" />
            ) : blockedThis ? (
              <Chrome lang={lang} k="entry.login.useGoogle" vars={{ x: GOOGLE }} echo="inline" />
            ) : coolingThis ? (
              <Chrome lang={lang} k="entry.login.resendIn" vars={{ n: cooldown }} echo="inline" />
            ) : (
              <Chrome lang={lang} k="entry.login.send" echo="inline" />
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate>
          <label htmlFor="staff-code" className="entry-label">
            <Chrome lang={lang} k="entry.login.code.label" echo="stack" />
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
            placeholder={ts(lang, "entry.login.code.placeholder")}
            className="entry-input entry-input-code"
          />
          <button
            type="submit"
            aria-disabled={verifyRefused || undefined}
            className="entry-primary staff-press"
          >
            <Chrome lang={lang} k={busy ? "entry.checking" : "entry.login.verify"} echo="inline" />
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            className="entry-link"
          >
            <Chrome lang={lang} k="entry.login.otherEmail" echo="inline" />
          </button>
        </form>
      )}

      {/* One live region for both the success notice and the error (QA §A: no redundant regions).
          Also the email field's aria-describedby target — read on focus after a send error. */}
      <p
        id="staff-auth-msg"
        role="status"
        className={error ? "entry-msg entry-msg-warn" : "entry-msg"}
      >
        {shown && <MsgText lang={lang} msg={shown} />}
      </p>
    </section>
  );
}
