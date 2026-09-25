"use client";
import { useId, type ReactNode, type RefObject } from "react";
import { Button, Field } from "@mms/ui";
import type { TableDetail, TableLineView } from "@/lib/floor-types";
import type { StaffLineEdit } from "@/lib/staff-send-view";
import type { PendingAdd } from "@/lib/pad-pending";
import {
  padDishName,
  ticketGroupOf,
  ticketGroups,
  TICKET_GROUP_ORDER,
  type TicketGroupKey,
} from "@/lib/order-pad";
import { frozenBoardCopy, type StaffDegraded } from "@/lib/staff-outage";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { al } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";
import { useLineMotion } from "../useLineMotion";
import { StaffLineEditor } from "./StaffLineEditor";
import { Chrome } from "./Chrome";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const GROUP_KEY: Record<TicketGroupKey, StaffKey> = {
  unsent: "pad.group.unsent",
  togo: "pad.group.togo",
  kitchen: "pad.group.kitchen",
  served: "pad.group.served",
  voided: "table.detail.line.voided",
};

/** What `useLineMotion` compares a line by: a change to any of these re-draws the row in place. */
const lineSig = (l: TableLineView) =>
  [l.id, l.qty, l.state, l.comped, l.notes ?? "", l.pendingApproval, l.soldOut].join(":");

export type CounterNameField = {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  /** The typed name is what the server holds (and it is not empty). */
  saved: boolean;
};

/**
 * Phase 2c · pad — the ORDER PAD's ONE ticket (DESIGN-LANGUAGE §28).
 *
 * Always mounted, exactly once: CSS decides where it shows (a pane beside the tiles on a tablet, the
 * order view on a phone) — never a second copy in a sheet, so no duplicated ids, focus or hooks.
 *
 * Head: the "Order" heading (the section's name and the focus fallback) and, on a counter order,
 * the name the expo calls out. Body: the lines in groups (not sent · to-go · in the kitchen · served
 * · removed; headings only with two or more), each a `StaffLineEditor`, and the GHOSTS of adds still
 * in flight at the end of "Not sent yet" — "Adding…", "Checking…", or "Send again" (the SAME add
 * key, so it can never go on twice) — never a price. A removal leaves as a ghost while the list
 * closes over it, and a refused one comes back in place (`useLineMotion`, §24). Foot: the server's
 * pre-tax subtotal on a receipt row, "—" while anything is pending (amounts are never intent); the
 * pre-tax note; the frozen-feed line; "Reload the order" once an add has gone unanswered; and the
 * status row the pad hands in (to-go at pay · everything sent · counter at pay). The Send and Take
 * payment live in the pad's dock, one node each, placed by CSS per tier.
 *
 * The ticket mounts NO live region: every outcome goes to the pad's one Toast.
 */
export function StaffTicket({
  lang,
  sessionId,
  detail,
  pending,
  amountsSettled,
  degraded,
  nowMs,
  showReload,
  onReload,
  headingRef,
  rootRef,
  counterName,
  foot,
  canWrite,
  removing,
  onRemove,
  onResend,
  onError,
  onEditState,
}: {
  lang: StaffLang;
  sessionId: string;
  detail: TableDetail;
  pending: readonly PendingAdd[];
  /** No add is pending: the subtotal may be named. */
  amountsSettled: boolean;
  degraded: StaffDegraded | null;
  nowMs: number;
  showReload: boolean;
  onReload: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** The ticket's root — the Send's note hold looks for `data-note-for` within it. */
  rootRef: RefObject<HTMLElement | null>;
  counterName: CounterNameField | null;
  foot: ReactNode;
  canWrite: boolean;
  /** Lines whose removal is in flight — drawn as ghosts until the server answers. */
  removing: ReadonlySet<string>;
  onRemove: (line: TableLineView) => void;
  onResend: (key: string) => void;
  onError: (msg: string) => void;
  onEditState: (lineId: string, edit: StaffLineEdit | null) => void;
}) {
  const ids = useId();
  const mode = detail.mode;
  const live = detail.lines.filter((l) => !removing.has(l.id));
  const motion = useLineMotion(live, {
    group: (l) => ticketGroupOf(l, mode),
    groupOrder: TICKET_GROUP_ORDER,
    sig: lineSig,
    scope: sessionId,
  });
  const { groups, showHeadings } = ticketGroups(live, mode);
  const ghosts = pending;
  // The ghosts sit at the end of "Not sent yet": that group is drawn whenever one exists, even when
  // no confirmed line is unsent yet (the first dish's first tap).
  const drawn: { key: TicketGroupKey; lines: TableLineView[] }[] =
    ghosts.length > 0 && !groups.some((g) => g.key === "unsent")
      ? [{ key: "unsent", lines: [] }, ...groups]
      : groups;
  const headings = showHeadings || (ghosts.length > 0 && drawn.length >= 2);
  const empty = drawn.length === 0;

  return (
    <section
      ref={rootRef}
      id="pad-ticket"
      className="pad-ticket card card-textured"
      aria-labelledby={`${ids}-h`}
    >
      <div className="pad-ticket-head">
        {/* `echo={false}`: the heading names the section AND is the focus target. */}
        <h2 id={`${ids}-h`} ref={headingRef} tabIndex={-1} className="pad-ticket-title">
          <Chrome lang={lang} k="pad.ticket.title" />
        </h2>
        {counterName && (
          <form
            className="pad-name"
            onSubmit={(e) => {
              e.preventDefault();
              counterName.onSave();
            }}
          >
            <Field label={<Chrome lang={lang} k="browse.name.label" />}>
              {(control) => (
                <span className="pad-name-row">
                  <input
                    {...control}
                    value={counterName.value}
                    maxLength={40}
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder={ts(lang, "browse.name.placeholder")}
                    onChange={(e) => counterName.onChange(e.target.value)}
                  />
                  {/* The word only after the SERVER confirmed ("Saved ✓"); a stated word while it
                      saves, never an ellipsis (its content is its name, §17). */}
                  <Button
                    type="submit"
                    variant="secondary"
                    size="lg"
                    busy={counterName.saving}
                    busyLabel={<Chrome lang={lang} k="browse.name.saving" />}
                    {...(counterName.saved ? { "aria-disabled": true } : {})}
                  >
                    {counterName.saved ? (
                      <Chrome lang={lang} k="browse.name.saved" />
                    ) : (
                      <Chrome lang={lang} k="browse.name.save" />
                    )}
                  </Button>
                </span>
              )}
            </Field>
          </form>
        )}
      </div>

      <div className="pad-ticket-body">
        {empty ? (
          <p className="pad-ticket-empty">
            <Chrome lang={lang} k="pad.ticket.empty" echo="stack" />
          </p>
        ) : (
          drawn.map((g) => (
            <div key={g.key} className="pad-ticket-group" data-group={g.key}>
              {headings && (
                <h3 id={`${ids}-${g.key}`} className="pad-ticket-group-h">
                  <Chrome lang={lang} k={GROUP_KEY[g.key]} />
                </h3>
              )}
              <ul
                role="list"
                className="pad-ticket-list"
                {...(headings
                  ? { "aria-labelledby": `${ids}-${g.key}` }
                  : { "aria-labelledby": `${ids}-h` })}
                {...motion.listProps}
              >
                {motion.rowsFor(g.key, g.lines).map((r) => (
                  <StaffLineEditor
                    key={r.item.id}
                    sessionId={sessionId}
                    line={r.item}
                    disabled={!canWrite}
                    onError={onError}
                    onEditState={onEditState}
                    rowProps={motion.rowProps(r.item.id, r.leaving)}
                    leaving={r.leaving}
                    onRemove={() => {
                      // BEFORE the write: focus lands on the neighbouring dish while this control
                      // is still live, and what sits below is held from the next tap (§24).
                      motion.noteRemoval(r.item.id);
                      onRemove(r.item);
                    }}
                  />
                ))}
                {g.key === "unsent" &&
                  ghosts.map((p) => (
                    <GhostRow key={p.key} lang={lang} add={p} onResend={onResend} />
                  ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="pad-ticket-foot">
        {!detail.settled && (
          <p className="pad-receipt">
            <Chrome lang={lang} k="table.detail.subtotalSoFar" />
            <span className="pad-leader" aria-hidden="true" />
            {/* The server's pre-tax subtotal — never recomputed here — and "—" while any add is
                pending: a figure named over a dish still in flight would be a claim (§23). */}
            <span className="pad-receipt-amt">
              {amountsSettled ? fmt(detail.runningSubtotalCents) : "—"}
            </span>
          </p>
        )}
        {!detail.settled && (
          <p className="pad-note">
            <Chrome lang={lang} k="table.detail.pretaxNote" echo="stack" />
          </p>
        )}
        {degraded && (
          // Plain text, not a region: the pad's one Toast announced it once when the feed froze.
          <p className="pad-stale">
            <span lang={lang}>
              {frozenBoardCopy(
                lang,
                detail.serverNow,
                nowMs - degraded.since,
                "what.order",
                degraded.cause,
              )}
            </span>
          </p>
        )}
        {showReload && (
          <Button variant="secondary" size="lg" block onClick={onReload}>
            <Chrome lang={lang} k="pad.reload" echo="stack" />
          </Button>
        )}
        {foot}
      </div>
    </section>
  );
}

/** An add still on its way. Its words are aria-hidden (the claim was SPOKEN at the tap); the one
 *  control it may carry — "Send again", on an add whose answer was lost — is named in full. */
function GhostRow({
  lang,
  add,
  onResend,
}: {
  lang: StaffLang;
  add: PendingAdd;
  onResend: (key: string) => void;
}) {
  const name = padDishName(lang, add.name, add.nameMy).lead;
  return (
    <li className="pad-ghost mms-rise" data-state={add.state}>
      <span className="pad-ghost-text" aria-hidden="true">
        <span className="staff-qty">{add.qty}×</span> <span lang={name.lang}>{name.text}</span>
      </span>
      {add.state === "lost" ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label={
            al(lang, { kind: "verb", verb: "pad.ghost.verb.resend", subject: name.text }).aria
          }
          onClick={() => onResend(add.key)}
        >
          <Chrome lang={lang} k="pad.ghost.verb.resend" />
        </Button>
      ) : (
        <span className="pad-ghost-status" aria-hidden="true">
          {add.state === "unconfirmed" ? (
            <Chrome lang={lang} k="pad.ghost.checking" />
          ) : (
            <Chrome lang={lang} k="pad.ghost.adding" />
          )}
        </span>
      )}
    </li>
  );
}
