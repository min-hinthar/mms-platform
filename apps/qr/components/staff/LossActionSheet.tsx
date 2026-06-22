"use client";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Sheet } from "@mms/ui";
import { listApprovers, voidLine, type Approver, type VoidLineResult } from "@/lib/voids";
import { requestApproval } from "@/lib/approvals";
import type { TableLineView } from "@/lib/floor-types";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Action = "void" | "comp";
type Reason =
  | "mistake"
  | "kitchen_error"
  | "quality"
  | "guest_request"
  | "service_recovery"
  | "other";

// Reason codes per action (the SQL audit only length-bounds the code; these are the offered set).
const REASONS: Record<Action, { value: Reason; label: string }[]> = {
  void: [
    { value: "mistake", label: "Ordered by mistake" },
    { value: "kitchen_error", label: "Kitchen made it wrong" },
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
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lockLeft, setLockLeft] = useState(0);
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

  // Lockout countdown (server-clocked `lockedUntil` → a local tick), self-stops at 0.
  const locked = lockLeft > 0;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const reasonOptions = REASONS[action];
  // The reason DERIVED-valid for the current action: when the action toggles, a reason that doesn't apply
  // to it simply reads as unselected (no effect / setState-in-effect needed — it forces a fresh choice).
  const effectiveReason = reason && reasonOptions.some((r) => r.value === reason) ? reason : "";

  const pinOk = pin.length >= 4 && pin.length <= 8;
  const canSubmit =
    !!effectiveReason && !locked && !pending && (!showStepUp || (!!approverStaffId && pinOk));

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
        setMsg(
          res.attemptsRemaining > 0
            ? `Wrong PIN — ${res.attemptsRemaining} ${res.attemptsRemaining === 1 ? "try" : "tries"} left.`
            : "Wrong PIN.",
        );
        break;
      case "pin_locked": {
        const left = Math.max(
          0,
          Math.ceil((new Date(res.lockedUntil).getTime() - Date.now()) / 1000),
        );
        setLockLeft(left);
        setMsg("Too many tries on that PIN.");
        break;
      }
      case "pin_no_pin":
        setMsg("That manager hasn’t set a PIN yet.");
        break;
      case "bad_approver":
        setMsg("Pick a manager other than yourself to approve.");
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
      default:
        setMsg("Couldn’t do that just now — please try again.");
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setMsg(null);
    startTransition(async () => {
      const res = await voidLine({
        sessionId,
        cartItemId: line.id,
        action,
        reason: effectiveReason,
        ...(showStepUp ? { approverStaffId, pin } : {}),
      });
      handleResult(res);
    });
  }

  // Deferred path (S2.4): no manager at hand → request approval (no PIN). The line stays live until a
  // manager resolves it from the queue. Needs a reason (for the audit), not a manager/PIN.
  function submitRequest() {
    if (!effectiveReason || pending || locked) return;
    setMsg(null);
    startTransition(async () => {
      const res = await requestApproval({
        sessionId,
        cartItemId: line.id,
        action,
        reason: effectiveReason,
      });
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
        default:
          setMsg("Couldn’t send that request — please try again.");
      }
    });
  }

  const mins = Math.floor(lockLeft / 60);
  const secs = lockLeft % 60;
  const lockCopy = locked ? `Locked — try again in ${mins > 0 ? `${mins}m ` : ""}${secs}s.` : null;
  const verb = action === "comp" ? "Comp" : "Void";

  const managers = useMemo(() => approvers ?? [], [approvers]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`${verb} “${line.name}”`}>
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

        {/* Reason — required, server-audited. */}
        <fieldset style={fieldset}>
          <legend style={legend}>Reason</legend>
          <div role="group" aria-label="Reason" style={{ display: "grid", gap: 6 }}>
            {reasonOptions.map((r) => {
              const on = effectiveReason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReason(r.value)}
                  style={{ ...reasonBtn, ...(on ? reasonBtnOn : null) }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Manager step-up — shown for a comp / cooked void up-front, or after the server asks for it. */}
        {showStepUp && (
          <fieldset style={fieldset}>
            <legend style={legend}>Manager approval</legend>
            <label htmlFor="loss-mgr" style={label}>
              Manager
            </label>
            <select
              id="loss-mgr"
              value={approverStaffId}
              onChange={(e) => setApproverStaffId(e.target.value)}
              disabled={locked || managers.length === 0}
              style={select}
            >
              <option value="">
                {approvers === null
                  ? "Loading…"
                  : managers.length === 0
                    ? "No managers available"
                    : "Tap your name"}
              </option>
              {managers.map((m) => (
                <option key={m.staffId} value={m.staffId}>
                  {m.displayName}
                </option>
              ))}
            </select>
            {approvers !== null && managers.length === 0 && (
              // Honest dead-end note: a cooked void / comp needs a manager and none are on shift.
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--t2)" }}>
                A manager has to approve this — none are signed in right now.
              </p>
            )}
            <label htmlFor="loss-pin" style={{ ...label, marginTop: 12 }}>
              PIN
            </label>
            <input
              id="loss-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••"
              disabled={locked}
              // S2-audit S10: NOT described-by the live region (a node can't be both a field description and
              // a transactional live region without double-announcing); the label + placeholder suffice.
              style={input}
            />
          </fieldset>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.6 }}
        >
          {pending ? "Working…" : showStepUp ? `${verb} with approval` : `${verb} item`}
        </button>

        {/* Deferred path (S2.4): only for gated actions — request a manager's approval without a PIN now.
            Needs a reason; the line stays live until a manager resolves it from the queue. */}
        {showStepUp && (
          <button
            type="button"
            onClick={submitRequest}
            disabled={!effectiveReason || pending || locked}
            style={{ ...secondaryBtn, opacity: !effectiveReason || pending || locked ? 0.6 : 1 }}
          >
            No manager here? Request approval
          </button>
        )}

        {/* One live region (QA §A): the lockout countdown takes precedence over a transient message. */}
        <p
          id="loss-msg"
          role="status"
          aria-live="polite"
          style={{ margin: "12px 0 0", minHeight: 18 }}
        >
          {(lockCopy ?? msg) && (
            <span style={{ fontSize: 13, color: "var(--warn)" }}>{lockCopy ?? msg}</span>
          )}
        </p>
      </form>
    </Sheet>
  );
}

const lineSummary: CSSProperties = { margin: "0 0 14px", fontSize: 14, fontWeight: 600 };
const seg: CSSProperties = { display: "flex", gap: 6, marginBottom: 8 };
const segBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const segBtnOn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const hint: CSSProperties = { margin: "0 0 6px", fontSize: 12.5, color: "var(--t2)" };
const fieldset: CSSProperties = { border: "none", padding: 0, margin: "12px 0 0" };
const legend: CSSProperties = { padding: 0, fontSize: 13, fontWeight: 700, marginBottom: 8 };
const reasonBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  textAlign: "left",
  padding: "0 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 14,
  cursor: "pointer",
};
const reasonBtnOn: CSSProperties = {
  borderColor: "var(--ac)",
  background: "color-mix(in oklab, var(--ac) 10%, var(--cd))",
  fontWeight: 700,
};
const label: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const select: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 12px",
  fontSize: 16,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: 16,
  letterSpacing: "0.3em",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  marginTop: 16,
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: 15,
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
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
