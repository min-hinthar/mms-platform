"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { BRAND_NAME } from "@/lib/brand";
import {
  boardColumnFit,
  distinctNames,
  stepDownTables,
  tablesFitStart,
  viewTables,
  type FitRow,
  type FitTable,
  type TablesView,
} from "@/lib/board-fit";
import { useWakeLock } from "@/lib/useWakeLock";
import { raceFetch } from "@/lib/staff-outage";
import {
  BOARD_FAIL_THRESHOLD,
  nextBoardStateOnFailure,
  readBoardRefusal,
  type BoardVerdictReason,
} from "@/lib/board-poll";
import {
  MOTION_STEP_MS,
  planBoardMotion,
  type MotionMemory,
  type MotionStep,
} from "@/lib/board-motion";
import type { BoardDishStage, BoardTable } from "@/lib/board-tables";
import { STAFF, ts } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import { Chrome } from "@/components/staff/Chrome";
import type { StaffLang } from "@/lib/staff-lang";
import type React from "react";
import { KdsChime } from "@/lib/kds-sound";
import { buttonClass, CounterPass, KitchenTrack } from "@mms/ui";

/** Where an unlinked wall sends its manager — back to this board once signed in. */
const BOARD_SIGNIN_PATH = "/staff/login?next=/board";

/**
 * The dining room's wall TV (/board on any smart-TV browser). W3e built it as the order-ready board
 * — Preparing | Ready for the pickup codes; PD9 (the owner's 2026-10-07 message; PATH_DESIGN decision
 * 11; m9) adds the KITCHEN: every dine-in table with food in the kitchen as a landscape CounterPass,
 * its dishes on the ONE KITCHEN TRACK (Sent · Cooking · Served), beside the codes.
 *
 * Polls the sanitized /api/board read every 5 s (the TV can't join the private realtime channels).
 * What the wall shows is the payload's and nothing more: a table number and dish names, a code and
 * its status — no guest name, price, count, clock, age, ETA, approval or Undo word (the boundary is
 * `lib/board-tables.ts`'s type and the route's allowlist; this component may only render LESS).
 *
 * It never nags: Sent and Cooking are marks, Served is calm (green), and the pickup Ready pass is the
 * wall's only call. It moves only when food changes state, one thing at a time (`lib/board-motion.ts`):
 * a segment FILLs, a table TURNs once per visit when its last dish is served (after Mom's 6-second
 * Undo — the server's `KDS_UNDO_MS`), a code is issued Ready with the shipped FLASH and chime. A first
 * read and the first read after a frozen spell play nothing. A stale feed dims the wall and says so:
 * codes and dish names do not rot and stay, drawn frozen; every stage, roll-up and flash goes; and a
 * table's presence rots on the linger clock, so past it the kitchen half keeps only its sentence.
 *
 * A missing/unauthorized token renders the not-linked state, never a spinner forever.
 */

/** One bag on the wall: its code and its status. No name, no wait, no time (m9 decision 19, B4). */
type BoardOrder = { code: string; status: "preparing" | "ready" };

type BoardState =
  | { kind: "loading" }
  /**
   * A verdict about THIS DEVICE, carrying the server's own sentence. The message matters because the
   * two verdicts need different instructions and the board cannot tell them apart on its own: a
   * `denied` board has a device link it is not using, a `not_configured` board has none to use and
   * its operator must sign in instead.
   */
  | { kind: "unlinked"; reason: BoardVerdictReason; message: string | null }
  /**
   * We could not reach the server AT ALL and have no snapshot to fall back on — a board that booted
   * into an outage. `escalated` is computed by the fold rather than at render (`Date.now()` in a
   * render body is impure and React Compiler rejects it).
   */
  | { kind: "offline"; since: number; fails: number; escalated: boolean }
  /**
   * `tables` is `BoardTable[] | null`, and the null is LOAD-BEARING: it is the route's answer when a
   * kitchen read dropped (or an older server that sends none), and it renders as "can't read the
   * kitchen", never as "all clear" over a full wok. `lastGoodAt` / `frozenExpired`: the fold's
   * bound on how long a stale wall keeps its frozen passes (`lib/board-poll.ts`).
   */
  | {
      kind: "live";
      orders: BoardOrder[];
      tables: BoardTable[] | null;
      /** True only when the server read NO food of any channel on the wok — the one fact "All clear"
       *  may say (the blind pass on #336). `null`: not known (an older server, or `tables` is null). */
      kitchenIdle: boolean | null;
      stale: boolean;
      lastGoodAt?: number;
      frozenExpired?: boolean;
    };

/** The stage words — the ONE KITCHEN TRACK's keys, identical on every surface (the KDS's Served). */
const STAGE_KEY = {
  sent: "table.line.state.fired",
  cooking: "table.line.state.inProgress",
  served: "table.line.state.served",
} as const satisfies Record<BoardDishStage, string>;
const stageWord = (s: BoardDishStage) => STAFF[STAGE_KEY[s]];

export function ReadyBoard({ token, lang }: { token: string; lang: StaffLang }) {
  // A tokenless board is no longer knowably unlinked at mount: a staff sign-in on the device is now
  // a credential too (`authorizeDevice`), and that lives in a cookie the client can't read. So it
  // starts LOADING and lets the server answer (Codex round 1, P1).
  const [state, setState] = useState<BoardState>({ kind: "loading" });
  /**
   * PD9 — the motion memory (`planBoardMotion`) and the queue it fills. `null` until the first good
   * poll, which therefore SEEDS (no storm after a reboot); reset to `null` whenever the feed went
   * stale, so the first good poll after a frozen spell seeds again (m9 critic B6).
   */
  const memory = useRef<MotionMemory | null>(null);
  const [motion, setMotion] = useState<{ steps: MotionStep[]; i: number; nonce: number }>({
    steps: [],
    i: 0,
    nonce: 0,
  });
  const fails = useRef(0);
  /**
   * The concurrent-poll lock every other staff board already has (`lib/staff-outage.ts` documents the
   * idiom). Without it a slow poll overtaken by a newer one rewinds the motion memory, so the next
   * tick re-announces a bag already called: a second flash and a second chime for a bag someone
   * collected.
   */
  const inFlight = useRef(false);
  // board-4 — the sound chip is a TOGGLE that stays mounted. `soundOn` drives the chip; the ref is
  // what the poll reads (`poll` is a `useCallback` over `token` alone).
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  // The TV's browser refused audio: said ONCE through the one status node, then the node goes back
  // to the poll state. The chip stays live — a manager who fixes the TV's audio must be able to try
  // again.
  const [soundNote, setSoundNote] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One arm at a time: two taps inside `await arm()` both took the arm path and both played the
  // confirmation tone (the blind pass, slice 5).
  const arming = useRef(false);
  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );
  const chime = useRef<KdsChime | null>(null);

  useWakeLock(); // a TV browser tab must never sleep mid-service

  const poll = useCallback(async () => {
    if (inFlight.current) return; // a tick that overtakes its predecessor rewinds prevReady — see the ref
    inFlight.current = true;
    try {
      // Always polls, token or not: an empty `k` is the staff-session path, which only the server
      // can adjudicate. Raced against a timeout so a hung socket becomes a rejection (the honest
      // offline path) instead of holding the lock and silently stopping the board mid-service.
      // `raceFetch`: a route-handler fetch is not in Next's action queue, so it is never put on the
      // stall ledger (Phase 2h review c, C1).
      const res = await raceFetch(
        fetch(`/api/board?k=${encodeURIComponent(token)}`, { cache: "no-store" }),
      );
      if (res.status === 401 || res.status === 503) {
        // 401 and a `not_configured` 503 are verdicts about the DEVICE — say so. An `unavailable`
        // 503 is the auth service being unreachable, which is not a verdict about anything: fall
        // through to the retry path so a running display keeps its last-known orders instead of
        // blanking mid-service on a blip (W10b; Codex round 1, P2).
        //
        // ⚠️ A verdict must actually BE one. Not every 401/503 reaching this branch came from our
        // route: a platform-level 503 (Vercel throttle, a paused deployment, any upstream gateway)
        // carries an HTML error page, so `res.json()` rejects and `body` is null — and the first cut
        // wrote `body?.reason !== "unavailable"`, where `undefined !== "unavailable"` is TRUE. A
        // blip that said nothing about the device destroyed a live snapshot and told the house the
        // screen was never linked. An absent body is "we can't tell", which is the retry path
        // (adversarial pass; the same W10b shape one layer further out).
        const body = (await res.json().catch(() => null)) as {
          reason?: string;
          error?: string;
        } | null;
        const refusal = readBoardRefusal(res.status, body);
        if (refusal.kind === "verdict") {
          // P2 — carry the REASON, not just the server's English sentence: a Burmese board renders
          // its own copy per reason, and falls back to `message` for a reason it has not learned.
          setState({ kind: "unlinked", reason: refusal.reason, message: refusal.message });
          return;
        }
        throw new Error("board poll: no verdict available");
      }
      if (!res.ok) throw new Error(`board poll ${res.status}`);
      // `tables` is read DEFENSIVELY (`?? null`): a TV is the longest-lived client in the building
      // and can be served an older deploy mid-rollout, which sends no `tables` — and an `undefined`
      // there must read "can't read the kitchen", never throw inside render.
      const data = (await res.json()) as {
        orders?: BoardOrder[];
        tables?: BoardTable[] | null;
        kitchenIdle?: boolean | null;
      };
      const orders = (data.orders ?? []).map((o) => ({ code: o.code, status: o.status }));
      const tables = data.tables ?? null;
      // Read STRICTLY: only a literal `true` lets the wall say "All clear" (an older server sends none).
      const kitchenIdle =
        data.kitchenIdle === true ? true : data.kitchenIdle === false ? false : null;
      fails.current = 0;
      const plan = planBoardMotion(
        memory.current,
        tables,
        orders.filter((o) => o.status === "ready").map((o) => o.code),
      );
      memory.current = plan.memory;
      // Muted (the toggle off) is silent; a table going all served never chimes (m9 decision 15) —
      // only a bag turning Ready, the shipped pickup tone.
      if (plan.steps.some((s) => s.kind === "flash") && soundOnRef.current)
        chime.current?.play("pickup");
      // The next poll lands any backlog as final frames: a new plan replaces the queue.
      setMotion((m) => ({ steps: plan.steps, i: 0, nonce: m.nonce + 1 }));
      setState({ kind: "live", orders, tables, kitchenIdle, stale: false, lastGoodAt: Date.now() });
    } catch {
      fails.current += 1;
      // A stale wall re-seeds its motion on recovery: what went out while it was blind is drawn at
      // its final frame, never celebrated late.
      if (fails.current >= BOARD_FAIL_THRESHOLD) memory.current = null;
      // The fold lives in `lib/board-poll.ts` so it can be tested: keep a live board's snapshot and
      // admit staleness after two misses (bounding the frozen passes to the linger); move a board
      // that has NO snapshot to `offline`.
      setState((prev) => nextBoardStateOnFailure(prev, fails.current, Date.now()) as BoardState);
    } finally {
      inFlight.current = false; // released on EVERY exit, including the verdict return above
    }
  }, [token]);

  useEffect(() => {
    // First poll deferred a tick (setState stays in timer callbacks, never the effect body).
    const first = setTimeout(() => void poll(), 0);
    const id = setInterval(poll, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  // The motion player: ONE step at a time, each for its own duration (`MOTION_STEP_MS`); a new
  // poll's plan replaces the queue (`nonce`), so nothing queues behind a frozen tab.
  const active: MotionStep | null = motion.steps[motion.i] ?? null;
  useEffect(() => {
    if (active === null) return;
    const nonce = motion.nonce;
    const id = setTimeout(
      () => setMotion((m) => (m.nonce === nonce ? { ...m, i: m.i + 1 } : m)),
      MOTION_STEP_MS[active.kind],
    );
    return () => clearTimeout(id);
  }, [active, motion.nonce]);

  const toggleSound = async () => {
    if (soundOnRef.current) {
      soundOnRef.current = false;
      setSoundOn(false);
      return;
    }
    if (arming.current) return;
    arming.current = true;
    try {
      chime.current ??= new KdsChime();
      const ok = await chime.current.arm();
      if (!ok) {
        setSoundNote(true);
        if (noteTimer.current) clearTimeout(noteTimer.current);
        noteTimer.current = setTimeout(() => setSoundNote(false), SOUND_NOTE_MS);
        return;
      }
      soundOnRef.current = true;
      setSoundOn(true);
      chime.current.play("pickup");
    } finally {
      arming.current = false;
    }
  };

  if (state.kind === "unlinked") {
    return (
      <div className="orb-root dark orb-setup">
        <header className="orb-head">
          <h1 className="orb-title">{BRAND_NAME}</h1>
        </header>
        {/* P2 — the server's sentence is ENGLISH and this screen may be Burmese, so render OUR copy
            keyed on the reason. There are exactly two: `readBoardRefusal` returns a verdict only
            when the (status, reason) pair is one this client knows, so there is no third branch to
            write and no `message` fallback to reach — a reason the server invents later is a
            `retry`, not an unlinked board. `state.message` stays on the type as the server's own
            words for a future surface that wants them. */}
        <p className="orb-empty" lang={lang === "my" ? "my" : undefined}>
          {state.reason === "denied" ? ts(lang, "board.denied") : ts(lang, "board.notConfigured")}
        </p>
        {/* Phase 0 — the unlinked wall's ONE action is a real link (it was a path printed as prose,
            which nobody can follow on a TV with a remote). The path stays beneath it as the fallback
            for a manager typing it on another device; it rides the `{x}` slot, which <Chrome> marks
            `lang="en"` inside the Burmese run (board-5). */}
        <a
          href={BOARD_SIGNIN_PATH}
          className={buttonClass({ size: "xl", className: "orb-setup-cta" })}
        >
          <Chrome lang={lang} k="board.signin.cta" />
        </a>
        <p className="orb-empty orb-setup-hint">
          <Chrome lang={lang} k="board.signin" vars={{ x: BOARD_SIGNIN_PATH }} />
        </p>
      </div>
    );
  }

  if (state.kind === "offline") {
    // Never reached a snapshot, so there is nothing to keep showing and nothing to be stale about.
    // Past the shared escalation window, stop implying this is momentary — the floor needs to know
    // the screen is not coming back on its own. `escalated` is decided in the fold, not here: a
    // `Date.now()` in render is impure and React Compiler rejects it outright.
    return (
      <div className="orb-root dark">
        <header className="orb-head">
          <h1 className="orb-title">{BRAND_NAME}</h1>
        </header>
        <p className="orb-empty" role="status" lang={lang === "my" ? "my" : undefined}>
          {ts(lang, state.escalated ? "board.offline.still" : "board.offline")}
        </p>
      </div>
    );
  }

  const orders = state.kind === "live" ? state.orders : [];
  // A stale snapshot keeps its codes and dish names (they do not rot) and drops every stage, roll-up
  // and flash; past the linger it drops the tables too (`frozenExpired`).
  const stale = state.kind === "live" && state.stale;
  const ready = orders.filter((o) => o.status === "ready"); // the route's order: newest readiness first
  const preparing = orders.filter((o) => o.status === "preparing"); // next up first
  const tables =
    state.kind !== "live" || (state.stale && state.frozenExpired) ? null : state.tables;

  return (
    // board-2 — `data-stale` is the tell at three metres: the passes fall to dashed outlines and the
    // secondary ink, and the status line grows (globals.css); the ONE live region is unchanged.
    <div className="orb-root dark" data-stale={stale || undefined}>
      <header className="orb-head">
        <h1 className="orb-title">
          <span aria-hidden="true">✦</span> {BRAND_NAME}
        </h1>
        {/* ONE polite region, single-voice: poll state only. Pass changes are ambient and never
            announced — a TV is not a screen-reader surface, and one region keeps the page honest. */}
        <p className="orb-status" role="status" lang={lang === "my" ? "my" : undefined}>
          {soundNote
            ? ts(lang, "board.sound.refused")
            : state.kind === "loading"
              ? ts(lang, "board.connecting")
              : stale
                ? ts(lang, "board.reconnecting")
                : tf(lang, "board.status", { n: ready.length, total: preparing.length })}
        </p>
        {/* board-4 — one chip, both states, under the shared lit cap; the visible text IS the name. */}
        <button
          type="button"
          className="kds-chip staff-press"
          aria-pressed={soundOn}
          onClick={toggleSound}
          lang={lang === "my" ? "my" : undefined}
        >
          {ts(lang, soundOn ? "board.sound.on" : "board.sound")}
        </button>
      </header>

      <div className="orb-main">
        <KitchenSection
          lang={lang}
          known={state.kind === "live"}
          tables={tables}
          kitchenIdle={state.kind === "live" ? state.kitchenIdle : null}
          frozen={stale}
          active={active}
        />
        <div className="orb-pickup">
          <BoardColumn
            lang={lang}
            k="board.col.ready"
            orders={ready}
            empty={
              <p className="orb-empty" lang={lang === "my" ? "my" : undefined}>
                {ts(lang, "board.empty")}
              </p>
            }
            flash={!stale && active?.kind === "flash" ? active.code : null}
          />
          <BoardColumn
            lang={lang}
            k="board.col.preparing"
            orders={preparing}
            empty={<p className="orb-empty">—</p>}
            flash={null}
          />
        </div>
      </div>
    </div>
  );
}

/** How long the sound refusal holds the status node before it goes back to the poll state. */
const SOUND_NOTE_MS = 6_000;

/**
 * board-1 — rows a column can show, MEASURED, never a constant: the list's box divided by the
 * tallest rendered row. `Infinity` until both exist (an empty or unlaid-out column shows everything;
 * the CSS clip holds it on-screen meanwhile).
 *
 * ⚠️ THE BOX MUST NOT DEPEND ON THE ROWS. The `<ul>` is `flex: 1 1 auto` in its column (globals.css,
 * pinned by the suite), so its height is the column's remaining space whatever it holds. The first
 * cut measured a content-sized list — the flex default — and read its own output back: a new bag
 * shrank the shown rows, which shrank the box, which shrank the cap, down to a lone `+N more`; an
 * overflowing column cycled that forever (the blind pass, slice 5). The same reason every row is ONE
 * line (`.orb-name` ellipsizes): the division assumes rows of one height, and a wrapped name would
 * push the `+N more` row under the clip in silence.
 *
 * Re-measured on every snapshot (the effect keys on the orders array) and, via ResizeObserver, when
 * the list or any rendered row resizes — a TV that changes zoom. The `<ul>` is ALWAYS mounted so
 * the ref is stable (a conditional target breaks observers). The `+N more` row renders INSIDE the
 * list as its last item, which is why the fit reserves a slot for it and why the box never changes
 * as the row comes and goes. `setCap` with an unchanged value is a React no-op, so a re-measure
 * that finds the same cap does not re-render.
 */
function useColumnFit(orders: readonly BoardOrder[]): {
  ref: RefObject<HTMLUListElement | null>;
  cap: number;
} {
  const ref = useRef<HTMLUListElement>(null);
  const [cap, setCap] = useState(Infinity);
  useEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const rows = () => [...ul.querySelectorAll("li:not(.orb-more)")];
    const measure = () => {
      const box = ul.getBoundingClientRect().height;
      const rowH = Math.max(0, ...rows().map((r) => r.getBoundingClientRect().height));
      setCap(box > 0 && rowH > 0 ? Math.floor(box / rowH) : Infinity);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    for (const r of rows()) ro.observe(r);
    return () => ro.disconnect();
  }, [orders]);
  return { ref, cap };
}

/**
 * The pickup column's two lists. Ready codes are issued as passes — the landscape CounterPass at the
 * TV's 54px code row, the same face the guest's claim ticket shows (m3) — and arrive with the shipped
 * FLASH (on the pass's edge: a gold wash over paper would vanish, m9 critic C). Preparing codes are
 * plain rows: a code becomes a pass when it turns Ready. Each list keeps board-1's measured cut and
 * its "+N more" row.
 */
function BoardColumn({
  lang,
  k,
  orders,
  empty,
  flash,
}: {
  lang: StaffLang;
  k: "board.col.preparing" | "board.col.ready";
  orders: BoardOrder[];
  empty: React.ReactNode;
  flash: string | null;
}) {
  const { ref, cap } = useColumnFit(orders);
  const fit = boardColumnFit(orders.length, cap);
  const isReady = k === "board.col.ready";
  return (
    <section className={isReady ? "orb-col orb-col-ready" : "orb-col"} aria-label={ts(lang, k)}>
      <BilingualHeading lang={lang} k={k} />
      {orders.length === 0 && empty}
      <ul role="list" ref={ref}>
        {orders.slice(0, fit.shown).map((o) =>
          isReady ? (
            <CounterPass
              key={o.code}
              as="li"
              tier="tv"
              orientation="landscape"
              figure={`#${o.code}`}
              figureKind="code"
              figureSpoken={o.code.split("").join(" ")}
              label={{ en: STAFF["board.pass.code"].en, my: STAFF["board.pass.code"].my }}
              lang={lang}
              headingLevel={3}
              className={`orb-ready${flash === o.code ? " orb-ready-flash" : ""}`}
            />
          ) : (
            <li key={o.code} className="orb-card">
              <span className="orb-name">#{o.code}</span>
            </li>
          ),
        )}
        {fit.more > 0 && (
          // The room is told what the cut hid — the KDS's own `+N more` words, no new copy.
          <li className="orb-more" lang={lang === "my" ? "my" : undefined}>
            {tf(lang, "kds.more", { n: fit.more })}
          </li>
        )}
      </ul>
    </section>
  );
}

/**
 * PD9 — the kitchen half. Its heading row carries the KEY — the three tracks and their words, both
 * tongues, taught once and never repeated per row (the guests' static step guide; aria-hidden: each
 * dish's word carries its state) — or, when the kitchen cannot be read, the one sentence in its
 * place. The passes are sorted by number and flow down the left column, then the right, by INDEX
 * (`viewTables`); nothing re-sorts on status.
 */
function KitchenSection({
  lang,
  known,
  tables,
  kitchenIdle,
  frozen,
  active,
}: {
  lang: StaffLang;
  /** False before the first answer (loading): neither the key's promise nor an outage is said. */
  known: boolean;
  tables: BoardTable[] | null;
  kitchenIdle: boolean | null;
  frozen: boolean;
  active: MotionStep | null;
}) {
  const my = lang === "my";
  const unreadable = known && (tables === null || frozen);
  return (
    <section className="orb-kitchen" aria-labelledby="orb-kitchen-h">
      <div className="orb-kitchen-head">
        <BilingualHeading lang={lang} k="kds.title" id="orb-kitchen-h" />
        {unreadable ? (
          <p className="orb-kitchen-note" lang={my ? "my" : undefined}>
            {ts(lang, "board.pulse.unavailable")}
          </p>
        ) : (
          <TrackKey lang={lang} />
        )}
      </div>
      {!known || tables === null ? null : tables.length > 0 ? (
        <TablePasses lang={lang} tables={tables} frozen={frozen} active={active} />
      ) : !frozen && kitchenIdle === true ? (
        // "All clear" is a claim about the WHOLE kitchen (the blind pass on #336): never over a pickup
        // bag or a counter order on the wok (the tables are dine-in only), and never on a frozen
        // snapshot — the head already says the kitchen cannot be read. Otherwise the body says nothing.
        <p className="orb-empty" lang={my ? "my" : undefined}>
          {ts(lang, "kds.allclear")}
        </p>
      ) : null}
    </section>
  );
}

/** The key: the three tracks at the glyph size, each with its word in both tongues (lead first). */
function TrackKey({ lang }: { lang: StaffLang }) {
  return (
    <div className="orb-key" aria-hidden="true">
      {(["sent", "cooking", "served"] as const).map((s) => (
        <KitchenTrack
          key={s}
          stage={s}
          size="glyph"
          surface="theme"
          word={stageWord(s)}
          lang={lang}
        />
      ))}
    </div>
  );
}

/**
 * board-fit, for the passes — measured, never a constant (m9 "Order and fit"): every snapshot starts
 * full and steps down BEFORE PAINT (layout effects) while the list overflows its box — (a) collapse
 * the all-served, (b) fold the served dishes, (c) cut the highest numbers behind "+N more". A list
 * whose box cannot be measured (no layout yet) shows everything; the CSS clip holds it meanwhile.
 */
function useTablesFit(tables: BoardTable[]): {
  ref: RefObject<HTMLUListElement | null>;
  view: TablesView;
} {
  const ref = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState(() => tablesFitStart(tables.length));
  const [seen, setSeen] = useState(tables);
  // A new snapshot starts full again (the adjust-state-from-a-prop idiom: set during render, so the
  // stale fit never paints).
  if (seen !== tables) {
    setSeen(tables);
    setFit(tablesFitStart(tables.length));
  }
  const [resized, setResized] = useState(0);
  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const over = ul.scrollHeight > ul.clientHeight + 1 || ul.scrollWidth > ul.clientWidth + 1;
    if (over && !(fit.level === 2 && fit.shown === 0)) setFit((f) => stepDownTables(f));
  }, [fit, tables, resized]);
  useEffect(() => {
    const ul = ref.current;
    if (!ul || typeof ResizeObserver === "undefined") return;
    // A TV that changes zoom re-fits from the top — on a CHANGE of the list's box, never on a
    // notification alone (the blind pass on #336, both rounds). The browser's first notification is
    // `observe()` itself, reporting the box the render-time reset and the layout effect above have
    // just fitted: answered, it ran the whole step-down a second time on every 5 s poll, each pass
    // forcing a layout on a weak TV browser. And a box that is 0×0 when observed gets NO first
    // notification, so "skip the first" skipped its first REAL resize and left the passes cut behind
    // "+N more" until the next poll — for a whole frozen spell. Comparing the box holds either way;
    // the box never depends on the passes (`.orb-passes` is `flex: 1` and clips), so a step-down
    // never notifies itself.
    const boxOf = () => `${ul.clientWidth}×${ul.clientHeight}`;
    let fitted = boxOf();
    const ro = new ResizeObserver(() => {
      const now = boxOf();
      if (now === fitted) return;
      fitted = now;
      setFit(tablesFitStart(tables.length));
      setResized((n) => n + 1);
    });
    ro.observe(ul);
    return () => ro.disconnect();
  }, [tables]);
  return { ref, view: viewTables(tables, fit) };
}

function TablePasses({
  lang,
  tables,
  frozen,
  active,
}: {
  lang: StaffLang;
  tables: BoardTable[];
  frozen: boolean;
  active: MotionStep | null;
}) {
  const { ref, view } = useTablesFit(tables);
  const [left, right] = view.columns;
  return (
    <ul role="list" ref={ref} className="orb-passes" aria-label={sx(lang, "board.a11y.tables")}>
      {[...left, ...right].map((t, i) => (
        <TablePass
          key={t.table}
          lang={lang}
          table={t}
          // Columns by INDEX (Codex round 4 on #319): the right column starts at a forced break.
          breakBefore={i === left.length && right.length > 0}
          frozen={frozen}
          active={active}
        />
      ))}
      {view.more > 0 && (
        // It counts TABLES, never dishes — the KDS's own `+N more` words.
        <li className="orb-more" lang={lang === "my" ? "my" : undefined}>
          {tf(lang, "kds.more", { n: view.more })}
        </li>
      )}
    </ul>
  );
}

/**
 * One table pass: the CounterPass in landscape at the TV tier — the table figure once at `--fs-pass`
 * under "စားပွဲ · Table", a 4px dotted seam, and the dish rows on the paper. When every dish is served
 * its STATUS CELL carries the roll-up (the Served track and word) and TURNs once; the rows drop their
 * tracks (no fact is marked twice). Frozen: the same geometry, dashed, with no stage at all.
 */
function TablePass({
  lang,
  table: t,
  breakBefore,
  frozen,
  active,
}: {
  lang: StaffLang;
  table: FitTable;
  breakBefore: boolean;
  frozen: boolean;
  active: MotionStep | null;
}) {
  const id = `${t.table}`;
  const name = tf(lang, "kds.table", { id });
  const showStages = !frozen && !t.out;
  // Every dish list on the pass gets its OWN accessible name (the blind pass on #336): the folded
  // served row says it is the served row, a round with a stub says its round, and any name that would
  // still repeat (two unnumbered Sends; "next round" twice under a failed round read) takes its
  // occurrence (`distinctNames`) — never two sibling lists a screen reader cannot tell apart.
  const stubs = t.rounds.map((r) =>
    r.n !== null && r.n >= 2
      ? { kind: "n" as const, n: r.n }
      : r.next
        ? { kind: "next" as const }
        : null,
  );
  const listNames = distinctNames([
    ...(t.folded ? [`${name} · ${ts(lang, STAGE_KEY.served)}`] : []),
    ...stubs.map((stub) =>
      stub === null
        ? name
        : `${name} · ${stub.kind === "n" ? tf(lang, "kds.round", { id: stub.n }) : ts(lang, "kds.round.next")}`,
    ),
  ]);
  return (
    <CounterPass
      as="li"
      tier="tv"
      orientation="landscape"
      figure={id}
      figureKind="table"
      label={{ en: STAFF["board.pass.table"].en, my: STAFF["board.pass.table"].my }}
      lang={lang}
      headingLevel={3}
      className={`orb-pass${breakBefore ? " orb-pass-break" : ""}`}
      head={
        t.out && !frozen ? (
          <KitchenTrack
            stage="served"
            size="glyph"
            word={stageWord("served")}
            lang={lang}
            echo={false}
          />
        ) : undefined
      }
      turning={!frozen && active?.kind === "turn" && active.table === t.table ? "head" : undefined}
    >
      {t.collapsed ? null : (
        <>
          {t.folded && (
            <ul
              role="list"
              className="orb-dishes"
              aria-label={tf(lang, "kds.a11y.lines", { x: listNames[0]! })}
            >
              <DishRow
                lang={lang}
                row={t.folded}
                stage="served"
                showStage={showStages}
                filling={false}
              />
            </ul>
          )}
          {t.rounds.map((r, i) => {
            const stub = stubs[i]!;
            const listName = listNames[i + (t.folded ? 1 : 0)]!;
            return (
              <Fragment key={`${r.n ?? "u"}-${i}`}>
                {/* THE ROUND STUB (m5's, at the wall's scale): a label, never a control; round 1 never
                    carries one; "next round" only beside an older round on this pass. The digit is
                    Latin (`kds.round`'s identifier slot). */}
                {stub !== null && (
                  <p className="orb-round">
                    {stub.kind === "n" ? (
                      <Chrome lang={lang} k="kds.round" vars={{ id: stub.n }} />
                    ) : (
                      <Chrome lang={lang} k="kds.round.next" />
                    )}
                  </p>
                )}
                <ul
                  role="list"
                  className="orb-dishes"
                  aria-label={tf(lang, "kds.a11y.lines", { x: listName })}
                >
                  {r.rows.map((row) => {
                    const dish = row.kind === "dish" ? row.dish : null;
                    // The fit's key — the planner's own `rowKey`, from the round's ORIGINAL index.
                    const key = row.kind === "dish" ? row.key : null;
                    return (
                      <DishRow
                        key={key ?? "folded"}
                        lang={lang}
                        row={row}
                        stage={dish?.stage ?? "served"}
                        showStage={showStages}
                        filling={!frozen && active?.kind === "fill" && active.row === key}
                      />
                    );
                  })}
                </ul>
              </Fragment>
            );
          })}
        </>
      )}
    </CounterPass>
  );
}

/**
 * One dish row: the house's own names — the catalog Burmese on top at the larger size, the English
 * snapshot name beneath, in BOTH board languages (m9 decision 18; a dish with no catalog Burmese
 * draws its English alone, unmarked) — and its track with ONE word in the lead tongue (two scripts
 * cannot stack in a chip). A to-go dish wears the KDS's "To-go" tag beside its name. Folded (fit
 * level 2): the table's served dishes joined with " · " on each line behind one Served track.
 */
function DishRow({
  lang,
  row,
  stage,
  showStage,
  filling,
}: {
  lang: StaffLang;
  row: FitRow;
  stage: BoardDishStage;
  showStage: boolean;
  filling: boolean;
}) {
  const dishes = row.kind === "dish" ? [row.dish] : row.dishes;
  const mys = dishes.map((d) => d.nameMy);
  const allMy = mys.every((m) => m !== null);
  const togo = row.kind === "dish" && row.dish.togo;
  return (
    <li className={`orb-dish${row.kind === "folded" ? " orb-dish-folded" : ""}`}>
      <span className="orb-dish-names">
        <span className="orb-dish-line">
          {allMy ? (
            <span className="orb-dish-my" lang="my">
              {mys.join(" · ")}
            </span>
          ) : (
            <span className="orb-dish-lead">{dishes.map((d) => d.name).join(" · ")}</span>
          )}
          {togo && (
            <span className="orb-togo" lang={lang === "my" ? "my" : undefined}>
              {ts(lang, "kds.channel.togo")}
            </span>
          )}
        </span>
        {allMy && <span className="orb-dish-en">{dishes.map((d) => d.name).join(" · ")}</span>}
      </span>
      {showStage && (
        <KitchenTrack
          stage={stage}
          size="tv"
          word={stageWord(stage)}
          lang={lang}
          echo={false}
          filling={filling}
        />
      )}
    </li>
  );
}

/**
 * P2 — a section heading, both tongues, ALWAYS. The wall serves a mixed room and cannot choose for
 * it; `lang` decides only which one LEADS. The lead sits in its own span and `lang` never goes on the
 * `<h2>`: the English echo is a SIBLING, never a child of a Burmese run (Chrome's rule 2), and the
 * `<h2>` itself stays unmarked because it contains both.
 */
function BilingualHeading({
  lang,
  k,
  id,
}: {
  lang: StaffLang;
  k: "board.col.preparing" | "board.col.ready" | "kds.title";
  id?: string;
}) {
  const my = lang === "my";
  return (
    <h2 id={id}>
      <span lang={my ? "my" : undefined}>{ts(lang, k)}</span>
      <small lang={my ? undefined : "my"}>{my ? STAFF[k].en : STAFF[k].my}</small>
    </h2>
  );
}
