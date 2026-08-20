"use client";
import { useEffect, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { Sheet } from "@mms/ui";
import { listApprovers, voidLine, type Approver, type VoidLineResult } from "@/lib/voids";
import { requestApproval } from "@/lib/approvals";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import type { TableLineView } from "@/lib/floor-types";
import { ManagerPinFields, PIN_NO_PIN_COPY, pinFailureCopy, useLockout } from "./ManagerPinStepUp";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Action = "void" | "comp";
type Reason =
  | "mistake"
  | "kitchen_error"
  | "sold_out"
  | "quality"
  | "guest_request"
  | "service_recovery"
  | "other";

// Reason codes per action (the SQL audit only length-bounds the code; these are the offered set).
const REASONS: Record<Action, { value: Reason; label: string }[]> = {
  void: [
    { value: "mistake", label: "Ordered by mistake" },
    { value: "kitchen_error", label: "Kitchen made it wrong" },
    // W23a — the dine-in twin of the refund's "We ran out". A dine-in 86 costs nothing (the line is
    // voided before settle, no money moved), which is exactly why it has to be COUNTED — otherwise
    // the cheapest recovery is also the most invisible one.
    { value: "sold_out", label: "We ran out" },
    { value: "quality", label: "Quality / guest unhappy" },
    { value: "guest_request", label: "Guest changed their mind" },
    { value: "other", label: "Other" },
  ],
  comp: [
    { value: "service_recovery", label: "Making it right" },
    { value: "quality", label: "Quality / guest unhappy" },
    { value: "guest_request", label: "Guest courtesy" },
    { value: "other", label: "Other" },
  ],
};

/**
 * The loss action (S2.3): void (cancel + remove) or comp (free, kitchen still makes it) a fired line, with
 * the manager-PIN step-up when the server requires it. The loss gate is SERVER-authoritative — this sheet
 * shows the PIN step up-front for the clearly-gated cases (a comp, or a cooked line) and otherwise submits
 * solo, revealing the step-up only if the server returns `needs_pin` (e.g. an over-ceiling uncooked void).
 * The manager taps their name → enters their PIN (verified server-side, lockout-counted).
 */
export function LossActionSheet({
  open,
  onOpenChange,
  sessionId,
  line,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  line: TableLineView;
  onDone: (action: Action) => void;
}) {
  const [action, setAction] = useState<Action>("void");
  const [reason, setReason] = useState<Reason | "">("");
  const [reasonInvalid, setReasonInvalid] = useState(false); // S14: inline "pick a reason" validation
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { setLockLeft, locked, lockCopy } = useLockout();
  const [pending, startTransition] = useTransition();

  // The kitchen has started/finished this line → a void of it (and any comp) is a loss → manager-gated.
  const cooked = line.state === "in_progress" || line.state === "served";
  // Show the PIN step up-front for the obviously-gated cases; an uncooked over-ceiling void escalates via
  // the server's `needs_pin` instead (no ceiling value shipped to the client).
  const gatedUpFront = action === "comp" || cooked;
  const showStepUp = stepUp || gatedUpFront;

  // Load the manager list once on mount. The sheet is MOUNTED only while open (StaffLineEditor gates it),
  // so a fresh mount each open both refetches the roster (a manager added/removed mid-shift is reflected)
  // and resets all transient state via the initial useState values — no setState-in-effect reset needed.
  useEffect(() => {
    let live = true;
    listApprovers()
      .then((a) => live && setApprovers(a))
      .catch(() => live && setApprovers([]));
    return () => {
      live = false;
    };
  }, []);

  const reasonOptions = REASONS[action];
  // The reason DERIVED-valid for the current action: when the action toggles, a reason that doesn't apply
  // to it simply reads as unselected (no effect / setState-in-effect needed — it forces a fresh choice).
  const effectiveReason = reason && reasonOptions.some((r) => r.value === reason) ? reason : "";

  const pinOk = pin.length >= 4 && pin.length <= 8;
  // The reason is validated inline on submit (S14), not folded into the disabled gate — a silently-dimmed
  // CTA leaves the server with no idea why. The PIN/manager completeness still gates the button visibly.
  const canSubmit = !locked && !pending && (!showStepUp || (!!approverStaffId && pinOk));
  // S11: no manager is signed in → the PIN path is a dead end; the deferred request becomes the primary.
  const noManagers = approvers !== null && approvers.length === 0;

  function pickReason(r: Reason) {
    setReason(r);
    setReasonInvalid(false);
  }

  function handleResult(res: VoidLineResult) {
    if (res.ok) {
      onDone(res.action);
      onOpenChange(false);
      return;
    }
    setPin("");
    switch (res.reason) {
      case "needs_pin":
        setStepUp(true);
        setMsg("A manager needs to approve this — tap your name and enter your PIN.");
        break;
      case "pin_wrong":
      case "pin_locked":
        setMsg(pinFailureCopy(res, setLockLeft)); // S2-audit S13: shared PIN-failure copy
        break;
      case "pin_no_pin":
        setMsg(PIN_NO_PIN_COPY);
        break;
      case "bad_approver":
        setMsg("Pick a manager other than yourself to approve.");
        break;
      case "step_up_rate_limited":
        setMsg("Too many PIN attempts — wait a few minutes, then try again.");
        break;
      case "in_flight":
        setMsg("This table is mid-payment — wait until they’ve finished.");
        break;
      case "not_open":
        setMsg("This table’s order is no longer open.");
        break;
      case "not_found":
        setMsg("That item isn’t on this table anymore.");
        break;
      case "already":
        // Already voided/comped (a double-tap / a peer beat us) — treat as done so the sheet closes clean.
        onDone(action);
        onOpenChange(false);
        break;
      case "outage":
        // W10b — nothing was voided/comped; the platform is unreachable, not the line or the PIN.
        setMsg(STAFF_WRITE_OUTAGE);
        break;
      default:
        setMsg("Couldn’t do that just now — please try again.");
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!effectiveReason) {
      setReasonInvalid(true); // S14: tell them what's missing instead of a dead, dimmed button
      setMsg("Pick a reason first.");
      return;
    }
    if (!canSubmit) return;
    setMsg(null);
    startTransition(async () => {
      // ⚠️ The transport itself can reject — offline, a server-action version skew after a deploy —
      // and an unhandled rejection inside a transition scope surfaces as a THROW into the nearest
      // error boundary, taking the whole staff table page down instead of showing the outage copy
      // every other failure reason gets. Both siblings (`RefundActionSheet`, `StaffMenuBrowser`)
      // already wrap; this file was the one that did not. M82 adversarial pass, LOW.
      try {
        const res = await voidLine({
          sessionId,
          cartItemId: line.id,
          action,
          reason: effectiveReason,
          ...(showStepUp ? { approverStaffId, pin } : {}),
        });
        handleResult(res);
      } catch {
        setMsg(STAFF_WRITE_OUTAGE);
      }
    });
  }

  // Deferred path (S2.4): no manager at hand → request approval (no PIN). The line stays live until a
  // manager resolves it from the queue. Needs a reason (for the audit), not a manager/PIN.
  function submitRequest() {
    if (pending || locked) return;
    if (!effectiveReason) {
      setReasonInvalid(true); // S14: same inline validation on the deferred path
      setMsg("Pick a reason first.");
      return;
    }
    setMsg(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof requestApproval>>;
      // Same rule as the direct path above — a rejected transport must read as an outage, not as a
      // crashed page. This is also the arm that keeps `busy` honest: the flag settles either way.
      try {
        res = await requestApproval({
          sessionId,
          cartItemId: line.id,
          action,
          reason: effectiveReason,
        });
      } catch {
        setMsg(STAFF_WRITE_OUTAGE);
        return;
      }
      if (res.ok) {
        onDone(action);
        onOpenChange(false);
        return;
      }
      switch (res.reason) {
        case "already_pending":
          setMsg("A manager request is already open for this item.");
          break;
        case "no_approval_needed":
          setMsg("This one doesn’t need a manager — use “Void item”.");
          break;
        case "in_flight":
          setMsg("This table is mid-payment — wait until they’ve finished.");
          break;
        case "not_open":
          setMsg("This table’s order is no longer open.");
          break;
        case "not_found":
          setMsg("That item isn’t on this table anymore.");
          break;
        case "outage":
          // W10b — the request wasn't recorded; the platform is unreachable, not the line.
          setMsg(STAFF_WRITE_OUTAGE);
          break;
        default:
          setMsg("Couldn’t send that request — please try again.");
      }
    });
  }

  const verb = action === "comp" ? "Comp" : "Void";

  return (
    // M82 — `busy` while a void/comp or an approval request is in flight. This sheet had NO guard at
    // all while its sibling `RefundActionSheet` did, and it is the worse case of the two: `voidLine`
    // runs `verifyStaffPin` BEFORE the RPC, which atomically spends one of the manager's five
    // attempts. A dismissal mid-flight therefore loses the verdict AND the attempt — and the natural
    // response, trying again, walks a manager toward a floor-wide lockout with nothing on screen
    // ever having said why. `pending` is `useTransition`'s flag, so it settles on the failure path.
    <Sheet open={open} onOpenChange={onOpenChange} busy={pending} title={`${verb} “${line.name}”`}>
      <form onSubmit={submit} style={{ marginTop: 8 }} noValidate>
        <p style={lineSummary}>
          {line.qty}× {line.name} · {fmt(line.unitPriceCents * line.qty)}
          {cooked && <span style={{ color: "var(--t2)" }}> · already cooking</span>}
        </p>

        {/* Action: void vs comp. role="group" + aria-pressed toggle buttons (the app's segmented-control
            convention — not role="radio", which would promise arrow-key roving this doesn't implement). */}
        <div role="group" aria-label="Action" style={seg}>
          {(["void", "comp"] as Action[]).map((a) => {
            const on = action === a;
            return (
              <button
                className="staff-btn"
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => setAction(a)}
                style={{ ...segBtn, ...(on ? segBtnOn : null) }}
              >
                {a === "void" ? "Void (remove)" : "Comp (free)"}
              </button>
            );
          })}
        </div>
        <p style={hint}>
          {action === "void"
            ? "Cancels the item and removes it from the bill. The kitchen won’t make it."
            : "The guest isn’t charged, but the kitchen still makes it."}
        </p>

        {/* Reason — required, server-audited. Inline-validated on submit (S14): aria-invalid + a visible
            note when they try to confirm without picking one, rather than a silently-dimmed CTA. */}
        <fieldset style={fieldset}>
          <legend style={legend}>Reason</legend>
          <div
            role="group"
            aria-label="Reason"
            aria-describedby={reasonInvalid ? "loss-reason-err" : undefined}
            style={{ display: "grid", gap: 6 }}
          >
            {reasonOptions.map((r) => {
              const on = effectiveReason === r.value;
              return (
                <button
                  className="staff-btn"
                  key={r.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickReason(r.value)}
                  style={{
                    ...reasonBtn,
                    ...(on ? reasonBtnOn : null),
                    ...(reasonInvalid ? { borderColor: "var(--warn)" } : null),
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {reasonInvalid && (
            <p
              id="loss-reason-err"
              style={{ margin: "6px 0 0", fontSize: "var(--fs-sm)", color: "var(--warn)" }}
            >
              Pick a reason to continue.
            </p>
          )}
        </fieldset>

        {/* Manager step-up — shown for a comp / cooked void up-front, or after the server asks for it.
            The select/PIN + the empty-roster note live in the shared <ManagerPinFields> (S13). */}
        {showStepUp && (
          <fieldset style={fieldset}>
            <legend style={legend}>Manager approval</legend>
            <ManagerPinFields
              idPrefix="loss"
              approvers={approvers}
              approverStaffId={approverStaffId}
              onApproverChange={setApproverStaffId}
              pin={pin}
              onPinChange={setPin}
              locked={locked}
            />
          </fieldset>
        )}

        {/* S11: with no manager signed in the PIN path can't complete, so the deferred request becomes the
            primary action; otherwise the PIN confirm leads and the request is the secondary "no manager?" out. */}
        {showStepUp && noManagers ? (
          <button
            className="staff-btn"
            type="button"
            onClick={submitRequest}
            disabled={pending || locked}
            style={{ ...primaryBtn, opacity: pending || locked ? 0.6 : 1 }}
          >
            {pending ? "Sending…" : `Request a manager’s approval to ${action}`}
          </button>
        ) : (
          <>
            <button
              className="staff-btn"
              type="submit"
              disabled={!canSubmit}
              style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.6 }}
            >
              {pending ? "Working…" : showStepUp ? `${verb} with approval` : `${verb} item`}
            </button>

            {/* Deferred path (S2.4): for gated actions — request a manager's approval without a PIN now.
                The line stays live until a manager resolves it from the queue. */}
            {showStepUp && (
              <button
                className="staff-btn"
                type="button"
                onClick={submitRequest}
                disabled={pending || locked}
                style={{ ...secondaryBtn, opacity: pending || locked ? 0.6 : 1 }}
              >
                No manager here? Request approval
              </button>
            )}
          </>
        )}

        {/* One live region (QA §A): the lockout countdown takes precedence over a transient message. */}
        <p id="loss-msg" role="status" style={{ margin: "12px 0 0", minHeight: 18 }}>
          {(lockCopy ?? msg) && (
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
              {lockCopy ?? msg}
            </span>
          )}
        </p>
      </form>
    </Sheet>
  );
}

const lineSummary: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
};
const seg: CSSProperties = { display: "flex", gap: 6, marginBottom: 8 };
const segBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
const segBtnOn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const hint: CSSProperties = { margin: "0 0 6px", fontSize: "var(--fs-sm)", color: "var(--t2)" };
const fieldset: CSSProperties = { border: "none", padding: 0, margin: "12px 0 0" };
const legend: CSSProperties = {
  padding: 0,
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  marginBottom: 8,
};
const reasonBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  textAlign: "left",
  padding: "0 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const reasonBtnOn: CSSProperties = {
  borderColor: "var(--ac)",
  background: "color-mix(in oklab, var(--ac) 10%, var(--cd))",
  fontWeight: 700,
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  marginTop: 16,
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  marginTop: 8,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
