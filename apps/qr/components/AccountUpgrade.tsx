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
    <Card as="section" style={card} aria-labelledby="upgrade-h">
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
            style={input}
          />
          <button type="submit" disabled={busy} aria-busy={busy} style={primaryBtn}>
            {busy ? "Sending…" : "Email me a code"}
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
            style={input}
          />
          <button type="submit" disabled={busy} aria-busy={busy} style={primaryBtn}>
            {busy ? "Confirming…" : "Confirm & save my rewards"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setCode("");
              setError(null);
            }}
            style={textBtn}
          >
            <span aria-hidden>←</span> Use a different email
          </button>
        </form>
      )}

      <div style={divider} aria-hidden />

      <button
        type="button"
        onClick={alreadyLinked ? signInGoogle : google}
        disabled={busy}
        style={googleBtn}
      >
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
  width: "100%",
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: 16, // ≥16px → no iOS zoom-on-focus
  marginBottom: 12,
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};
const googleBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
const textBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  marginTop: 8,
  border: "none",
  background: "transparent",
  color: "var(--t2)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const divider: CSSProperties = { height: 1, background: "var(--bd)", margin: "16px 0" };
const errorLine: CSSProperties = {
  minHeight: 16,
  margin: "10px 0 0",
  fontSize: 13,
  color: "var(--warn)",
  textAlign: "center",
};
