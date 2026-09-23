"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { refundLine, type SettledLine, type SettledOrder } from "@/lib/refunds";
import { dollars } from "@/lib/receipt-view";
import { REFUND_REASONS, REFUND_REASON_KEY, type RefundReason } from "@/lib/settled-view";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import { ts } from "@/lib/i18n/staff";
import { MsgText, type StaffMsg } from "./StaffMsg";
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
 */
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
  const [pending, startTransition] = useTransition();
  const amount = dollars(line.offeredCents);
  const canSubmit = !pending && !locked && pin.length >= 4;

  // manager-5 — a refused PIN leaves the field: the masked wrong digits used to stay, so the next
  // Refund tap re-sent them and burned another attempt toward the lockout (the approvals card and
  // the loss sheet both clear it). Focus returns to the field so the retype starts where it ended.
  const pinRefused = () => {
    setPin("");
    document.getElementById("refund-pin")?.focus();
  };

  const submit = () => {
    // §17 — the button says so with `aria-disabled`; the refusal is here, on the same predicate.
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await refundLine({ orderItemId: line.id, reason, pin });
        if (res.ok) {
          onDone(res.amountCents); // the SERVER-authorized amount (its clamp is the authority)
          return;
        }
        // The two silent closes below unmount the sheet; every other refusal keeps it, and none of
        // them may keep the PIN.
        if (res.reason !== "already_refunded" && res.reason !== "fully_refunded") pinRefused();
        switch (res.reason) {
          case "pin_wrong":
          case "pin_locked":
            setError(pinFailureCopy(res, setLockLeft)); // the shared PIN-failure copy (S13, P7·2)
            break;
          case "pin_no_pin":
            setError({ k: "pin.noPin.profile" });
            break;
          // ⚠️ THESE TWO CLOSE SILENTLY, AND THAT IS SAFE ONLY BECAUSE THE CASH FLOW RECORDS FIRST
          // (Codex round 2 on #286, P1). Both mean a stale board: another manager refunded this line,
          // or exhausted the order, between the page load and this tap. While `floor.settled.path.cash`
          // read "hand it back from the drawer, THEN record it here", that sequence put money in a
          // guest's hand and then closed this sheet without a word — an unrecorded payout. It now
          // says record first, so when either verdict lands the drawer has not been opened and there
          // is nothing to reconcile. If that instruction is ever reordered, these two arms have to
          // surface instead of closing.
          case "already_refunded":
            // It's already refunded — refresh the board (the line will show its mark) + close. No
            // dead error text (the sheet unmounts on onDone, so a message here would never be seen).
            onDone();
            break;
          case "fully_refunded":
            // The order's refundable pool (goods + tax) is exhausted by prior refunds — nothing left to
            // give back on this line. Refresh + close; the board reflects the order's refunded state.
            onDone();
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
            // W10b — no money moved; the platform is unreachable, not a verdict about the manager.
            setError(STAFF_WRITE_OUTAGE);
            break;
          default:
            setError({ k: "floor.refund.err.failed" });
        }
      } catch {
        pinRefused();
        setError({ k: "floor.refund.err.failed" });
      }
    });
  };

  // The lockout countdown takes precedence over a transient message.
  const shown = lockCopy ?? error;
  return (
    // W22c — the canonical `Sheet`: Radix traps focus, binds Esc to the document, dismisses on a
    // real outside pointer-down (not a text-selection drag released on the scrim), and lifts above
    // the keyboard (`--kb-inset`) so the Refund button beneath the PIN field stays reachable.
    //
    // ⚠️ NOT WHILE THE REFUND IS IN FLIGHT. The caller unmounts this component on close, so a
    // dismissal mid-flight drops the server's answer on the floor: `setError` would no-op on an
    // unmounted tree and `onDone` would never run, leaving the board un-refreshed and the manager
    // with no confirmation and no error — a state indistinguishable from a refund that never
    // happened, over money that may already have left the card. `busy` refuses every exit.
    <Sheet
      open={open}
      busy={pending}
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
          {shown === null ? null : <MsgText lang={lang} msg={shown} />}
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            className="staff-btn"
            type="button"
            onClick={() => {
              if (pending) return; // the sheet's `busy` refuses every exit mid-flight (M82)
              onClose();
            }}
            aria-disabled={pending || undefined}
            style={secondaryBtn}
          >
            <Chrome lang={lang} k="table.appr.verb.cancel" echo="stack" />
          </button>
          <button
            className="staff-btn"
            type="button"
            onClick={submit}
            aria-disabled={!canSubmit || undefined}
            aria-busy={pending || undefined}
            style={primaryBtn}
          >
            {/* No aria-label, deliberately: the visible label SWAPS to "Refunding…" mid-submit,
                and a fixed name would then no longer contain the visible text. */}
            {pending ? (
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
