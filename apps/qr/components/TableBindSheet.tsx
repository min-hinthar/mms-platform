"use client";
import { useRef, useState } from "react";
import { Sheet } from "@mms/ui";
import { TableSection } from "@/components/TableSection";
import { BIND_COPY } from "@/lib/bind-copy";
import type { BindTableResult } from "@/lib/bind-table";
import { boundWrite, type Bounded } from "@/lib/bounded-write";
import { t } from "@/lib/i18n";
import { seatedAnswer } from "@/lib/table-pick";
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
 * drops the persisted key (`useTableSession`) and mints a second session. The section's own h3 is
 * not rendered here either: this sheet IS the section, and its title is the one name.
 *
 * THE BIND (M82 · `busy`): `claim` raises `binding`, awaits `boundWrite(onClaim(n))` — the HOST's
 * `bindTable(cartId, n)`, the 3c-i shape (`LineOptionsSheet`'s `onMakeNow`: the host owns the
 * mutation call, the sheet owns the bounded await) — the contract's STAFF_HANG_MS bound, never a
 * raw action — and clears it in a `finally`, so every
 * exit is refused only while the write can still be out (`lib/sheet-busy-callers.test.ts` parses
 * this shape), and a second chip or "Send anyway" under a bind still out is IGNORED (one write per
 * open at a time). A write still out at the bound reads as `error` to the host ("couldn't send that just
 * now"); its late answer is deliberately not applied — the next Send asks again and the bind answers
 * `already` if it landed, so nothing is lost but one question.
 *
 * `seated` — a table that was Open when the grid was read and seated by the time the chip was
 * pressed, OR a Seated chip's own bind (Codex round 3 on #314, P2: in this sheet a Seated chip tries
 * the bind FIRST, because only `bindTable`'s pre-read can tell the host's OWN numberless row on that
 * table's sticker — which the registry reports as occupied — from a stranger's party; `TableGrid`
 * says why) — flips THAT chip to Seated (a disclosure, never natively disabled) and reveals the inline
 * join with focus in its input, plus the drafts note while this cart holds drafts: joining moves the
 * diner, never the dishes. J40 — `kiosk` and `held` (an order NO code joins: a kiosk order, or a
 * table a server started that already has an order on it) flip the chip to Seated with NO form, and
 * under a freeze such a chip says FROZEN_NOTE instead of revealing an ask (`seatedAnswer`, pure,
 * decides which). Every other answer is the host's to say.
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
  // J40 — the subset whose latest answer was an order NO code joins (`kiosk` · `held`): Seated, but
  // with no join form, here or under a freeze. Cleared when the same chip's next answer is `seated`.
  const [noJoinAt, setNoJoinAt] = useState<ReadonlySet<number>>(() => new Set());
  // Why the sheet is closing — "send" on a landed bind or "Send anyway", else a dismissal.
  const closedBy = useRef<"send" | null>(null);

  const shown = seatedAt.size
    ? tables.map((t) => (seatedAt.has(t.tableNumber) ? { ...t, occupied: true } : t))
    : tables;
  const occupied = (n: number) => shown.some((t) => t.tableNumber === n && t.occupied);

  async function claim(n: number) {
    // One bind at a time (the blind pass on 3c-ii, concurrency): a second chip while one is out
    // started a second write whose late `ok` could fire the order after a dismissal, and the first
    // `finally` dropped `busy` with that write still in flight. The chips are never natively
    // disabled (the sheet is `aria-busy`); the guard is here, where the write starts.
    if (binding) return;
    if (frozen && occupied(n)) {
      // A SEATED chip under a freeze (Codex round 3 on #314): no bind is possible, and the join is
      // not a cart write — reveal the ask, as the DoorSheet's chip would. FROZEN_NOTE below is the
      // OPEN chip's sentence; said here it would wall the join off until a tablemate's lock lifts.
      // J40 — except a chip whose order no code joins: there is no ask to reveal, so the freeze's
      // own sentence is the true one.
      if (noJoinAt.has(n)) onFrozen(FROZEN_NOTE);
      else setJoinNum(n);
      return;
    }
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
    // J40 — `seatedAnswer` (pure) says what the refusal does to THIS chip.
    const ask = seatedAnswer(result);
    if (result.ok) {
      closedBy.current = "send";
    } else if (ask === "join") {
      setSeatedAt((s) => new Set(s).add(n));
      setNoJoinAt((s) => withoutTable(s, n));
      setJoinNum(n);
    } else if (ask === "occupied") {
      // No form: the chip whose ask is OPEN collapses instead of binding (`TableGrid`), so no ask
      // can be open on the chip this answer is for.
      setSeatedAt((s) => new Set(s).add(n));
      setNoJoinAt((s) => new Set(s).add(n));
    }
    onOutcome(result);
  }
  const sendAnyway = () => {
    if (binding) return; // the same one-write rule: no second send under a bind still out
    closedBy.current = "send";
    onSendAnyway();
  };
  // At UNMOUNT (after the exit). Nothing to prevent: Radix's modal content prevents its own default
  // and aims at a trigger that does not exist, so the landing is the host's either way (docblock).
  // The join ASK is this open's: a reopened sheet shows no form for a table the host did not tap
  // (the DoorSheet resets the same way). The `seated` verdicts stay — the bind said so.
  const closeEdge = () => {
    const sent = closedBy.current === "send";
    closedBy.current = null;
    setJoinNum(null);
    onClosed?.({ sent });
  };

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

/** A copy of `s` without `n` (the state sets are never mutated in place). */
function withoutTable(s: ReadonlySet<number>, n: number): ReadonlySet<number> {
  if (!s.has(n)) return s;
  const next = new Set(s);
  next.delete(n);
  return next;
}

const flush = { margin: 0 } as const;
const refusal = { margin: "var(--s3) 0 0", color: "var(--warn)" } as const;
