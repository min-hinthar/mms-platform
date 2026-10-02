"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { resolveRefundNeeded, type RefundNeeded } from "@/lib/approvals";
import {
  boundWrite,
  hasOwnWait,
  ownWaitSlot,
  subscribeOwnWait,
  type Late,
} from "@/lib/bounded-write";
import type { StaffLang } from "@/lib/staff-lang";
import { al, sx } from "@/lib/staff-labels";
import { ts } from "@/lib/i18n/staff";
import { plural, tf } from "@/lib/i18n/fill";
import { Chrome } from "./Chrome";
import { useEchoesShown } from "./StaffLangProvider";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A row's own line after a mark got no answer: still out at the bound, or the answer was lost. */
type NoteKind = "waiting" | "unknown";
/** Codex r2 on #310 (B3) — the tab's own-wait subject for a row's mark still out past the bound. */
const holdOf = (id: string) => `refundmark:${id}`;
/** The late answer a row's hold carries while its mark is out. */
type MarkLate = Promise<Late<Awaited<ReturnType<typeof resolveRefundNeeded>>>>;

/**
 * A4·3 — the refunds-needed strip (W11 / M43), moved from `/staff/approvals` onto the counter's one
 * screen as the first of the manager rails. Every row is a charge (or a hold we knowingly
 * abandoned) that no order accounts for; the manager refunds it in the processor's dashboard and
 * marks it done here. Renders nothing when the ledger is empty; an UNREADABLE ledger says so —
 * an empty strip must MEAN empty. A client component since Codex round 2 on #283: its rows ride
 * the approvals poll (`ApprovalsBoard`), because a server-rendered strip never re-read the ledger
 * and a tablet left on the one screen hid a stranded charge the webhook wrote after load. The
 * resolve is the exported server action; the row leaves the strip only once the server confirmed.
 *
 * manager-3 — "Mark refunded" is TWO taps now (the ClearTableButton shape): the first opens an
 * inline confirm group naming the amount and the processor, the second commits. It was one tap
 * with no confirm, no undo and no busy state — a mis-tap hid a stranded charge from the console,
 * and a double-tap submitted twice — on the one surface where every other destructive control is
 * two-step or PIN-gated. Focus moves into the group when it opens and back to the trigger when it
 * closes; the commit is `aria-disabled` + `aria-busy` while in flight (§17), never native.
 *
 * Phase 2h (P2fc) — the mark is NOT a transition any more. Its lock was `useTransition`'s `pending`,
 * which React entangles with every other async transition on the page and holds until the RAW action
 * answers (LEARNINGS #149 · #158 · #200): one hung approvals write kept every row's buttons dimmed.
 * The lock is a ref + state written here, the action is awaited with a bound (`boundWrite`), and a
 * lost or late answer says so honestly — it may still be marked done — never "nothing was recorded".
 *
 * Codex round 2 on #310 (B3) — the strip's lock frees at the bound, but a row whose mark is still
 * unanswered keeps its OWN hold until the late answer settles: that lock was the only guard, so its
 * confirm reopened and every attempt queued another mark behind the unresolved one. The hold is per
 * ROW (other rows stay free) and lives in the tab's own-wait register (`refundmark:<row>`), so a
 * strip mounted again while the mark is out still holds the row and says its line; the held row's
 * trigger is `aria-disabled` (never native), described by its line, and a tap RE-SAYS that line as
 * a new node instead of sending.
 */
export function RefundsNeededStrip({
  lang,
  refunds,
  stale = false,
  onResolved,
}: {
  lang: StaffLang;
  /** null — the ledger could not be read (the page's read rejected, and no poll has since). */
  refunds: RefundNeeded[] | null;
  /** The ledger loaded once but the latest poll could not read it: the rows below are the last
   *  good ones and new stranded charges may be missing — said, never an all-clear (Codex round 3
   *  on #283). */
  stale?: boolean;
  /** The server confirmed the row resolved: drop it and re-poll. */
  onResolved?: (id: string) => void;
}) {
  // The row whose mark got no answer — caught HERE (Codex round 4 on #283, P1): uncaught, the
  // action's rejection reached the route's error boundary and replaced the whole counter screen with
  // it. Phase 2h (9e) — `unknown`: the answer was lost, so the mark MAY have landed (a reload shows
  // whether the row is still listed); `waiting`: still no answer at the bound. Never "nothing was
  // recorded". The region exists only after the person's own tap, so it never announces on load.
  // Phase 2h review c (C7) — PER ROW: opening or marking another row used to clear the one slot,
  // wiping this row's "no answer yet" while its mark could still land, and its late throw was then
  // dropped against the emptied slot. Each row's line is now cleared only by that row.
  const [notes, setNotes] = useState<Readonly<Record<string, NoteKind>>>({});
  // B3 — the rows held by their own mark still out, READ BY RENDER (subscribed): a remounted strip
  // holds them too, and the late answer frees each wherever it lands. A string snapshot (the held
  // ids, in row order), so an unchanged hold is an equal value and never a re-render.
  const heldKey = useSyncExternalStore(
    subscribeOwnWait,
    () => (refunds ?? []).flatMap((r) => (hasOwnWait(holdOf(r.id)) ? [r.id] : [])).join(" "),
    () => "",
  );
  const heldIds = new Set(heldKey.split(" "));
  // A row held by a mark this strip did not send (mounted again since) says the hold's line too.
  const noteOf = (id: string): NoteKind | null => notes[id] ?? (heldIds.has(id) ? "waiting" : null);
  const setNote = (id: string, kind: NoteKind | null) =>
    setNotes((n) => {
      if (kind === null) {
        if (!(id in n)) return n;
        const { [id]: _gone, ...rest } = n;
        return rest;
      }
      return { ...n, [id]: kind };
    });
  // B3 — a tap on a held row re-says its line: a count per row keys the line's content, so a re-said
  // sentence REPLACES the node and is announced again (`useResaid`'s rule, one count per row).
  const [resaid, setResaid] = useState<Readonly<Record<string, number>>>({});
  // B3 — the late answers this strip already hears: its OWN marks (their `.then` in `confirm`), and
  // the holds it found on mount and attached to. A late answer is said once, by one listener here.
  const heard = useRef(new Set<MarkLate>());
  const alive = useRef(false);
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });
  useEffect(() => {
    // Re-armed at every setup (a cleanup-only latch stays false after Strict Mode's first pass).
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // B3 — a row held by a mark a strip that is GONE sent (this one mounted since): its late answer
  // lands here — the sender can no longer say it. A late mark leaves the row; a lost one says
  // "couldn't confirm".
  useEffect(() => {
    for (const id of heldKey.split(" ")) {
      const late = id === "" ? false : ownWaitSlot<MarkLate | false>(holdOf(id), false).current;
      if (late === false || heard.current.has(late)) continue;
      heard.current.add(late);
      void late.then((answer) => {
        if (!alive.current) return;
        if (answer.kind === "answer") {
          setNote(id, null);
          onResolvedRef.current?.(id);
        } else setNote(id, "unknown");
      });
    }
  }, [heldKey]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Phase 2h — the strip's one lock (one mark at a time): a REF read at tap time (two taps in one
  // frame both read the same render) and its state twin, cleared in a `finally` at the bound.
  const inFlight = useRef(false);
  // P2e review (A5) — the device's echo state, the value <Chrome> reads: the Mark refunded name
  // composes its echoed label with it, so a Burmese-only device never announces the English word
  // its button stopped printing.
  const echoes = useEchoesShown();
  // Which row is marking — the strip's one flag (one mark at a time), and its name.
  const [markingId, setMarkingId] = useState<string | null>(null);
  const pending = markingId !== null;
  const sectionRef = useRef<HTMLElement>(null);
  // The group that is OPEN is derived from the live rows, never the raw id: the poll (or the other
  // tablet) can drop the row whose group is open, and a stale id would keep the next open from
  // ever taking focus. A landed mark leaves the same way — the row goes, the group goes with it.
  const confirming =
    confirmingId !== null && refunds !== null && refunds.some((r) => r.id === confirmingId)
      ? confirmingId
      : null;
  // Focus follows the flow: into the group as it opens — including straight from ANOTHER row's
  // group (the blind pass's interleaving) — and, as it closes, back to that row's trigger; when the
  // row itself has gone (marked here, or by the poll), to the strip, or to the zone's heading once
  // the strip has no rows left. Edge-triggered on the PREVIOUS id, so a first mount never grabs.
  const wasConfirming = useRef<string | null>(null);
  useEffect(() => {
    const prev = wasConfirming.current;
    wasConfirming.current = confirming;
    if (confirming !== null && prev !== confirming) {
      document.getElementById(`refund-confirm-${confirming}`)?.focus();
    } else if (confirming === null && prev !== null) {
      const landing =
        document.getElementById(`refund-mark-${prev}`) ??
        sectionRef.current ??
        document.getElementById("appr-h");
      landing?.focus({ preventScroll: true });
    }
  }, [confirming]);

  function openConfirm(id: string) {
    if (inFlight.current) return;
    // B3 — this row's own mark is still out: re-say its line (a new node), never reopen the confirm.
    if (hasOwnWait(holdOf(id))) {
      setResaid((n) => ({ ...n, [id]: (n[id] ?? 0) + 1 }));
      return;
    }
    setNote(id, null);
    setConfirmingId(id);
  }
  function cancel() {
    if (inFlight.current) return;
    setConfirmingId(null);
  }
  async function confirm(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setMarkingId(id);
    setNote(id, null);
    try {
      // 9b — called OUTSIDE any transition, the RAW action awaited with a bound. It throws on an
      // unreadable table; a throw is a LOST answer, not a refusal (the update may have run).
      const out = await boundWrite(resolveRefundNeeded(id));
      if (out.kind === "answer") {
        // Both land in one batch: the row leaves with the group inside it, and the focus effect
        // above lands on the strip or the heading.
        setConfirmingId(null);
        onResolved?.(id);
        return;
      }
      setConfirmingId(null); // the effect returns focus to the trigger, beside the line
      if (out.kind === "threw") {
        console.error("[RefundsNeededStrip] mark unconfirmed — the row stays", out.error);
        setNote(id, "unknown");
        return;
      }
      setNote(id, "waiting");
      // B3 — the ROW stays held until the late answer settles (the strip's lock frees below); the
      // hold carries the late answer, so a strip mounted since can say it (heard here: this one's).
      const hold = ownWaitSlot<MarkLate | false>(holdOf(id), false);
      heard.current.add(out.late);
      hold.current = out.late;
      // The late answer lands whenever it comes (9e): the strip lives as long as its board, so
      // there is no "gone" to guard — its own state is a no-op once both are.
      void out.late.then((late) => {
        hold.current = false; // answered or lost: this row's mark is no longer out
        if (late.kind === "answer") {
          // A LATE mark lands (9e): the row leaves, and its "no answer yet" line with it.
          setNote(id, null);
          onResolved?.(id);
        } else {
          // Only over its own waiting line: a row re-marked since says that attempt's outcome.
          setNotes((n) => (n[id] === "waiting" ? { ...n, [id]: "unknown" } : n));
        }
      });
    } finally {
      // Frees AT THE BOUND (fact 3): never held by the raw, never by another surface's transition.
      inFlight.current = false;
      setMarkingId(null);
    }
  }

  if (refunds === null)
    return (
      <p style={outageText}>
        <Chrome lang={lang} k="table.appr.refunds.outage" echo="stack" />
      </p>
    );
  const staleLine = stale ? (
    <p style={outageText}>
      <Chrome lang={lang} k="table.appr.refunds.stale" echo="stack" />
    </p>
  ) : null;
  if (refunds.length === 0) return staleLine;
  const processor = ts(lang, "table.appr.stripe");
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={sx(lang, "table.appr.a11y.refunds")}
      style={{ ...refundsStrip, outline: "none" }}
    >
      {staleLine}
      <p style={refundsHead}>
        <strong>
          <Chrome
            lang={lang}
            k={plural(refunds.length, "table.appr.refunds.one", "table.appr.refunds.many")}
            vars={{ n: refunds.length }}
            echo="inline"
          />
        </strong>{" "}
        <Chrome lang={lang} k="table.appr.refundsHint" vars={{ x: processor }} echo="stack" />
      </p>
      <ul role="list" aria-label={sx(lang, "table.appr.a11y.refundsList")} style={refundsList}>
        {refunds.map((r) => {
          const marking = pending && markingId === r.id;
          return (
            <li key={r.id} style={refundsRow}>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--fw-bold)" }}>
                {r.amountCents != null ? (
                  fmt(r.amountCents)
                ) : (
                  <Chrome lang={lang} k="table.appr.amountUnknown" />
                )}
              </span>{" "}
              {/* ⚠️ `r.reason` is the RAW `qr_refunds_needed.reason` column with its underscores
                  swapped for spaces — a database status key printed to a manager, which is the
                  OPEN-ITEMS P2g shape (a raw key where a label belongs). It is NOT localized here
                  on purpose: guessing a Burmese word per undeclared code would invent a label,
                  and the fix is a `what.*`-style key map over the column's real domain. Filed. */}
              · {r.reason.replaceAll("_", " ")} ·{" "}
              <code style={{ fontSize: "var(--fs-xs)", overflowWrap: "anywhere" }}>
                {r.paymentIntent}
              </code>
              {confirming === r.id ? (
                <div
                  id={`refund-confirm-${r.id}`}
                  tabIndex={-1}
                  role="group"
                  aria-label={tf(lang, "table.appr.a11y.confirmRefunded", { x: r.paymentIntent })}
                  style={{ ...confirmRow, outline: "none" }}
                >
                  <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)" }}>
                    {/* Inline echo, not stacked: a flex line with the two buttons beside it. */}
                    {r.amountCents != null ? (
                      <Chrome
                        lang={lang}
                        k="table.appr.confirmRefunded.q"
                        vars={{ m: fmt(r.amountCents), x: processor }}
                        echo="inline"
                      />
                    ) : (
                      <Chrome
                        lang={lang}
                        k="table.appr.confirmRefunded.qUnknown"
                        vars={{ x: processor }}
                        echo="inline"
                      />
                    )}
                  </span>
                  <div style={{ display: "flex", gap: "var(--s3)" }}>
                    <button
                      type="button"
                      className="staff-btn"
                      onClick={cancel}
                      aria-disabled={pending || undefined}
                      style={cancelBtn}
                    >
                      <Chrome lang={lang} k="settle.cancel" echo={false} />
                    </button>
                    {/* No aria-label, deliberately: the label SWAPS to "Marking…" mid-commit, and
                        a fixed name would then no longer contain the visible text. The group's
                        name carries the payment intent; the label alone is the honest name. */}
                    <button
                      type="button"
                      className="staff-btn"
                      onClick={() => void confirm(r.id)}
                      aria-disabled={pending || undefined}
                      aria-busy={marking || undefined}
                      style={resolveBtn}
                    >
                      {marking ? (
                        <Chrome lang={lang} k="table.appr.marking" echo={false} />
                      ) : (
                        <Chrome lang={lang} k="table.appr.verb.markRefunded.confirm" echo="stack" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Every row shows the same two words, so the visible label alone names nothing —
                   the name carries the payment intent, which is what the manager matches against
                   the processor. `al()` takes the same `echo` this button renders, and the
                   device's `shown`, and composes through `chromeVisible()` — so the name holds
                   exactly the visible strings, both under Both and the Burmese alone under
                   Burmese only (WCAG 2.5.3); rule 3c compares the two echoes. B3 — a row whose
                   own mark is still out is HELD (aria-disabled, dimmed), described by its line. */
                <button
                  id={`refund-mark-${r.id}`}
                  type="button"
                  className="staff-btn"
                  onClick={() => openConfirm(r.id)}
                  aria-disabled={pending || heldIds.has(r.id) || undefined}
                  aria-describedby={heldIds.has(r.id) ? `refund-line-${r.id}` : undefined}
                  style={
                    heldIds.has(r.id)
                      ? { ...resolveBtn, ...heldLook, marginLeft: "var(--s2)" }
                      : { ...resolveBtn, marginLeft: "var(--s2)" }
                  }
                  aria-label={
                    al(lang, {
                      kind: "verb",
                      echo: "stack",
                      shown: echoes,
                      verb: "table.appr.verb.markRefunded",
                      subject: r.paymentIntent,
                    }).aria
                  }
                >
                  <Chrome lang={lang} k="table.appr.verb.markRefunded" echo="stack" />
                </button>
              )}
              {noteOf(r.id) !== null && (
                <span id={`refund-line-${r.id}`} role="status" style={failText}>
                  {/* Keyed by the row's re-say count (B3): a re-said line replaces the node. */}
                  <Chrome
                    key={resaid[r.id] ?? 0}
                    lang={lang}
                    k={
                      noteOf(r.id) === "waiting"
                        ? "table.appr.refunds.markWaiting"
                        : "table.appr.refunds.markUnknown"
                    }
                    echo="stack"
                  />
                </span>
              )}
              {/* Phase 2h — both lines say "reload", and the console is installed standalone (no
                  browser reload): the one way out sits BESIDE the line, never inside its region. */}
              {noteOf(r.id) !== null && (
                <div style={{ marginTop: "var(--s2)" }}>
                  <ReloadButton lang={lang} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const refundsStrip: CSSProperties = {
  // The staff boards' existing warn pair — theme-aware, per the tokens-never-hex rule.
  border: "1px solid var(--warn)",
  borderRadius: 12,
  padding: "var(--s3) var(--s4)",
  marginTop: "var(--s6)",
  background: "var(--warnb)",
};
const outageText: CSSProperties = {
  margin: "var(--s6) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
// A held control's dim (the clear, merge and open-bill controls'), never a native disable (B3).
const heldLook: CSSProperties = { opacity: 0.5, cursor: "not-allowed" };
const resolveBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: 10,
  border: "1px solid var(--warn)",
  background: "transparent",
  color: "var(--warn)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontWeight: "var(--fw-semibold)",
  cursor: "pointer",
};
const confirmRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  flexWrap: "wrap",
  marginTop: "var(--s2)",
};
const refundsHead: CSSProperties = { margin: 0, marginBottom: 8 };
const refundsList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 6,
};
const refundsRow: CSSProperties = { fontSize: "var(--fs-sm)" };
const failText: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
