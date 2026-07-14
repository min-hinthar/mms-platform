"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { Card } from "@mms/ui";
import { tierMeta, tierTint } from "@/lib/rewards-tiers";

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
  tierId,
  stars,
}: {
  email: string | null;
  displayName: string | null;
  /** K3a rewards standing — a compact recognition chip (the full ring/ladder is the Rewards card below). */
  tierId: string;
  stars: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const name = displayName?.trim() || null;
  const who = name || email || "your account";
  // Show the email as a SECOND line only when a display name is the primary — otherwise it's already the
  // heading (no need to repeat it), and an anonymous-but-somehow-here case falls back to "your account".
  const secondaryEmail = name && email ? email : null;
  const tier = tierMeta(tierId);
  const tint = tierTint(tierId);

  // Focus follows the confirm step both ways (WCAG 2.4.3): opening parks focus on the SAFE default
  // ("Stay signed in") so an accidental Enter can't sign out; cancelling returns focus to the "Sign
  // out" trigger (never dropped to <body>). `wasConfirming` skips the initial mount.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus({ preventScroll: true });
      wasConfirming.current = true;
    } else if (wasConfirming.current) {
      triggerRef.current?.focus({ preventScroll: true });
      wasConfirming.current = false;
    }
  }, [confirming]);

  async function signOut() {
    setBusy(true);
    const supa = browserClient();
    try {
      await supa.auth.signOut();
      // Re-mint a fresh ANONYMOUS session (mirroring AnonAuthGate) — `router.refresh()` only re-renders
      // server components and does NOT re-run AnonAuthGate's client effect, so without this the app sits
      // sessionless: /account would render the red "couldn't load your rewards" alert (not the promised
      // guest state) and the header would keep the stale wallet chip. Retry once (GoTrue anon-signup can
      // transiently rate-limit), exactly like AnonAuthGate; the SIGNED_IN it fires refetches the badge.
      let { error } = await supa.auth.signInAnonymously();
      if (error) ({ error } = await supa.auth.signInAnonymously());
    } catch {
      // Best-effort — the refresh re-derives the session; the next route change re-runs AnonAuthGate.
    }
    setBusy(false); // reset before the refresh: on a re-mint failure the button must not stick at "Signing out…"
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
      {secondaryEmail && <p style={emailLine}>{secondaryEmail}</p>}
      {/* Standing chip — recognition at a glance (tier-tinted; text uses the AA `-strong` token). The full
          Stars ring + tier ladder is the Rewards card right below, so this stays a compact summary. */}
      <div style={{ margin: "10px 0 12px" }}>
        <span
          // role="img" so the aria-label is reliably announced — a bare <span> maps to `generic`, where
          // ARIA says a label "should not be used" (NVDA/VoiceOver may skip it); the label then names this
          // labelled composite glyph, and its all-decorative children stay aria-hidden.
          role="img"
          style={{
            ...tierChip,
            background: `color-mix(in srgb, ${tint.fill} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${tint.fill} 32%, transparent)`,
            color: tint.text,
          }}
          aria-label={`${tier.english} tier, ${stars} ${stars === 1 ? "Star" : "Stars"}`}
        >
          <span aria-hidden>{tier.emoji}</span>
          <span aria-hidden>{tier.english}</span>
          <span aria-hidden style={{ opacity: 0.45 }}>
            ·
          </span>
          <span aria-hidden>✦ {stars}</span>
        </span>
      </div>
      <p style={sub}>Your Stars follow you to any device.</p>

      {!confirming ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setConfirming(true)}
          className="nav-link"
          style={signOutBtn}
        >
          Sign out
        </button>
      ) : (
        <div
          style={{ marginTop: 4 }}
          role="group"
          aria-label="Confirm sign out"
          aria-describedby="acct-signout-warning"
        >
          <p id="acct-signout-warning" style={confirmCopy}>
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
const emailLine: CSSProperties = {
  margin: "1px 0 0",
  fontSize: 13,
  color: "var(--t2)",
  overflowWrap: "anywhere", // a long email wraps, never overflows the card
};
const tierChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 26,
  padding: "3px 11px",
  borderRadius: 999,
  border: "1px solid transparent", // color set inline from the tier tint
  fontSize: 12.5,
  fontWeight: 800,
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
