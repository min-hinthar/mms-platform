"use client";
import type { Ref } from "react";
import Link from "next/link";
import { buttonClass } from "@mms/ui";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { handoffRows, type HandoffRow } from "@/lib/register-math";
import type { Handoff } from "@/lib/register-ui";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** One word per concept on every money surface: the settled receipt's Total and Tip, the sheet's
 *  Change, the sheet's "Cash received". */
const ROW_KEY: Record<HandoffRow["k"], StaffKey> = {
  total: "floor.settled.row.total",
  tip: "floor.settled.row.tip",
  tendered: "table.detail.handoff.tendered",
  change: "settle.cash.changeLabel",
  collect: "table.detail.handoff.collect",
};

/**
 * The paid card (Phase 2c · register, DESIGN-LANGUAGE §29) — the moment after a settle, with its
 * two facts at the size a cashier reads across the counter: the CHANGE to hand back and, on a counter
 * order, the #CODE to call out.
 *
 * Not a live region. It is FOCUSED when it appears (the parent's effect — the settle control it
 * replaced has unmounted), and its accessible NAME carries the facts: `aria-labelledby` = the title,
 * the change row (or what is still to collect, or the total when no tender was entered) and the
 * #CODE. The name is always spoken on focus; a description is a VoiceOver HINT, spoken after a pause
 * and silenced by the "Speak Hints" setting, so the facts are not left there. The old card was
 * `role="status"` AND focused — announced twice, and the third polite region on the page (P2r).
 *
 * Rows come from `handoffRows` (the persisted figures, zero-gated): a table's card renders only when
 * a tender was entered (the parent decides), rows only; a counter card adds #CODE, the call-out and
 * the way back to the counter — a Link that promises only the navigation it does.
 */
export function HandoffCard({
  lang,
  handoff,
  ref,
}: {
  lang: StaffLang;
  handoff: Handoff;
  ref?: Ref<HTMLElement>;
}) {
  const rows = handoffRows(handoff.totalCents, handoff.tipCents, handoff.tenderedCents);
  // The row the name speaks: the change (or what is still owed) when a tender was entered, else the
  // total — the one figure a cashier needs from the card.
  const key =
    rows.find((r) => r.k === "change" || r.k === "collect")?.k ?? ("total" as HandoffRow["k"]);
  const code = `#${handoff.orderId.slice(-6).toUpperCase()}`;
  const labelledBy = [
    "handoff-title",
    `handoff-row-${key}`,
    handoff.isCounter ? "handoff-code" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      className={`card card-textured staff-handoff mms-rise${handoff.isCounter ? " staff-handoff-counter" : ""}`}
    >
      <div className="staff-handoff-rows">
        {/* `echo={false}`: an aria-labelledby target — an echo would put both scripts in the name. */}
        <h2 id="handoff-title" className="staff-handoff-title">
          <span className="staff-handoff-check" aria-hidden="true">
            ✓
          </span>{" "}
          <Chrome lang={lang} k="table.detail.handoff.title" echo={false} />
        </h2>
        <dl className="staff-handoff-dl">
          {rows.map((r) => (
            <div
              key={r.k}
              id={`handoff-row-${r.k}`}
              className={`checkout-leader-row staff-handoff-row staff-handoff-row-${r.k}`}
            >
              <dt>
                <Chrome lang={lang} k={ROW_KEY[r.k]} echo={false} />
              </dt>
              <dd>{fmt(r.cents)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {handoff.isCounter && (
        <div className="staff-handoff-call">
          <p id="handoff-code" className="staff-handoff-code">
            {code}
          </p>
          <p className="staff-handoff-callout">
            <Chrome lang={lang} k="table.detail.handoff.callout" echo="stack" />
          </p>
        </div>
      )}
      {handoff.isCounter && (
        <Link
          href={STAFF_DOOR_TARGET.counter}
          className={buttonClass({
            variant: "primary",
            size: "xl",
            block: true,
            className: "staff-handoff-done",
          })}
        >
          <span>
            <Chrome lang={lang} k="table.detail.handoff.done" echo="stack" />
          </span>
          <span aria-hidden="true" className="ui-btn-arrow-fwd">
            →
          </span>
        </Link>
      )}
    </section>
  );
}
