"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { closeSecureTab } from "@/lib/staff-cart";
import { boundWrite, stalledSince } from "@/lib/bounded-write";
import { Button, Card, type ButtonVariant } from "@mms/ui";
import { sx } from "@/lib/staff-labels";
import { openQuote, quoteDrift, reconcileQuote, type SettleQuote } from "@/lib/register-math";
import { inFlightMsg, type InFlightHolder } from "@/lib/inflight-refusal";
import type { SettleOutcome } from "@/lib/floor-pane";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2c · gate ──
import { settleBlockedMsg } from "@/lib/staff-send-view";
import { ackForTap, reWarning, type PendingFlag } from "@/lib/settle-approvals";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";
import { useResaid } from "./useResaid";

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
  | { kind: "unsent"; units: number }
  // P2el — the gate could not read the lines, so nothing was charged; the same tap retries.
  | { kind: "unreadable" }
  // PD8 — a request this tap did not display (a re-warning): the page re-draws the flag card.
  | { kind: "approvalPending"; dish: string }
  // PD8 — the pending read failed; nothing charged, the same tap retries.
  | { kind: "approvalUnreadable" }
  // Phase 2h (9d) — refused AT THE TAP while an earlier action is stuck: never sent, nothing charged.
  | { kind: "stalled" }
  // Phase 2h (9e) — still unanswered at the bound: the card on file may yet be charged. The late
  // answer is APPLIED when it lands (a late charge re-reads the page; a late refusal is said).
  | { kind: "waiting" };

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
  acknowledgedApprovalIds,
  onApprovalPending,
  gateLive,
  readTicket = 0,
  readsStarted,
  onSettleOutcome,
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
  /** PD8 (Codex correction 13) — the pending request ids THIS door displays; sent at ITS confirm as
   *  the acknowledgement (never read into an amount). */
  acknowledgedApprovalIds?: readonly string[];
  /** PD8 — the server re-warned: the page re-draws the flag card with the server's list and says
   *  `dishes`, the ones this confirm did NOT acknowledge (`reWarning`). */
  onApprovalPending?: (pending: PendingFlag[], dishes: string) => void;
  /** Phase 2c · gate — whether the page's one region still holds the gate's line. `false` once it
   *  retired (a send, a later read with nothing unsent, another setter): the raced line never
   *  outlives it. Omitted (no page): the line lives until the table reads blocked or the next tap. */
  gateLive?: boolean;
  /** Phase 2c · review (R1) — the page's read clock (see CashSettleButton): the committed detail's
   *  ticket, and the last read STARTED (called when a refusal lands, never in render). */
  readTicket?: number;
  readsStarted?: () => number;
  /** Phase 2d · review fixes — every refusal (`refused`: nothing recorded) or unknown outcome (the
   *  answer never came) of this control's settle, as it lands. The page says it where this control
   *  cannot: once the detail unmounted mid-settle, this control's own line is gone with it.
   *  Phase 2h · integration — and `landed`: a LATE charge answering the attempt this control
   *  reported `unknown` at the bound, so the page can retract what it said off that unknown. */
  onSettleOutcome?: (outcome: SettleOutcome) => void;
}) {
  const lang = useStaffLang();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The tap-time guard — a REF read when the finger lands, beside the `busy` the Button renders.
  const inFlight = useRef(false);
  const [error, setError] = useState<CloseError | null>(null);
  // Phase 2h (S2 critic D9) — a LATE charge went: the guard stays spent (the trigger held) until the
  // settle section re-renders away, exactly as an on-time charge keeps "Charging…" — between the late
  // answer and the page's re-read the ledger is clear, so nothing else would refuse a second close.
  const [charged, setCharged] = useState(false);
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
  // The blind pass on #333 — with NO page to re-draw the flag, what this door's own re-warning
  // carried, acknowledged by its next confirm (`ackForTap`). With a page, the page owns it.
  const warned = useRef<string[]>([]);
  // What the last close SENT as its acknowledgement — the re-warning names what it did not cover.
  const sentAck = useRef<string[]>([]);

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

  // Phase 2h — whether this control is still mounted when a LATE answer lands (9e: a late refusal is
  // said only while its surface is here). Re-armed at setup: Strict Mode runs the cleanup once on
  // mount, and a cleanup-only latch would read "gone" forever (the CLAUDE.md gotcha).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * The close's answer, whenever it lands — at once, or after the bound (`late`, 9e: never dropped).
   * `quoted` / `basis` are the TAP's (the figure the confirm showed, the prop the page read). Returns
   * whether the charge WENT: then the guard stays spent until the settle section re-renders away.
   */
  function land(
    res: Awaited<ReturnType<typeof closeSecureTab>>,
    quoted: number,
    basis: number,
    late: boolean,
  ): boolean {
    if (!res.ok) {
      onSettleOutcome?.("refused"); // nothing was charged, whichever refusal it is
      // A late refusal is said only while this control is here; the page says it where it cannot.
      if (late && !alive.current) return false;
      setConfirming(false);
      if (res.code === "moved") {
        // Nothing was charged. Quote the server's figure (what it just derived — not optimistic),
        // name both in the alert, and re-read the page; the re-tap is compared again.
        // `raisedAt` (R1): only a read that starts after this refusal may settle the figure.
        setQuote({ cents: res.totalCents, basis, raisedAt: readsStarted?.() ?? readTicket });
        setError({ kind: "moved", from: quoted, to: res.totalCents });
        onChanged?.();
        return false;
      }
      if (res.code === "inflight") {
        setError({ kind: "inflight", holder: res.holder });
        return false;
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
        return false;
      }
      if (res.code === "unreadable") {
        // P2dc · P2el — nothing charged, the freeze released: the dictionary's words; retry = tap.
        setError({ kind: "unreadable" });
        return false;
      }
      if (res.code === "approval_pending") {
        // PD8 — a request this confirm did not display: nothing charged, the freeze released. The
        // page re-draws the flag card naming it; the next confirm acknowledges what it shows.
        const said = reWarning(res.pending, sentAck.current);
        if (!onApprovalPending) warned.current = res.pending.map((p) => p.id);
        setError({ kind: "approvalPending", dish: said.dishes });
        onApprovalPending?.(res.pending, said.dishes);
        return false;
      }
      if (res.code === "approval_unreadable") {
        setError({ kind: "approvalUnreadable" });
        return false;
      }
      setError({ kind: "server", text: res.error });
      return false;
    }
    // A LATE charge (9e): "no answer yet" is no longer true — the page's re-read shows it closing.
    if (late) setError(null);
    // The off-session charge fulfills via the webhook; the page's detail re-reads (the freeze makes it
    // read-only at once, and paid when the webhook lands).
    onChanged?.();
    return true;
  }

  async function confirm() {
    if (inFlight.current) return;
    if (drift) {
      // The total moved while the confirm was open: this tap ADOPTS the new figure in front of
      // staff (the label re-reads it, the sentence naming both stays); nothing is charged.
      setQuote({ cents: drift.to, basis: drift.to });
      setError({ kind: "moved", from: drift.from, to: drift.to });
      return;
    }
    // Phase 2h (9d) — an earlier action has been unanswered for the bound: refused AT THE TAP, never
    // sent (queued behind the stuck one, the charge could land minutes from now, after the cashier
    // took cash). The confirm closes (focus returns to the trigger, beside the alert that says it).
    // Read now, never from render state.
    if (stalledSince() !== null) {
      setConfirming(false);
      setError({ kind: "stalled" });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    // The figure the confirm is showing (COMPARE-ONLY on the server) and the prop the page read.
    const quoted = shownTotal;
    const basis = totalCents;
    // A charge that WENT keeps the guard spent: the confirm stays "Charging…" until the settle
    // section re-renders away, so a second charge cannot be asked.
    let spent = false;
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      // PD8 — the ids this door displays at ITS confirm ride the close as the acknowledgement.
      sentAck.current = ackForTap(acknowledgedApprovalIds ?? [], warned.current);
      const out = await boundWrite(
        closeSecureTab({
          sessionId,
          quotedCents: quoted,
          acknowledgedApprovalIds: sentAck.current,
        }),
      );
      if (out.kind === "answer") {
        spent = land(out.value, quoted, basis, false);
        return;
      }
      // No answer, or no answer yet: we don't know whether the card was charged. The page says it
      // where this control cannot (it may unmount mid-settle).
      onSettleOutcome?.("unknown");
      // Close the confirm (the effect above returns focus to the trigger, beside the alert).
      setConfirming(false);
      if (out.kind === "threw") {
        // Phase 2a · register — a REJECTED action used to latch the confirm on "Charging…" with both
        // buttons disabled until a reload. Say the one true thing: we don't know whether it charged.
        console.error("[CloseSecureTabButton] close rejected — outcome unknown", out.error);
        setError({ kind: "local" });
        return;
      }
      setError({ kind: "waiting" });
      void out.late.then((late) => {
        if (late.kind !== "answer") {
          setError({ kind: "local" }); // a lost late answer: "couldn't confirm" (9e)
          // Codex r2 on #310 (A1) — handed UP again: the bound's `unknown` may have reached a detail
          // still mounted (ignored there), and a switch since leaves this throw as the pane's only cue.
          onSettleOutcome?.("unknown");
          return;
        }
        if (land(late.value, quoted, basis, true)) {
          inFlight.current = true;
          setCharged(true);
          // Phase 2h · integration — the charge WENT: the answer to the `unknown` handed up at the
          // bound, so the page may retract what it said off it.
          onSettleOutcome?.("landed");
        }
      });
    } finally {
      // Frees AT THE BOUND (fact 3) — unless the charge went.
      if (!spent) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  // Phase 2h (S2 critic D4) — this close is still unanswered past the bound: the trigger is HELD
  // (the line says "don't take cash or another card"), so a re-tap can never reach the stalled
  // refusal and replace that warning with "this did nothing". The late answer frees it — or, a
  // charge, keeps it spent (`charged`).
  const held = error?.kind === "waiting" || charged;
  // Review a (A5) — every SET of the stored outcome (a second refused charge re-says `out.stalled`)
  // replaces the alert's content, so it is announced again. Keyed on the STATE: `alertMsg` is
  // built fresh each render while the figures drift.
  const said = useResaid(error);

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
          disabled={held}
          aria-describedby={[
            blocked && blockedNoteId ? blockedNoteId : null,
            error?.kind === "waiting" ? "secure-close-alert" : null,
            "secure-close-hint",
          ]
            .filter(Boolean)
            .join(" ")}
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
        <p
          id="secure-close-alert"
          role="alert"
          style={{ ...hint, marginTop: 4, color: "var(--warn)" }}
        >
          <span key={said}>
            {alertMsg.kind === "server" ? (
              <OutageText lang={lang} error={alertMsg.text} />
            ) : alertMsg.kind === "unreadable" ? (
              <Chrome lang={lang} k="settle.unsentUnreadable" echo={false} />
            ) : alertMsg.kind === "approvalPending" ? (
              <Chrome
                lang={lang}
                k="settle.flag.pendingRefused"
                vars={{ x: alertMsg.dish }}
                echo={false}
              />
            ) : alertMsg.kind === "approvalUnreadable" ? (
              <Chrome lang={lang} k="settle.approvalsUnreadable" echo={false} />
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
            ) : alertMsg.kind === "stalled" ? (
              <Chrome lang={lang} k="out.stalled" echo={false} />
            ) : alertMsg.kind === "waiting" ? (
              <Chrome lang={lang} k="settle.card.waiting" echo={false} />
            ) : (
              <Chrome lang={lang} k="settle.card.unknown" echo={false} />
            )}
          </span>
        </p>
      )}
      {/* Phase 2h — both lines say "reload the page", and the console is installed standalone (no
          browser reload): the one way out sits BESIDE the alert that says it, never inside it. */}
      {(alertMsg?.kind === "stalled" || alertMsg?.kind === "waiting") && (
        <div style={reloadRow}>
          <ReloadButton lang={lang} />
        </div>
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
// Phase 2h — the reload offered beside the alert: spaced off the line above it, never stretched.
const reloadRow: CSSProperties = { marginTop: "var(--s2)" };
