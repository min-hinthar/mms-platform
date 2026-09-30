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
  ROSTER_FAILED_COPY,
  pinFailureCopy,
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
 * unseen. It never says anything is charged or refunded, because nothing is: the order is
 * cancelled, the loss is audited, no money moves.
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
  lang,
}: {
  sessionId: string;
  customerName: string | null;
  lines: TableLineView[];
  /** The server's SENT set on the DB clock (`TableDetail.sentLineIds`) — what the write-off takes. */
  sentLineIds: string[];
  /** The server's DROPPED set on the same clock (`TableDetail.droppedLineIds`) — what goes unrecorded. */
  droppedLineIds: string[];
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
  lang,
  onOpenChange,
}: {
  sessionId: string;
  customerName: string | null;
  lines: TableLineView[];
  sentLineIds: string[];
  droppedLineIds: string[];
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

  // The SENT lines and the DROPPED ones — both the server's sets, never re-derived here.
  const sent = new Set(sentLineIds);
  const sentLines = lines.filter((l) => sent.has(l.id));
  const sentUnits = sentLines.reduce((a, l) => a + l.qty, 0);
  const droppedUnits = noShowDroppedUnits(lines, droppedLineIds);
  const name = customerName?.trim() ? customerName.trim() : null;

  const pinOk = pin.length >= 4 && pin.length <= 8;
  const canSubmit = !locked && (!stepUp || (approverStaffId !== "" && pinOk));

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
        // `expectedLineIds` — the sent set this sheet SHOWS (the list above), so the write-off and any
        // manager's approval cover exactly what was on screen; a moved set answers `changed`.
        res = await recordCounterNoShow({
          sessionId,
          expectedLineIds: sentLineIds,
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
  // that sentence (and only that one — a pending "a manager needs to approve" stays).
  async function retryRoster(): Promise<boolean> {
    const ok = await roster.retry();
    setMsg((m) => (ok ? (m === ROSTER_FAILED_COPY ? null : m) : ROSTER_FAILED_COPY));
    return ok;
  }

  const shown = lockCopy ?? msg;
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
        <p id={bodyId} style={body}>
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
