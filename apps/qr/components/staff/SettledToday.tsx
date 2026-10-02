"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, EmptyState, Icon, useSheetSubject } from "@mms/ui";
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
  ackHandBack,
  announceHandBacks,
  handBackKey,
  handBackSubjects,
  nextHandBackExpiryMs,
  owedHandBacksNow,
  refundSheetAfterAnswer,
  rememberHandBack,
  settledChipKey,
  settledStatusKey,
  subscribeHandBacks,
  tabStore,
  writtenHere,
  tenderKey,
  type HandBack,
} from "@/lib/settled-view";
import { raceTimeout } from "@/lib/staff-outage";
import { createPollGate, type PollGate } from "@/lib/poll-gate";
import { ts } from "@/lib/i18n/staff";
import { plural } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";
import { Chrome } from "./Chrome";
import { RefundActionSheet } from "./RefundActionSheet";
import { StaggerList } from "./StaggerList";
import { useEchoesShown, useStaffLang } from "./StaffLangProvider";
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
  const refund = useSheetSubject(refunding);
  // The last refund's confirmation (the server-authorized amount — the clamp may have bitten). The
  // region exists only once a Refund has been opened, so it never announces on load.
  const [armed, setArmed] = useState(false);
  // M218 (Codex round 1, P1) — the banner must name the instrument the money actually took. It said
  // "to the card" unconditionally, which was true while only card lines could reach it and is false
  // the moment a drawer hand-back is recordable. The PATH is captured with the amount, at the moment
  // the sheet reports, rather than re-derived later from a list that has since refreshed.
  const [confirmed, setConfirmed] = useState<{ cents: number; path: RefundPath } | null>(null);
  // Phase 2i (P2bi · D5) — every CASH hand-back still owed in this tab, read FROM THE RECORD
  // (`peekHandBacks`): written on every cash answer, forgotten only by its own [Handed back] (or a
  // shift's age). The banner says exactly this list — one source, so nothing is said twice.
  const [owedBack, setOwedBack] = useState<HandBack[]>([]);
  // The record, then any entry this DOCUMENT could not write down (storage refused) — held in the
  // lib's memory, not this zone's, so a late answer after an unmount still reaches the next mount
  // (critic F2). Every read of the list goes through here: mount, answer, late answer, ack (F8).
  const repeek = useCallback((): HandBack[] => {
    const next = owedHandBacksNow(tabStore(), Date.now());
    setOwedBack(next);
    return next;
  }, []);
  // Phase 2h (9b) — the read is called OUTSIDE any transition: under `startTransition(async …)` its
  // `pending` (the Refresh's busy) held until the action ANSWERED, whatever `raceTimeout` did — and
  // while it hung, every other transition's pending and every router commit on the tab was held with
  // it (LEARNINGS #149 · #200). `reading` is a state cleared in `finally`, so it frees at the bound.
  const [reading, setReading] = useState(false);
  // Phase 2h · critic B8 — a re-read OWED to one still in the air (a Refresh past the race's give-up,
  // or a refund's re-read): the read is coming, so Refresh stays busy until it starts. Without this a
  // tap past the give-up looked live, did nothing and said nothing (§17).
  const [owed, setOwed] = useState(false);

  // ── Phase 2h (9f) ── reads never stack (`lib/poll-gate.ts`). A manual Refresh does not disable the
  // line Refund controls, so a refund can complete — and ask for its own re-read — while the manual
  // read is in the air (Codex round 1 on #283). Two reads used to fly, and the OLDER, pre-refund
  // answer landing last put the Refund button back over a line the ledger already holds (a read
  // generation guarded it). Now a read asked for while one is unanswered is OWED, not sent: it runs
  // once the raw answers, so the newest read always STARTS after the older one's answer — which makes
  // the generation guard unreachable, and it is gone (an unreachable guard is decorative — the
  // Phase 2h contract critic, F11). It also never queues a second call behind a hung one in Next's
  // one-at-a-time queue. Made ONCE for the zone's life, on first use from a callback; never disposed
  // from a cleanup (Strict Mode would latch it): the kick is guarded by `alive`, re-armed at setup.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const kick = useRef<() => void>(() => {});
  const gateRef = useRef<PollGate | null>(null);
  const gateOf = useCallback((): PollGate => {
    if (gateRef.current === null) {
      gateRef.current = createPollGate(() => {
        if (alive.current) kick.current();
      });
    }
    return gateRef.current;
  }, []);
  const refresh = useCallback(async () => {
    // Review a (A3) — a refund's LATE answer reaches this through the sheet's tap-time `onDone`,
    // possibly after the zone unmounted: a read from a dead zone shows nothing and only puts one
    // more action into the tab's one-at-a-time queue. The kick is guarded the same way (above).
    if (!alive.current) return;
    const gate = gateOf();
    const asked = gate.ask();
    // Owed to the read in the air: it runs once that one answers. No miss is counted here, because
    // none is needed — this zone has no two-miss banner, and the read in the air already dated the
    // list ("stale") when its own race gave up, at the same bound `missed` measures; a refused ask
    // past it would only say that again (an unreachable rule is decorative — the contract critic, F11).
    if (asked.go === "owed") {
      if (alive.current) setOwed(true);
      return;
    }
    setOwed(false);
    setReading(true);
    try {
      // The RAW read is watched (the race frees this caller at 15 s, never Next's queue).
      const next = await raceTimeout(gate.watch(getSettledToday()), "read");
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
      setStale(true);
      console.error("[SettledToday] refresh failed", e);
    } finally {
      setReading(false); // frees AT THE BOUND (the race's give-up), whatever the action is doing
    }
  }, [gateOf]);
  useEffect(() => {
    kick.current = () => void refresh();
  }, [refresh]);

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
  //
  // ⚠️ THE CASH PATH GOES TO THE BANNER INSTEAD, and that is a money rule, not a focus preference
  // (Codex round 3 on #286, P1). Under record-first the banner no longer CONFIRMS a hand-back — it
  // ASKS for one, and it carries the only copy of the server-clamped figure. It renders above the
  // whole list, so refocusing a row that can sit far below the fold leaves a manager who has already
  // been charged looking at a screen that never told them to open the drawer. Focus plus a scroll
  // puts the instruction in front of whoever must act on it, sighted or not.
  const refocusOrderId = useRef<string | null>(null);
  const refocusBanner = useRef(false);
  // Phase 2i — the last instruction acknowledged and nothing left to say: focus goes to the zone's
  // heading (the [Handed back] that had it is gone), never to <body>.
  const refocusHeading = useRef(false);
  const bannerRef = useRef<HTMLParagraphElement | null>(null);

  // ⚠️ THE CASH BANNER'S FOCUS IS KEYED TO WHAT IT SAYS, NOT `snap` (Codex round 4 on #286, P1).
  // Phase 2i: that is `owedBack` now — every path that asks for the banner's focus (a cash answer,
  // a mount, a late answer, an acknowledgement) re-peeks it, and `confirmed` carries only the card
  // report, whose focus goes to its order header instead.
  // It was `[snap]`, and that made the instruction depend on a read succeeding: `refresh()` calls
  // `setSnap` ONLY on a good answer — an outage deliberately keeps the last good list and sets
  // `stale` instead — so a refund that RECORDED, followed by a failed refresh, left `snap`
  // identical, this effect never rerunning, and `refocusBanner` pending forever. The money was
  // out of the books' reach and the manager was never told to hand it over.
  //
  // `confirmed` is set synchronously in `onDone` BEFORE `refresh()` is called, so it changes
  // whether or not the read that follows ever lands. The banner also does not depend on the list:
  // it renders from `confirmed` and the hand-back record alone, above the orders, so there is
  // nothing to wait for. (Phase 2i — a cash answer now moves `owedBack`, re-peeked from the record
  // in `onDone`; `confirmed` carries only the card path's report.)
  useEffect(() => {
    if (refocusHeading.current) {
      refocusHeading.current = false;
      document.getElementById("settled-h")?.focus();
      return;
    }
    if (!refocusBanner.current) return;
    refocusBanner.current = false;
    refocusOrderId.current = null;
    // What the banner says with focus is said in this document: a navigation back re-shows it
    // without taking focus again (critic F4). Marked HERE, where it is said — never by an answer
    // landing in a zone that is gone.
    announceHandBacks(owedBack);
    bannerRef.current?.focus();
    // Optional call: `scrollIntoView` is not implemented in every DOM this renders under (jsdom
    // has no layout), and a missing scroll must never throw out of an effect that has just moved
    // focus onto a money instruction. Focus alone already brings it into view in a real browser.
    bannerRef.current?.scrollIntoView?.({ block: "center" });
  }, [owedBack]);

  // Phase 2h · review a (A2) · Phase 2i (D5) — a hand-back still owed is shown when the zone mounts:
  // after the manager came back from another screen, and after a RELOAD — ours, or Next's own on the
  // refund's answer (a stale build), which is why every cash answer is written down. An instruction
  // this document has not said yet takes the banner's FOCUS (the effect above), so it is read out
  // and in view. The record is
  // read from a timer, never in render (a server render has no tab storage, and a different first
  // paint would not hydrate) and never as a synchronous setState in the effect body. A peek never
  // forgets, so Strict Mode's double setup costs nothing: only [Handed back] ends an entry.
  //
  // Critic F4 — an entry stands for a shift now, so a mount takes focus only for something THIS
  // document has not said yet (`announceHandBacks`: a navigation back re-shows it quietly), and never
  // pulls focus out of where someone already put it (a pane a hash opened, another zone): only from
  // <body>.
  //
  // ⚠️ Blind review (M1 · K1 · C1) — and only for an entry THIS document wrote (`writtenHere`): a late
  // answer that landed while the zone was away. An entry read back by a reload, by Next's reload on a
  // stale build or by a duplicated tab is shown as a QUESTION (`handBackKey`) and takes no focus: the
  // money may already be out of the drawer, and pulling a manager onto "hand back $X" again is how a
  // guest is paid twice.
  useEffect(() => {
    const t = setTimeout(() => {
      const owed = repeek();
      if (owed.length === 0) return;
      setArmed(true);
      const free = document.activeElement === null || document.activeElement === document.body;
      if (free && announceHandBacks(owed.filter(writtenHere))) refocusBanner.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [repeek]);

  // A hand-back remembered by an answer this zone did not send — a refund sent from an earlier
  // mount of the zone, answering late after the manager came back — is said here at once, with
  // focus, rather than on some later mount. Like the answering zone (`refundSheetAfterAnswer`'s
  // hand-back rule, critic S1), it closes whatever sheet is open here first (critic F5): under an
  // open sheet the banner is aria-hidden and the sheet's focus trap takes its focus back. An entry
  // only AGING out of memory just re-reads the list.
  useEffect(
    () =>
      subscribeHandBacks((what) => {
        const owed = repeek();
        if (what === "expired" || owed.length === 0) return;
        setRefunding(null);
        refocusBanner.current = true;
        setArmed(true);
      }),
    [repeek],
  );

  // Codex r1 on #311 (P1) — the list on screen is re-read at the moment its first entry ends its
  // shift, WHEREVER that entry is held. A memory entry's own timer already told this zone (above);
  // an entry read back from the record had nothing, so a zone left mounted went on saying a
  // hand-back past its one-shift life. Quietly: a re-read takes no focus and closes no sheet
  // (`refocusBanner` is untouched), exactly like a memory entry aging out.
  useEffect(() => {
    const due = nextHandBackExpiryMs(owedBack, Date.now());
    if (due === null) return;
    const t = setTimeout(repeek, due);
    return () => clearTimeout(t);
  }, [owedBack, repeek]);

  /** [Handed back]: forget THAT entry (record and memory), say what is left, and put focus on it —
   *  or on the zone's heading when nothing is left to say. */
  const acknowledge = (lineId: string) => {
    ackHandBack(tabStore(), lineId);
    const left = repeek();
    if (left.length > 0 || confirmed !== null) refocusBanner.current = true;
    else refocusHeading.current = true;
  };

  // The CARD path's handoff still waits for the list, and correctly: the refreshed list is what
  // swaps the Refund button for the refunded mark and drops focus to <body>, so there is nothing
  // to re-home until it lands. On a failed refresh the button is still there and the sheet's own
  // focus restore is adequate — no instruction is stranded, because the card banner only reports.
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

  // What each owed instruction is called — its banner line and its [Handed back] say the same.
  const subjects = handBackSubjects(owedBack);

  const head = (
    <div style={headRow}>
      {/* echo={false}: this heading IS the section's accessible name (aria-labelledby reads the
          element's full text; an echo would name the region in both scripts at once). */}
      <h2 id="settled-h" tabIndex={-1} className="staff-zone-head">
        <Chrome lang={lang} k="floor.settled.head" />
      </h2>
      {/* §17 — never native `disabled` (it drops focus to <body> mid-tap): `aria-disabled` states
          what the handler refuses, and the dim stays. */}
      <button
        type="button"
        onClick={() => {
          if (reading || owed) return;
          void refresh();
        }}
        aria-disabled={reading || owed || undefined}
        aria-busy={reading || owed || undefined}
        className="staff-btn staff-press"
        style={{ ...refreshBtn, opacity: reading || owed ? 0.6 : 1 }}
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
        <div style={bannerWrap}>
          {/* The zone's ONE live region holds the words only; each [Handed back] sits outside it
              (a control inside a live region is announced as text) and is described by its line. */}
          <p role="status" ref={bannerRef} tabIndex={-1} style={confirmBanner}>
            {owedBack.map((h, i) => (
              <Fragment key={h.lineId}>
                {i > 0 && " "}
                <span id={handBackLineId(h.lineId)} style={bannerLine}>
                  <Chrome
                    lang={lang}
                    k={handBackKey(h)}
                    vars={{ m: dollars(h.cents), x: subjects[i] ?? "" }}
                  />
                </span>
              </Fragment>
            ))}
            {owedBack.length > 0 && confirmed !== null && " "}
            {confirmed !== null && (
              <span style={bannerLine}>
                <Chrome
                  lang={lang}
                  k="floor.settled.confirmed"
                  vars={{ m: dollars(confirmed.cents) }}
                />
              </span>
            )}
          </p>
          {owedBack.length > 0 && (
            <div style={ackRow}>
              {owedBack.map((h, i) => (
                <Button
                  key={h.lineId}
                  variant="secondary"
                  size="lg"
                  aria-describedby={handBackLineId(h.lineId)}
                  onClick={() => acknowledge(h.lineId)}
                >
                  {/* The subject rides the label — the same words as its line (dish · receipt, or
                      the figure), numbered when two still read alike: two instructions standing side
                      by side never offer two identical buttons, to the eye or to speech input
                      (critic F3 — the dish alone repeats across orders). */}
                  <Chrome lang={lang} k="floor.settled.handBack.done" echo="inline" />
                  <span style={ackSubject}> · {subjects[i]}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
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
                // ⚠️ The CARD confirmation is cleared on every attempt (Codex round 3 on #286, P1): a
                // report standing over a new attempt reads as that attempt's figure.
                //
                // Phase 2i (D5) SUPERSEDES the cash half of that rule: an owed hand-back is NOT
                // cleared here. It is the only copy of a drawer instruction that Next's reload on a
                // stale build can otherwise erase, so it stands until its own [Handed back] — and it
                // names its dish, which is what keeps it from reading as THIS attempt's figure.
                setConfirmed(null);
                setRefunding({ order: o, line });
              }}
            />
          )}
        />
      )}

      {/* M76 — the subject is HELD through the exit (`useSheetSubject`): the sheet stays mounted
          with `open=false` while it slides down, and `key` makes the next open a fresh instance
          (reason, PIN and lockout copy reset by remount, as before). */}
      {refund.held && (
        <RefundActionSheet
          key={refund.key}
          open={refund.open}
          order={refund.held.order}
          line={refund.held.line}
          onClose={() => setRefunding(null)}
          onDone={(refundedCents?: number) => {
            // Phase 2h · integration b — THIS sheet's subject, as the render that mounted it held it:
            // a LATE answer arrives through the tap-time closure, after the manager may have opened
            // another line's sheet, and must close only its own (`refundSheetAfterAnswer`) — unless
            // it asks for a drawer hand-back, which no open sheet may hide (critic S1).
            const subject = refund.held!;
            const orderId = subject.order.id;
            const path = subject.order.refundPath;
            const handBack = refundedCents != null && path === "cash";
            // ⚠️ Phase 2i (P2bi · D5) — FIRST, synchronously, before any state is set: write the
            // hand-back down. `refundLine` revalidates, so on a tab older than the server Next
            // reloads the page right after this handler — the banner below may never paint, and the
            // record is the only place the instruction survives. EVERY cash answer, mounted or not
            // (Phase 2h kept only a gone zone's): the banner reads the record, so it is said once.
            if (handBack) {
              // Storage refused → the lib holds it in the document's memory and holds an automatic
              // reload while it does (critic F1 · F2); not a hand-back at all → kept nowhere (F7).
              const hb = {
                lineId: subject.line.id,
                cents: refundedCents,
                name: subject.line.name,
                code: subject.order.code,
                at: Date.now(),
              };
              rememberHandBack(tabStore(), hb);
            }
            setRefunding((open) => refundSheetAfterAnswer(open, subject.line.id, handBack));
            if (refundedCents == null) {
              // A NO-OP — `already_refunded` or `fully_refunded`, nothing recorded. Leaving the
              // previous card confirmation standing would report a figure this attempt never moved.
              // An owed hand-back stays: it names its own dish and waits for its own [Handed back].
              setConfirmed(null);
            } else if (handBack) {
              // Said, with focus, by this zone's own hand-back listener (`subscribeHandBacks`), which
              // `rememberHandBack` told synchronously above — ONE path for an on-time answer, a late
              // one, and one heard by a newer mount (it also closes any open sheet: critic F5).
            } else {
              setConfirmed({ cents: refundedCents, path });
              refocusOrderId.current = orderId; // hand focus to the order header once the refresh lands
            }
            void refresh();
          }}
        />
      )}
    </section>
  );
}

/** The banner line a [Handed back] is described by (`aria-describedby`). */
const handBackLineId = (lineId: string) => `settled-hand-back-${lineId}`;

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
          <span style={{ fontWeight: "var(--fw-bold)" }}>
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
          <span style={{ fontWeight: "var(--fw-bold)", fontVariantNumeric: "tabular-nums" }}>
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
  // P2e review (A5) — the device's echo state, the value <Chrome> reads: every name below that
  // composes an echoed label takes it too, so the name follows the mode the label renders in.
  const echoes = useEchoesShown();
  // W23b — states the amount rather than crossing the line out: a clamped refund returns part of a
  // dish, and a strike-through would claim the whole of it came back.
  const mark = lineRefundLabel(l.refundedCents);
  return (
    <li style={lineRow}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span aria-hidden style={{ fontWeight: "var(--fw-bold)", color: "var(--ac-strong)" }}>
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
              shown: echoes,
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
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const sub: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 };
const countLine: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)" };
const warnText: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--warn)" };
const bannerWrap: CSSProperties = { display: "grid", gap: "var(--s2)" };
const bannerLine: CSSProperties = { display: "block" };
const ackRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--s2)" };
const ackSubject: CSSProperties = { fontWeight: "var(--fw-regular)" };
const confirmBanner: CSSProperties = {
  minHeight: 18,
  margin: 0,
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
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
  fontWeight: "var(--fw-heavy)",
  textTransform: "uppercase",
  letterSpacing: "var(--track-caps)",
  color: "var(--t2)",
};
const body: CSSProperties = {
  margin: "10px 0 0",
  padding: "10px 0 0",
  borderTop: "1px solid var(--bd)",
  display: "grid",
  gap: 8,
};
const statusLine: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
};
const groupHead: CSSProperties = {
  margin: "4px 0 0",
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-heavy)",
  textTransform: "uppercase",
  letterSpacing: "var(--track-caps)",
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
const markStyle: CSSProperties = { color: "var(--warn)", fontWeight: "var(--fw-bold)" };
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
const rowGrand: CSSProperties = { ...row, fontWeight: "var(--fw-heavy)" };
const pathNote: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const refundBtn: CSSProperties = {
  flex: "none",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
