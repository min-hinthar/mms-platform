"use client";
import { useId, useRef, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { Button, Sheet } from "@mms/ui";
import { listApprovers, recordCounterNoShow } from "@/lib/voids";
import type { RecordCounterNoShowResult } from "@/lib/voids";
import { dropHandoffStash } from "@/lib/floor-pane";
import type { TableLineView } from "@/lib/floor-types";
import { plural } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import { haptic } from "@/lib/haptics";
import { sheetCloseLabel } from "./SheetCloseLabel";
import {
  ManagerPinFields,
  PIN_NO_PIN_COPY,
  pinFailureCopy,
  rosterRetryMsg,
  useApproverRoster,
  useLockout,
} from "./ManagerPinStepUp";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useTableNav } from "./TableNav";

/**
 * Phase 2f · pay at pickup — "They didn't come": write off a COUNTER order's SENT food when the guest
 * never collected it (owner decision 7b). It replaces Clear on a counter order whose food reached the
 * kitchen unpaid (`detail.unpaidSent`) — Clear would drop cooked food with no loss recorded.
 *
 * WHAT IT CLAIMS, AND WHY THAT IS TRUE. The body's count is the units of `sentLineIds` — the server's
 * own SENT set (`counterSentLine` on the DB clock: fired / cooking / served, not grocery, not comped,
 * past its grace), which is exactly the set `mms_counter_no_show` writes off. What it DROPS is named
 * separately and said to be dropped, not counted as a loss — the units of `droppedLineIds`, the
 * server's own DROPPED set read beside the sent one on the same DB clock (`counterNoShowDropped`:
 * every draft and every in-grace fired line, comped or grocery included — the SQL reverts those and
 * cancels the cart with them). Neither set is re-derived here. The sent set rides the write as
 * `expectedLineIds`, so a set that moved under the sheet is refused (`changed`), never written off
 * unseen. A comped dish the kitchen already has (`compedKitchenLineIds`) is neither — the comp is
 * already an audited loss — but the cancelled cart takes it off the kitchen screen, so the sheet
 * says THAT, in its own sentence, never as a loss. It never says anything is charged or refunded,
 * because nothing is: the order is cancelled, the loss is audited, no money moves.
 *
 * WHAT THE MANAGER READ IS WHAT IS SUBMITTED (Phase 2f review, PT-3). The table page keeps polling
 * while the sheet is open, so the three sets — and the lines they name — are SNAPSHOTTED when the
 * sheet opens, rendered from the snapshot, and the write carries the snapshot's sent set. When the
 * live sets stop matching it, the sheet does not adopt them silently: its one region says the order
 * changed, the confirm refuses, and an explicit "Show the order as it is now" adopts the new sets
 * (focus goes to the new count). Nothing is re-snapshotted when the manager step-up opens: a
 * `needs_pin` answer means the server just matched the snapshot's sent set (`changed` is checked
 * first), so the snapshot IS what the manager is being asked to approve.
 *
 * The loss gate is SERVER-authoritative (the sent value against the ceiling, or anything cooked): the
 * first tap goes solo, and a `needs_pin` reveals the manager step-up (the loss sheet's two-pass
 * shape) and relabels the confirm. Every refusal is said in the sheet's ONE region; the `switch`
 * below is exhaustive over `RecordCounterNoShowResult` (a new server reason fails to compile here).
 * The confirm is never natively disabled (§17), refuses a second tap in the same frame through a ref,
 * and has no undo — a no-show is §22's confirmed exception, like Clear.
 */
export function CounterNoShowButton({
  sessionId,
  customerName,
  lines,
  sentLineIds,
  droppedLineIds,
  compedKitchenLineIds,
  lang,
}: {
  sessionId: string;
  customerName: string | null;
  lines: TableLineView[];
  /** The server's SENT set on the DB clock (`TableDetail.sentLineIds`) — what the write-off takes. */
  sentLineIds: string[];
  /** The server's DROPPED set on the same clock (`TableDetail.droppedLineIds`) — what goes unrecorded. */
  droppedLineIds: string[];
  /** The server's comped-in-the-kitchen set (`TableDetail.compedKitchenLineIds`) — off the kitchen
   *  screen with the cart, never a loss. */
  compedKitchenLineIds: string[];
  lang: StaffLang;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" size="xl" block onClick={() => setOpen(true)}>
        <Chrome lang={lang} k="table.noshow.btn" echo="stack" />
      </Button>
      {/* Mounted only while open: a fresh mount re-reads the manager roster and resets every
          transient state (the PIN, the step-up, the region) — LossActionSheet's rule. */}
      {open && (
        <NoShowSheet
          sessionId={sessionId}
          customerName={customerName}
          lines={lines}
          sentLineIds={sentLineIds}
          droppedLineIds={droppedLineIds}
          compedKitchenLineIds={compedKitchenLineIds}
          lang={lang}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

/**
 * Every refusal the sheet can hear. `changed` (the cross-area decision): the sent set
 * `mms_counter_no_show` derives under its lock differs from the one the sheet SHOWED
 * (`expectedLineIds`), so it wrote nothing. The explicit member is a no-op once the lib union carries
 * it (resolves at integration) — the switch below stays exhaustive either way.
 */
export type NoShowRefusal =
  | Exclude<RecordCounterNoShowResult, { ok: true }>
  | { ok: false; reason: "changed" };

/**
 * What the no-show DROPS — never counted as a loss, said beside it: the units of the server's DROPPED
 * set (`droppedLineIds`, `counterNoShowDropped` on the DB clock). Only a lookup — the predicate lives
 * in lib/counter-order.ts beside `counterSentLine`, so the sheet cannot quote a set the SQL does not
 * remove (Codex r2 on #308: a client filter here once dropped a comped in-grace dish from the count).
 */
export function noShowDroppedUnits(
  lines: ReadonlyArray<Pick<TableLineView, "id" | "qty">>,
  droppedLineIds: ReadonlyArray<string>,
): number {
  const dropped = new Set(droppedLineIds);
  return lines.filter((l) => dropped.has(l.id)).reduce((a, l) => a + l.qty, 0);
}

/** The three server sets a no-show touches, as the sheet read them (the PT-3 snapshot). */
export type NoShowSets = {
  sent: ReadonlyArray<string>;
  dropped: ReadonlyArray<string>;
  comped: ReadonlyArray<string>;
};

/** Set equality over ids (order-free — the server's arrays follow the cart's order, not a key). */
export function sameIdSet(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sb].every((id) => sa.has(id));
}

/** Did any of the three sets move since the snapshot? Any one moving changes a sentence on screen. */
export function noShowSetsMoved(snap: NoShowSets, live: NoShowSets): boolean {
  return (
    !sameIdSet(snap.sent, live.sent) ||
    !sameIdSet(snap.dropped, live.dropped) ||
    !sameIdSet(snap.comped, live.comped)
  );
}

/** The sentence the one region says while the live sets differ from what the sheet shows. */
const CHANGED_COPY: StaffMsg = { k: "table.noshow.err.changed" };

/** Every refusal → its sentence (null only for a lockout: the countdown IS that sentence). */
export function noShowRefusalMsg(
  res: NoShowRefusal,
  setLockLeft: (seconds: number) => void,
): StaffMsg | null {
  switch (res.reason) {
    case "needs_pin":
      return { k: "pin.needsManager" };
    case "pin_wrong":
    case "pin_locked":
      return pinFailureCopy(res, setLockLeft);
    case "pin_no_pin":
      return PIN_NO_PIN_COPY;
    case "bad_approver":
      return { k: "pin.badApprover.self" };
    case "step_up_rate_limited":
      return { k: "pin.rateLimited" };
    case "in_flight":
      return { k: "table.noshow.err.inFlight" };
    case "not_open":
      return { k: "table.noshow.err.notOpen" };
    case "not_counter":
      return { k: "table.noshow.err.notCounter" };
    case "nothing_sent":
      return { k: "table.noshow.err.nothingSent" };
    case "changed":
      return { k: "table.noshow.err.changed" };
    case "outage":
      return STAFF_WRITE_OUTAGE;
    case "error":
      return { k: "table.noshow.err.failed" };
    default: {
      const _never: never = res;
      return _never;
    }
  }
}

function NoShowSheet({
  sessionId,
  customerName,
  lines,
  sentLineIds,
  droppedLineIds,
  compedKitchenLineIds,
  lang,
  onOpenChange,
}: {
  sessionId: string;
  customerName: string | null;
  lines: TableLineView[];
  sentLineIds: string[];
  droppedLineIds: string[];
  compedKitchenLineIds: string[];
  lang: StaffLang;
  onOpenChange: (o: boolean) => void;
}) {
  const nav = useTableNav();
  const bodyId = useId();
  // The roster, with a failed read kept an OUTAGE (Codex round 2 on #308): never `[]`, which the
  // picker reads as "no managers on shift" and which blocked a manager-gated write-off outright.
  const roster = useApproverRoster(listApprovers);
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [stepUp, setStepUp] = useState(false);
  // M82 — the Sheet's `busy` is a transition's `pending`, never a hand-rolled boolean: all four
  // exits are blocked while it is true, and a `useTransition` flag settles on every path.
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const { setLockLeft, locked, lockCopy } = useLockout(lang);
  // The tap-time guard: two taps in one frame see the same render, so only a REF refuses the second.
  const inFlight = useRef(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  // PT-3 — the sets (and the lines they name) as they were when the sheet OPENED: what renders and
  // what the write carries. The live props only ever decide whether that snapshot is still true.
  const liveSets: NoShowSets = {
    sent: sentLineIds,
    dropped: droppedLineIds,
    comped: compedKitchenLineIds,
  };
  const [snap, setSnap] = useState(() => ({ lines, sets: liveSets }));
  const moved = noShowSetsMoved(snap.sets, liveSets);

  // The SENT lines, the DROPPED ones and the comped ones the kitchen has — all the server's sets,
  // never re-derived here, and all read from the snapshot.
  const sent = new Set(snap.sets.sent);
  const sentLines = snap.lines.filter((l) => sent.has(l.id));
  const sentUnits = sentLines.reduce((a, l) => a + l.qty, 0);
  const droppedUnits = noShowDroppedUnits(snap.lines, snap.sets.dropped);
  const compedUnits = noShowDroppedUnits(snap.lines, snap.sets.comped);
  const name = customerName?.trim() ? customerName.trim() : null;

  const pinOk = pin.length >= 4 && pin.length <= 8;
  const canSubmit = !locked && !moved && (!stepUp || (approverStaffId !== "" && pinOk));

  // The explicit re-arm: adopt the order as it is now, and take the finger to the new count. A stale
  // server `changed` goes with it (it spoke of the old sets); any other sentence stays.
  function rearm() {
    setSnap({ lines, sets: liveSets });
    setMsg((m) => (typeof m === "object" && m?.k === "table.noshow.err.changed" ? null : m));
    bodyRef.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    if (!canSubmit) return; // §17 — the confirm says so with aria-disabled; the refusal is here
    inFlight.current = true;
    setMsg(null);
    haptic("commit");
    startTransition(async () => {
      let res: RecordCounterNoShowResult;
      try {
        // `expectedLineIds` — the sent set this sheet SHOWS (the snapshot's, the list above), so the
        // write-off and any manager's approval cover exactly what was on screen; a moved set answers
        // `changed`.
        res = await recordCounterNoShow({
          sessionId,
          expectedLineIds: [...snap.sets.sent],
          ...(stepUp ? { approverStaffId, pin } : {}),
        });
      } catch {
        // A rejected transport (offline, a version skew) must read as an outage, never crash the page.
        res = { ok: false, reason: "outage" };
      } finally {
        inFlight.current = false;
      }
      if (res.ok) {
        // The order is cancelled and its session closed: leave the defunct detail (ClearTableButton's
        // exit — the page replaces to the counter, the pane closes). No paid card follows it.
        dropHandoffStash(sessionId);
        nav.toFloor("cleared");
        return;
      }
      setPin("");
      if (res.reason === "needs_pin") setStepUp(true);
      setMsg(noShowRefusalMsg(res, setLockLeft));
    });
  }

  // Try again on the roster: a second failure is said in the sheet's ONE region; a recovery clears
  // that sentence (and only that one) — and puts back "a manager needs to approve" while the step-up
  // is still pending (`rosterRetryMsg`).
  async function retryRoster(): Promise<boolean> {
    const ok = await roster.retry();
    setMsg((m) => rosterRetryMsg(m, ok, stepUp));
    return ok;
  }

  // The lockout countdown outranks everything; a moved order outranks a transient message.
  const shown = lockCopy ?? (moved ? CHANGED_COPY : msg);
  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      busy={pending}
      closeLabel={sheetCloseLabel(lang)}
      title={
        name ? (
          <Chrome lang={lang} k="table.noshow.title" vars={{ x: name }} />
        ) : (
          <Chrome lang={lang} k="table.noshow.title.anon" />
        )
      }
    >
      <form onSubmit={submit} style={{ marginTop: "var(--s2)" }} noValidate>
        <p id={bodyId} ref={bodyRef} tabIndex={-1} style={body}>
          <Chrome
            lang={lang}
            k={plural(sentUnits, "table.noshow.body.one", "table.noshow.body.many")}
            vars={{ n: sentUnits }}
            echo="stack"
          />
        </p>
        {/* What goes, read-only: the sent lines only (the drafts are the next sentence's). */}
        <ul role="list" aria-labelledby={bodyId} style={list} data-noshow-lines="">
          {sentLines.map((l) => (
            <li key={l.id} style={row}>
              {l.qty}× {l.name}
            </li>
          ))}
        </ul>
        {droppedUnits > 0 && (
          <p style={note}>
            <Chrome
              lang={lang}
              k={plural(
                droppedUnits,
                "table.noshow.body.drafts.one",
                "table.noshow.body.drafts.many",
              )}
              vars={{ n: droppedUnits }}
              echo="stack"
            />
          </p>
        )}
        {compedUnits > 0 && (
          // Neither a loss nor dropped: a no-charge dish the kitchen has, gone from its screen with the
          // cancelled order. No amount — nothing is owed on it and nothing is written off.
          <p style={note} data-noshow-comped="">
            <Chrome
              lang={lang}
              k={plural(
                compedUnits,
                "table.noshow.body.comped.one",
                "table.noshow.body.comped.many",
              )}
              vars={{ n: compedUnits }}
              echo="stack"
            />
          </p>
        )}
        {stepUp && (
          <fieldset style={fieldset}>
            <legend style={legend}>
              <Chrome lang={lang} k="table.loss.managerLegend" echo="stack" />
            </legend>
            <ManagerPinFields
              idPrefix="noshow"
              approvers={roster.approvers}
              approverStaffId={approverStaffId}
              onApproverChange={setApproverStaffId}
              pin={pin}
              onPinChange={setPin}
              locked={locked}
              rosterFailed={roster.failed}
              retrying={roster.retrying}
              onRetry={retryRoster}
            />
          </fieldset>
        )}
        {moved && (
          <div style={{ marginTop: "var(--s3)" }}>
            <Button type="button" variant="secondary" block onClick={rearm}>
              <Chrome lang={lang} k="table.noshow.rearm" echo="stack" />
            </Button>
          </div>
        )}
        <div style={{ marginTop: "var(--s4)" }}>
          <Button
            type="submit"
            variant="danger"
            size="xl"
            block
            busy={pending}
            {...(!canSubmit ? { "aria-disabled": true } : {})}
          >
            {stepUp ? (
              <Chrome lang={lang} k="table.loss.confirmApproval.void" echo="stack" />
            ) : (
              <Chrome lang={lang} k="table.noshow.confirm" echo="stack" />
            )}
          </Button>
        </div>
        {/* ONE region (QA §A): the lockout countdown outranks a transient message. */}
        <p role="status" style={region}>
          {shown && (
            <span style={{ color: "var(--warn)" }}>
              <MsgText lang={lang} msg={shown} />
            </span>
          )}
        </p>
      </form>
    </Sheet>
  );
}

const body: CSSProperties = { margin: 0, fontSize: "var(--fs-body)" };
const note: CSSProperties = {
  margin: "var(--s2) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: "var(--s3) 0 0",
  padding: 0,
  display: "grid",
  gap: "var(--s1)",
};
const row: CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)" };
const fieldset: CSSProperties = { border: "none", padding: 0, margin: "var(--s3) 0 0" };
const legend: CSSProperties = {
  padding: 0,
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  marginBottom: "var(--s2)",
};
const region: CSSProperties = {
  margin: "var(--s3) 0 0",
  minHeight: "1.4em",
  fontSize: "var(--fs-sm)",
};
