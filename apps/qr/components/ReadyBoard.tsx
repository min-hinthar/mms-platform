"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { BRAND_NAME } from "@/lib/brand";
import { shelfWait } from "@/lib/kds-time";
import { boardColumnFit } from "@/lib/board-fit";
import { useWakeLock } from "@/lib/useWakeLock";
import { raceTimeout } from "@/lib/staff-outage";
import {
  nextBoardStateOnFailure,
  readBoardRefusal,
  type BoardVerdictReason,
} from "@/lib/board-poll";
import { STAFF, ts } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import { Chrome } from "@/components/staff/Chrome";
import type { BoardPulse, PulseDish, PulseTable } from "@/lib/board-pulse";
import type { StaffLang } from "@/lib/staff-lang";
import type React from "react";
import { KdsChime } from "@/lib/kds-sound";
import { buttonClass } from "@mms/ui";

/** Where an unlinked wall sends its manager — back to this board once signed in. */
const BOARD_SIGNIN_PATH = "/staff/login?next=/board";

/**
 * W3e: the order-ready board client — Preparing | Ready on any smart-TV browser. Polls the sanitized
 * /api/board read every 5s (the TV can't join the private realtime channels); the ONLY write that moves
 * a card is the expo's bump. Gold flash (+ optional gesture-armed chime, TVs with a remote can tap once)
 * on the Preparing→Ready transition; picked-up cards linger 10 minutes server-side then auto-clear.
 * Bilingual headings (EN/MY — the community the house serves). Keeps the last good snapshot through
 * blips with an honest "Reconnecting…" note; a missing/unauthorized token renders the not-linked state,
 * never a spinner forever.
 */

type BoardOrder = {
  code: string;
  name: string | null;
  status: "preparing" | "ready";
  readyAt: string | null;
  /** K32 (A4·1) — minutes on the Ready shelf, derived by the server from the DB clock. Optional
   *  because a TV is the longest-lived client in the building and may poll a server that
   *  predates the field; absent means "do not draw a wait", never 0. */
  readyMinutes?: number | null;
};

type BoardState =
  | { kind: "loading" }
  /**
   * A verdict about THIS DEVICE, carrying the server's own sentence. The message matters because the
   * two verdicts need different instructions and the board cannot tell them apart on its own: a
   * `denied` board has a device link it is not using, a `not_configured` board has none to use and
   * its operator must sign in instead. Rendering one hardcoded "open the board with its device link"
   * for both told a staff-signed-in TV to go find a link that does not exist.
   */
  | { kind: "unlinked"; reason: BoardVerdictReason; message: string | null }
  /**
   * We could not reach the server AT ALL and have no snapshot to fall back on — a board that booted
   * into an outage. Distinct from `loading`, which claims we are still connecting, and distinct from
   * a stale `live`, which has real orders to keep showing. Without this state such a board sat on
   * "Connecting…" forever under a Ready column promising "Ready orders light up here."
   *
   * `escalated` is computed by the fold rather than at render — `Date.now()` in a render body is
   * impure and React Compiler rejects it, and measuring a duration across two clock domains is the
   * skew bug `staff-outage.ts` already documents.
   */
  | { kind: "offline"; since: number; fails: number; escalated: boolean }
  /**
   * P6 — `pulse` is `BoardPulse | null`, and the null is LOAD-BEARING: it is the route's answer when
   * a kitchen read dropped, and it must render as "we can't read the kitchen", never as a zeroed
   * band. A band drawn from `{tickets: 0}` over a full wok is the same lie `lib/kitchen.ts` refuses
   * (an empty KDS reading "all clear" over a room of cooking food), one screen further out.
   *
   * ⚠️ There is deliberately NO `serverNow` here. An earlier cut carried one, with a docblock
   * saying the oldest-ticket age was measured against it — and by then the age had already moved
   * server-side as an integer, so the field was read by nothing. Worse if a later reader had used
   * it: the route stamps `serverNow` from the APP clock while `oldestMinutes` comes from `mms_now`,
   * which is precisely the two-clock-domain error the removed comment claimed to prevent.
   */
  | { kind: "live"; orders: BoardOrder[]; pulse: BoardPulse | null; stale: boolean };

export function ReadyBoard({ token, lang }: { token: string; lang: StaffLang }) {
  // A tokenless board is no longer knowably unlinked at mount: a staff sign-in on the device is now
  // a credential too (`authorizeDevice`), and that lives in a cookie the client can't read. So it
  // starts LOADING and lets the server answer — the old initializer short-circuited to "unlinked"
  // and the documented `/staff/login?next=/board` flow could never leave that screen
  // (Codex round 1, P1).
  const [state, setState] = useState<BoardState>({ kind: "loading" });
  const [flashes, setFlashes] = useState<Map<string, number>>(new Map());
  const flashNonce = useRef(0);
  const prevReady = useRef<Set<string>>(new Set());
  const seeded = useRef(false); // first poll = baseline only, never a flash storm (LOW-2)
  const fails = useRef(0);
  /**
   * The concurrent-poll lock every other staff board already has (`lib/staff-outage.ts` documents the
   * idiom). Without it the 5s interval fires regardless of whether the previous poll is still out,
   * and `prevReady` — the ONLY memory the flash/chime machinery has — is whatever response lands
   * LAST. A slow poll overtaken by a newer one rewinds that set, so the next tick re-announces an
   * order already called: a second gold flash and a second chime for a bag someone collected, which
   * sends that customer back to the counter. This diff made it likelier, not less: a board on the
   * staff-session path pays a `getUser()` round-trip per poll before the orders read.
   */
  const inFlight = useRef(false);
  // board-4 — the sound chip is a TOGGLE that stays mounted (it used to unmount on the tap that
  // armed it, dropping focus to <body> with no mute afterwards). `soundOn` drives the chip; the ref
  // is what the poll reads, because `poll` is a `useCallback` over `token` alone and a state read
  // inside it would be the value from the render that created it.
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  // The TV's browser refused audio: said ONCE through the one status node, then the node goes back
  // to the poll state. The chip stays live — a refusal is the browser's, and a manager who fixes the
  // TV's audio must be able to try again (over-blocking is the same defect as under-blocking).
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
      const res = await raceTimeout(
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
      // P6 — `pulse` and `serverNow` are read DEFENSIVELY (`?? null`) rather than trusted to be
      // present. A TV is the longest-lived client in the building: it can be running a build from
      // before this field existed, or be served a cached older deploy mid-rollout, and an
      // `undefined` reaching the band's `pulse.tickets` would throw inside render — taking the
      // Ready column, which is the customer-facing half, down with it.
      const data = (await res.json()) as {
        orders: BoardOrder[];
        pulse?: BoardPulse | null;
      };
      fails.current = 0;

      // Gold-flash the NEWLY ready. The card remounts as it moves columns (same key, different <ul>),
      // so the flash class animates once on arrival; prune departed codes so the map stays bounded.
      // The FIRST successful poll only seeds the baseline — a TV reboot must not flash (and chime for)
      // the whole existing Ready column as if every bag just came up (adversarial LOW-2).
      const codesNow = new Set(data.orders.map((o) => o.code));
      const readyNow = new Set(data.orders.filter((o) => o.status === "ready").map((o) => o.code));
      const newlyReady = seeded.current
        ? [...readyNow].filter((c) => !prevReady.current.has(c))
        : [];
      seeded.current = true;
      prevReady.current = readyNow;
      setFlashes((prev) => {
        if (newlyReady.length === 0 && prev.size === 0) return prev;
        const next = new Map<string, number>();
        for (const [code, nonce] of prev) if (codesNow.has(code)) next.set(code, nonce);
        for (const c of newlyReady) next.set(c, ++flashNonce.current);
        return next;
      });
      // Muted (the toggle off) is silent; armed-but-muted keeps the engine so the next tap is instant.
      if (newlyReady.length > 0 && soundOnRef.current) chime.current?.play("pickup");

      setState({ kind: "live", orders: data.orders, pulse: data.pulse ?? null, stale: false });
    } catch {
      fails.current += 1;
      // The fold lives in `lib/board-poll.ts` so it can be tested: keep a live board's snapshot and
      // admit staleness after two misses; move a board that has NO snapshot to `offline` rather than
      // letting it claim forever that it is still connecting.
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
  // A stale snapshot keeps its names and codes (they do not rot) and drops every AGE — the pulse's
  // below, and each card's wait minutes (Codex round 1 on A4·1).
  const stale = state.kind === "live" && state.stale;
  // board-1 — the cut falls on the end that matters least in each column. The route sends the
  // newest order first (`created_at` desc), which for PREPARING puts the bag about to come up at the
  // BOTTOM; reversed, the next bag up leads and the cut hides what was just placed — those parties
  // are told by the `+N more` row that they are in the queue.
  const preparing = orders.filter((o) => o.status === "preparing").reverse();
  // Freshest call-outs at the top — the person walking up scans the top of the Ready column.
  const ready = orders
    .filter((o) => o.status === "ready")
    .sort((a, b) => (b.readyAt ?? "").localeCompare(a.readyAt ?? ""));

  return (
    // board-2 — `data-stale` is the tell at three metres: the cards fall to the secondary ink and the
    // status line grows (globals.css); the ONE live region is unchanged, so nothing announces twice.
    <div className="orb-root dark" data-stale={stale || undefined}>
      <header className="orb-head">
        <h1 className="orb-title">
          <span aria-hidden="true">✦</span> {BRAND_NAME}
        </h1>
        {/* ONE polite region: poll state only (card moves are visual + chime; a TV isn't an SR surface,
            but the region keeps the page honest for anyone on a browser). */}
        {/* ONE polite region, single-voice: a bilingual live region would announce everything twice. */}
        <p className="orb-status" role="status" lang={lang === "my" ? "my" : undefined}>
          {soundNote
            ? ts(lang, "board.sound.refused")
            : state.kind === "loading"
              ? ts(lang, "board.connecting")
              : state.kind === "live" && state.stale
                ? ts(lang, "board.reconnecting")
                : tf(lang, "board.status", { n: ready.length, total: preparing.length })}
        </p>
        {/* board-4 — one chip, both states: the pressed word is `Sound on` under the shared lit cap
            (`.kds-chip[aria-pressed="true"]`), a second tap mutes; focus never leaves the element.
            The visible text IS the name (no aria-label — rule 3's containment pair). */}
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

      <div className="orb-cols">
        <BoardColumn
          lang={lang}
          k="board.col.preparing"
          orders={preparing}
          empty={<p className="orb-empty">—</p>}
          flashes={null}
          stale={stale}
        />
        <BoardColumn
          lang={lang}
          k="board.col.ready"
          orders={ready}
          empty={
            <p className="orb-empty" lang={lang === "my" ? "my" : undefined}>
              {ts(lang, "board.empty")}
            </p>
          }
          flashes={flashes}
          stale={stale}
        />
      </div>

      {/* ⚠️ `stale` NULLS THE PULSE, and that asymmetry with the Ready column is the point. The
          stale fold keeps `kind: "live"` and carries the whole snapshot forward (`board-poll.ts`),
          which is right for a name and a pickup code — those do not rot. Every value in this band
          does: a count of what is on the wok NOW, an age in minutes, and a `Food up` announcement
          whose five-minute window is enforced SERVER-side and therefore lapses the moment the server
          stops answering. Left carried, forty minutes into an outage the wall showed `9 Oldest` and
          a lit-gold `Table 3 · Food up` — the "act on this" vocabulary — and sent a runner to the
          pass for a plate that went out half an hour ago.
          The cost, stated: `stale` needs only two consecutive misses (~15s), so a brief blip blanks
          the band and it self-heals on the next good poll. A band that says it cannot read the
          kitchen for fifteen seconds is cheaper than one that lies for forty minutes, and it is the
          same `null`-is-unknown contract the route already uses for a dropped kitchen read. */}
      <KitchenPulse
        lang={lang}
        pulse={state.kind === "live" && !state.stale ? state.pulse : null}
        known={state.kind === "live"}
      />
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

function BoardColumn({
  lang,
  k,
  orders,
  empty,
  flashes,
  stale,
}: {
  lang: StaffLang;
  k: "board.col.preparing" | "board.col.ready";
  orders: BoardOrder[];
  empty: React.ReactNode;
  flashes: Map<string, number> | null;
  stale: boolean;
}) {
  const { ref, cap } = useColumnFit(orders);
  const fit = boardColumnFit(orders.length, cap);
  return (
    <section
      className={k === "board.col.ready" ? "orb-col orb-col-ready" : "orb-col"}
      aria-label={ts(lang, k)}
    >
      <BilingualHeading lang={lang} k={k} />
      {orders.length === 0 && empty}
      <ul role="list" ref={ref}>
        {orders.slice(0, fit.shown).map((o) => (
          <BoardCard
            key={o.code}
            order={o}
            flash={flashes?.get(o.code) ?? null}
            lang={lang}
            stale={stale}
          />
        ))}
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
 * P6 — the KITCHEN PULSE band: the second audience on the one screen.
 *
 * WHAT IS ON IT AND WHY EACH IS ALLOWED (the boundary is argued in full in `lib/board-pulse.ts`;
 * this component may only ever render LESS than the payload carries, never derive more):
 *   · a ticket count and the oldest ticket's age — load, attached to nobody;
 *   · an all-day dish rail — unattributed, and the route withholds it entirely below three live
 *     tickets, because at one or two it is one party's order in the clear;
 *   · dine-in as TABLE NUMBER + `cooking`/`up` — the number is printed on the tent card and
 *     called across the room all night; the status is what a runner walking past already sees.
 * Nothing here reaches for a guest name, a per-table dish, a modifier, an amount or an id, because
 * `BoardPulse` has no field for one.
 *
 * The oldest age arrives as WHOLE MINUTES rather than as a fire timestamp, and that is a boundary
 * decision made in `lib/board-pulse.ts`, not a formatting one: at one live ticket beside one table
 * on the strip, an exact `fire_at` would state that party's order instant to the room. The screen
 * therefore has no clock arithmetic to do and no drift to clamp.
 *
 * `known` vs `pulse === null` are DIFFERENT unknowns and the band says so: `known: false` is a
 * board that has no snapshot at all (loading, or the offline/unlinked screens above never reach
 * here), and `pulse: null` is a live board whose kitchen read dropped. Only the second gets the
 * "can't read the kitchen" sentence — saying it while merely connecting would call an outage on a
 * board that is simply starting up.
 *
 * NO MOTION, deliberately, and it is a design decision rather than an omission. The Ready column's
 * gold flash marks a transition a customer is waiting for; a band that animated its own numbers on
 * a screen hanging in a dining room would pull every guest's eye to the kitchen's workload every
 * five seconds. The band earns its place typographically — the same lit-gold vocabulary the Ready
 * column already owns marks a `ready` table, static.
 */
function KitchenPulse({
  lang,
  pulse,
  known,
}: {
  lang: StaffLang;
  pulse: BoardPulse | null;
  known: boolean;
}) {
  const my = lang === "my";
  return (
    <section className="orb-pulse" aria-label={ts(lang, "kds.title")}>
      <BilingualHeading lang={lang} k="kds.title" />
      {!known ? null : pulse === null ? (
        <p className="orb-pulse-note" lang={my ? "my" : undefined}>
          {ts(lang, "board.pulse.unavailable")}
        </p>
      ) : pulse.tickets === 0 && pulse.tables.length === 0 ? (
        <p className="orb-pulse-note" lang={my ? "my" : undefined}>
          {ts(lang, "kds.allclear")}
        </p>
      ) : (
        <div className="orb-pulse-body">
          <div className="orb-pulse-stats">
            {/* The KDS stat-row idiom, verbatim: the VALUE is a plain number in its own element, so
                it is Latin by construction rather than by discipline — it never passes through a
                `{n}` slot, which is where `fill.ts` localizes numerals. The two screens a cook reads
                in one shift therefore render a count the same way. */}
            <p className="orb-stat">
              <b>{pulse.tickets}</b>
              <span lang={my ? "my" : undefined}>{ts(lang, "kds.line.cooking")}</span>
            </p>
            <p className="orb-stat">
              <b>{pulse.oldestMinutes === null ? "—" : pulse.oldestMinutes}</b>
              <span lang={my ? "my" : undefined}>{ts(lang, "board.pulse.oldest")}</span>
            </p>
          </div>

          {pulse.tables.length > 0 && (
            <ul className="orb-tables" role="list" aria-label={sx(lang, "board.a11y.tables")}>
              {pulse.tables.map((t) => (
                <PulseTableChip key={t.table} lang={lang} table={t} />
              ))}
            </ul>
          )}

          {pulse.allDay.length > 0 && (
            <div className="orb-rail">
              <h3 className="orb-rail-head">
                <span lang={my ? "my" : undefined}>{ts(lang, "kds.allday.title")}</span>
                <small lang={my ? undefined : "my"}>
                  {my ? STAFF["kds.allday.title"].en : STAFF["kds.allday.title"].my}
                </small>
              </h3>
              <ul role="list" aria-label={sx(lang, "kds.a11y.allDay")}>
                {pulse.allDay.map((d) => (
                  <li key={d.name} className="orb-rail-row">
                    <PulseDishName lang={lang} dish={d} />
                    {/* `×4` — a multiplicity, not a prose count, and Latin in both tongues for the
                        same reason the stat values are: it is scanned, not read. */}
                    <b className="orb-rail-qty">×{d.qty}</b>
                  </li>
                ))}
              </ul>
              {pulse.allDayMore > 0 && (
                <p className="orb-rail-more" lang={my ? "my" : undefined}>
                  {tf(lang, "kds.more", { n: pulse.allDayMore })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One dine-in chip: the tent-card number and one of two coarse statuses.
 *
 * `echo={false}` on the number follows PR A's echo policy verbatim — "no echo on 44px chips and
 * badges, because two scripts cannot legibly stack in a chip". The BAND's heading carries both
 * tongues, which is where the room learns what it is looking at; the chips stay terse. `<Chrome>`
 * is also what wraps the Latin table number in `lang="en"` inside a Burmese run, so `စားပွဲ 2`
 * keeps the body face and cannot break mid-value.
 */
function PulseTableChip({ lang, table }: { lang: StaffLang; table: PulseTable }) {
  const my = lang === "my";
  return (
    <li className={`orb-table orb-table-${table.status}`}>
      <span className="orb-table-no">
        <Chrome lang={lang} k="kds.table" vars={{ id: table.table }} />
      </span>
      <span className="orb-table-state" lang={my ? "my" : undefined}>
        {ts(lang, table.status === "cooking" ? "kds.line.cooking" : "board.pulse.up")}
      </span>
    </li>
  );
}

/**
 * A rail dish, both tongues, as SIBLINGS.
 *
 * The KDS's `RailRowText` nests its English fallback inside the Burmese run (marked `lang="en"`),
 * which is right for a ticket. The wall holds itself to the stricter shape its own suite already
 * pins — no English text inside a `lang="my"` element at all — because that property is what stops
 * the next heading refactor from typesetting an English word in Padauk on the one staff screen
 * guests read. So: the lead carries the tongue it actually contains, and the echo is a sibling.
 *
 * A dish with no catalog Burmese renders its English name ALONE and unmarked, exactly as the rail
 * would have looked with no `name_my` at all — never an English word wearing a Burmese mark.
 */
function PulseDishName({ lang, dish }: { lang: StaffLang; dish: PulseDish }) {
  const my = lang === "my" && dish.nameMy !== null;
  return (
    <span className="orb-rail-name">
      <span lang={my ? "my" : undefined}>{my ? dish.nameMy : dish.name}</span>
      {dish.nameMy !== null && (
        <small lang={my ? undefined : "my"}>{my ? dish.name : dish.nameMy}</small>
      )}
    </span>
  );
}

/**
 * P2 — a section heading, both tongues, ALWAYS. The wall serves a mixed room and cannot choose for
 * it; `lang` decides only which one LEADS. The Burmese of the two column headings is verbatim from
 * W3e and this slice does not reword it.
 *
 * ⚠️ WHY THE LEAD SITS IN ITS OWN SPAN AND `lang` NEVER GOES ON THE `<h2>`. The first cut wrote
 * `<h2 lang="my">…<small>English</small></h2>`: under a Burmese board that nests the English echo
 * INSIDE the Burmese element, which typesets it in Padauk and announces it to a screen reader as
 * Burmese. That is exactly the violation `Chrome`'s rule 2 exists to prevent ("the English echo is a
 * SIBLING, never a child"), and the heading is the one staff surface guests read. Two sibling spans,
 * each marked for what it actually contains — and the `<h2>` itself stays unmarked, because it
 * contains both.
 *
 * P6 renamed it from `ColumnHeading` and widened `k` by exactly one key: the pulse band is a third
 * section on the same wall and must not grow a second, subtly different heading shape. The type
 * stays an explicit union rather than `StaffKey`, so the set of things that can be a heading here
 * remains something a reader can enumerate.
 */
function BilingualHeading({
  lang,
  k,
}: {
  lang: StaffLang;
  k: "board.col.preparing" | "board.col.ready" | "kds.title";
}) {
  const my = lang === "my";
  return (
    <h2>
      <span lang={my ? "my" : undefined}>{ts(lang, k)}</span>
      <small lang={my ? undefined : "my"}>{my ? STAFF[k].en : STAFF[k].my}</small>
    </h2>
  );
}

function BoardCard({
  order,
  flash,
  lang,
  stale,
}: {
  order: BoardOrder;
  flash: number | null;
  lang: StaffLang;
  stale: boolean;
}) {
  // K32 (A4·1) — how long a bag has waited, drawn from the server's own minute count (never a
  // subtraction from this screen's clock). The ROUTE decides which cards carry one — Ready only,
  // never a collected bag — and pins that in its suite; this card draws the number it was sent.
  // An older server sends no count at all, and then nothing is drawn rather than "0". A STALE
  // snapshot draws none either: the count is an age, and carried through an outage it would read
  // "5 min" an hour later beside a note saying the board is reconnecting (Codex round 1 on A4·1).
  const wait = order.readyMinutes ?? null;
  return (
    <li className={`orb-card${flash != null ? " orb-card-flash" : ""}`}>
      <span className="orb-name">{order.name ?? `#${order.code}`}</span>
      {order.name && <span className="orb-code">#{order.code}</span>}
      {wait !== null && !stale && (
        <span className="orb-wait" lang={lang === "my" ? "my" : undefined}>
          {/* K28(b) — the ceiling lives in `shelfWait`; this card renders the key it is handed. */}
          {(() => {
            const w = shelfWait(wait);
            return w.k === "board.card.wait" ? tf(lang, w.k, { mins: w.mins }) : ts(lang, w.k);
          })()}
        </span>
      )}
    </li>
  );
}
