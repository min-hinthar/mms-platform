"use client";
import { useRef, useState, type CSSProperties } from "react";
import { Icon } from "@mms/ui";
import { requestCardState, type RequestCardState } from "@/lib/approval-state";
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
 *
 * The blind pass on #333: the sheet decides the request's REAL state (`flagCardState` — the queue's
 * one derivation over the flag's live line), so a changed request offers Close it, never only Deny.
 * A refusal (`changed`, `not_open`, `still_open`, an outage) keeps the sheet open with its reason and
 * asks the page to re-read (`onRefresh`); only an APPLIED decision closes it (`onDecided`), and only
 * an approve says the total is moving (a deny or a close leaves every figure where it was).
 */
export function flagCardState(flag: PendingFlag): RequestCardState | null {
  // Take payment renders over an OPEN cart only, so the line alone decides open vs changed. A line
  // that could not be read decides nothing (null): the pane offers no key over it — Deny on a line
  // that may have changed would write the `denied` D2 retired (the last blind pass on #333). The
  // queue decides it, and the next detail read brings the line back.
  if (flag.lineNow === "unknown") return null;
  return requestCardState({
    cartStatus: "open",
    qty: flag.qty,
    amountCents: flag.amountCents,
    lineNow: flag.lineNow,
  });
}
export function ApprovalFlagCard({
  requests,
  tableText,
  hasHelp,
  headingLevel,
  serverNow,
  onDecided,
  onRefresh,
  focusAfterDecision,
}: {
  /** The open cart's pending requests, oldest first (the detail's `pendingRequests`). */
  requests: PendingFlag[];
  /** "7", or the sticker label — what Help is told. */
  tableText: string;
  /** The counter pane has a Help door; the standalone table page does not. */
  hasHelp: boolean;
  headingLevel: 3 | 4;
  serverNow: string;
  /** A decision was APPLIED: the page re-reads and moves focus; `totalMoves` — an approve took the
   *  dish off or made it free, so the trigger says "Updating the total…" until a later read lands. */
  onDecided: (o: { totalMoves: boolean }) => void;
  /** A refusal (or any answer): re-read the detail; the sheet stays where it is. */
  onRefresh: () => void;
  /** Focus after an APPLIED decision — the page's settle heading (A11Y, screen 3). Run once the sheet
   *  has unmounted: a modal sheet traps focus while it is up, and restores its opener after. */
  focusAfterDecision: () => void;
}) {
  const lang = useStaffLang();
  // The request the sheet is open for — by id, so a request decided elsewhere (gone on the re-read)
  // closes the sheet instead of handing it to the next one.
  const [decidingId, setDecidingId] = useState<string | null>(null);
  // An APPLIED decision closed the sheet: its unmount hands focus to the page, not back to the opener.
  const applied = useRef(false);
  const decideRef = useRef<HTMLButtonElement>(null);
  // The roster, read on mount (the fresh-mount rule) — an unreadable one is `failed`, never empty.
  const roster = useApproverRoster(listApprovers);
  const oldest = requests[0];
  if (!oldest) return null;
  const deciding = decidingId === oldest.id;
  const state = flagCardState(oldest);
  const eligible = signersFor(roster.approvers, oldest.initiatorStaffId);
  // Nobody here can decide: a READ roster with no signer. A failed read keeps Decide (fail open).
  const nobody = !roster.failed && eligible !== null && eligible.length === 0;
  // An unreadable line offers no decision here (`flagCardState` → null); the consequence still says
  // what Take payment does.
  const decidable = state !== null;
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
      {!nobody && decidable && (
        <button
          ref={decideRef}
          type="button"
          className="staff-btn"
          style={decideBtn}
          aria-expanded={deciding}
          aria-controls={deciding ? "flag-decide" : undefined}
          onClick={() => {
            // Per open: a LATE ok from an earlier sheet the ✕ closed must not send THIS one's
            // close to the settle heading (the last blind pass on #333).
            applied.current = false;
            setDecidingId(oldest.id);
          }}
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
      {deciding && state !== null && (
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
              lineNow: oldest.lineNow === "unknown" ? null : oldest.lineNow,
            }}
            state={state}
            approvers={roster.approvers}
            rosterFailed={roster.failed}
            retrying={roster.retrying}
            onRetry={roster.retry}
            hideCancel
            onCancel={() => setDecidingId(null)}
            // Every answer re-reads the detail; a REFUSAL keeps the sheet open with its reason.
            onResolved={onRefresh}
            onVerdict={(v) => {
              applied.current = true;
              setDecidingId(null);
              onDecided({ totalMoves: v.decision === "approve" });
            }}
            onClosed={() => {
              applied.current = true;
              setDecidingId(null);
              onDecided({ totalMoves: false });
            }}
            sheet={{
              open: true,
              onOpenChange: (open) => {
                if (!open) setDecidingId(null);
              },
              onCloseAutoFocus: (e) => {
                e.preventDefault();
                if (applied.current) {
                  applied.current = false;
                  focusAfterDecision();
                } else {
                  decideRef.current?.focus({ preventScroll: true });
                }
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
