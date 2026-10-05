"use client";
import { useRef, useState } from "react";
import { Sheet } from "@mms/ui";
import { TableSection } from "@/components/TableSection";
import { BIND_COPY } from "@/lib/bind-copy";
import type { BindTableResult } from "@/lib/bind-table";
import { boundWrite, type Bounded } from "@/lib/bounded-write";
import { t } from "@/lib/i18n";
import type { DineInTable } from "@/lib/tables";
import { FROZEN_NOTE } from "./useUndoGrace";

/**
 * Phase 3c-ii (D27 · D28) — the Send-time table sheet. The first Send on an UNBOUND dine-in session
 * opens it (`SendToKitchenButton`'s gate, `sendNeedsTable`); a chip BINDS the live session to that
 * table through ONE bounded write and hands the host the CONFIRMED answer, and the host (Checkout)
 * runs the SAME send — bind and fire are one gesture. "Pick your table" is the Send's question,
 * never a verb: this sheet wears no `.checkout-cta` and the hero stays `orderStageHero`'s.
 *
 * It hosts `TableSection` — the DoorSheet's own section, verbatim — with the Send's wiring: an
 * open chip calls `claim` instead of navigating (a `?table=N` claim would MINT a second session over
 * the drafts about to be sent), no chip is "yours" (the session has no number), the escape reads
 * "Send anyway" (`BIND_COPY.sendAnyway` — a numberless ticket reads its code on the pass, so a
 * registry outage is never a dead end), and the sub-line is this sheet's own (`BIND_COPY.sub` with
 * its K15 draft): the DoorSheet's "scan your sticker" is REFUSED here, since a `?t=` from /cart
 * drops the persisted key (`useTableSession`) and mints a second session.
 *
 * THE BIND (M82 · `busy`): `claim` raises `binding`, awaits `boundWrite(onClaim(n))` — the HOST's
 * `bindTable(cartId, n)`, the 3c-i shape (`LineOptionsSheet`'s `onMakeNow`: the host owns the
 * mutation call, the sheet owns the bounded await) — the contract's STAFF_HANG_MS bound, never a
 * raw action — and clears it in a `finally`, so every
 * exit is refused only while the write can still be out (`lib/sheet-busy-callers.test.ts` parses
 * this shape). A write still out at the bound reads as `error` to the host ("couldn't send that just
 * now"); its late answer is deliberately not applied — the next Send asks again and the bind answers
 * `already` if it landed, so nothing is lost but one question.
 *
 * `seated` — a table that was Open when the grid was read and seated by the time the chip was
 * pressed — flips THAT chip to Seated (a disclosure, never natively disabled) and reveals the inline
 * join with focus in its input, plus the drafts note while this cart holds drafts: joining moves the
 * diner, never the dishes. Every other answer is the host's to say.
 *
 * NO LIVE REGION HERE (one per view): a sentence written while the modal is open sits under Radix's
 * `aria-hidden`, so the host STASHES each one and says it through its own region in `onClosed` —
 * which fires from `onCloseAutoFocus`, at UNMOUNT, after the CSS exit. THE RESTORE IS THE HOST'S ON
 * BOTH EDGES: a caller-supplied `onCloseAutoFocus` replaces the primitive's W9e opener restore
 * outright (`packages/ui/src/sheet.tsx:248-252`), and Radix's modal content then prevents its own
 * default and focuses a `Dialog.Trigger` this primitive never renders — so without an explicit
 * landing every close drops focus on <body>. `onClosed({ sent })` is that landing's cue: on the SEND
 * edge (a bind landed, or "Send anyway") the Send node has given way to the Undo (or is disabled
 * mid-send) and the host focuses the control that replaced it; on a dismissal (Esc · ✕ · scrim) —
 * which calls nothing and keeps every draft — it focuses the Send again.
 *
 * T9 — THE FREEZE THAT LANDS WHILE THE ASK IS UP. The Send's gate refused a frozen tap before any
 * sheet opened; a tablemate's checkout can lock the cart while this sheet is open, and `bindTable`
 * refuses on the raw lock. So `claim` reads Checkout's `editsFrozen` (threaded, never re-derived)
 * and refuses BEFORE the write with `FROZEN_NOTE` — the sentence the client already knows, not the
 * raced one the server would answer — through `onFrozen`, which the host shows here and says
 * through its region after the close (`scripts/check-child-freeze.mjs` parses this shape).
 */
export function TableBindSheet({
  open,
  onOpenChange,
  onClaim,
  tables,
  draftQty,
  frozen,
  note,
  onFrozen,
  onOutcome,
  onSendAnyway,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The host's `bindTable(cartId, n)` — the RAW action; this sheet bounds it (`boundWrite`). */
  onClaim: (n: number) => Promise<BindTableResult>;
  /** T9 — Checkout's `editsFrozen`, threaded: a chip tap under a freeze is refused before the bind. */
  frozen: boolean;
  /** A frozen chip tap's sentence (`FROZEN_NOTE`): shown here by the host, said after the close. */
  onFrozen: (sentence: string) => void;
  /** The registered dine-in tables (number + occupancy; tokens stripped server-side). */
  tables: DineInTable[];
  /** The cart's dine-in draft units — the drafts note under a seated table's join form. */
  draftQty: number;
  /** The host's visible sentence for the last refusal (seen here, SAID after the close), or null. */
  note: string | null;
  /** The bind's CONFIRMED answer — the CAS count or the re-read, never before. The host confirms the
   *  number, closes, and sends (ok); confirms and closes (`already_bound`); or keeps the sheet open. */
  onOutcome: (result: BindTableResult) => void;
  /** The escape: send unbound, as before 3c-ii. The host closes and sends. */
  onSendAnyway: () => void;
  /** After the sheet has UNMOUNTED (the close edge): `sent` when it closed to send. The host says
   *  what it stashed and lands focus — on the control that replaced the Send, or on the Send again
   *  after a dismissal (the primitive restores nothing once this handler exists; see above). */
  onClosed?: (edge: { sent: boolean }) => void;
}) {
  // M82 — the bind in flight: set at the tap, cleared in the finally of the one bounded await.
  const [binding, setBinding] = useState(false);
  // The seated table whose code is being asked for, inline under the grid (null = no ask).
  const [joinNum, setJoinNum] = useState<number | null>(null);
  // Tables the bind answered `seated` for since this sheet opened: their chips read Seated now,
  // whatever the registry said when the grid was read.
  const [seatedAt, setSeatedAt] = useState<ReadonlySet<number>>(() => new Set());
  // Why the sheet is closing — "send" on a landed bind or "Send anyway", else a dismissal.
  const closedBy = useRef<"send" | null>(null);

  async function claim(n: number) {
    if (frozen) {
      // T9 — the lock landed while the ask was up: refuse BEFORE the write, and say so.
      onFrozen(FROZEN_NOTE);
      return;
    }
    closedBy.current = null;
    setBinding(true);
    let out: Bounded<BindTableResult> | undefined;
    try {
      out = await boundWrite(onClaim(n));
    } finally {
      setBinding(false);
    }
    if (!out) return;
    // A thrown action, and a write still out at the bound (its late answer is not applied — the
    // docblock says why), both read as a send that did not happen.
    const result: BindTableResult =
      out.kind === "answer" ? out.value : { ok: false, reason: "error" };
    if (result.ok) {
      closedBy.current = "send";
    } else if (result.reason === "seated") {
      setSeatedAt((s) => new Set(s).add(n));
      setJoinNum(n);
    }
    onOutcome(result);
  }
  const sendAnyway = () => {
    closedBy.current = "send";
    onSendAnyway();
  };
  // At UNMOUNT (after the exit). Nothing to prevent: Radix's modal content prevents its own default
  // and aims at a trigger that does not exist, so the landing is the host's either way (docblock).
  const closeEdge = () => {
    const sent = closedBy.current === "send";
    closedBy.current = null;
    onClosed?.({ sent });
  };

  const shown = seatedAt.size
    ? tables.map((t) => (seatedAt.has(t.tableNumber) ? { ...t, occupied: true } : t))
    : tables;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      busy={binding}
      onCloseAutoFocus={closeEdge}
      title={
        <>
          {t("en", "pickYourTable")}{" "}
          <span lang="my" className="door-sheet-my">
            {t("my", "pickYourTable")}
          </span>
        </>
      }
    >
      <TableSection
        tables={shown}
        source="send"
        sub={
          <>
            {BIND_COPY.sub}{" "}
            <span lang="my" className="door-sheet-my">
              {BIND_COPY.subMy}
            </span>
          </>
        }
        joinNum={joinNum}
        onJoinChange={setJoinNum}
        onClaim={claim}
        onPlain={sendAnyway}
        markMine={false}
        joinNote={
          draftQty > 0 ? (
            <p className="door-sheet-sub" style={flush}>
              {BIND_COPY.draftsNote}
            </p>
          ) : undefined
        }
      />
      {note && (
        // Seen while the sheet is open; SAID by the host's region once it has closed (no region here).
        <p className="door-sheet-sub" style={refusal}>
          {note}
        </p>
      )}
    </Sheet>
  );
}

const flush = { margin: 0 } as const;
const refusal = { margin: "var(--s3) 0 0", color: "var(--warn)" } as const;
