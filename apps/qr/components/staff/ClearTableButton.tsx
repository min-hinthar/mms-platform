"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Button, matchesFocusVisible } from "@mms/ui";
import { clearTable, getClearPreview } from "@/lib/floor";
import { boundRead, boundWrite, stalledSince } from "@/lib/bounded-write";
import { dropHandoffStash } from "@/lib/floor-pane";
import { useTableNav } from "./TableNav";
import { plural, tf } from "@/lib/i18n/fill";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
// ── PD7 · M182 ──
import { clearIsLoss, clearRefusalSays, type ClearPreview } from "@/lib/clear-table";
import {
  CLEAR_ARM_MS,
  clearWindowLeftMs,
  clearWindowStale,
  type ClearWatch,
} from "@/lib/clear-window";
import { capRelease, holdCapPhase, NO_HOLD, setHeld, type Hold } from "@/lib/undo-hold";
import type { StaffKeyMsg } from "@/lib/staff-send-view";
import type { ClearTableResult } from "@/lib/floor-types";
import { useOptionalCounterMint, type MintReservation } from "./CounterMintContext";
import { useTurnoverNews } from "./TurnoverNews";
import { padDishName } from "@/lib/order-pad";
import { SealEcho } from "./HandoffCard";
import type { FocusEvent } from "react";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

/**
 * Clear a table on turnover (S1.2). Two-step confirm (no accidental clear), and DISABLED with an honest
 * reason while a payment is in flight — the server refuses it regardless (the button gating is just the
 * affordance). On success the session is closed; we leave the now-defunct detail page for the floor.
 *
 * Phase 2h (P2fc) — the clear is awaited with a BOUND (`boundWrite`): a hung action used to leave
 * "Clearing…" up with Cancel natively disabled until a reload. Busy is state cleared in a `finally`,
 * every control is `aria-disabled` (never native), and the outcome is said honestly: a lost answer
 * "couldn't confirm" (the table may already be cleared), a slow one "no answer yet — don't clear it
 * again" with the reload beside it; the late answer still lands (a late clear leaves the table).
 * Until it does, "Clear table" is HELD (S2 critic D3): a second clear would only queue behind the
 * stuck one, so the guard stays spent and the trigger says why, described by the waiting line.
 *
 * Phase 2h review c (C6) — clearing is not money, but a late clear lands destructively ("possibly on
 * the NEXT party's order"), so it takes the money doors' 9d rule: on a STALLED tablet
 * (`stalledSince() !== null` — another action out past the bound) the confirm is refused BEFORE
 * anything is sent, said as `out.stalled` with the reload beside it. And a tap on the held trigger
 * while THIS clear waits re-says its own waiting line as a new node (announced again), never a dead
 * tap and never "this did nothing", which would drop "don't clear it again".
 */
/*
 * PD7 · M182 (m7 "Turn Signals", ruling #6) — a TABLE's clear is no longer a confirm. The tap takes a
 * FRESH LOOK (`getClearPreview`, the database's own read of what the kitchen has — Codex correction
 * 11: an unknown read clears NOTHING and says "couldn't check"). Nothing sent → straight into the
 * six-second window, "Clearing Table N" (§22 undo over confirm). Food SENT and unpaid → the LOSS
 * SLIP first: the dishes, their menu price, and "Did Table N pay?" — Take cash (the pane's ONE till,
 * opened through its own trigger) or "No — they left without paying", which reveals what the clear
 * records and the one danger commit ("Clear · $41.00 loss"), armed after the lane's 400 ms; the
 * commit opens the same window. The window writes nothing until it closes: Undo, a table that moved
 * under it (a join, a changed order, a payment starting), or this control unmounting all drop it —
 * the safe direction (m7 B9's alternative; the floor-card in-slot window is a named follow-up).
 * "Seat next party" reserves the screen's ONE mint lock at the tap (refused, out loud, when it is
 * held — corrections 5 · 9), sends the clear at once, and starts the next party only on its ok, in
 * the pane at split width (correction 6); a refused clear hands the lock back. The outcome is said
 * on the FLOOR (`TurnoverNews`, m7 B10): the pane leaves with the table. A COUNTER order keeps the
 * two-step confirm below ("They didn't come" is its loss exit).
 */
export function ClearTableButton({
  sessionId,
  label,
  paymentInFlight,
  counterOrder = false,
  tableNumber = null,
  watch,
  onSlip,
  onTakeCash,
  headingLevel = 3,
  cardOnFile = false,
  tableGone,
}: {
  sessionId: string;
  label: string;
  paymentInFlight: boolean;
  /** A counter order: the two-step confirm and `mms_clear_counter_cart` (no look, no window). */
  counterOrder?: boolean;
  /** The table's registered number — "Seat next party" needs one (an unregistered sticker has none). */
  tableNumber?: number | null;
  /** What the window watches on the table (the detail's members, lines, payment state). */
  watch?: ClearWatch;
  /** The loss slip is armed (true) or gone (false): the page demotes its settle trigger while it
   *  is, so one hero verb stands per state (m7 B12). */
  onSlip?: (armed: boolean) => void;
  /** The slip's "Take cash" door: the pane's ONE till, opened through its own trigger (m7 B3).
   *  Absent where that till is not offered — the door is not drawn. */
  onTakeCash?: () => void;
  /** The slip heading's level: the settle section's own (the page's h2, the pane's h3). */
  headingLevel?: 2 | 3;
  /** The tab is SECURED (a card on file): an armed loss slip drops, and says the card pays — its
   *  sent food is never a walkout (`secure_tab`; the second blind pass on #341). */
  cardOnFile?: boolean;
  /** Set by the page when its read found the table CLOSED (cleared, merged or swept elsewhere) —
   *  read as this control unmounts, so a window the table closed under is never "left". */
  tableGone?: { readonly current: boolean };
}) {
  const lang = useStaffLang();
  // Phase 2d · split — the exit is the page's or the pane's (`TableNav`), bound once.
  const nav = useTableNav();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 2f — a counter order whose food reached the kitchen unpaid is refused by code (`sent`):
  // the page's own sentence, which names the way out ("They didn't come"), not the server's English.
  const [sentRefused, setSentRefused] = useState(false);
  // Phase 2h — the clear's own outcome when no answer came: `unknown` (it threw — the answer was
  // lost) or `waiting` (still out at the bound). Kept apart from the server's sentence (`error`).
  const [unanswered, setUnanswered] = useState<"waiting" | "unknown" | null>(null);
  // Review c (C6) — the confirm was refused before dispatch on a stalled tablet (9d).
  const [stalled, setStalled] = useState(false);
  // Moves on every SAY — keys the alert's content so an equal sentence re-said is a new node.
  const [said, resay] = useReducer((n: number) => n + 1, 0);
  // The tap-time guard — a REF read when the finger lands (two taps in one frame both read the same
  // render), beside the `busy` the buttons say.
  const inFlight = useRef(false);
  // Whether this control is still mounted when a LATE answer lands. Re-armed at setup (Strict Mode).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // ── PD7 · the table path ──
  // `checking` — the fresh look is out; `slip` — a loss look, the fork asked (`walkout`: "No" taken);
  // `window` — the six seconds (`startedAt`, the watch at open); `committing` — the clear was sent.
  type TablePhase =
    | { k: "rest" }
    | { k: "checking" }
    | { k: "slip"; look: ClearPreview; walkout: boolean; at: number }
    | { k: "window"; look: ClearPreview; startedAt: number; watchAtOpen: ClearWatch | null }
    | { k: "committing" };
  const [phase, setPhase] = useState<TablePhase>({ k: "rest" });
  // A refusal or a check, in the dictionary's words (a Burmese console reads them).
  const [notice, setNotice] = useState<StaffKeyMsg | null>(null);
  const [hold, setHold] = useState<Hold>(NO_HOLD);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dropped, setDropped] = useState(0);
  const mint = useOptionalCounterMint();
  const news = useTurnoverNews();
  // The window's one commit: a ref, so the interval and a Seat next tap can never send it twice.
  const windowSent = useRef(false);
  // The window's own focus move onto Undo, and whether the tap that opened it was a keyboard's.
  const programmaticFocus = useRef(false);
  const kbAtOpen = useRef(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const slipHeadRef = useRef<HTMLHeadingElement>(null);
  const windowId = useId();
  const warnId = useId();
  const slipHeadId = useId();
  const slipBodyId = useId();
  const midPaymentId = useId();
  const alertId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Keep focus with the flow (S1-audit S6): into the confirm group when it opens, back to the trigger
  // when it closes — never dropped to <body> as the step unmounts. The `wasConfirming` guard avoids
  // grabbing focus on first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  /** The clear's answer, whenever it lands — at once, or after the bound (9e: never dropped). */
  function land(res: Awaited<ReturnType<typeof clearTable>>) {
    if (!res.ok) {
      setConfirming(false);
      setUnanswered(null);
      setError(res.error);
      setSentRefused(res.code === "sent");
      return;
    }
    // Session closed — return to the floor (this detail is now defunct). Phase 2a · tablet: the
    // floor BY NAME — a bare `/staff` resolves by the door cookie and could land on the doors.
    // Phase 2d · split: through `TableNav` — the page replaces to the floor; the pane closes. The
    // table's paid card leaves with it (a cleared table has no card to follow).
    dropHandoffStash(sessionId);
    nav.toFloor("cleared");
  }

  /**
   * The clear itself, bounded — ONE commit for both paths. A counter order sends no look (its own
   * SQL decides, `mms_clear_counter_cart`); a TABLE sends the look the staff member was shown
   * (`look`, PD7 · M182) and may carry the next party's reserved mint (`seat`), released whenever
   * the clear does not land.
   */
  async function confirm(look: ClearPreview | null = null, seat: MintReservation | null = null) {
    if (inFlight.current) return;
    // 9d — read AT THE TAP: sent now, the clear would queue behind the stuck action and land
    // whenever it releases. Nothing is sent; the confirm step stays open for Cancel.
    if (stalledSince() !== null) {
      seat?.release();
      if (look) setPhase({ k: "rest" });
      setStalled(true);
      resay();
      return;
    }
    setStalled(false);
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSentRefused(false);
    setUnanswered(null);
    if (look) setPhase({ k: "committing" });
    let left = false;
    // Still out at the bound: the guard stays spent until the late answer lands (docblock, D3).
    let outstanding = false;
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(
        clearTable(look ? { sessionId, expect: expectOf(look) } : { sessionId }),
      );
      if (out.kind === "answer") {
        left = out.value.ok; // a cleared table is leaving: stay busy until the swap
        if (look) landTable(out.value, seat);
        else land(out.value);
        return;
      }
      setConfirming(false); // the effect returns focus to the trigger, beside the line
      if (look) setPhase({ k: "rest" });
      if (out.kind === "threw") {
        seat?.release();
        console.error("[ClearTableButton] clear unconfirmed", out.error);
        setUnanswered("unknown");
        return;
      }
      setUnanswered("waiting");
      outstanding = true;
      // The bound passed with the clear still out: the next party's mint goes back NOW (the blind
      // pass on #341). Held until the late answer, a hung clear kept every Walk-up, Phone order and
      // table start on this screen refused with no reason shown — for as long as the action took,
      // or until a reload. So a late answer never starts that party; a late ok says so on the floor.
      const seatDropped = seat !== null;
      seat?.release();
      void out.late.then((late) => {
        // A detail that is gone has nothing to leave or say (a late clear is seen on the floor).
        if (!alive.current) return;
        // The answer is in: a refusal or a lost answer frees the guard; a clear leaves the table.
        if (late.kind !== "answer" || !late.value.ok) inFlight.current = false;
        if (late.kind !== "answer") setUnanswered("unknown");
        else if (look) landTable(late.value, null, seatDropped);
        else land(late.value);
      });
    } finally {
      // Busy frees AT THE BOUND (fact 3) — unless the table is leaving under this control; the
      // guard stays spent while the answer is still out (`outstanding`).
      if (!left) {
        if (!outstanding) inFlight.current = false;
        setBusy(false);
      }
    }
  }

  // ── PD7 · the table path ───────────────────────────────────────────────────────────────────

  /** The trigger's tap on a TABLE: the fresh look decides slip, window, or "couldn't check". */
  async function look() {
    if (inFlight.current) {
      // C6 — its own clear still waits: re-say "no answer yet — don't clear it again".
      if (unanswered === "waiting") resay();
      return;
    }
    if (phase.k !== "rest") return;
    setNotice(null);
    setError(null);
    setUnanswered(null);
    setStalled(false);
    setPhase({ k: "checking" });
    const out = await boundRead(getClearPreview({ sessionId }));
    if (!alive.current) return;
    const r = out.kind === "answer" ? out.value : null;
    if (r === null || r.kind === "unknown") {
      // Correction 11 — an unknown kitchen read is NEVER a no-loss clear: nothing is cleared.
      if (out.kind === "threw") console.error("[ClearTableButton] the look failed", out.error);
      setPhase({ k: "rest" });
      setNotice({ k: "settle.clear.checkFailed" });
      resay();
      return;
    }
    if (r.kind === "closed") {
      setPhase({ k: "rest" });
      setNotice({ k: "settle.clear.gone" });
      resay();
      return;
    }
    if (r.kind === "counter") {
      // A counter order reached this path (the page's flag was a read old): its own confirm.
      setPhase({ k: "rest" });
      setConfirming(true);
      return;
    }
    if (r.kind === "secure") {
      // A secured tab's SENT food is its saved card's to pay (the blind pass on #341): no slip and
      // no walkout — the pane's card door ("Close bill · card on file") is the way out.
      setPhase({ k: "rest" });
      setNotice({ k: "settle.clear.secureTab", vars: { id: label } });
      resay();
      return;
    }
    if (clearIsLoss(r.preview)) {
      setPhase({ k: "slip", look: r.preview, walkout: false, at: Date.now() });
      return;
    }
    openWindow(r.preview);
  }

  function openWindow(p: ClearPreview) {
    // Whether the control that opened the window was reached the KEYBOARD way: only then does the
    // window's own move of focus onto Undo hold it (a tap's script focus never does — undo-hold).
    const opener = document.activeElement;
    kbAtOpen.current = opener instanceof HTMLElement && matchesFocusVisible(opener);
    windowSent.current = false;
    setHold(NO_HOLD);
    const at = Date.now();
    setNowMs(at);
    setPhase({ k: "window", look: p, startedAt: at, watchAtOpen: watch ?? null });
  }

  /** Back to rest, nothing written; focus to the trigger (never <body>). */
  function backToRest(say: StaffKeyMsg | null = null) {
    setPhase({ k: "rest" });
    setHold(NO_HOLD);
    setNotice(say);
    if (say) resay();
    queueMicrotask(() => triggerRef.current?.focus());
  }

  /** Correction 5 · 9 — "Seat next party": the mint lock reserved FIRST (refused out loud when it is
   *  held, the table and its window as they were), then the clear sent now. */
  function seatNext(p: ClearPreview) {
    if (windowSent.current || !mint || tableNumber === null) return;
    const seat = mint.reserve(`table-${tableNumber}`);
    if (seat === null) {
      setNotice({ k: "floor.mint.waiting" });
      resay();
      return;
    }
    windowSent.current = true;
    void confirm(p, seat);
  }

  /** The clear's answer: a refusal in the dictionary's words, or the turn — said on the FLOOR.
   *  `seatDropped`: "Seat next party" was asked, but the answer came after the bound, which gave the
   *  mint back — the table is clear, the party was not started (said, with the way to start it). */
  function landTable(res: ClearTableResult, seat: MintReservation | null, seatDropped = false) {
    if (!res.ok) {
      seat?.release();
      setPhase({ k: "rest" });
      setUnanswered(null);
      if (res.code === "unreadable") {
        setUnanswered("unknown");
        return;
      }
      if (res.code !== undefined && res.code !== "sent") {
        setNotice({ k: clearRefusalSays(res.code).k, vars: { id: label } });
        resay();
        return;
      }
      setError(res.error);
      return;
    }
    dropHandoffStash(sessionId);
    if (seatDropped && tableNumber !== null) {
      news?.say({ k: "settle.clear.seatFailed", vars: { id: label } }, "warn");
      nav.toFloor("cleared");
      return;
    }
    const dishes = res.dishes ?? 0;
    news?.say(
      dishes > 0
        ? {
            k: plural(dishes, "settle.clear.freeLoss.one", "settle.clear.freeLoss.many"),
            vars: { id: label, n: dishes },
          }
        : { k: "settle.clear.free", vars: { id: label } },
    );
    if (seat && tableNumber !== null) {
      // The next party starts only now (a start before the close would find the OLD session), and
      // lands in the pane at split width — the floor's bell stays live (correction 6).
      seat.go(
        { kind: "table", tableNumber },
        {
          onStart: () => {},
          onRefusal: (n) => {
            // The table IS clear; the seat did not happen (or its answer is not in). Said out loud
            // on the floor, with the way to start the party by hand (correction 9).
            news?.say(
              typeof n !== "string" &&
                (n.k === "floor.mint.waiting" || n.k === "floor.mint.unknown")
                ? { k: n.k }
                : { k: "settle.clear.seatFailed", vars: { id: label } },
              "warn",
            );
            nav.toFloor("cleared");
          },
        },
      );
      return;
    }
    nav.toFloor("cleared");
  }

  // The slip is armed: the page demotes its settle trigger (one hero verb per state — m7 B12).
  const slipArmed = phase.k === "slip";
  useEffect(() => {
    onSlip?.(slipArmed);
  }, [slipArmed, onSlip]);
  useEffect(() => () => onSlip?.(false), [onSlip]);
  // Focus follows the step: the slip's heading when it opens, Undo when the window opens.
  useEffect(() => {
    if (phase.k === "slip" && !phase.walkout) slipHeadRef.current?.focus();
  }, [phase.k]); // eslint-disable-line react-hooks/exhaustive-deps -- the step, not its fields
  useEffect(() => {
    if (phase.k !== "window") return;
    programmaticFocus.current = true;
    undoRef.current?.focus();
    programmaticFocus.current = false;
  }, [phase.k]);

  // The window's clock: a short tick re-renders the seconds leaf, and the TICK commits when the
  // window runs out with nothing holding it — an event, never an effect body (one commit: the
  // `windowSent` ref, also spent by Undo, Seat next and a drop).
  const win = phase.k === "window" ? phase : null;
  const holdRef = useRef(hold);
  const commitRef = useRef(confirm);
  // Whether a window is open and unsent, and the floor's channel — read when this control LEAVES.
  const windowOpenRef = useRef(false);
  const leaveSayRef = useRef<(() => void) | null>(null);
  const goneRef = useRef(tableGone);
  useLayoutEffect(() => {
    holdRef.current = hold;
    commitRef.current = confirm;
    windowOpenRef.current = phase.k === "window";
    goneRef.current = tableGone;
    leaveSayRef.current = news
      ? () => news.say({ k: "settle.clear.windowLeft", vars: { id: label } }, "warn")
      : null;
  });
  // The window leaving with its pane (another table picked, the pane closed) sends nothing — the
  // safe direction (m7 B9's alternative) — and it is SAID on the floor, so nobody walks away from
  // "Clearing Table N" believing it finished (the blind pass on #341): the table is still open.
  useEffect(
    () => () => {
      if (windowOpenRef.current && !windowSent.current && !goneRef.current?.current)
        leaveSayRef.current?.();
    },
    [],
  );
  useEffect(() => {
    if (!win) return;
    // The controls arm at exactly the lane's 400 ms (never a tick late).
    const arm = setTimeout(() => setNowMs(Date.now()), CLEAR_ARM_MS);
    const id = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (windowSent.current || holdRef.current.sources.size > 0) return;
      if (clearWindowLeftMs(win.startedAt, holdRef.current, now) > 0) return;
      windowSent.current = true;
      void commitRef.current(win.look, null);
    }, 250);
    return () => {
      clearTimeout(arm);
      clearInterval(id);
    };
  }, [win]);
  const holdPhase = win ? holdCapPhase(hold, nowMs) : "none";
  if (win && holdPhase === "release") setHold(capRelease(hold, nowMs));
  const leftMs = win ? clearWindowLeftMs(win.startedAt, hold, nowMs) : 0;
  const armed = win !== null && nowMs - win.startedAt >= CLEAR_ARM_MS;
  // A table that moved under the window — a join, a changed order, a payment starting — drops it on
  // the spot, in the render that sees it (React's guarded set-during-render): nothing was sent, and
  // the server would refuse the same on its own (`p_seen_at`, the set compare, the money mutex).
  const stale =
    win && win.watchAtOpen && watch
      ? clearWindowStale(win.watchAtOpen, { ...watch, paying: paymentInFlight })
      : null;
  // A tab SECURED under the armed slip: its card pays for the sent food, so the slip (and its
  // walkout) drops in the render that sees it, saying so — the server would refuse the commit
  // (`secure_tab`) on its own.
  if (phase.k === "slip" && cardOnFile) {
    setPhase({ k: "rest" });
    setNotice({ k: "settle.clear.secureTab", vars: { id: label } });
    resay();
    setDropped((n) => n + 1);
  }
  if (win && stale !== null) {
    setPhase({ k: "rest" });
    setHold(NO_HOLD);
    setNotice(
      stale === "paying"
        ? { k: "settle.clear.midPayment" }
        : stale === "joined"
          ? { k: "settle.clear.joined", vars: { id: label } }
          : { k: "table.noshow.err.changed" },
    );
    resay();
    setDropped((n) => n + 1);
  }
  // A dropped window hands focus back to the trigger (never <body>).
  useEffect(() => {
    if (dropped > 0) triggerRef.current?.focus();
  }, [dropped]);

  // A focus that is `:focus-visible` holds the window (a touch never does — undo-hold's rule).
  const holdOn = (e: FocusEvent<HTMLButtonElement>) => {
    const keyboard = programmaticFocus.current
      ? kbAtOpen.current
      : matchesFocusVisible(e.currentTarget);
    if (keyboard) setHold((h) => setHeld(h, "slot", true, Date.now()));
  };
  const holdOff = () => setHold((h) => setHeld(h, "slot", false, Date.now()));
  // The slip's commit arms the lane's 400 ms after "No" is taken (a double tap never commits).
  const slip = phase.k === "slip" ? phase : null;
  const SlipH = headingLevel === 2 ? "h2" : "h3";
  useEffect(() => {
    if (!slip?.walkout) return;
    const id = setTimeout(() => setNowMs(Date.now()), CLEAR_ARM_MS);
    return () => clearTimeout(id);
  }, [slip?.walkout, slip?.at]);
  const commitArmed = slip !== null && slip.walkout && nowMs - slip.at >= CLEAR_ARM_MS;
  const committing = phase.k === "committing";

  const tableStep = slip ? (
    // ── the LOSS SLIP (m7 screen 2) — only after Clear was reached for, only with food SENT ──
    <section className="clear-slip" aria-labelledby={slipHeadId}>
      <SlipH id={slipHeadId} ref={slipHeadRef} tabIndex={-1} className="clear-slip-h">
        {/* The ONE loss mark: an outline diamond, decorative (the heading says the word). */}
        <span className="clear-slip-mark" aria-hidden />
        <Chrome lang={lang} k="settle.clear.loss.head" echo={false} />
        <SealEcho lang={lang} k="settle.clear.loss.head" className="clear-slip-echo" />
      </SlipH>
      <p className="clear-slip-sub">
        <Chrome lang={lang} k="settle.clear.loss.sent" echo="inline" />
      </p>
      <ul
        role="list"
        aria-label={tf(lang, "settle.clear.loss.sent", {})}
        className="clear-slip-list"
      >
        {slip.look.sent.map((l) => {
          const n = padDishName(lang, l.name, l.nameMy);
          return (
            <li key={l.id}>
              <span className="staff-qty">{l.qty}×</span>
              <span lang={n.lead.lang}>{n.lead.text}</span>
              {n.echo && (
                <span className="chrome-en" lang={n.echo.lang}>
                  {n.echo.text}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {slip.look.droppedUnits > 0 && (
        <p className="clear-slip-drafts">
          <Chrome
            lang={lang}
            k={plural(
              slip.look.droppedUnits,
              "table.noshow.body.drafts.one",
              "table.noshow.body.drafts.many",
            )}
            vars={{ n: slip.look.droppedUnits }}
            echo="stack"
          />
        </p>
      )}
      <dl className="clear-slip-total">
        <dt>
          <Chrome lang={lang} k="settle.clear.loss.total" echo="stack" />
        </dt>
        <dd>{fmtCents(slip.look.lossCents)}</dd>
      </dl>
      <p className="clear-slip-ask">
        <Chrome lang={lang} k="settle.clear.ask" vars={{ id: label }} echo="stack" />
      </p>
      <div className="clear-slip-doors">
        {onTakeCash && (
          <Button
            variant="secondary"
            onClick={() => {
              // The pane's ONE till, through its own trigger (every hold it keeps applies); the
              // slip stands down — paying IS the answer to its question.
              setPhase({ k: "rest" });
              onTakeCash();
            }}
          >
            <Chrome lang={lang} k="settle.cash.title" echo="stack" />
          </Button>
        )}
        {!slip.walkout && (
          <Button
            variant="secondary"
            aria-expanded={false}
            onClick={() => setPhase({ ...slip, walkout: true, at: Date.now() })}
          >
            <Chrome lang={lang} k="settle.clear.walkout" echo="stack" />
          </Button>
        )}
        <Button variant="quiet" onClick={() => backToRest()}>
          <Chrome lang={lang} k="settle.cancel" echo={false} />
        </Button>
      </div>
      {slip.walkout && (
        <div className="clear-slip-commit">
          <p id={slipBodyId}>
            <Chrome
              lang={lang}
              k={plural(
                slip.look.units,
                "settle.clear.loss.body.one",
                "settle.clear.loss.body.many",
              )}
              vars={{ n: slip.look.units }}
              echo="stack"
            />{" "}
            <Chrome lang={lang} k="settle.clear.loss.tail" echo="stack" />
          </p>
          {/* The one danger act, the sum named on it (§22); described by what it records. */}
          <Button
            variant="danger"
            size="lg"
            block
            disabled={!commitArmed}
            aria-describedby={slipBodyId}
            onClick={() => openWindow(slip.look)}
          >
            <Chrome
              lang={lang}
              k="settle.clear.loss.commit"
              vars={{ m: fmtCents(slip.look.lossCents) }}
              echo="stack"
            />
          </Button>
        </div>
      )}
    </section>
  ) : win || committing ? (
    // ── the WINDOW (m7 screen 1): nothing is written until it closes ──
    <div role="group" aria-labelledby={windowId} className="clear-window">
      <p id={windowId} className="clear-chip">
        <Chrome lang={lang} k="settle.clear.window" vars={{ id: label }} echo="inline" />
      </p>
      <div className="clear-window-cells">
        <Button
          ref={undoRef}
          variant="secondary"
          className="clear-undo"
          disabled={!armed}
          busy={committing}
          busyLabel={<Chrome lang={lang} k="settle.clear.clearing" echo={false} />}
          aria-describedby={holdPhase === "warn" ? warnId : undefined}
          onFocus={holdOn}
          onBlur={holdOff}
          onClick={() => {
            if (windowSent.current) return;
            windowSent.current = true;
            backToRest();
          }}
        >
          <Chrome lang={lang} k="kds.undo" echo="stack" />
          {win && (
            // The ONE in-slot countdown: a decorative seconds leaf (the window is not a timer read).
            <span className="clear-undo-left" aria-hidden lang={lang}>
              {" "}
              {tf(lang, "table.send.undoLeft", { n: Math.max(1, Math.ceil(leftMs / 1000)) })}
            </span>
          )}
        </Button>
        {mint && tableNumber !== null && (
          <Button
            variant="secondary"
            disabled={!armed || committing}
            onFocus={holdOn}
            onBlur={holdOff}
            onClick={() => {
              if (win) seatNext(win.look);
            }}
          >
            <Chrome lang={lang} k="settle.clear.seatNext" echo="stack" />
          </Button>
        )}
      </div>
      {holdPhase === "warn" && (
        // WCAG 2.2.1 — the one warning before a held window releases, said in its own alert and
        // describing the held Undo (never ranked under "Ready to serve" — m7 B11).
        <p id={warnId} role="alert" className="clear-warn">
          <Chrome lang={lang} k="settle.clear.holdWarn" vars={{ id: label }} echo={false} />
        </p>
      )}
    </div>
  ) : null;

  const waiting = unanswered === "waiting";

  if (paymentInFlight) {
    return (
      <div>
        {/* Phase 2h — `aria-disabled`, never native: a native disable drops a focused control's
            focus to <body> as the payment starts under it, and hides the reason from a screen
            reader. The note says why (its description); a tap does nothing. */}
        <button
          type="button"
          aria-disabled
          aria-describedby={midPaymentId}
          style={{ ...clearBtn, opacity: 0.5, cursor: "not-allowed" }}
        >
          <Chrome lang={lang} k="settle.clear.btn" echo="stack" />
        </button>
        <p id={midPaymentId} style={hint}>
          <Chrome lang={lang} k="settle.clear.midPayment" echo="stack" />
        </p>
      </div>
    );
  }

  return (
    <div>
      {confirming ? (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={tf(lang, "settle.a11y.confirmClear", { id: label })}
          style={{ ...confirmRow, outline: "none" }}
        >
          <span style={{ fontSize: "var(--fs-sm)" }}>
            {/* Inline echo, not stacked: this row is a flex line with the two buttons beside it,
                and a stacked pair would push its height. */}
            <Chrome lang={lang} k="settle.clear.question" vars={{ id: label }} echo="inline" />
          </span>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            {/* aria-disabled + the handlers' guards (§17, K35) — never native `disabled`, which drops
                focus to <body> under the tap; busy frees at the bound, so neither is stranded. */}
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setConfirming(false);
              }}
              aria-disabled={busy || undefined}
              style={cancelBtn}
            >
              <Chrome lang={lang} k="settle.cancel" echo={false} />
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              style={clearBtn}
            >
              {busy ? (
                <Chrome lang={lang} k="settle.clear.clearing" echo={false} />
              ) : (
                <Chrome lang={lang} k="settle.confirm" echo="stack" />
              )}
            </button>
          </div>
        </div>
      ) : tableStep ? (
        tableStep
      ) : (
        // Held while this clear is still unanswered (aria-disabled + the handler's guard, never
        // native), and described by the waiting line that says why.
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            // PD7 — a TABLE's tap takes the fresh look (slip, window, or "couldn't check").
            if (!counterOrder) {
              void look();
              return;
            }
            if (inFlight.current) {
              // C6 — its own clear still waits: re-say "no answer yet — don't clear it again".
              if (waiting) resay();
              return;
            }
            setConfirming(true);
          }}
          aria-disabled={waiting || undefined}
          aria-describedby={waiting ? alertId : undefined}
          aria-busy={phase.k === "checking" || undefined}
          style={waiting ? { ...clearBtn, opacity: 0.5, cursor: "not-allowed" } : clearBtn}
        >
          {phase.k === "checking" ? (
            <Chrome lang={lang} k="settle.clear.checking" echo={false} />
          ) : (
            <Chrome lang={lang} k="settle.clear.btn" echo="stack" />
          )}
        </button>
      )}
      {/* Assertive alert (not a polite live region) so the detail view keeps ONE polite region — its
          shared line-edit status; parity with CashSettle/Merge (S1-audit S5). */}
      {(error || unanswered || stalled || notice) && (
        <p id={alertId} role="alert" style={{ ...hint, color: "var(--warn)" }}>
          {/* Keyed by `said`: a re-said sentence replaces the node, so it is announced again. */}
          <span key={said}>
            {unanswered === "waiting" ? (
              <Chrome lang={lang} k="settle.clear.waiting" echo={false} />
            ) : unanswered === "unknown" ? (
              <Chrome lang={lang} k="settle.clear.unknown" echo={false} />
            ) : stalled ? (
              <Chrome lang={lang} k="out.stalled" echo={false} />
            ) : notice ? (
              // PD7 — a check or a refusal, in the dictionary's words.
              <Chrome lang={lang} k={notice.k} vars={notice.vars} echo={false} />
            ) : sentRefused ? (
              <Chrome lang={lang} k="settle.clear.counterSent" echo="stack" />
            ) : (
              <OutageText lang={lang} error={error ?? ""} />
            )}
          </span>
        </p>
      )}
      {/* Phase 2h — the waiting line says "reload the page", and the console is installed standalone
          (no browser reload): the one way out sits BESIDE the alert, never inside it. */}
      {(waiting || (stalled && unanswered === null)) && (
        <div style={{ marginTop: "var(--s2)" }}>
          <ReloadButton lang={lang} />
        </div>
      )}
    </div>
  );
}

const clearBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  cursor: "pointer",
};
const confirmRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
};
const hint: CSSProperties = { margin: "8px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" };

/** The look a table's clear carries — the dishes and the figure shown, and the clock they were read on. */
const expectOf = (p: ClearPreview) => ({
  lineIds: p.sent.map((l) => l.id),
  lossCents: p.lossCents,
  seenAt: p.seenAt,
});

const fmtCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
