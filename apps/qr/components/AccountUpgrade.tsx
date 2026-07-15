"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@mms/db";
import { ensureProfile } from "@/lib/rewards";
import { mintMergeToken } from "@/lib/merge";
import { stashMergeToken, clearMergeToken } from "@/lib/mergeTokenStore";
import { readIdentities, type DeviceIdentity } from "@/lib/deviceIdentity";
import { WelcomeBackChooser } from "./WelcomeBackChooser";
import { Card } from "@mms/ui";

/**
 * Anon → durable account (M4 P4.1). Upgrades the SAME anonymous uid in place (email OTP / Google), so the
 * diner's past paid orders + earned Stars carry over with no migration (docs/M4_DESIGN R3). Honest: we only
 * report the account once the gateway CONFIRMS it (verifyOtp / the Google redirect) — never eagerly.
 *
 * The upgraded session is kept by AnonAuthGate via a SERVER-SIDE staff check (getSessionKind) — it swaps
 * only confirmed staff, never an upgraded diner — so there's no client marker to set (and no marker-write
 * that could fail before the Google redirect and orphan the account).
 */
export function AccountUpgrade({ stars }: { stars: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "code">("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The email the diner typed already belongs to a DIFFERENT account → `updateUser` can't attach it (it
  // 422s `email_exists`). Instead of a dead-end raw error, pivot to a SIGN-IN recovery (mirrors the Google
  // identity_already_exists path). `codeMode` then drives the verifyOtp type: an `email_change` upgrade
  // keeps this anon uid (Stars carry over); an `email` sign-in switches to the existing account.
  const [emailTaken, setEmailTaken] = useState(false);
  const [codeMode, setCodeMode] = useState<"email_change" | "email">("email_change");
  // K7: the email currently mid re-auth from a "Welcome back" chip / a `?resume=` return — shows a spinner on
  // that chip and drives the code-step label.
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  // K7 shared-device — sign INTO a pre-existing account. `bringStars` is the merge-safety hinge: a genuine
  // guest saving their own Stars (typed a taken email / used Google) mints the K3b merge token to carry them
  // over; an explicit SWITCH (a remembered-identity chip, or a lend-mode resume) passes false so the current
  // session's guest Stars are NEVER swept onto the account being switched to — and clears any stale token.
  const sendSignInCode = useCallback(async (addr: string, bringStars: boolean): Promise<boolean> => {
    const supa = browserClient();
    if (bringStars) {
      const mtoken = await mintMergeToken();
      if (mtoken) stashMergeToken(mtoken);
    } else {
      clearMergeToken();
    }
    const { error: e0 } = await supa.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: false }, // sign in to the EXISTING account — never silently mint a new one
    });
    if (e0) {
      setError(e0.message || "Couldn’t send the sign-in code — try again.");
      return false;
    }
    setEmail(addr);
    setCodeMode("email");
    setPhase("code");
    return true;
  }, []);

  const startGoogleSignIn = useCallback(async (bringStars: boolean): Promise<void> => {
    const supa = browserClient();
    if (bringStars) {
      const mtoken = await mintMergeToken();
      if (mtoken) stashMergeToken(mtoken);
    } else {
      clearMergeToken();
    }
    const { error: e4 } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (e4) {
      setError(e4.message || "Couldn’t sign in with Google — try again.");
      setBusy(false);
      setSelectedEmail(null);
    }
    // success → full-page redirect to Google, returns to /account
  }, []);

  // Tap a "Welcome back" chip — a merge-suppressed switch to a known prior identity.
  const selectIdentity = useCallback(
    async (id: DeviceIdentity) => {
      setBusy(true);
      setError(null);
      setEmailTaken(false);
      setSelectedEmail(id.email);
      if (id.method === "google") {
        await startGoogleSignIn(false); // redirects away (or clears busy on error)
        return;
      }
      const ok = await sendSignInCode(id.email, false);
      setBusy(false);
      if (!ok) setSelectedEmail(null);
    },
    [sendSignInCode, startGoogleSignIn],
  );

  // OAuth callback error (M4 P4.1): linkIdentity redirects back to /account, and if the Google account the
  // diner picked is already linked to a DIFFERENT Morning Star account, Supabase (PKCE → the error lands in
  // the QUERY string, which is why useSearchParams can read it) bounces back with
  // ?error_code=identity_already_exists + a 422 on /auth/v1/user — otherwise the diner would just see a raw
  // error URL with no way forward. Derive it during render (NOT setState-in-effect: the React-Compiler lint
  // rule forbids that, and deriving also avoids a hydration mismatch on this dynamically-rendered route).
  // When already-linked, the Google button becomes a SIGN-IN recovery (linking again would fail the same
  // way). Copy stays HONEST: signing in switches to the EXISTING account — and K3b now MOVES this device's
  // Stars onto it (a merge token minted before the redirect, redeemed by /account's MergeRedeemer on return).
  // a11y tradeoff: because this message is present from SSR/first paint it's INITIAL content of the
  // role="status" region, so a SR won't auto-announce it (live regions announce changes) — it's still
  // visible + discoverable on navigation; a change-based fix would require the forbidden setState-in-effect.
  const searchParams = useSearchParams();
  const alreadyLinked = searchParams.get("error_code") === "identity_already_exists";
  const callbackError = searchParams.get("error_code")
    ? alreadyLinked
      ? "That Google account already has a Morning Star account — sign in and we’ll move this device’s Stars onto it."
      : "Couldn’t finish with Google — please try again."
    : null;

  // Focus follows the step (WCAG 2.4.3): email→code swaps the form (the pressed submit unmounts), and
  // "Use a different email" swaps back — land focus in the new step's input. Skip the initial mount so
  // the card never steals focus from the page.
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (phase === "code" ? codeRef.current : emailRef.current)?.focus({ preventScroll: true });
  }, [phase]);
  const [, startTransition] = useTransition();

  // Once the callback error is read (above), strip the ?error…/#error… params (and the SDK's `sb=` hash)
  // via replaceState — a side-effect only, no setState. Using replaceState (not router.replace) keeps the
  // derived callbackError/alreadyLinked intact (Next's searchParams don't react to it), so the message +
  // recovery stay visible while the URL is cleaned and a refresh can't replay the raw error.
  useEffect(() => {
    if (callbackError && typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [callbackError]);

  // Refresh the Server Components once the account CONFIRMS. The Google OAuth return exchanges the PKCE code
  // client-side AFTER the initial SSR (which saw anonymous cookies), so `/account`'s RewardsHub + this card
  // stay stale until a manual reload — verify() refreshes the email path explicitly, but the Google path had
  // no refresh. Subscribe to the auth confirm (SIGNED_IN on Google, USER_UPDATED on email) and refresh once
  // (ref-guarded), gated on the session being a REAL account (is_anonymous !== true — a real account may
  // surface the flag as false OR omit it, and only an anon session is explicitly `true`) so the anonymous
  // sign-in AnonAuthGate mints never trip it. ensureProfile() first so the Google upgrade's profile row exists.
  const refreshedRef = useRef(false);
  useEffect(() => {
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event, session) => {
      const upgraded = !!session?.user && session.user.is_anonymous !== true;
      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        upgraded &&
        !refreshedRef.current
      ) {
        refreshedRef.current = true;
        // Refresh even if ensureProfile rejects — the account is confirmed; the profile row is secondary
        // (idempotently re-created on the next confirmed load) and must not block the hub from updating.
        void (async () => {
          try {
            await ensureProfile();
          } catch {
            /* best-effort */
          }
          startTransition(() => router.refresh());
        })();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, startTransition]);

  // K7 lend resume — a "Done — back to [owner]" tap lands here as `?resume=<email>`. Fire the owner's
  // merge-SUPPRESSED fast re-auth once (a remembered chip → its OTP/OAuth path; otherwise pre-fill the field
  // for a manual sign-in), then strip the param so a refresh can't re-fire it. `readIdentities` is client-only
  // so this runs post-hydration, matching the chooser.
  const resumeParam = searchParams.get("resume");
  const resumeFired = useRef(false);
  useEffect(() => {
    if (!resumeParam || resumeFired.current) return;
    resumeFired.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Defer to the next frame so the fast-re-auth's setState (setBusy / setEmail) isn't a synchronous
    // setState-in-effect (lint-safe, matching the chooser's deferred read).
    const raf = requestAnimationFrame(() => {
      const match = readIdentities().find(
        (i) => i.email.toLowerCase() === resumeParam.toLowerCase(),
      );
      if (match) void selectIdentity(match);
      else setEmail(resumeParam); // not remembered → pre-fill the field for a manual sign-in
    });
    return () => cancelAnimationFrame(raf);
  }, [resumeParam, selectIdentity]);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setError(null);
    const supa = browserClient();

    if (emailTaken) {
      // RECOVERY: the diner TYPED an address that belongs to another account, so SIGN IN to it (updateUser
      // would just re-fail email_exists). This is a genuine guest saving their OWN Stars into a pre-existing
      // account → `bringStars: true` mints the K3b merge token so /account's MergeRedeemer carries this
      // device's Stars over. (A remembered-CHIP switch takes the `false` path instead — see selectIdentity.)
      await sendSignInCode(addr, true);
      setBusy(false);
      return;
    }

    // UPGRADE: attach the email to the SAME anonymous user — keeps the uid, so past orders + Stars carry
    // over. Supabase sends a confirmation (6-digit code + link); is_anonymous flips on verify. (AnonAuthGate
    // keeps the upgraded session via a server-side staff check — no client marker needed.)
    const { error: e1 } = await supa.auth.updateUser({ email: addr });
    if (e1) {
      // The email already belongs to a DIFFERENT Morning Star account. Don't dead-end on the raw 422 —
      // flip to the sign-in recovery (the diner re-submits to send a sign-in code). Match the typed code
      // first, with a message fallback for SDK-version drift.
      if (e1.code === "email_exists" || /already.*registered/i.test(e1.message)) {
        setEmailTaken(true);
        setBusy(false);
        return;
      }
      setError(e1.message || "Couldn’t send the code — try again.");
      setBusy(false);
      return;
    }
    setCodeMode("email_change");
    setPhase("code");
    setBusy(false);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const supa = browserClient();
    // `email_change` finalizes the anon→account UPGRADE (keeps the uid + Stars); `email` completes the
    // SIGN-IN to the pre-existing account (recovery). The verify token/flow is otherwise identical.
    const { error: e2 } = await supa.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: codeMode,
    });
    if (e2) {
      setError(e2.message || "That code didn’t match. Check your email and try again.");
      setBusy(false);
      return;
    }
    // Create the profile row now the account is confirmed — but never let a throw here strand the button at
    // "Confirming…": the account IS confirmed, the profile is secondary (idempotently re-created on the next
    // confirmed load), so swallow + still refresh (mirrors the auth-listener path).
    try {
      await ensureProfile();
    } catch {
      /* best-effort — the confirmed session is what matters */
    }
    startTransition(() => router.refresh()); // re-render the hub as upgraded / signed-in — keeps the rewards
  }

  async function google() {
    setBusy(true);
    setError(null);
    const supa = browserClient();
    // Link Google to the SAME anonymous user (keeps the uid). AnonAuthGate keeps the post-redirect upgraded
    // session via a server-side staff check, so there's no pre-redirect marker write to fail (no orphan path).
    const { error: e3 } = await supa.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (e3) {
      setError(e3.message || "Couldn’t continue with Google — try again.");
      setBusy(false);
    }
    // success → redirects to Google, returns to /account (server-side ensureProfile finalizes the profile).
  }

  async function signInGoogle() {
    setBusy(true);
    setError(null);
    // Recovery for identity_already_exists: SIGN IN to the existing account (not linkIdentity, which would
    // fail the same way) so the diner lands on their real account and its saved rewards. A genuine guest
    // saving their OWN Stars → `bringStars: true` mints the merge token before the redirect.
    await startGoogleSignIn(true);
  }

  return (
    <Card as="section" textured style={card} aria-labelledby="upgrade-h">
      <p className="eyebrow" style={{ margin: "0 0 6px" }}>
        <span aria-hidden>✦ </span>Save your Stars
      </p>
      <h2 id="upgrade-h" style={h2}>
        Keep your rewards
      </h2>
      {/* Name the stakes honestly (the confusion this fixes: seeing your Stars + a "save them" pitch reads
          as a contradiction unless it's clear they're DEVICE-BOUND and could be lost). Lead with the real
          count when there is one. */}
      <p style={sub}>
        {stars > 0 ? (
          <>
            You’ve earned{" "}
            <strong>
              {stars} {stars === 1 ? "Star" : "Stars"}
            </strong>{" "}
            on this device — they live only here. Add an email or continue with Google to{" "}
            <strong>keep them for good</strong>; your past orders come with you too.
          </>
        ) : (
          <>
            You’re earning Stars on this device — they live only here. Add an email or continue with
            Google to <strong>save them to an account</strong>.
          </>
        )}
      </p>

      {/* K7: remembered-identity chips for a one-tap (merge-suppressed) return — renders null for a
          first-time guest with no history. Only on the idle step (the code step is mid-sign-in). */}
      {phase === "idle" && (
        <WelcomeBackChooser onSelect={selectIdentity} busy={busy} selectedEmail={selectedEmail} />
      )}

      {phase === "idle" ? (
        <form onSubmit={submitEmail}>
          <label htmlFor="up-email" style={label}>
            Email
          </label>
          <input
            ref={emailRef}
            id="up-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              // Editing the address clears the "already registered" recovery + any error, so a corrected
              // or different email starts fresh on the normal upgrade path.
              if (emailTaken) setEmailTaken(false);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            className="account-field"
            style={input}
          />
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="checkout-cta"
            style={primaryBtn}
          >
            <span style={ctaLabel}>
              {busy ? "Sending…" : emailTaken ? "Send sign-in code" : "Email me a code"}
            </span>
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="up-code" style={label}>
            6-digit code sent to {email}
          </label>
          <input
            ref={codeRef}
            id="up-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            placeholder="123456"
            className="account-field"
            style={input}
          />
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="checkout-cta"
            style={primaryBtn}
          >
            <span style={ctaLabel}>
              {busy
                ? "Confirming…"
                : codeMode === "email"
                  ? "Confirm & sign in"
                  : "Confirm & save my rewards"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setCode("");
              setError(null);
              setEmailTaken(false); // back to a clean upgrade attempt
              setCodeMode("email_change");
              setSelectedEmail(null); // clear any chip-selection spinner state
            }}
            className="nav-link"
            style={textBtn}
          >
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            Use a different email
          </button>
        </form>
      )}

      {/* Labeled fading-hairline divider (matches the checkout tray language) between the email path and
          the Google affordance. */}
      <p className="checkout-tray-label" style={divider} aria-hidden>
        or
      </p>

      <button
        type="button"
        onClick={alreadyLinked ? signInGoogle : google}
        disabled={busy}
        className="account-oauth"
        style={googleBtn}
      >
        {/* The Google "G" uses Google's official brand colors by mandate — a sanctioned literal-color
            exception (like email HTML), not a token miss. Decorative → aria-hidden. */}
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
        {alreadyLinked ? "Sign in with Google" : "Continue with Google"}
      </button>

      {/* SINGLE live region for the card — an error, the email-already-registered recovery, or the Google
          callback recovery (mutually exclusive at any moment). Routing the recovery here (vs a second
          region) keeps one live region per view; it announces on the emailTaken change (a real change to
          this persistent node, unlike the SSR-initial callbackError). */}
      <p role="status" aria-atomic="true" style={errorLine}>
        {error ??
          // Only on the idle (email-entry) step — once we advance to the code step the "Send sign-in code"
          // button is gone, so the directive would contradict the screen (the diner already tapped it).
          (emailTaken && phase === "idle"
            ? "That email already has a Morning Star account — tap “Send sign-in code” to use it. We’ll move this device’s Stars onto it when you sign in."
            : null) ??
          callbackError}
      </p>
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = {
  padding: "var(--s5)",
};
const h2: CSSProperties = { margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "var(--tx)" };
const sub: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 13.5,
  color: "var(--t2)",
  lineHeight: 1.5,
};
const label: CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--t2)",
  margin: "0 0 6px",
};
const input: CSSProperties = {
  // border lives in `.account-field` (so :focus-visible can recolor it — an inline border would outrank it)
  width: "100%",
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 12,
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: 16, // ≥16px → no iOS zoom-on-focus
  marginBottom: 12,
};
// bg/color/gradient/sheen/shine live in `.checkout-cta`; this is layout only (label rides above the
// ::after sweep on its own relative span, ctaLabel).
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  border: "none",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};
const ctaLabel: CSSProperties = { position: "relative", zIndex: 1 };
const googleBtn: CSSProperties = {
  // border lives in `.account-oauth` (so hover can recolor it to accent)
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  minHeight: 48,
  borderRadius: 12,
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
// color/weight/size/underline/arrow come from `.nav-link`; content-width so the underline hugs the text
// (a full-width centered variant would stretch the wipe across the whole row) — left-aligns under the CTA.
const textBtn: CSSProperties = {
  marginTop: 4,
  border: "none",
  background: "transparent",
  cursor: "pointer",
};
const divider: CSSProperties = { margin: "16px 0" };
const errorLine: CSSProperties = {
  minHeight: 16,
  margin: "10px 0 0",
  fontSize: 13,
  color: "var(--warn)",
  textAlign: "center",
};
