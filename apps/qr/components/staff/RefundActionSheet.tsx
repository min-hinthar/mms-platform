"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { useResaid } from "./useResaid";
import { refundLine, type RefundResult, type SettledLine, type SettledOrder } from "@/lib/refunds";
import { boundWrite, ownWaitSlot, stalledSince, tapRefusal } from "@/lib/bounded-write";
import { dollars } from "@/lib/receipt-view";
import { REFUND_REASONS, REFUND_REASON_KEY, type RefundReason } from "@/lib/settled-view";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { ReloadButton } from "./ReloadOffer";
import { pinFailureCopy, useLockout } from "./ManagerPinStepUp";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { ExpoLineMy } from "./TicketText";

/**
 * Refund step-up sheet (S4.3b · A4·3) — money-OUT confirmation for ONE paid line. The WHOLE line
 * (qty × the dish, its Burmese, its modifiers, the kitchen note) so a manager knows which line
 * they are refunding; the figure the server will actually charge back (`offeredCents` — the
 * discounted goods + the line's tax share, CLAMPED to what the order can still give back), and
 * the clamp explained before the tap when it bit (M204). Reason (audit) + the manager's own PIN
 * (re-auth at action time; lockout-counted server-side). The amount shown is a display echo; the
 * server (`mms_refund_authorize`) re-derives the authoritative amount + PI. One live region for
 * the error.
 *
 * Phase 2h — a refund is MONEY OUT, so it is refused at the tap while the tablet is stalled (9d), and
 * a refund with no answer at STAFF_HANG_MS frees the sheet and says so — "it may still go through,
 * don't refund it again or hand anything back" — with the late answer applied when it comes (9e).
 */

/** The sentences that say "reload the page" — the reload sits beside the region that says them. */
const RELOAD_SAYS: ReadonlySet<StaffKey> = new Set<StaffKey>([
  "out.stalled",
  "floor.refund.waiting",
  "floor.refund.waitingCash",
]);
export function RefundActionSheet({
  order,
  line,
  open,
  onClose,
  onDone,
}: {
  order: SettledOrder;
  line: SettledLine;
  /** M76 — the parent holds this sheet mounted through its exit (`useSheetSubject`) and drives
   *  `open`; a sheet that is unmounted on close cannot animate out. */
  open: boolean;
  onClose: () => void;
  /** Called on success/no-op. The amount (cents) is passed on a real refund so the board can confirm the
   *  ACTUAL figure (the server's clamp is the authority); omitted on a no-op. */
  onDone: (refundedCents?: number) => void;
}) {
  const [reason, setReason] = useState<RefundReason>("unhappy");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<StaffMsg | null>(null);
  const lang = useStaffLang();
  // P7·2 — the same `pin.*` sentences the loss sheet, the approvals queue and the lock screen say,
  // and the same countdown: "wrong PIN — 2 tries left" is ONE sentence on every screen that says it.
  // manager-5 — `locked` too: without it the Refund button stayed tappable through the lockout
  // countdown and the field neither read-only nor gated, so a locked manager kept re-sending into
  // the lock (the approvals card and the loss sheet both gate on it).
  const { setLockLeft, locked, lockCopy } = useLockout(lang);
  // Phase 2h (9a) — the sheet's `busy` is STATE, set at the tap and cleared in the `finally` around a
  // BOUNDED await — never a transition's `pending`, which holds while the Server Action it dispatched
  // is unanswered (Next's per-tab action queue; LEARNINGS #149 · #200). The M82 guard parses for it.
  const [busy, setBusy] = useState(false);
  // The tap-time guard: two taps in one frame both read the render before `busy` flipped.
  const inFlight = useRef(false);
  // Critic F12 — THIS sheet's own write went past the bound unanswered and is still out. A re-tap
  // is refused on it directly, not only through the 9d ledger check: it is this sheet's OWN fact,
  // whatever the ledger reads (F12 caught the ledger reading "not stalled" with the wall clock set
  // back mid-hang; it ages on a monotonic clock since Codex r2 B4), so a second write never queues
  // behind the first. The refusal it
  // drives re-says the sheet's OWN waiting sentence, not the tablet's (`tapRefusal`, in `submit`).
  // Review a (A4) — kept per LINE in the tab's own-wait register, never per mount: the board keys
  // every open as a fresh sheet, and a re-opened sheet for the same line must still say its own line.
  const ownLate = ownWaitSlot(`refund:${line.id}`, false);
  // A LATE refusal (9e) moves focus into the PIN field — only while THIS sheet is open: the id is
  // shared with any refund sheet opened since. Re-armed at setup (Strict Mode runs the cleanup
  // between two setups).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const amount = dollars(line.offeredCents);
  // Review a (A2) — THIS refund's waiting sentence. A CASH refund's answer is the only thing that
  // says "hand back $X from the drawer" (record-first), and the reload the sentence asks for kills
  // that answer — so the cash line carries the instruction itself ({m}, the figure shown above).
  const waitingKey: StaffKey =
    order.refundPath === "cash" ? "floor.refund.waitingCash" : "floor.refund.waiting";
  const canSubmit = !busy && !locked && pin.length >= 4;

  // manager-5 — a refused PIN leaves the field: the masked wrong digits used to stay, so the next
  // Refund tap re-sent them and burned another attempt toward the lockout (the approvals card and
  // the loss sheet both clear it). Focus returns to the field so the retype starts where it ended.
  const pinRefused = () => {
    setPin("");
    document.getElementById("refund-pin")?.focus();
  };

  /**
   * The refund's ANSWER — on time, or late (9e). The two closes and a landed refund are the PARENT's
   * (`onDone` refreshes the board and confirms the server's figure), so they land even after the
   * manager closed this sheet; a refusal is said here only while the sheet is still open.
   */
  function land(res: RefundResult) {
    if (res.ok) {
      onDone(res.amountCents); // the SERVER-authorized amount (its clamp is the authority)
      return;
    }
    // ⚠️ THESE TWO CLOSE SILENTLY, AND THAT IS SAFE ONLY BECAUSE THE CASH FLOW RECORDS FIRST
    // (Codex round 2 on #286, P1). Both mean a stale board: another manager refunded this line,
    // or exhausted the order, between the page load and this tap. While `floor.settled.path.cash`
    // read "hand it back from the drawer, THEN record it here", that sequence put money in a
    // guest's hand and then closed this sheet without a word — an unrecorded payout. It now
    // says record first, so when either verdict lands the drawer has not been opened and there
    // is nothing to reconcile. If that instruction is ever reordered, these two arms have to
    // surface instead of closing.
    if (res.reason === "already_refunded" || res.reason === "fully_refunded") {
      // Already refunded, or the order's refundable pool (goods + tax) is exhausted by prior
      // refunds — refresh the board (the line shows its mark) + close. No dead error text (the
      // sheet unmounts on onDone, so a message here would never be seen).
      onDone();
      return;
    }
    if (!alive.current) return; // a late refusal is said only while this sheet is open
    // Every other refusal keeps the sheet, and none of them may keep the PIN.
    pinRefused();
    switch (res.reason) {
      case "pin_wrong":
      case "pin_locked":
        setError(pinFailureCopy(res, setLockLeft)); // the shared PIN-failure copy (S13, P7·2)
        break;
      case "pin_no_pin":
        setError({ k: "pin.noPin.profile" });
        break;
      case "not_paid":
        setError({ k: "floor.refund.err.notPaid" });
        break;
      case "split_unsupported":
        setError({ k: "floor.refund.err.split", vars: { x: ts(lang, "table.appr.stripe") } });
        break;
      case "stripe_error":
        setError({ k: "floor.refund.err.stripe" });
        break;
      case "not_manager":
        setError({ k: "floor.refund.err.notManager" });
        break;
      case "cash_not_ready":
        // M218 — the database has no `mms_refund_cash_line` yet (the app deploys on merge; the
        // migration is applied by hand afterwards). Under record-first (Codex round 2, P1) the
        // drawer is still shut when this renders, so the copy STOPS the hand-back rather than
        // documenting one that already happened. It is not "try again" either: the verdict is
        // about the database's shape, and it heals when the migration lands, not on a retry.
        setError({ k: "floor.refund.err.cashNotReady" });
        break;
      case "outage":
        // W10b — the action ANSWERED that no money moved; the platform is unreachable, not a
        // verdict about the manager. (A THROWN action is not this — see `submit`.)
        setError(STAFF_WRITE_OUTAGE);
        break;
      default:
        setError({ k: "floor.refund.err.failed" });
    }
  }

  const submit = async () => {
    // §17 — the button says so with `aria-disabled`; the refusal is here, on the same predicate.
    if (inFlight.current || !canSubmit) return;
    // Phase 2h (9d) — money out is refused AT THE TAP, never dispatched, while any action on this tab
    // has gone STAFF_HANG_MS without an answer: Next would queue the refund behind it and release it
    // whenever the queue moves — after the manager may have handed the money back another way. Read
    // now, never from render state. Owner decision: while THIS sheet's own refund is still out past
    // the bound, the refusal re-says ITS sentence ("Don't refund it again or hand anything back"),
    // never the tablet's "this did nothing" (`tapRefusal`).
    const refused = tapRefusal<StaffKey>(
      ownLate.current ? waitingKey : null,
      stalledSince(),
      "out.stalled",
    );
    if (refused !== null) {
      setError({ k: refused, vars: { m: amount } });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      // 9b — called OUTSIDE any transition and awaited BOUNDED, the RAW action promise handed over.
      const out = await boundWrite(refundLine({ orderItemId: line.id, reason, pin }));
      if (out.kind === "answer") {
        land(out.value);
        return;
      }
      // Sent either way: the PIN must not stay to be re-sent toward the lockout.
      setPin("");
      if (out.kind === "threw") {
        // 9e — a REJECTED action may have refunded (the response lost after Stripe answered):
        // "couldn't confirm — check the order before you refund again or hand anything back",
        // never "couldn't refund — try again".
        setError({ k: "floor.refund.err.unknown" });
        return;
      }
      setError({ k: waitingKey, vars: { m: amount } });
      ownLate.current = true;
      void out.late.then((late) => {
        ownLate.current = false;
        if (late.kind === "answer") land(late.value);
        else setError({ k: "floor.refund.err.unknown" });
      });
    } finally {
      inFlight.current = false;
      setBusy(false); // frees AT THE BOUND on every path — the M82 guard parses for it
    }
  };

  // The lockout countdown takes precedence over a transient message.
  const shown = lockCopy ?? error;
  // Critic F1 — every SET of the message (a re-tap's refusal re-says the standing waiting line)
  // replaces the region's content, so the re-said sentence is announced, not swallowed as no change.
  const said = useResaid(error);
  const reload =
    typeof shown === "object" && shown !== null && "k" in shown && RELOAD_SAYS.has(shown.k);
  return (
    // W22c — the canonical `Sheet`: Radix traps focus, binds Esc to the document, dismisses on a
    // real outside pointer-down (not a text-selection drag released on the scrim), and lifts above
    // the keyboard (`--kb-inset`) so the Refund button beneath the PIN field stays reachable.
    //
    // ⚠️ NOT WHILE THE REFUND IS IN FLIGHT. The caller unmounts this component on close, so a
    // dismissal mid-flight drops the server's answer on the floor: `setError` would no-op on an
    // unmounted tree and `onDone` would never run, leaving the board un-refreshed and the manager
    // with no confirmation and no error — a state indistinguishable from a refund that never
    // happened, over money that may already have left the card. `busy` refuses every exit — up to
    // STAFF_HANG_MS (Phase 2h, 9a): past it the sheet frees and says "no answer yet", and a late
    // answer still reaches `onDone` (the board's) after a close.
    <Sheet
      open={open}
      busy={busy}
      closeLabel={sheetCloseLabel(lang)}
      onOpenChange={(next) => !next && onClose()}
      title={<Chrome lang={lang} k="floor.refund.title" vars={{ x: line.name }} />}
    >
      <div style={body}>
        <p style={lineSummary}>
          {order.tableNumber !== null ? (
            <Chrome lang={lang} k="floor.table" vars={{ id: order.tableNumber }} />
          ) : (
            <Chrome lang={lang} k="floor.settled.code" vars={{ id: order.code }} />
          )}
          {" · "}
          <span aria-hidden>{line.qty}×</span> {line.name}
          {line.modifiers.length > 0 && (
            <span style={{ color: "var(--t2)" }}> · {line.modifiers.join(", ")}</span>
          )}
          <ExpoLineMy line={line} />
          {line.notes && <span style={noteStyle}>“{line.notes}”</span>}
        </p>
        <p style={amountLine}>
          <Chrome lang={lang} k="floor.refund.amount" vars={{ m: amount }} />
        </p>
        {line.offerClamped && (
          <p style={{ margin: "4px 0 0", fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
            <Chrome lang={lang} k="floor.refund.clamped" vars={{ m: amount }} echo="stack" />
          </p>
        )}
        {/* M218 — WHICH note depends on the tender, and it did not have to before: until
            `mms_refund_cash_line` existed this sheet was unreachable on a cash order
            (`canRefundHere` was `refundPath === "app"`), so "back to the card" was true of every
            line that could open it. On a cash line it would now contradict the drawer instruction
            the manager just read two lines above. */}
        <p style={{ margin: "2px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          <Chrome
            lang={lang}
            k={order.refundPath === "cash" ? "floor.refund.note.cash" : "floor.refund.note"}
            echo="stack"
          />
        </p>

        <label style={lbl} htmlFor="refund-reason">
          <Chrome lang={lang} k="floor.refund.reason" echo="stack" />
        </label>
        <select
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as RefundReason)}
          style={field}
        >
          {/* An <option> can hold only text, so the mark rides the element itself (rule 5). */}
          {REFUND_REASONS.map((r) => (
            <option key={r} value={r} lang={lang}>
              {ts(lang, REFUND_REASON_KEY[r])}
            </option>
          ))}
        </select>

        <label style={lbl} htmlFor="refund-pin">
          <Chrome lang={lang} k="floor.refund.pin" echo="stack" />
        </label>
        <input
          id="refund-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          // §17 — a lockout makes the field READ-ONLY, not disabled: the refused submit just moved
          // focus into it, and a disabled field would drop that focus to <body>.
          readOnly={locked}
          style={field}
          placeholder="••••"
        />

        {/* One live region for the sheet's error (polite — the failure text changes so AT announces it). */}
        <p
          role="status"
          style={{
            minHeight: 18,
            margin: "8px 0 0",
            fontSize: "var(--fs-sm)",
            color: "var(--warn)",
          }}
        >
          {shown === null ? null : <MsgText key={said} lang={lang} msg={shown} />}
        </p>
        {/* Phase 2h — the reload the region's sentence names, beside the region (never inside it). */}
        {reload && (
          <div style={reloadRow}>
            <ReloadButton lang={lang} block />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            className="staff-btn"
            type="button"
            onClick={() => {
              if (busy) return; // the sheet's `busy` refuses every exit mid-flight (M82)
              onClose();
            }}
            aria-disabled={busy || undefined}
            style={secondaryBtn}
          >
            <Chrome lang={lang} k="table.appr.verb.cancel" echo="stack" />
          </button>
          <button
            className="staff-btn"
            type="button"
            onClick={submit}
            aria-disabled={!canSubmit || undefined}
            aria-busy={busy || undefined}
            style={primaryBtn}
          >
            {/* No aria-label, deliberately: the visible label SWAPS to "Refunding…" mid-submit,
                and a fixed name would then no longer contain the visible text. */}
            {busy ? (
              <Chrome lang={lang} k="floor.refund.working" />
            ) : (
              <Chrome lang={lang} k="floor.refund.amount" vars={{ m: amount }} echo="stack" />
            )}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// The primitive owns the scrim, the fixed positioning, the z layer, the safe-area padding and the
// dvh/keyboard discipline. What is left is the body inset.
const body: CSSProperties = { padding: "0 18px 18px" };
const reloadRow: CSSProperties = { marginTop: "var(--s2)" };
const lineSummary: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const noteStyle: CSSProperties = { display: "block", fontStyle: "italic" };
const amountLine: CSSProperties = {
  margin: "8px 0 0",
  fontWeight: "var(--fw-heavy)",
  fontSize: "var(--fs-h2)",
  fontVariantNumeric: "tabular-nums",
};
const lbl: CSSProperties = {
  display: "block",
  margin: "14px 0 4px",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  color: "var(--t2)",
};
const field: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const primaryBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 10,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const secondaryBtn: CSSProperties = {
  flex: "none",
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
