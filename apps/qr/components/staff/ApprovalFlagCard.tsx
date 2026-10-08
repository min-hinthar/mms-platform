"use client";
import { useRef, useState, type CSSProperties } from "react";
import { Icon } from "@mms/ui";
import type { PendingFlag } from "@/lib/settle-approvals";
import { listApprovers } from "@/lib/voids";
import { padDishName } from "@/lib/order-pad";
import { sx } from "@/lib/staff-labels";
import { ApprovalDecision } from "./ApprovalsBoard";
import { useApproverRoster } from "./ManagerPinStepUp";
import { signersFor } from "./ApprovalSlip";
import { Chrome } from "./Chrome";
import { RelativeTime } from "./RelativeTime";
import { useStaffLang } from "./StaffLangProvider";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** The consequence sentence's id — Take cash is described by it FIRST (owner answer 4, A1). */
export const FLAG_CONSEQUENCE_ID = "flag-consequence";

/**
 * PD8 (PATH_DESIGN decision 4; m8 screen 3 with appendix A1 · B1 · B2) — the flag at Take payment.
 *
 * A paper card with ONE warm glyph square, never a warn slab and never a rail: the title names the
 * oldest waiting dish, a ticket line per waiting dish (kind mark · qty × dish · the request's figure;
 * cooked · from {asker} · age beneath), ONE paper secondary "Decide it here", and the consequence
 * sentence. Take cash below stays the live hero at full ink — it is NEVER dimmed: tapping it with a
 * flag up IS the acknowledgement (the page sends exactly the ids this card shows). "Decide it here"
 * opens the shipped centred Sheet around `ApprovalDecision` (the ONE SLIP), so the deciding state's
 * only primary is Approve (B2). Nobody here can decide (the filtered roster is empty): no Decide, and
 * the consequence becomes the Help sentence on the counter pane (the standalone table page has no
 * Help, so it keeps the consequence). An UNREADABLE roster still offers Decide — it never fails
 * closed (decision 25). Plain text, never a live region; the pane's one region speaks.
 */
export function ApprovalFlagCard({
  requests,
  tableText,
  hasHelp,
  headingLevel,
  serverNow,
  onDecided,
}: {
  /** The open cart's pending requests, oldest first (the detail's `pendingRequests`). */
  requests: PendingFlag[];
  /** "7", or the sticker label — what Help is told. */
  tableText: string;
  /** The counter pane has a Help door; the standalone table page does not. */
  hasHelp: boolean;
  headingLevel: 3 | 4;
  serverNow: string;
  /** A verdict landed: the page re-reads (and says "Updating the total…" until it lands). */
  onDecided: () => void;
}) {
  const lang = useStaffLang();
  const [deciding, setDeciding] = useState(false);
  const decideRef = useRef<HTMLButtonElement>(null);
  // The roster, read on mount (the fresh-mount rule) — an unreadable one is `failed`, never empty.
  const roster = useApproverRoster(listApprovers);
  const oldest = requests[0];
  if (!oldest) return null;
  const eligible = signersFor(roster.approvers, oldest.initiatorStaffId);
  // Nobody here can decide: a READ roster with no signer. A failed read keeps Decide (fail open).
  const nobody = !roster.failed && eligible !== null && eligible.length === 0;
  const H = headingLevel === 3 ? "h3" : "h4";
  const dish = padDishName(lang, oldest.lineName, oldest.nameMy);
  const dishText = dish.lead.text;

  return (
    <section
      className="card settle-flag"
      aria-labelledby="flag-title"
      data-flag-count={requests.length}
    >
      <div className="settle-flag-title">
        <span className="appr-flag-square" aria-hidden>
          <Icon name="flag" size={20} />
        </span>
        <H id="flag-title">
          <Chrome lang={lang} k="settle.flag.title" vars={{ x: dishText }} echo="stack" />
        </H>
      </div>
      <ul
        className="settle-flag-lines"
        role="list"
        aria-label={sx(lang, "settle.flag.a11y.waiting")}
      >
        {requests.map((r) => (
          <li key={r.id} className="settle-flag-line">
            <span className="settle-flag-line-row">
              <span
                className={`appr-mark appr-mark-sm ${r.kind === "void" ? "appr-mark-remove" : "appr-mark-free"}`}
                aria-hidden
              >
                {r.kind === "comp" && <Icon name="gift" size={11} />}
              </span>
              <span className={`appr-kind-word ${r.kind === "comp" ? "appr-kind-word-free" : ""}`}>
                <Chrome
                  lang={lang}
                  k={r.kind === "comp" ? "table.appr.kind.comp" : "table.appr.kind.void"}
                />
              </span>
              <span>
                {r.qty}× {r.lineName}
              </span>
              <span className="settle-flag-leader" aria-hidden />
              <span className="settle-flag-price">{fmt(r.amountCents)}</span>
            </span>
            <span className="appr-card-fact">
              {r.cooked && (
                <>
                  <Chrome lang={lang} k="table.appr.cooked" echo="inline" />
                  {" · "}
                </>
              )}
              <Chrome lang={lang} k="table.appr.from" vars={{ x: r.initiatorName }} echo="inline" />
              {" · "}
              <RelativeTime iso={r.createdAt} serverNow={serverNow} />
            </span>
          </li>
        ))}
      </ul>
      {!nobody && (
        <button
          ref={decideRef}
          type="button"
          className="staff-btn"
          style={decideBtn}
          aria-expanded={deciding}
          aria-controls={deciding ? "flag-decide" : undefined}
          onClick={() => setDeciding(true)}
        >
          <Chrome lang={lang} k="settle.flag.decide" echo="stack" />
        </button>
      )}
      <p id={FLAG_CONSEQUENCE_ID} className="settle-flag-consequence">
        {nobody && hasHelp ? (
          <Chrome
            lang={lang}
            k="settle.flag.nobody"
            vars={{ x: dishText, t: tableText }}
            echo="stack"
          />
        ) : (
          <Chrome lang={lang} k="settle.flag.consequence" vars={{ x: dishText }} echo="stack" />
        )}
      </p>
      {deciding && (
        <div id="flag-decide">
          <ApprovalDecision
            request={{
              id: oldest.id,
              kind: oldest.kind,
              lineName: oldest.lineName,
              nameMy: oldest.nameMy,
              initiatorName: oldest.initiatorName,
              initiatorStaffId: oldest.initiatorStaffId,
              tableNumber: null,
              tableLabel: tableText,
            }}
            state="open"
            approvers={roster.approvers}
            rosterFailed={roster.failed}
            retrying={roster.retrying}
            onRetry={roster.retry}
            hideCancel
            onCancel={() => setDeciding(false)}
            onResolved={() => {
              setDeciding(false);
              onDecided();
            }}
            onVerdict={() => {}}
            onClosed={() => {}}
            sheet={{
              open: true,
              onOpenChange: (open) => {
                if (!open) setDeciding(false);
              },
              title: <Chrome lang={lang} k="table.loss.managerLegend" echo="stack" />,
            }}
          />
        </div>
      )}
    </section>
  );
}

const decideBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 54,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
