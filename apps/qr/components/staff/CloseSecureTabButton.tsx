"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { closeSecureTab } from "@/lib/staff-cart";
import { Button, Card, type ButtonVariant } from "@mms/ui";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";

/**
 * The two error sources on this surface, kept APART (the TerminalSettle `SettleError` pattern).
 * `kind: "server"` is a sentence `closeSecureTab` returned, so it goes through `<OutageText>`.
 * `kind: "local"` is a REJECTED action (the connection dropped mid-charge): nothing came back, so
 * the charge's outcome is UNKNOWN — this file authors that sentence as its own dictionary key rather
 * than the write-outage twin, whose "that change wasn’t saved" would be false for a charge that may
 * have landed.
 */
type CloseError = { kind: "server"; text: string } | { kind: "local" };

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Close a SECURE tab off-session (S3.2) — charge the card on file for the final total. Two-step confirm
 * (parity with CashSettleButton); the server (closeSecureTab) re-derives the amount + holds the settle
 * mutex, mints the off_session PI, and the webhook fulfills. A decline surfaces here as an honest
 * "settle by cash or a fresh card" — the tab is never stranded paid. No tip is added off-session.
 *
 * Phase 2c · register — every control is a `@mms/ui` Button (aria-disabled + aria-busy, never native
 * `disabled`, K35), the trigger is the settle section's primary on a secure running bill
 * (`settlePrimary`), and a landed close re-reads the PAGE's detail (`onChanged`) — `router.refresh()`
 * updated nothing `FloorDetailLive` reads.
 */
export function CloseSecureTabButton({
  sessionId,
  totalCents,
  variant = "primary",
  onChanged,
}: {
  sessionId: string;
  totalCents: number;
  variant?: Extract<ButtonVariant, "primary" | "secondary">;
  /** The parent's own detail refresh (debounced). */
  onChanged?: () => void;
}) {
  const lang = useStaffLang();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The tap-time guard — a REF read when the finger lands, beside the `busy` the Button renders.
  const inFlight = useRef(false);
  const [error, setError] = useState<CloseError | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Move focus into the confirm group when it opens and back to the trigger when it closes (parity with
  // CashSettleButton, S1-audit S6). The guard skips first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let res: Awaited<ReturnType<typeof closeSecureTab>>;
    try {
      res = await closeSecureTab({ sessionId });
    } catch (e) {
      // Phase 2a · register — a REJECTED action used to latch the confirm on "Charging…" with both
      // buttons disabled until a reload. Clear busy, close the confirm (the effect above returns
      // focus to the trigger) and say the one true thing: we don't know whether the card was charged.
      console.error("[CloseSecureTabButton] close rejected — outcome unknown", e);
      inFlight.current = false;
      setBusy(false);
      setConfirming(false);
      setError({ kind: "local" });
      return;
    }
    if (!res.ok) {
      inFlight.current = false;
      setBusy(false);
      setConfirming(false);
      setError({ kind: "server", text: res.error });
      return;
    }
    // The off-session charge fulfills via the webhook; the page's detail re-reads (the freeze makes it
    // read-only at once, and paid when the webhook lands). The confirm stays "Charging…" until the
    // settle section re-renders away — the guard stays spent, so a second charge cannot be asked.
    onChanged?.();
  }

  return (
    <div>
      {confirming ? (
        <Card
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={sx(lang, "settle.a11y.confirmCard")}
          style={{ ...confirmCard, outline: "none" }}
        >
          <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
            <Chrome
              lang={lang}
              k="settle.card.chargeQ"
              vars={{ m: fmt(totalCents) }}
              echo="stack"
            />{" "}
            {/* The same sentence the cash settle closes with — one key, so a K15 correction lands
                on both surfaces at once. */}
            <Chrome lang={lang} k="settle.cash.closesTab" echo="stack" />
          </p>
          <div style={{ display: "flex", gap: "var(--s3)", alignItems: "stretch" }}>
            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              <Chrome lang={lang} k="settle.cancel" echo={false} />
            </Button>
            <Button
              variant="primary"
              size="xl"
              style={{ flex: 1 }}
              busy={busy}
              busyLabel={<Chrome lang={lang} k="settle.card.charging" echo={false} />}
              onClick={confirm}
            >
              <Chrome
                lang={lang}
                k="settle.card.chargeAmount"
                vars={{ m: fmt(totalCents) }}
                echo="stack"
              />
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          ref={triggerRef}
          variant={variant}
          size="xl"
          block
          aria-describedby="secure-close-hint"
          onClick={() => setConfirming(true)}
        >
          <Chrome lang={lang} k="settle.card.trigger" vars={{ m: fmt(totalCents) }} echo="stack" />
        </Button>
      )}
      <p id="secure-close-hint" style={hint}>
        <Chrome lang={lang} k="settle.card.hint" echo="stack" />
      </p>
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.text} />
          ) : (
            <Chrome lang={lang} k="settle.card.unknown" echo={false} />
          )}
        </p>
      )}
    </div>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const confirmCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  padding: "var(--s4)",
};
const hint: CSSProperties = {
  margin: "var(--s2) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
