"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { Card } from "@mms/ui";
import { tierMeta, tierTint } from "@/lib/rewards-tiers";
import { setLend, firstNameOf } from "@/lib/deviceIdentity";

/**
 * K3a "quiet when signed in" + K7 shared-device — the upgraded diner's identity card on /account. It REPLACES
 * the anon "Save your Stars" pitch (a signed-in diner is done being pitched) with a real status surface: who
 * you are, your standing, and two shared-device actions.
 *
 * - **Switch account** — signs out to a fresh anonymous guest, landing on the sign-in chooser (with the
 *   "Welcome back" chips) so returning to your own OR another account is a one-tap re-auth. Your Stars are NOT
 *   lost — they live on the account, reachable again on the next sign-in — so the copy says exactly that.
 * - **Order for a friend** — lend mode: same sign-out-to-guest, but it stashes YOUR greeting hint so a global
 *   "ordering for a friend" banner can offer a one-tap return. The friend browses/orders on a clean guest
 *   session that never touches your account (structurally, they can't earn onto or spend from it).
 *
 * Neither is destructive (Stars are safe either way), so each is a single tap behind a one-line confirm (no
 * accidental mode change), with WCAG-2.4.3 focus discipline: the confirm parks focus on the SAFE "Cancel" so a
 * stray Enter can't fire, and returns focus to the trigger on cancel. On success we refresh the Server
 * Components so /account re-renders as the guest chooser (and, for lend, the banner appears).
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
  const [pending, setPending] = useState<null | "switch" | "lend">(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const name = displayName?.trim() || null;
  const who = name || email || "your account";
  // Show the email as a SECOND line only when a display name is the primary — otherwise it's already the
  // heading (no need to repeat it), and an anonymous-but-somehow-here case falls back to "your account".
  const secondaryEmail = name && email ? email : null;
  const tier = tierMeta(tierId);
  const tint = tierTint(tierId);
  const firstName = firstNameOf(displayName);

  // Focus follows the confirm step both ways (WCAG 2.4.3): opening parks focus on the SAFE default ("Cancel")
  // so an accidental Enter can't act; cancelling returns focus to the button that opened it (never dropped to
  // <body>). `lastTrigger` records which action opened the confirm; `wasPending` skips the initial mount.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) {
      cancelRef.current?.focus({ preventScroll: true });
      wasPending.current = true;
    } else if (wasPending.current) {
      lastTrigger.current?.focus({ preventScroll: true });
      wasPending.current = false;
    }
  }, [pending]);

  function open(kind: "switch" | "lend", e: MouseEvent<HTMLButtonElement>) {
    lastTrigger.current = e.currentTarget;
    setPending(kind);
  }

  // Sign out to a fresh ANONYMOUS guest — the shared mechanic behind both actions. `router.refresh()` only
  // re-renders server components and does NOT re-run AnonAuthGate's client effect, so we re-mint here or the
  // app sits sessionless (/account would show the red "couldn't load" alert, not the guest chooser). Retry
  // once (GoTrue anon-signup can transiently rate-limit), mirroring AnonAuthGate.
  async function toGuest(): Promise<void> {
    const supa = browserClient();
    await supa.auth.signOut();
    let { error } = await supa.auth.signInAnonymously();
    if (error) ({ error } = await supa.auth.signInAnonymously());
  }

  async function doSwitch() {
    setBusy(true);
    try {
      await toGuest();
    } catch {
      // Best-effort — the refresh re-derives the session; the next route change re-runs AnonAuthGate.
    }
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function doLend() {
    setBusy(true);
    try {
      await toGuest();
      // Stash the owner hint AFTER the guest session is minted, so the "ordering for a friend" banner + the
      // one-tap return light up. `email` is guaranteed here (the button is gated on it). Best-effort inside
      // setLend (storage may be unavailable → no banner, but the guest session is still clean).
      if (email) setLend({ ownerEmail: email, ownerFirstName: firstName });
    } catch {
      /* best-effort — as above */
    }
    setBusy(false);
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
      <p style={sub}>Your Stars stay on your account — switch or lend this phone anytime.</p>

      {pending === null ? (
        <div style={{ display: "grid", gap: 10 }}>
          {/* Lend the phone for one guest order — only when we have an email to route the return to. */}
          {email && (
            <button
              type="button"
              onClick={(e) => open("lend", e)}
              className="account-oauth"
              style={lendBtn}
            >
              <span aria-hidden style={{ fontSize: "var(--fs-body)" }}>
                ✦
              </span>
              Order for a friend
            </button>
          )}
          <button
            type="button"
            onClick={(e) => open("switch", e)}
            className="nav-link"
            style={switchBtn}
          >
            Switch account
          </button>
        </div>
      ) : (
        <div
          style={{ marginTop: 4 }}
          role="group"
          aria-label={
            pending === "lend" ? "Confirm ordering for a friend" : "Confirm switching account"
          }
          aria-describedby="acct-confirm-copy"
        >
          <p id="acct-confirm-copy" style={confirmCopy}>
            {pending === "lend"
              ? `Hand the phone to a friend? They’ll browse as a guest — your account and Stars stay safe. Tap “Done — back to ${firstName ?? "you"}” on the banner to return.`
              : `Switch account? You’ll browse as a guest — sign back in with one tap, or pick another account. Your Stars stay on ${who}.`}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={pending === "lend" ? doLend : doSwitch}
              disabled={busy}
              aria-busy={busy}
              style={proceedBtn}
            >
              {busy
                ? "One moment…"
                : pending === "lend"
                  ? "Yes, order for a friend"
                  : "Yes, switch"}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              style={cancelBtn}
            >
              Cancel
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
  fontSize: "var(--fs-h3)",
  fontWeight: 800,
  color: "var(--tx)",
  overflowWrap: "anywhere", // a long email must wrap, never overflow the card
};
const emailLine: CSSProperties = {
  margin: "1px 0 0",
  fontSize: "var(--fs-sm)",
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
  fontSize: "var(--fs-sm)",
  fontWeight: 800,
};
const sub: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  lineHeight: 1.5,
};
// Outline action (borrows `.account-oauth`'s border/hover-accent) — the lend affordance.
const lendBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  minHeight: 48,
  borderRadius: 12,
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  cursor: "pointer",
};
const switchBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  justifySelf: "start",
};
const confirmCopy: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  lineHeight: 1.5,
};
// Non-destructive proceed (Stars are safe) → accent border, not the `--warn` red of a true destructive step.
const proceedBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 11,
  border: "1.5px solid var(--ac)",
  background: "transparent",
  color: "var(--ac)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
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
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
