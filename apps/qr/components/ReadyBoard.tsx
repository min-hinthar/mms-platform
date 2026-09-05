"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { KdsChime } from "@/lib/kds-sound";

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
   * `serverNow` rides along because the oldest-ticket age is measured against it and NOT against
   * `Date.now()`: a clock read in a render body is impure and React Compiler rejects it, and the
   * two endpoints have to share one clock domain to be a duration at all (`staff-outage.ts`
   * documents the skew bug that taught this). A stale board keeps the last pair, so the age freezes
   * with the rest of the snapshot rather than drifting upward against a live clock while nothing
   * behind it is being refreshed.
   */
  | {
      kind: "live";
      orders: BoardOrder[];
      pulse: BoardPulse | null;
      serverNow: string | null;
      stale: boolean;
    };

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
  const [soundOn, setSoundOn] = useState(false);
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
        serverNow?: string;
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
      if (newlyReady.length > 0) chime.current?.play("pickup");

      setState({
        kind: "live",
        orders: data.orders,
        pulse: data.pulse ?? null,
        serverNow: data.serverNow ?? null,
        stale: false,
      });
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

  const enableSound = async () => {
    chime.current ??= new KdsChime();
    const ok = await chime.current.arm();
    setSoundOn(ok);
    if (ok) chime.current.play("pickup");
  };

  if (state.kind === "unlinked") {
    return (
      <div className="orb-root dark">
        <header className="orb-head">
          <h1 className="orb-title">Mandalay Morning Star</h1>
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
        <p className="orb-empty">
          A manager can sign in on this screen at <strong>/staff/login?next=/board</strong>.
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
          <h1 className="orb-title">Mandalay Morning Star</h1>
        </header>
        <p className="orb-empty" role="status" lang={lang === "my" ? "my" : undefined}>
          {ts(lang, state.escalated ? "board.offline.still" : "board.offline")}
        </p>
      </div>
    );
  }

  const orders = state.kind === "live" ? state.orders : [];
  const preparing = orders.filter((o) => o.status === "preparing");
  // Freshest call-outs at the top — the person walking up scans the top of the Ready column.
  const ready = orders
    .filter((o) => o.status === "ready")
    .sort((a, b) => (b.readyAt ?? "").localeCompare(a.readyAt ?? ""));

  return (
    <div className="orb-root dark">
      <header className="orb-head">
        <h1 className="orb-title">
          <span aria-hidden="true">✦</span> Mandalay Morning Star
        </h1>
        {/* ONE polite region: poll state only (card moves are visual + chime; a TV isn't an SR surface,
            but the region keeps the page honest for anyone on a browser). */}
        {/* ONE polite region, single-voice: a bilingual live region would announce everything twice. */}
        <p className="orb-status" role="status" lang={lang === "my" ? "my" : undefined}>
          {state.kind === "loading"
            ? ts(lang, "board.connecting")
            : state.kind === "live" && state.stale
              ? ts(lang, "board.reconnecting")
              : tf(lang, "board.status", { n: ready.length, total: preparing.length })}
        </p>
        {!soundOn && (
          <button
            type="button"
            className="kds-chip"
            onClick={enableSound}
            lang={lang === "my" ? "my" : undefined}
          >
            {ts(lang, "board.sound")}
          </button>
        )}
      </header>

      <div className="orb-cols">
        <section className="orb-col" aria-label={ts(lang, "board.col.preparing")}>
          <BilingualHeading lang={lang} k="board.col.preparing" />
          {preparing.length === 0 ? (
            <p className="orb-empty">—</p>
          ) : (
            <ul role="list">
              {preparing.map((o) => (
                <BoardCard key={o.code} order={o} flash={null} />
              ))}
            </ul>
          )}
        </section>

        <section className="orb-col orb-col-ready" aria-label={ts(lang, "board.col.ready")}>
          <BilingualHeading lang={lang} k="board.col.ready" />
          {ready.length === 0 ? (
            <p className="orb-empty" lang={lang === "my" ? "my" : undefined}>
              {ts(lang, "board.empty")}
            </p>
          ) : (
            <ul role="list">
              {ready.map((o) => (
                <BoardCard key={o.code} order={o} flash={flashes.get(o.code) ?? null} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <KitchenPulse
        lang={lang}
        pulse={state.kind === "live" ? state.pulse : null}
        serverNow={state.kind === "live" ? state.serverNow : null}
        known={state.kind === "live"}
      />
    </div>
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
 *   · dine-in as TABLE NUMBER + `cooking`/`ready` — the number is printed on the tent card and
 *     called across the room all night; the status is what a runner walking past already sees.
 * Nothing here reaches for a guest name, a per-table dish, a modifier, an amount or an id, because
 * `BoardPulse` has no field for one.
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
  serverNow,
  known,
}: {
  lang: StaffLang;
  pulse: BoardPulse | null;
  serverNow: string | null;
  known: boolean;
}) {
  const my = lang === "my";
  const minutes = pulse ? oldestMinutes(pulse.oldestFiredAt, serverNow) : null;
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
              <b>{minutes === null ? "—" : minutes}</b>
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
 * The oldest ticket's age in WHOLE MINUTES, measured between two timestamps the SERVER produced.
 *
 * Minutes rather than the KDS's `m:ss`: the pass reads its screen at arm's length and a second
 * matters there; this one is read across a dining room, where a ticking seconds field is unreadable
 * and would redraw twice a minute for nothing. The two surfaces format the SAME published value
 * (`pulse.oldestFiredAt`) for their own distance — there is no second derivation to drift.
 *
 * CLAMPED AT ZERO on purpose. `oldestFiredAt` is stamped by Postgres and `serverNow` by the Node
 * process, so a few seconds of drift between them is normal and would otherwise render `-1`.
 */
function oldestMinutes(oldestFiredAt: string | null, serverNow: string | null): number | null {
  if (oldestFiredAt === null || serverNow === null) return null;
  const fired = new Date(oldestFiredAt).getTime();
  const now = new Date(serverNow).getTime();
  if (!Number.isFinite(fired) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - fired) / 60_000));
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
        {ts(lang, table.status === "cooking" ? "kds.line.cooking" : "board.pulse.ready")}
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

function BoardCard({ order, flash }: { order: BoardOrder; flash: number | null }) {
  return (
    <li className={`orb-card${flash != null ? " orb-card-flash" : ""}`}>
      <span>{order.name ?? `#${order.code}`}</span>
      {order.name && <span className="orb-code">#{order.code}</span>}
    </li>
  );
}
