"use client";
import { useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  const [, startTransition] = useTransition();

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

      <button type="button" onClick={google} disabled={busy} style={googleBtn}>
        Continue with Google
      </button>

      <p role="status" aria-live="polite" aria-atomic="true" style={errorLine}>
        {error}
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
