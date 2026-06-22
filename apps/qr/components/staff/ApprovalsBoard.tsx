"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import { listPendingApprovals, resolveApproval, type PendingApproval } from "@/lib/approvals";
import type { Approver } from "@/lib/voids";
import { RelativeTime } from "./RelativeTime";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const REASON_LABEL: Record<string, string> = {
  mistake: "Ordered by mistake",
  kitchen_error: "Kitchen made it wrong",
  quality: "Quality / guest unhappy",
  guest_request: "Guest request",
  service_recovery: "Making it right",
  other: "Other",
};

/**
 * The manager approvals queue (S2.4) — server-rendered snapshot kept live by a 5s POLL (mms_approvals is
 * owner-read RLS, so it's not on the realtime publication; requests/resolves are low-frequency, so a poll
 * is the right tool). Each request resolves via the manager-PIN step-up (tap your name → PIN), so it works
 * on a shared tablet regardless of who's signed in; the server re-checks role + self + once-only.
 */
export function ApprovalsBoard({
  initial,
  approvers,
}: {
  initial: PendingApproval[];
  approvers: Approver[];
}) {
  const [snap, setSnap] = useState(initial);
  const [serverNow] = useState(() => new Date().toISOString());
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setSnap(await listPendingApprovals());
    } catch (e) {
      // Keep the last good queue on a transient error; the next poll recovers.
      console.error("[ApprovalsBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const count = snap.length;

  return (
    <section aria-labelledby="appr-h">
      <div style={headRow}>
        <h2 id="appr-h" style={{ fontSize: 16, margin: 0 }}>
          Open requests
        </h2>
        <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13, color: "var(--t2)" }}>
          {count === 0 ? "All clear" : `${count} waiting`}
        </p>
      </div>

      {count === 0 ? (
        <div className="card" style={empty}>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing to approve</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--t2)", lineHeight: 1.5 }}>
            When a server asks to void or comp something they can’t do solo, it lands here for a
            manager to approve or deny — oldest first.
          </p>
        </div>
      ) : (
        <ul role="list" aria-label="Pending approval requests" style={grid}>
          {snap.map((a) => (
            <li key={a.id}>
              <RequestCard
                request={a}
                approvers={approvers}
                serverNow={serverNow}
                onResolved={refresh}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestCard({
  request,
  approvers,
  serverNow,
  onResolved,
}: {
  request: PendingApproval;
  approvers: Approver[];
  serverNow: string;
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [lockLeft, setLockLeft] = useState(0);
  const [pending, startTransition] = useTransition();

  const locked = lockLeft > 0;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const verb = request.kind === "comp" ? "Comp" : "Void";
  const pinOk = pin.length >= 4 && pin.length <= 8;
  const canConfirm = !!decision && !!approverStaffId && pinOk && !pending && !locked;

  function open(d: "approve" | "deny") {
    setDecision(d);
    setMsg(null);
  }
  function cancel() {
    setDecision(null);
    setPin("");
    setMsg(null);
  }

  function confirm(e: FormEvent) {
    e.preventDefault();
    if (!canConfirm || !decision) return;
    setMsg(null);
    startTransition(async () => {
      const res = await resolveApproval({ approvalId: request.id, decision, approverStaffId, pin });
      if (res.ok) {
        onResolved(); // the card drops off on the next snapshot
        return;
      }
      setPin("");
      switch (res.reason) {
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
          setMsg("Pick a manager other than whoever requested this.");
          break;
        case "already":
          setMsg("Already resolved — refreshing.");
          onResolved();
          break;
        case "stale":
          setMsg("That item has since changed — refreshing.");
          onResolved();
          break;
        case "not_open":
          setMsg(
            "That table is no longer open — deny it (a settled refund is handled separately).",
          );
          break;
        default:
          setMsg("Couldn’t resolve that just now — please try again.");
      }
    });
  }

  const mins = Math.floor(lockLeft / 60);
  const secs = lockLeft % 60;
  const lockCopy = locked ? `Locked — try again in ${mins > 0 ? `${mins}m ` : ""}${secs}s.` : null;

  return (
    <article
      className="card"
      style={cardStyle}
      aria-label={`${verb} request for ${request.lineName}`}
    >
      <header style={cardHead}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          {request.tableLabel ? `Table ${request.tableLabel}` : "Table"}
        </span>
        <span style={{ fontSize: 12, color: "var(--t2)" }}>
          <RelativeTime iso={request.createdAt} serverNow={serverNow} />
        </span>
      </header>

      <p style={{ margin: 0, fontSize: 15 }}>
        <span style={kindBadge}>{verb}</span> {request.qty}× {request.lineName}
        <span style={{ color: "var(--t2)" }}> · {fmt(request.amountCents)}</span>
        {request.cooked && <span style={{ color: "var(--warn)", fontWeight: 700 }}> · cooked</span>}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--t2)" }}>
        {REASON_LABEL[request.reasonCode] ?? request.reasonCode} · from {request.initiatorName}
      </p>

      {decision === null ? (
        <div style={btnRow}>
          <button
            type="button"
            onClick={() => open("approve")}
            style={{ ...actionBtn, ...approveBtn }}
          >
            Approve
          </button>
          <button type="button" onClick={() => open("deny")} style={{ ...actionBtn, ...denyBtn }}>
            Deny
          </button>
        </div>
      ) : (
        <form onSubmit={confirm} style={{ marginTop: 4 }} noValidate>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
            {decision === "approve" ? `Approve this ${request.kind}` : "Deny this request"} —
            confirm with your PIN
          </p>
          <label htmlFor={`appr-mgr-${request.id}`} style={label}>
            Manager
          </label>
          <select
            id={`appr-mgr-${request.id}`}
            value={approverStaffId}
            onChange={(e) => setApproverStaffId(e.target.value)}
            disabled={locked || approvers.length === 0}
            style={select}
          >
            <option value="">
              {approvers.length === 0 ? "No managers available" : "Tap your name"}
            </option>
            {approvers.map((m) => (
              <option key={m.staffId} value={m.staffId}>
                {m.displayName}
              </option>
            ))}
          </select>
          <label htmlFor={`appr-pin-${request.id}`} style={{ ...label, marginTop: 10 }}>
            PIN
          </label>
          <input
            id={`appr-pin-${request.id}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="••••"
            disabled={locked}
            aria-describedby={`appr-msg-${request.id}`}
            style={input}
          />
          <div style={btnRow}>
            <button
              type="submit"
              disabled={!canConfirm}
              style={{
                ...actionBtn,
                ...(decision === "approve" ? approveBtn : denyBtn),
                opacity: canConfirm ? 1 : 0.6,
              }}
            >
              {pending ? "Working…" : decision === "approve" ? "Confirm approve" : "Confirm deny"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              style={{ ...actionBtn, ...cancelBtn }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <p
        id={`appr-msg-${request.id}`}
        role="alert"
        aria-live="assertive"
        style={{ margin: "8px 0 0", minHeight: 16 }}
      >
        {(lockCopy ?? msg) && (
          <span style={{ fontSize: 13, color: "var(--warn)" }}>{lockCopy ?? msg}</span>
        )}
      </p>
    </article>
  );
}

const headRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s4)",
};
const empty: CSSProperties = { padding: "var(--s6)" };
const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
};
const cardStyle: CSSProperties = { padding: "var(--s4)", display: "grid", gap: 6 };
const cardHead: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s3)",
};
const kindBadge: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ac-strong)",
};
const btnRow: CSSProperties = { display: "flex", gap: 8, marginTop: 10 };
const actionBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const approveBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const denyBtn: CSSProperties = { background: "var(--cd)", color: "var(--warn)" };
const cancelBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
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
