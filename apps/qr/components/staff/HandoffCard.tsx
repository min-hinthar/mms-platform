"use client";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { CounterPass, Icon, buttonClass } from "@mms/ui";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { laneHref } from "@/lib/staff-more";
import { handoffRows, type HandoffRow } from "@/lib/register-math";
import type { Handoff } from "@/lib/register-ui";
import { handoffCode } from "@/lib/reader-collect";
import { readHandoffStash, sealNavNow, takeHandoffFocus, takeSealLanding } from "@/lib/floor-pane";
import { TILL_MEDIA, sealHeroTier, sealAdopt } from "@/lib/till";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { echoDrawn } from "@/lib/staff-labels";
import { STAFF, ts, type StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { ReaderShown } from "./ReaderCollectContext";
import { useEchoesShown } from "./StaffLangProvider";

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

/** PD6 — the code stub's two-tongue label (the CounterPass's own label over its figure). */
const CODE_LABEL: { en: string; my: string } = {
  en: STAFF["table.detail.handoff.codeLabel"].en,
  my: STAFF["table.detail.handoff.codeLabel"].my,
};

/**
 * PD6 (m6 B5/B6 · D2) — a visual English echo that stays OUT of the accessible name: the seal's title
 * and its hero word are `aria-labelledby` targets, so a `<Chrome>` echo would put both scripts in
 * the name. The echo is drawn through Chrome's own decision (`echoDrawn` — a K15-HIGH word like
 * "Change" keeps its English on a Burmese-only device; "Paid" does not) and hidden from assistive
 * tech, so the name keeps one script per run.
 */
export function SealEcho({
  lang,
  k,
  className = "staff-seal-echo",
}: {
  lang: StaffLang;
  k: StaffKey;
  /** The echo's own look (the seal's by default; the till's slip heading passes its own). */
  className?: string;
}) {
  const shown = echoDrawn(k, useEchoesShown());
  if (lang !== "my" || !shown) return null;
  return (
    <span className={`chrome-en ${className}`} lang="en" aria-hidden="true">
      {ts("en", k)}
    </span>
  );
}

/**
 * The paid card — PD6's SEAL (m6 "Shape of the Sale", DESIGN-LANGUAGE §29): the moment after a
 * settle, its two facts at the size a cashier reads across the counter — the CHANGE to hand back and,
 * on a counter order, the #CODE to call out, on the ONE PASS (the CounterPass primitive, rendered,
 * never redrawn: the stub on constant paper beside the seal's own green). A dine-in settle gets the
 * same grammar with no stub, no #CODE and no Walk-up (reconciliation 4).
 *
 * The figures: Total and Tip are the persisted ones the settle returned; Cash received and Change are
 * what the cashier entered, kept in this tab only (m6 B8). The hero is the Change (or what is still to
 * collect) when a tender was entered, else the Total — and with no tender there is no Change and no
 * Cash received at all (Codex round 4 on m6).
 *
 * Not a live region. It is FOCUSED when it appears (the parent's effect — the settle control it
 * replaced has unmounted), and its accessible NAME carries the facts: `aria-labelledby` = the title,
 * the hero row and the #CODE. The name is always spoken on focus; a description is a VoiceOver HINT,
 * spoken after a pause and silenced by the "Speak Hints" setting, so the facts are not left there.
 *
 * `landing` — the in-place landing (or a same-tab reload whose stash names this order): the green
 * wash, ONE bloom on the ✓ disc and the rise, each RM-escorted. Every other render (a revisit, a deep
 * link, the reader chip's View) is the CALM seal: the same geometry on paper, the ✓ disc kept, no
 * wash, no bloom, no rise — green is filled only on the screen where it just landed (m6 B6).
 *
 * Wide (the till's own viewport predicate, `TILL_MEDIA`, and never in the pane): the stub sits beside
 * the green main and the actions take the till grid's money corner (track 5), so a late tap from the
 * tray's Take (tracks 1–3) lands on inert space — the geometry `lib/till.ts` pins. Narrow: stacked.
 */
export function HandoffCard({
  lang,
  handoff,
  ref,
  onDone,
  headingLevel = 2,
  landing = false,
  next,
  nativeBack = false,
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
  /** PD6 — this settle just landed here (or a matching same-tab stash came back on reload). */
  landing?: boolean;
  /** PD6 — the pad's quiet secondary (Walk-up, with its note); absent off the pad. One quiet
   *  secondary only: a counter order whose food went early shows Takeaway bags in its place. */
  next?: ReactNode;
  /** PD6 — the next start is unanswered past its bound: "Back to the counter" becomes a
   *  full-document `<a>`, so the way out also clears the stuck action queue. */
  nativeBack?: boolean;
}) {
  const Title = headingLevel === 3 ? "h3" : "h2";
  const inPane = onDone !== undefined;
  const wide = useMediaQuery(TILL_MEDIA) && !inPane;
  const rows = handoffRows(handoff.totalCents, handoff.tipCents, handoff.tenderedCents);
  // The HERO: the change (or what is still owed) when a tender was entered, else the total — the
  // one figure a cashier needs from the seal. The rest are the count-back rows under it.
  const hero = rows.find((r) => r.k === "change" || r.k === "collect") ?? rows[0]!;
  const foot = rows.filter((r) => r !== hero);
  // The #CODE, derived ONCE (`handoffCode`) — the chip, this card and the refunded line agree.
  const code = handoffCode(handoff.orderId);
  // Phase 2f — a counter order whose food went to the kitchen BEFORE it was paid: the bag is already
  // on the Takeaway bags lane (or cooking toward it), so the card says where to hand it over from.
  // It never says the food is READY (owner 7d — no auto-advance): the lane says that.
  const sentEarly = handoff.isCounter && handoff.sentEarly === true;
  const labelledBy = [
    "handoff-title",
    `handoff-row-${hero.k}`,
    handoff.isCounter ? "handoff-code" : null,
    sentEarly ? "handoff-sent-early" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const heroText = fmt(hero.cents);
  const callout = (
    <p className="staff-seal-callout">
      <Chrome lang={lang} k="table.detail.handoff.callout" echo="stack" />
    </p>
  );
  const passHeading = headingLevel === 3 ? 4 : 3;
  // A dine-in seal shows "Back to the counter" only in the counter's pane (where the counter is
  // beside it); a server's phone page keeps the rows-only card's quiet (no promise of a counter).
  const showBack = handoff.isCounter || inPane;
  const backClass = buttonClass({
    variant: "primary",
    size: "xl",
    className: "staff-handoff-done",
  });
  const backLabel = (
    <>
      <span>
        <Chrome lang={lang} k="table.detail.handoff.done" echo="stack" />
      </span>
      <span aria-hidden="true" className="ui-btn-arrow-fwd">
        →
      </span>
    </>
  );
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      className={`staff-seal${landing ? " mms-rise" : ""}`}
      data-landing={landing ? "" : undefined}
      data-counter={handoff.isCounter ? "" : undefined}
      data-wide={wide ? "" : undefined}
    >
      <div className="staff-seal-body">
        <div className="staff-seal-main">
          <div className="staff-seal-head">
            {/* The solid ✓ disc: "paid" on the counter (never an approval). Decorative — the title
                word is the state. Its one breath plays only on a landing. */}
            <span className="staff-seal-disc" aria-hidden="true">
              <Icon name="check" size={wide ? 44 : 28} strokeWidth={2.25} />
            </span>
            {/* `echo={false}`: an aria-labelledby target — the visual echo stays out of the name. */}
            <Title id="handoff-title" className="staff-seal-title">
              <Chrome lang={lang} k="table.detail.handoff.title" echo={false} />
              <SealEcho lang={lang} k="table.detail.handoff.title" />
            </Title>
          </div>
          <dl className="staff-seal-hero" data-row={hero.k}>
            <div id={`handoff-row-${hero.k}`}>
              <dt>
                {hero.k === "collect" && <Icon name="alert" size={28} aria-hidden />}
                <Chrome lang={lang} k={ROW_KEY[hero.k]} echo={false} />
                <SealEcho lang={lang} k={ROW_KEY[hero.k]} />
              </dt>
              <dd data-tier={sealHeroTier(heroText, wide)}>{heroText}</dd>
            </div>
          </dl>
          {foot.length > 0 && (
            <dl className="staff-seal-rows">
              {foot.map((r) => (
                <div
                  key={r.k}
                  className={`checkout-leader-row staff-seal-row staff-seal-row-${r.k}`}
                >
                  <dt>
                    <Chrome lang={lang} k={ROW_KEY[r.k]} echo="inline" />
                  </dt>
                  <dd>{fmt(r.cents)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {/* The #CODE stub IS the CounterPass (m6 B2 · round 3 D): constant paper in both themes, the
            code face at `--fs-pass` in landscape (a portrait paper steps a long code down), its
            notches cut to the seal's own ground (`--pass-hole`). */}
        {handoff.isCounter &&
          (wide ? (
            <CounterPass
              tier="counter"
              orientation="landscape"
              figure={code}
              figureKind="code"
              label={CODE_LABEL}
              lang={lang}
              id="handoff-code"
              headingLevel={passHeading}
              stub={callout}
              className="staff-seal-pass"
            />
          ) : (
            <CounterPass
              tier="counter"
              orientation="portrait"
              figure={code}
              figureKind="code"
              label={CODE_LABEL}
              lang={lang}
              id="handoff-code"
              headingLevel={passHeading}
              className="staff-seal-pass"
            >
              {callout}
            </CounterPass>
          ))}
      </div>
      {(sentEarly || next != null || showBack) && (
        <div className="staff-seal-actions">
          <div className="staff-seal-actions-in">
            {sentEarly && (
              <div className="staff-handoff-early">
                {/* `echo={false}`: an aria-labelledby target — an echo would put both scripts in the name. */}
                <p id="handoff-sent-early" className="staff-handoff-callout">
                  <Chrome lang={lang} k="table.detail.handoff.sentEarly" echo={false} />
                </p>
                {/* A NATIVE <a> (A4·3): the lane is a zone of the counter screen reached by its
                    fragment, which a client-side Link would not focus; in the pane it is a
                    same-page jump. */}
                <a
                  href={laneHref(onDone !== undefined)}
                  className={buttonClass({ variant: "secondary", size: "xl", block: true })}
                >
                  <Chrome lang={lang} k="expo.title" echo="stack" />
                </a>
              </div>
            )}
            {/* One quiet secondary only: Takeaway bags outranks Walk-up (m6 decision 20). */}
            {!sentEarly && next}
            {showBack &&
              (nativeBack ? (
                <a href={STAFF_DOOR_TARGET.counter} className={backClass}>
                  {backLabel}
                </a>
              ) : (
                <Link
                  href={STAFF_DOOR_TARGET.counter}
                  onClick={
                    onDone
                      ? (e) => {
                          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                            return;
                          e.preventDefault();
                          onDone();
                        }
                      : undefined
                  }
                  className={backClass}
                >
                  {backLabel}
                </Link>
              ))}
          </div>
        </div>
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
  // PD6 (m6 decision 24, appendix C · Codex correction 4) — a same-tab reload (or a K23 unlock)
  // after the pad's walk-up landed: THIS tab's stash, for THIS order, brings back what the cashier
  // entered (Cash received → Change) over the server's persisted Total and Tip (`sealAdopt` — never
  // the stash's total) — calm on every visit, and LANDING only on the first render after a same-tab
  // reload (the one-shot note, below). Anywhere else (another device, cleared storage,
  // another order) the server card stands, calm, with no invented Change. Read after mount, from a
  // scheduled callback (the server render cannot see the tab's storage).
  const [adopted, setAdopted] = useState<Handoff | null>(null);
  // The blind passes on #334 — the LANDING is a one-shot note beside the stash (`takeSealLanding`):
  // the first mount in a document RELOADED after the landing lands (`sealNavNow`); a client-side
  // revisit, and every later mount, is the calm seal.
  const [reLanded, setReLanded] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (takeHandoffFocus(sessionId, Date.now())) cardRef.current?.focus();
  }, [sessionId]);
  useEffect(() => {
    const id = setTimeout(() => {
      const a = sealAdopt(handoff, readHandoffStash(sessionId));
      setAdopted(a);
      setReLanded(
        a !== null && takeSealLanding(sessionId, handoff.orderId, Date.now(), sealNavNow()),
      );
    }, 0);
    return () => clearTimeout(id);
  }, [sessionId, handoff]);
  return (
    <>
      <ReaderShown
        sessionId={sessionId}
        onLanded={(h) => {
          if (h) setLanded(h);
        }}
      />
      <HandoffCard
        lang={lang}
        handoff={landed ?? adopted ?? handoff}
        landing={landed === null && reLanded}
        headingLevel={2}
        ref={cardRef}
      />
    </>
  );
}
