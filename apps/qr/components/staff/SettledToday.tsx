"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { EmptyState, Icon } from "@mms/ui";
import {
  getSettledToday,
  type SettledLine,
  type SettledOrder,
  type SettledToday as Snapshot,
} from "@/lib/refunds";
import type { RefundPath } from "@/lib/refund-console";
import { buildReceiptRows, dollars, groupReceiptLines } from "@/lib/receipt-view";
import { buildRefundRows, lineRefundLabel } from "@/lib/refund-view";
import {
  SETTLED_CAP,
  groupKey,
  receiptRowKey,
  settledChipKey,
  settledStatusKey,
  tenderKey,
} from "@/lib/settled-view";
import { raceTimeout } from "@/lib/staff-outage";
import { ts } from "@/lib/i18n/staff";
import { plural } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";
import { Chrome } from "./Chrome";
import { RefundActionSheet } from "./RefundActionSheet";
import { StaggerList } from "./StaggerList";
import { useStaffLang } from "./StaffLangProvider";
import { useZoneFocus } from "./ZoneFocus";
import { ExpoLineMy } from "./TicketText";

/**
 * Settled today (A4·3 · M204 · M183) — the manager's zone of the counter's one screen. Today's paid
 * and refunded orders, AS THE GUEST'S RECEIPT SHOWS THEM: every row, mark and status comes from the
 * derivations the artifact renders (`receipt-view.ts` · `refund-view.ts`) through the dictionary
 * map in `settled-view.ts`, so a manager reconciling against the slip in a guest's hand reads the
 * same words and the same figures. Expand an order to its lines; refund a line (money-OUT) via the
 * `RefundActionSheet`. Server-authoritative throughout — the board only displays; the refund
 * amount + PI are re-derived on submit. Re-reads `getSettledToday` after a refund so the line's
 * mark and the order's status reflect immediately (no client state-math).
 *
 * A server snapshot with a manual Refresh, deliberately not a third live subscription: the screen
 * already carries two 5 s pollers (`docs/A4_PLAN.md` — measured before a unified poll is built),
 * and a settled order does not change under a manager's hands the way an open table does.
 *
 * Live regions: the floor's is the screen's ONE state region; this zone's counts, freeze and
 * outage are plain text, and its only `role="status"` is mounted after the person's own tap (a
 * Refund opened) and speaks only the confirmed figure.
 */
export function SettledToday({ initial }: { initial: Snapshot }) {
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  // A refresh that failed keeps the last good list and says when it is from — the SNAPSHOT's own
  // instant (`serverNow`, the read that produced the list it is showing), never the failure's
  // (Codex round 1 on #283): dated by the failure, an hours-old server render read as current
  // through the present, which misleads a reconciliation after a refund.
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [refunding, setRefunding] = useState<{ order: SettledOrder; line: SettledLine } | null>(
    null,
  );
  // The last refund's confirmation (the server-authorized amount — the clamp may have bitten). The
  // region exists only once a Refund has been opened, so it never announces on load.
  const [armed, setArmed] = useState(false);
  // M218 (Codex round 1, P1) — the banner must name the instrument the money actually took. It said
  // "to the card" unconditionally, which was true while only card lines could reach it and is false
  // the moment a drawer hand-back is recordable. The PATH is captured with the amount, at the moment
  // the sheet reports, rather than re-derived later from a list that has since refreshed.
  const [confirmed, setConfirmed] = useState<{ cents: number; path: RefundPath } | null>(null);
  const [pending, startTransition] = useTransition();

  // Only the NEWEST read may replace the list (Codex round 1 on #283): a manual Refresh does not
  // disable the line Refund controls, so a refund can complete — and fire its own re-read — while
  // the manual read is still in flight. Whichever answer landed LAST used to win, and the older,
  // pre-refund one put the Refund button back over a line the ledger already holds.
  const readGen = useRef(0);
  const refresh = useCallback(() => {
    const mine = ++readGen.current;
    startTransition(async () => {
      try {
        const next = await raceTimeout(getSettledToday());
        if (mine !== readGen.current) return; // superseded — a newer read owns the list now
        // `getSettledToday` RETURNS its failures (`{ ok: false }`), it does not throw — so the
        // first draft installed an outage over a good list, and the manager who had just moved
        // money saw "can't load right now" where the confirmation was (blind pass on A4·3,
        // CRITICAL 2). A failed re-read keeps the last good snapshot, confirmation included, and
        // the count line says when the list is from. Only a good answer replaces the list.
        if (next.ok) {
          setSnap(next);
          setStale(false);
        } else {
          setStale(true);
        }
      } catch (e) {
        if (mine !== readGen.current) return;
        setStale(true);
        console.error("[SettledToday] refresh failed", e);
      }
    });
  }, []);

  // `/staff/orders` redirects onto this zone's fragment; the heading takes focus on arrival and on
  // a same-page jump (`useZoneFocus`, the one copy of the A4·3 rule since A4·5).
  useZoneFocus("settled-h");

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Refund focus handoff (WCAG 2.4.3): the sheet's cleanup restores focus to the Refund button that
  // opened it — but a successful refund's refresh then swaps that button for the refunded mark,
  // dropping focus to <body>. Stash the order id on success and, once the refreshed list lands, move
  // focus to that order's disclosure header (stable across the swap).
  const refocusOrderId = useRef<string | null>(null);
  useEffect(() => {
    const id = refocusOrderId.current;
    if (!id) return;
    refocusOrderId.current = null;
    if (document.activeElement === document.body)
      document
        .querySelector<HTMLButtonElement>(`[data-order-head="${id}"]`)
        ?.focus({ preventScroll: true });
  }, [snap]);

  // The read hides itself from anyone below manager: the page mounts this zone for a manager only,
  // so `forbidden` here is the gate race between the page's own check and the read (the floor
  // redirects on the same race) — nothing to say, nothing to show. An outage says so (never an
  // empty day), and a refresh can never turn a good list into this branch (above).
  if (!snap.ok && snap.reason === "forbidden") return null;

  const head = (
    <div style={headRow}>
      {/* echo={false}: this heading IS the section's accessible name (aria-labelledby reads the
          element's full text; an echo would name the region in both scripts at once). */}
      <h2 id="settled-h" tabIndex={-1} className="staff-zone-head">
        <Chrome lang={lang} k="floor.settled.head" />
      </h2>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="staff-btn staff-press"
        style={{ ...refreshBtn, opacity: pending ? 0.6 : 1 }}
      >
        <Chrome lang={lang} k="floor.settled.verb.refresh" echo="stack" />
      </button>
    </div>
  );

  if (!snap.ok) {
    return (
      <section aria-labelledby="settled-h" className="staff-zone">
        {head}
        <p style={warnText}>
          <Chrome lang={lang} k="floor.settled.outage" echo="stack" />
        </p>
      </section>
    );
  }

  const { orders, truncated } = snap;
  // The instant of the last GOOD read — the snapshot's own, formatted on the server in the
  // SERVICE zone like every clock beside it (Codex round 4 on #283: the tablet's own zone put the
  // list "as of 7:00 PM" over rows stamped noon) — shown only while a refresh has failed since.
  // Latin in both tongues (a clock).
  const staleClock = stale ? snap.serverClock : null;

  return (
    <section aria-labelledby="settled-h" className="staff-zone">
      {head}
      <p style={sub}>
        <Chrome lang={lang} k="floor.settled.sub" echo="stack" />
      </p>
      {/* The count, the cap and a failed refresh are one plain line — the floor's region is the
          screen's state region; this zone does not speak unprompted. */}
      <p style={{ ...countLine, color: staleClock ? "var(--warn)" : "var(--t2)" }} lang={lang}>
        <Chrome
          lang={lang}
          k={plural(orders.length, "floor.settled.count.one", "floor.settled.count.many")}
          vars={{ n: orders.length }}
        />
        {truncated && (
          <>
            {" "}
            <Chrome lang={lang} k="floor.settled.full" vars={{ n: SETTLED_CAP }} />
          </>
        )}
        {staleClock && (
          <>
            {" · "}
            <Chrome lang={lang} k="floor.settled.stale" vars={{ t: staleClock }} />
          </>
        )}
      </p>
      {armed && (
        <p role="status" style={confirmBanner}>
          {confirmed !== null && (
            <Chrome
              lang={lang}
              k={
                confirmed.path === "cash"
                  ? "floor.settled.confirmed.cash"
                  : "floor.settled.confirmed"
              }
              vars={{ m: dollars(confirmed.cents) }}
            />
          )}
        </p>
      )}

      {orders.length === 0 ? (
        <EmptyState
          title={<Chrome lang={lang} k="floor.settled.none" echo="stack" />}
          subtitle={<Chrome lang={lang} k="floor.settled.none.hint" echo="stack" />}
        />
      ) : (
        <StaggerList
          items={orders}
          getKey={(o) => o.id}
          ariaLabel={sx(lang, "floor.settled.a11y.list")}
          style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}
          renderItem={(o) => (
            <OrderCard
              order={o}
              open={open.has(o.id)}
              onToggle={() => toggle(o.id)}
              onRefund={(line) => {
                setArmed(true);
                setRefunding({ order: o, line });
              }}
            />
          )}
        />
      )}

      {refunding && (
        <RefundActionSheet
          order={refunding.order}
          line={refunding.line}
          onClose={() => setRefunding(null)}
          onDone={(refundedCents?: number) => {
            const orderId = refunding.order.id;
            setRefunding(null);
            if (refundedCents != null) {
              setConfirmed({ cents: refundedCents, path: refunding.order.refundPath });
              refocusOrderId.current = orderId; // hand focus to the order header once the refresh lands
            }
            refresh();
          }}
        />
      )}
    </section>
  );
}

/** One settled order: the collapsed row is the receipt's identity line; expanded, it IS the receipt. */
function OrderCard({
  order: o,
  open,
  onToggle,
  onRefund,
}: {
  order: SettledOrder;
  open: boolean;
  onToggle: () => void;
  onRefund: (line: SettledLine) => void;
}) {
  const lang = useStaffLang();
  const chip = settledChipKey(o.refund);
  const tKey = tenderKey(o.tender);
  const tender = tKey ? ts(lang, tKey) : o.tender;
  const groups = groupReceiptLines(o.lines);
  const rows = [...buildReceiptRows(o.breakdown, o.totalCents), ...buildRefundRows(o.refund)];
  // The path note (M183): from the order's own tender and PaymentIntent, never guessed from one.
  // M218 — CASH refunds here too, now that `mms_refund_cash_line` records them. Only `dashboard`
  // (split-tender: each payer's charge lives on its own share) is still refunded elsewhere. The
  // note below stays for cash because the money moves by HAND — the app records it, it cannot
  // open the drawer.
  const canRefundHere = o.refundPath !== "dashboard" && o.status === "paid";
  const exhausted = canRefundHere && o.remainingCents === 0 && o.lines.some((l) => !l.refunded);

  return (
    <div className="card card-textured" style={{ padding: 14 }}>
      <button
        type="button"
        data-order-head={o.id}
        onClick={onToggle}
        aria-expanded={open}
        className="staff-btn"
        style={orderHead}
      >
        <span style={{ display: "grid", gap: 2, textAlign: "left" }}>
          <span style={{ fontWeight: 700 }}>
            {o.tableNumber !== null ? (
              <Chrome lang={lang} k="floor.table" vars={{ id: o.tableNumber }} />
            ) : o.customerName ? (
              <Chrome lang={lang} k="floor.settled.for" vars={{ x: o.customerName }} />
            ) : (
              <Chrome lang={lang} k="floor.settled.code" vars={{ id: o.code }} />
            )}
          </span>
          <span style={meta}>
            {/* An earlier day's order the ledger admitted names the day it was PAID and when today
                its money moved (Codex round 1 on #283) — a bare clock here read as today's. */}
            {o.settledOn ? `${o.settledOn}, ${o.settledAt}` : o.settledAt}
            {o.refundedTodayAt && (
              <>
                {" · "}
                <Chrome lang={lang} k="floor.settled.refundedAt" vars={{ t: o.refundedTodayAt }} />
              </>
            )}
            {" · "}
            {tKey ? <Chrome lang={lang} k={tKey} /> : o.tender}
            {(o.tableNumber !== null || o.customerName) && (
              <>
                {" · "}
                <Chrome lang={lang} k="floor.settled.code" vars={{ id: o.code }} />
              </>
            )}
            {o.pickupSlotAt && (
              <>
                {" · "}
                {/* Zoned on the server, like the clock beside it — never re-formatted here. */}
                <Chrome lang={lang} k="floor.settled.slot" vars={{ t: o.pickupSlotAt }} />
              </>
            )}
          </span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {chip && (
            <span style={chipStyle}>
              <Chrome lang={lang} k={chip} />
            </span>
          )}
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {dollars(o.totalCents)}
          </span>
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            style={{ color: "var(--t2)" }}
          />
        </span>
      </button>

      {open && (
        <div style={body}>
          {/* The settled-state line — the receipt's, in the state's own words (W23b: a partly
              refunded order must never read "Paid in full"). */}
          <p style={statusLine}>
            <Chrome lang={lang} k={settledStatusKey(o.refund)} vars={{ x: tender }} echo="stack" />
          </p>

          {groups.map((g) => {
            const gk = g.label ? groupKey(g.key) : null;
            const headId = `settled-${o.id}-${g.key}`;
            return (
              <Fragment key={g.key}>
                {gk && (
                  <p id={headId} style={groupHead}>
                    <Chrome lang={lang} k={gk} echo="inline" />
                  </p>
                )}
                {/* Named by its destination heading when the order spans two or more, else by the
                    zone's own list name — a `role="list"` with `listStyle: none` needs one (QA §A). */}
                <ul
                  role="list"
                  {...(gk
                    ? { "aria-labelledby": headId }
                    : { "aria-label": sx(lang, "floor.settled.a11y.lines") })}
                  style={lineList}
                >
                  {g.lines.map((l) => (
                    <LineRow
                      key={l.id}
                      line={l}
                      refundable={canRefundHere && !l.refunded && l.offeredCents > 0}
                      onRefund={() => onRefund(l)}
                    />
                  ))}
                </ul>
              </Fragment>
            );
          })}

          {/* The receipt's totals, verbatim from the fulfillment-time snapshot — then, after the
              Total, what came back and what the guest actually paid (`buildRefundRows`). */}
          <ul role="list" aria-label={sx(lang, "floor.settled.a11y.rows")} style={rowList}>
            {rows.map((r) => {
              const k = receiptRowKey(r);
              return (
                <li key={r.key} style={r.grand ? rowGrand : row}>
                  {/* An unmapped row prints its own English label — never an invented word. */}
                  <span>{k ? <Chrome lang={lang} k={k} echo="inline" /> : r.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.negative ? "−" : ""}
                    {dollars(r.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>

          {o.refundPath === "cash" && (
            <p style={pathNote}>
              <Chrome lang={lang} k="floor.settled.path.cash" echo="stack" />
            </p>
          )}
          {o.refundPath === "dashboard" && (
            <p style={pathNote}>
              <Chrome
                lang={lang}
                k="floor.settled.path.dashboard"
                vars={{ x: ts(lang, "table.appr.stripe") }}
                echo="stack"
              />
            </p>
          )}
          {exhausted && (
            <p style={pathNote}>
              <Chrome lang={lang} k="floor.settled.path.exhausted" echo="stack" />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One line of the receipt: what was ordered (both tongues, its modifiers, the kitchen note), its
 *  amount, what has already come back, and — when the order can still give this line back — Refund. */
function LineRow({
  line: l,
  refundable,
  onRefund,
}: {
  line: SettledLine;
  refundable: boolean;
  onRefund: () => void;
}) {
  const lang = useStaffLang();
  // W23b — states the amount rather than crossing the line out: a clamped refund returns part of a
  // dish, and a strike-through would claim the whole of it came back.
  const mark = lineRefundLabel(l.refundedCents);
  return (
    <li style={lineRow}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span aria-hidden style={{ fontWeight: 700, color: "var(--ac-strong)" }}>
          {l.qty}×
        </span>{" "}
        {l.name}
        {l.modifiers.length > 0 && <span style={muted}> · {l.modifiers.join(", ")}</span>}
        {/* The line amount is qty × unit price (the receipt's structural rule); tax is one
            order-level row below, never per line. */}
        <span style={muted}> · {dollars(l.unitPriceCents * l.qty)}</span>
        {mark !== null ? (
          <span style={markStyle}>
            {" · "}
            <Chrome lang={lang} k="floor.card.refunded" vars={{ m: dollars(l.refundedCents) }} />
          </span>
        ) : (
          l.refunded && (
            <span style={markStyle}>
              {" · "}
              <Chrome lang={lang} k="floor.status.refunded" />
            </span>
          )
        )}
        {/* F18 (b) — the live catalog's Burmese, beneath, only when it adds something. */}
        <ExpoLineMy line={l} />
        {l.notes && <span style={noteStyle}>“{l.notes}”</span>}
      </span>
      {refundable && (
        <button
          type="button"
          onClick={onRefund}
          className="staff-btn"
          style={refundBtn}
          // Every line shows the same word, so the name carries the dish. The SAME key renders as
          // the visible label, so WCAG 2.5.3 containment holds by construction (guard rule 3c).
          aria-label={
            al(lang, {
              kind: "verb",
              echo: "stack",
              verb: "floor.settled.verb.refund",
              subject: l.name,
            }).aria
          }
        >
          <Chrome lang={lang} k="floor.settled.verb.refund" echo="stack" />
        </button>
      )}
    </li>
  );
}

const headRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
};
const refreshBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const sub: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 };
const countLine: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)" };
const warnText: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--warn)" };
const confirmBanner: CSSProperties = {
  minHeight: 18,
  margin: 0,
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--ac-strong)",
};
const orderHead: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  minHeight: 44,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "inherit",
  padding: 0,
};
const meta: CSSProperties = { fontSize: "var(--fs-sm)", color: "var(--t2)" };
const chipStyle: CSSProperties = {
  flex: "none",
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--t2)",
};
const body: CSSProperties = {
  margin: "10px 0 0",
  padding: "10px 0 0",
  borderTop: "1px solid var(--bd)",
  display: "grid",
  gap: 8,
};
const statusLine: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", fontWeight: 700 };
const groupHead: CSSProperties = {
  margin: "4px 0 0",
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--t2)",
};
const lineList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 8,
};
const lineRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: "var(--fs-sm)",
};
const muted: CSSProperties = { color: "var(--t2)" };
const markStyle: CSSProperties = { color: "var(--warn)", fontWeight: 700 };
const noteStyle: CSSProperties = { display: "block", color: "var(--t2)", fontStyle: "italic" };
const rowList: CSSProperties = {
  listStyle: "none",
  margin: "4px 0 0",
  padding: "8px 0 0",
  borderTop: "1px dashed var(--bd)",
  display: "grid",
  gap: 4,
  fontSize: "var(--fs-sm)",
};
const row: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10 };
const rowGrand: CSSProperties = { ...row, fontWeight: 800 };
const pathNote: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const refundBtn: CSSProperties = {
  flex: "none",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
