"use client";
import { useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { buttonClass } from "@mms/ui";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { laneHref } from "@/lib/staff-more";
import { handoffRows, type HandoffRow } from "@/lib/register-math";
import type { Handoff } from "@/lib/register-ui";
import { handoffCode } from "@/lib/reader-collect";
import { takeHandoffFocus } from "@/lib/floor-pane";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { ReaderShown } from "./ReaderCollectContext";

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
  onDone,
  headingLevel = 2,
}: {
  lang: StaffLang;
  handoff: Handoff;
  ref?: Ref<HTMLElement>;
  /** Phase 2d · split — inside the counter's pane the counter is already beside it: "Back to the
   *  counter" CLOSES the pane (the same link, so a modified click still opens the floor). */
  onDone?: () => void;
  /** Phase 2d · review fixes — h3 inside the counter's pane (Table 7 › Paid), under the pane's own
   *  h2 like every other section there; h2 on the table page. The StaffPromoControl pattern. */
  headingLevel?: 2 | 3;
}) {
  const Title = headingLevel === 3 ? "h3" : "h2";
  const rows = handoffRows(handoff.totalCents, handoff.tipCents, handoff.tenderedCents);
  // The row the name speaks: the change (or what is still owed) when a tender was entered, else the
  // total — the one figure a cashier needs from the card.
  const key =
    rows.find((r) => r.k === "change" || r.k === "collect")?.k ?? ("total" as HandoffRow["k"]);
  // The #CODE, derived ONCE (`handoffCode`) — the chip, this card and the refunded line agree.
  const code = handoffCode(handoff.orderId);
  // Phase 2f — a counter order whose food went to the kitchen BEFORE it was paid: the bag is already
  // on the Takeaway bags lane (or cooking toward it), so the card says where to hand it over from.
  // It never says the food is READY (owner 7d — no auto-advance): the lane says that.
  const sentEarly = handoff.isCounter && handoff.sentEarly === true;
  const labelledBy = [
    "handoff-title",
    `handoff-row-${key}`,
    handoff.isCounter ? "handoff-code" : null,
    sentEarly ? "handoff-sent-early" : null,
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
        <Title id="handoff-title" className="staff-handoff-title">
          <span className="staff-handoff-check" aria-hidden="true">
            ✓
          </span>{" "}
          <Chrome lang={lang} k="table.detail.handoff.title" echo={false} />
        </Title>
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
      {sentEarly && (
        <div className="staff-handoff-early">
          {/* `echo={false}`: an aria-labelledby target — an echo would put both scripts in the name. */}
          <p id="handoff-sent-early" className="staff-handoff-callout">
            <Chrome lang={lang} k="table.detail.handoff.sentEarly" echo={false} />
          </p>
          {/* A NATIVE <a> (A4·3): the lane is a zone of the counter screen reached by its fragment,
              which a client-side Link would not focus; in the pane it is a same-page jump. */}
          <a
            href={laneHref(onDone !== undefined)}
            className={buttonClass({ variant: "secondary", size: "xl", block: true })}
          >
            <Chrome lang={lang} k="expo.title" echo="stack" />
          </a>
        </div>
      )}
      {handoff.isCounter && (
        <Link
          href={STAFF_DOOR_TARGET.counter}
          onClick={
            onDone
              ? (e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onDone();
                }
              : undefined
          }
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

/**
 * Phase 2g · P2em (D2) — the full table page's CLOSED counter order: the server-built #CODE card
 * (`getTableDetail`'s closed verdict, from the order row), on any device and after any reload. The
 * page is a Server Component; this is its one client island.
 *
 * It marks the table as SHOWN (`ReaderShown`), so the staff bar's reader chip stands down over it, and
 * a card this tab's reader collect landed for it — the chip's "View" leads here — is handed over and
 * WINS: it is the same order, plus the tap's "went out unpaid" the row never stored. That is a hand-
 * over, not a stash restore (the page variant never restores one — FloorDetailLive), and the server
 * card is not a stash either: it is the order row, read now. Never a live region (HandoffCard is not).
 *
 * Focus (Phase 2g · review, A11Y-4): NOT focused when the page was navigated to — a deep link, a
 * reload, the chip's "View": nothing just landed under anyone. FOCUSED once, on mount, when the
 * detail this card replaced left the one-shot note (`takeHandoffFocus`): the phone was ON the live
 * order with focus inside it when a colleague's settle closed it, and the detail's
 * `router.refresh()` swapped the whole page for this card — without the move, focus would fall to
 * <body> with nothing said (the pathname never changes, so no route cue fires). Its name carries the
 * facts (Paid · the figure · #CODE), so the move is also the announcement.
 */
export function ClosedHandoffCard({
  lang,
  sessionId,
  handoff,
}: {
  lang: StaffLang;
  sessionId: string;
  handoff: Handoff;
}) {
  const [landed, setLanded] = useState<Handoff | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (takeHandoffFocus(sessionId, Date.now())) cardRef.current?.focus();
  }, [sessionId]);
  return (
    <>
      <ReaderShown
        sessionId={sessionId}
        onLanded={(h) => {
          if (h) setLanded(h);
        }}
      />
      <HandoffCard lang={lang} handoff={landed ?? handoff} headingLevel={2} ref={cardRef} />
    </>
  );
}
