"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { Card } from "@mms/ui";

/**
 * K3a "quiet when signed in" — the upgraded diner's identity card on /account. It REPLACES the anon
 * "Save your Stars" upgrade pitch (a signed-in diner is done being pitched) and the old plain "Signed
 * in as …" footer note, giving them a real status surface: who you are + a sign-out.
 *
 * Honest sign-out: the QR app has no persistent logged-out state — signing out drops the diner to
 * GUEST browsing (AnonAuthGate immediately mints a fresh ANONYMOUS session, a new uid). Their Stars
 * are NOT lost — they live on the account, reachable again on the next sign-in — so the copy says
 * exactly that, and a two-tap confirm guards against an accidental tap. On success we refresh the
 * Server Components: /account re-renders as anonymous (the upgrade pitch returns).
 */
export function AccountStatus({
  email,
  displayName,
}: {
  email: string | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const who = displayName?.trim() || email || "your account";

  // Tapping "Sign out" unmounts it and reveals the confirm — park focus on the SAFE default ("Stay
  // signed in") so a keyboard/SR diner isn't dropped to <body> (WCAG 2.4.3), and an accidental Enter
  // keeps them signed in rather than signing out. Skip the initial mount.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) cancelRef.current?.focus({ preventScroll: true });
  }, [confirming]);

  async function signOut() {
    setBusy(true);
    try {
      await browserClient().auth.signOut();
    } catch {
      // Best-effort — the refresh below re-derives the (now anonymous) session either way; never
      // strand the button at "Signing out…" on a transient error.
    }
    startTransition(() => router.refresh());
  }

  return (
    <Card as="section" textured style={card} aria-labelledby="acct-status-h">
      <p className="eyebrow" style={{ margin: "0 0 6px" }}>
        <span aria-hidden>✦ </span>Signed in
      </p>
      <h2 id="acct-status-h" style={h2}>
        {who}
      </h2>
      <p style={sub}>Your Stars are saved to your account — they follow you to any device.</p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="nav-link"
          style={signOutBtn}
        >
          Sign out
        </button>
      ) : (
        <div style={{ marginTop: 4 }} role="group" aria-label="Confirm sign out">
          <p style={confirmCopy}>
            Sign out? You’ll browse as a guest — sign back in anytime to see your Stars.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              aria-busy={busy}
              style={confirmBtn}
            >
              {busy ? "Signing out…" : "Yes, sign out"}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={cancelBtn}
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = { padding: "var(--s5)" };
const h2: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 18,
  fontWeight: 800,
  color: "var(--tx)",
  overflowWrap: "anywhere", // a long email must wrap, never overflow the card
};
const sub: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 13.5,
  color: "var(--t2)",
  lineHeight: 1.5,
};
const signOutBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
};
const confirmCopy: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 13,
  color: "var(--t2)",
  lineHeight: 1.5,
};
const confirmBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 11,
  border: "1.5px solid var(--warn)",
  background: "transparent",
  color: "var(--warn)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 11,
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
