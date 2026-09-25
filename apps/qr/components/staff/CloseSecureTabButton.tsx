"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { closeSecureTab } from "@/lib/staff-cart";
import { Button, Card, type ButtonVariant } from "@mms/ui";
import { sx } from "@/lib/staff-labels";
import { openQuote, quoteDrift, reconcileQuote, type SettleQuote } from "@/lib/register-math";
import { inFlightMsg, type InFlightHolder } from "@/lib/inflight-refusal";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2c · gate ──
import { settleBlockedMsg } from "@/lib/staff-send-view";

/**
 * The two error sources on this surface, kept APART (the TerminalSettle `SettleError` pattern).
 * `kind: "server"` is a sentence `closeSecureTab` returned, so it goes through `<OutageText>`.
 * `kind: "local"` is a REJECTED action (the connection dropped mid-charge): nothing came back, so
 * the charge's outcome is UNKNOWN — this file authors that sentence as its own dictionary key rather
 * than the write-outage twin, whose "that change wasn’t saved" would be false for a charge that may
 * have landed.
 */
type CloseError =
  | { kind: "server"; text: string }
  | { kind: "local" }
  // Phase 2c · register (P2aa) — the compare-and-swap refused, or the page's total moved off the
  // confirm's frozen figure while it was open: both figures, nothing charged.
  | { kind: "moved"; from: number; to: number }
  // P2w (critic finding) — refused while money is already moving on the table: WHO holds it, said
  // through a dictionary key per holder (the server's English `error` is for older bundles).
  | { kind: "inflight"; holder: InFlightHolder }
  // Phase 2c · gate — the settle gate refused the close (dishes the kitchen never got), with the
  // server's count. Shown here in the running bill's words, SAID by the page's one region.
  | { kind: "unsent"; units: number };

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
  blocked = false,
  blockedNoteId,
  onBlockedTap,
  gateLive,
  readTicket = 0,
  readsStarted,
}: {
  sessionId: string;
  totalCents: number;
  variant?: Extract<ButtonVariant, "primary" | "secondary">;
  /** The parent's own detail refresh (debounced). */
  onChanged?: () => void;
  /** Phase 2c · gate — the settle gate holds (read by the page): `aria-disabled`, described by the
   *  page's note, and a tap opens NO confirm — it hands up (`onBlockedTap`). */
  blocked?: boolean;
  /** The page's note that says why — prepended to the trigger's description while blocked. */
  blockedNoteId?: string;
  /** A refused tap (`null` — the page's count is the reading), or the server's `unsent` refusal (its
   *  count): the page says why in its one region and moves focus to the order's lines, where
   *  "remove them if the guest has left" is done. */
  onBlockedTap?: (units: number | null) => void;
  /** Phase 2c · gate — whether the page's one region still holds the gate's line. `false` once it
   *  retired (a send, a later read with nothing unsent, another setter): the raced line never
   *  outlives it. Omitted (no page): the line lives until the table reads blocked or the next tap. */
  gateLive?: boolean;
  /** Phase 2c · review (R1) — the page's read clock (see CashSettleButton): the committed detail's
   *  ticket, and the last read STARTED (called when a refusal lands, never in render). */
  readTicket?: number;
  readsStarted?: () => number;
}) {
  const lang = useStaffLang();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The tap-time guard — a REF read when the finger lands, beside the `busy` the Button renders.
  const inFlight = useRef(false);
  const [error, setError] = useState<CloseError | null>(null);
  // Phase 2c · gate — render-time adjustment (guarded set-during-render): a raced `unsent` line is
  // DROPPED, not merely hidden, once the page has caught up — the page read the drafts (`blocked`:
  // its note says it now) or its own line retired. Hidden, it came back once the dishes were
  // removed, offering to remove them (critic finding).
  if (error?.kind === "unsent" && (blocked || gateLive === false)) setError(null);
  // The QUOTE (lib/register-math `SettleQuote`) — frozen when the confirm OPENS, so "Charge $x"
  // charges the figure staff READ, never the prop the page's re-read moves under an open confirm (the
  // critic's finding, the cash sheet's twin). A server `moved` refusal replaces it with the server's
  // figure until the page catches up (`basis`).
  const [quote, setQuote] = useState<SettleQuote | null>(null);
  // Render-time adjustment (guarded set-during-render): the page caught up with the server's figure.
  // Phase 2c · review (R1) — and a read that began after a refusal settles the refusal's figure.
  const reconciled = reconcileQuote(quote, totalCents, readTicket);
  if (reconciled !== quote) setQuote(reconciled);
  // Closed, the figure the confirm WOULD open on (the trigger's label); open, the frozen one.
  const shownTotal = (confirming && reconciled ? reconciled : openQuote(reconciled, totalCents))
    .cents;
  // The page's total moved off the open confirm's figure: the alert names both, and the next tap
  // ADOPTS the new figure (it charges nothing).
  const drift = confirming ? quoteDrift(reconciled, totalCents) : null;
  const alertMsg: CloseError | null = drift ? { kind: "moved", ...drift } : error;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Move focus into the confirm group when it opens and back to the trigger when it closes (parity with
  // CashSettleButton, S1-audit S6). The guard skips first mount.
  const wasConfirming = useRef(false);
  // Phase 2c · gate — the confirm closed over an `unsent` refusal: the page's jump already moved
  // focus to the fix, so the close does not pull it back to the trigger. Set before the close.
  const jumpOwnsFocus = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current && !jumpOwnsFocus.current)
      triggerRef.current?.focus();
    jumpOwnsFocus.current = false;
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    if (inFlight.current) return;
    if (drift) {
      // The total moved while the confirm was open: this tap ADOPTS the new figure in front of
      // staff (the label re-reads it, the sentence naming both stays); nothing is charged.
      setQuote({ cents: drift.to, basis: drift.to });
      setError({ kind: "moved", from: drift.from, to: drift.to });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    // The figure the confirm is showing (COMPARE-ONLY on the server) and the prop the page read.
    const quoted = shownTotal;
    const basis = totalCents;
    let res: Awaited<ReturnType<typeof closeSecureTab>>;
    try {
      res = await closeSecureTab({ sessionId, quotedCents: quoted });
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
      if (res.code === "moved") {
        // Nothing was charged. Quote the server's figure (what it just derived — not optimistic),
        // name both in the alert, and re-read the page; the re-tap is compared again.
        // `raisedAt` (R1): only a read that starts after this refusal may settle the figure.
        setQuote({ cents: res.totalCents, basis, raisedAt: readsStarted?.() ?? readTicket });
        setError({ kind: "moved", from: quoted, to: res.totalCents });
        onChanged?.();
        return;
      }
      if (res.code === "inflight") {
        setError({ kind: "inflight", holder: res.holder });
        return;
      }
      if (res.code === "unsent") {
        // Phase 2c · gate — nothing charged (the freeze released on the server). The page says it
        // in its one region and takes staff to the lines; the page re-reads so its note appears.
        setError({ kind: "unsent", units: res.units });
        if (onBlockedTap) {
          jumpOwnsFocus.current = true;
          onBlockedTap(res.units);
        }
        onChanged?.();
        return;
      }
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
              vars={{ m: fmt(shownTotal) }}
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
              // aria-disabled + the handler's guard (K35) — a charge in flight is not cancellable here.
              {...(busy ? { "aria-disabled": true } : {})}
              onClick={() => {
                if (busy) return;
                setConfirming(false);
              }}
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
                vars={{ m: fmt(shownTotal) }}
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
          // Phase 2c · gate — the attribute (spread only when set) plus the handler's guard.
          {...(blocked ? { "aria-disabled": true } : {})}
          aria-describedby={
            blocked && blockedNoteId ? `${blockedNoteId} secure-close-hint` : "secure-close-hint"
          }
          onClick={() => {
            if (blocked) {
              // Opens no confirm: the page says why and takes staff to the lines.
              setError(null);
              onBlockedTap?.(null);
              return;
            }
            // The quote FREEZES here: the live figure, or the server's a refusal handed back while
            // the page has not re-read yet (`openQuote`).
            setQuote(openQuote(reconciled, totalCents));
            setConfirming(true);
          }}
        >
          <Chrome lang={lang} k="settle.card.trigger" vars={{ m: fmt(shownTotal) }} echo="stack" />
        </Button>
      )}
      <p id="secure-close-hint" style={hint}>
        <Chrome lang={lang} k="settle.card.hint" echo="stack" />
      </p>
      {/* Phase 2c · gate — SHOWN here, SAID by the page's one region (no role of its own); it is
          dropped for the page's note once the page has read the drafts too (the clear above). */}
      {alertMsg?.kind === "unsent" && (
        <p style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          <Chrome
            lang={lang}
            k={settleBlockedMsg(alertMsg.units, true).k}
            vars={settleBlockedMsg(alertMsg.units, true).vars}
            echo={false}
          />
        </p>
      )}
      {alertMsg && alertMsg.kind !== "unsent" && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {alertMsg.kind === "server" ? (
            <OutageText lang={lang} error={alertMsg.text} />
          ) : alertMsg.kind === "moved" ? (
            <Chrome
              lang={lang}
              k="settle.cash.moved"
              vars={{ old: fmt(alertMsg.from), m: fmt(alertMsg.to) }}
              echo={false}
            />
          ) : alertMsg.kind === "inflight" ? (
            <Chrome
              lang={lang}
              k={inFlightMsg(alertMsg.holder).k}
              vars={inFlightMsg(alertMsg.holder).vars}
              echo={false}
            />
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
