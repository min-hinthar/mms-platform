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
import { frozenBoardCopy, raceTimeout } from "@/lib/staff-outage";
import type { Approver } from "@/lib/voids";
import { EmptyState } from "@mms/ui";
import { RelativeTime } from "./RelativeTime";
import { StaggerList } from "./StaggerList";
import { ManagerPinFields, PIN_NO_PIN_COPY, pinFailureCopy, useLockout } from "./ManagerPinStepUp";
import { useStaffLang } from "./StaffLangProvider";

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
  // P2 — the device language, from app/staff/layout.tsx (the outage banner below speaks it).
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  const [serverNow] = useState(() => new Date().toISOString());
  // W10b — degraded state with the moment it began. This board's poll is a plain throw/resolve
  // (listPendingApprovals now THROWS on an unreadable queue instead of returning a false "all
  // clear"), so a rejection can be an outage OR an expired session OR this device's wifi — we
  // genuinely cannot tell them apart here, and the cause is therefore always `unknown`: the copy
  // says "not updating", never "we can't reach the ordering system" (pre-merge review — don't
  // assert a side you have no evidence about). `asOfIso`/`since`/`nowMs` are all this device's
  // clock, so the escalation elapsed is single-domain.
  const [degraded, setDegraded] = useState<{ since: number } | null>(null);
  const [asOfIso, setAsOfIso] = useState(() => new Date().toISOString());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      setSnap(await raceTimeout(listPendingApprovals()));
      setAsOfIso(new Date().toISOString());
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // Keep the last good queue on a transient error; flag stale after 2 misses (S2-audit S9).
      fails.current += 1;
      setNowMs(Date.now());
      if (fails.current >= 2) setDegraded((d) => d ?? { since: Date.now() });
      console.error("[ApprovalsBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Slow escalation tick while stale (the ≥2min paper-flow flip needs a re-render).
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

  // Focus catch-all (WCAG 2.4.3; the KdsBoard pattern): an approve/deny drops the request card —
  // restore focus to the heading only when it fell to <body> from a real control (edge-triggered).
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set at interaction time too (onFocusCapture on the root) — closes the blind window where the FIRST
  // bump after load lands before any snapshot has sampled focus (Codex P2).
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    if (document.activeElement === document.body && hadRealFocus.current)
      headingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [snap]);

  const count = snap.length;

  return (
    <section aria-labelledby="appr-h" onFocusCapture={markFocus}>
      <div style={headRow}>
        <h2
          id="appr-h"
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: "var(--fs-body)", margin: 0 }}
        >
          Open requests
        </h2>
        {/* P2 — marked only while the FROZEN copy is what renders: this region's other branches
              are still English literals until PR B converts them (OPEN-ITEMS P2c), so an
              unconditional `lang={lang}` would announce "All clear" as Burmese. */}
        <p
          role="status"
          lang={degraded ? lang : undefined}
          style={{
            margin: 0,
            fontSize: "var(--fs-sm)",
            color: degraded ? "var(--warn)" : "var(--t2)",
          }}
        >
          {degraded
            ? frozenBoardCopy(lang, asOfIso, nowMs - degraded.since, "what.list", "unknown")
            : count === 0
              ? "All clear"
              : `${count} waiting`}
        </p>
      </div>

      {count === 0 ? (
        // W10b — mid-freeze this must not read as an authoritative "queue clear", nor promise
        // arrivals this board can't currently hear about.
        <EmptyState
          title={degraded ? "Nothing to approve as of the last update" : "Nothing to approve"}
          subtitle={
            degraded
              ? "New requests won’t appear here until this list is updating again. Anything already requested is still pending."
              : "When a server asks to void or comp something they can’t do solo, it lands here for a manager to approve or deny — oldest first."
          }
        />
      ) : (
        <StaggerList
          items={snap}
          getKey={(a) => a.id}
          ariaLabel="Pending approval requests"
          style={grid}
          renderItem={(a) => (
            <RequestCard
              request={a}
              approvers={approvers}
              serverNow={serverNow}
              onResolved={refresh}
            />
          )}
        />
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
  onResolved: () => void | Promise<void>;
}) {
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { setLockLeft, locked, lockCopy } = useLockout();
  const [pending, startTransition] = useTransition();

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
        await onResolved(); // pending covers the refetch — the card drops off before the form re-enables
        return;
      }
      setPin("");
      switch (res.reason) {
        case "pin_wrong":
        case "pin_locked":
          setMsg(pinFailureCopy(res, setLockLeft)); // S2-audit S13: shared PIN-failure copy
          break;
        case "pin_no_pin":
          setMsg(PIN_NO_PIN_COPY);
          break;
        case "bad_approver":
          setMsg("Pick a manager other than whoever requested this.");
          break;
        case "step_up_rate_limited":
          setMsg("Too many PIN attempts — wait a few minutes, then try again.");
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
        case "in_flight":
          setMsg("That table is mid-payment — try again once they’ve finished.");
          break;
        case "outage":
          // W10b — nothing was recorded and the request is STILL PENDING; never imply the PIN or
          // the request was the problem.
          setMsg(
            "We can’t reach the ordering system — nothing was recorded. This request is still pending; try again in a moment.",
          );
          break;
        default:
          setMsg("Couldn’t resolve that just now — please try again.");
      }
    });
  }

  return (
    <article
      className="card card-textured"
      style={cardStyle}
      aria-label={`${verb} request for ${request.lineName}`}
    >
      <header style={cardHead}>
        <span style={{ fontWeight: 700, fontSize: "var(--fs-body)" }}>
          {request.tableLabel ? `Table ${request.tableLabel}` : "Table"}
        </span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          <RelativeTime iso={request.createdAt} serverNow={serverNow} />
        </span>
      </header>

      <p style={{ margin: 0, fontSize: "var(--fs-body)" }}>
        <span style={kindBadge}>{verb}</span> {request.qty}× {request.lineName}
        <span style={{ color: "var(--t2)" }}> · {fmt(request.amountCents)}</span>
        {request.cooked && <span style={{ color: "var(--warn)", fontWeight: 700 }}> · cooked</span>}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
        {REASON_LABEL[request.reasonCode] ?? request.reasonCode} · from {request.initiatorName}
      </p>

      {decision === null ? (
        <div style={btnRow}>
          <button
            type="button"
            onClick={() => open("approve")}
            className="staff-btn"
            style={{ ...actionBtn, ...approveBtn }}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => open("deny")}
            className="staff-btn"
            style={{ ...actionBtn, ...denyBtn }}
          >
            Deny
          </button>
        </div>
      ) : (
        <form onSubmit={confirm} style={{ marginTop: 4 }} noValidate>
          <p style={{ margin: "0 0 8px", fontSize: "var(--fs-sm)", fontWeight: 600 }}>
            {decision === "approve" ? `Approve this ${request.kind}` : "Deny this request"} —
            confirm with your PIN
          </p>
          <ManagerPinFields
            idPrefix={`appr-${request.id}`}
            approvers={approvers}
            approverStaffId={approverStaffId}
            onApproverChange={setApproverStaffId}
            pin={pin}
            onPinChange={setPin}
            locked={locked}
          />
          <div style={btnRow}>
            <button
              type="submit"
              disabled={!canConfirm}
              className="staff-btn"
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
              className="staff-btn"
              style={{ ...actionBtn, ...cancelBtn }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <p id={`appr-msg-${request.id}`} role="status" style={{ margin: "8px 0 0", minHeight: 16 }}>
        {(lockCopy ?? msg) && (
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>{lockCopy ?? msg}</span>
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
  fontSize: "var(--fs-xs)",
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
  fontSize: "var(--fs-sm)",
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
