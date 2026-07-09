"use client";
import {
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
export function AccountUpgrade() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "code">("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth callback error (M4 P4.1): linkIdentity redirects back to /account, and if the Google account the
  // diner picked is already linked to a DIFFERENT Morning Star account, Supabase (PKCE → the error lands in
  // the QUERY string, which is why useSearchParams can read it) bounces back with
  // ?error_code=identity_already_exists + a 422 on /auth/v1/user — otherwise the diner would just see a raw
  // error URL with no way forward. Derive it during render (NOT setState-in-effect: the React-Compiler lint
  // rule forbids that, and deriving also avoids a hydration mismatch on this dynamically-rendered route).
  // When already-linked, the Google button becomes a SIGN-IN recovery (linking again would fail the same
  // way). Copy stays HONEST: signing in switches to the EXISTING account — it does not merge this device's
  // unsaved Stars (no server-side merge exists), so it also points at the email path for keeping THOSE.
  // a11y tradeoff: because this message is present from SSR/first paint it's INITIAL content of the
  // role="status" region, so a SR won't auto-announce it (live regions announce changes) — it's still
  // visible + discoverable on navigation; a change-based fix would require the forbidden setState-in-effect.
  const searchParams = useSearchParams();
  const alreadyLinked = searchParams.get("error_code") === "identity_already_exists";
  const callbackError = searchParams.get("error_code")
    ? alreadyLinked
      ? "That Google account already has a Morning Star account. Sign in to use it, or add an email above to save this device’s rewards."
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
  // (ref-guarded), gated on the session being a REAL account (is_anonymous === false) so the anonymous
  // sign-in AnonAuthGate mints never trips it. ensureProfile() first so the Google upgrade's profile row exists.
  const refreshedRef = useRef(false);
  useEffect(() => {
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event, session) => {
      const upgraded = session?.user?.is_anonymous === false;
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && upgraded && !refreshedRef.current) {
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

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const supa = browserClient();
    // Attach the email to the SAME anonymous user — keeps the uid, so past orders + Stars carry over.
    // Supabase sends a confirmation (6-digit code + link) to the address; is_anonymous flips on verify.
    // (AnonAuthGate keeps the upgraded session via a server-side staff check — no client marker needed.)
    const { error: e1 } = await supa.auth.updateUser({ email: email.trim() });
    if (e1) {
      setError(e1.message || "Couldn’t send the code — try again.");
      setBusy(false);
      return;
    }
    setPhase("code");
    setBusy(false);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const supa = browserClient();
    const { error: e2 } = await supa.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email_change",
    });
    if (e2) {
      setError(e2.message || "That code didn’t match. Check your email and try again.");
      setBusy(false);
      return;
    }
    await ensureProfile(); // create the profile row now the account is confirmed
    startTransition(() => router.refresh()); // re-render the hub as upgraded — keeps the rewards
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
    const supa = browserClient();
    // Recovery for identity_already_exists: SIGN IN to the existing account (not linkIdentity, which would
    // fail the same way) so the diner lands on their real account and its saved rewards.
    const { error: e4 } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (e4) {
      setError(e4.message || "Couldn’t sign in with Google — try again.");
      setBusy(false);
    }
  }

  return (
    <Card as="section" textured style={card} aria-labelledby="upgrade-h">
      <p className="eyebrow" style={{ margin: "0 0 6px" }}>
        <span aria-hidden>✦ </span>Save your Stars
      </p>
      <h2 id="upgrade-h" style={h2}>
        Keep your rewards
      </h2>
      <p style={sub}>
        You’re earning Stars on this device. Add an email or continue with Google to{" "}
        <strong>save them to an account</strong> — your past orders count too.
      </p>

      {phase === "idle" ? (
        <form onSubmit={sendCode}>
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
            onChange={(ev) => setEmail(ev.target.value)}
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
            <span style={ctaLabel}>{busy ? "Sending…" : "Email me a code"}</span>
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
            <span style={ctaLabel}>{busy ? "Confirming…" : "Confirm & save my rewards"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setCode("");
              setError(null);
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

      <p role="status" aria-atomic="true" style={errorLine}>
        {error ?? callbackError}
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
