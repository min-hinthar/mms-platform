"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/lib/useWakeLock";
import { raceTimeout } from "@/lib/staff-outage";
import { nextBoardStateOnFailure, readBoardRefusal } from "@/lib/board-poll";
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
  | { kind: "unlinked"; message: string | null }
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
  | { kind: "live"; orders: BoardOrder[]; stale: boolean };

export function ReadyBoard({ token }: { token: string }) {
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
        const refusal = readBoardRefusal(body);
        if (refusal.kind === "verdict") {
          setState({ kind: "unlinked", message: refusal.message });
          return;
        }
        throw new Error("board poll: no verdict available");
      }
      if (!res.ok) throw new Error(`board poll ${res.status}`);
      const data = (await res.json()) as { orders: BoardOrder[] };
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

      setState({ kind: "live", orders: data.orders, stale: false });
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
        {/* The server already worked out WHICH verdict this is and wrote the sentence for it; render
            that rather than a guess. The fallback only covers a body that carried a reason but no
            message. */}
        <p className="orb-empty">
          {state.message ?? "This screen isn’t linked yet — ask a manager to set it up."}
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
        <p className="orb-empty" role="status">
          {state.escalated
            ? "Still can’t reach the ordering system — this screen isn’t updating. Call orders out from the kitchen for now."
            : "Can’t reach the ordering system — this screen isn’t updating. Trying again…"}
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
        <p className="orb-status" role="status">
          {state.kind === "loading"
            ? "Connecting…"
            : state.kind === "live" && state.stale
              ? "Reconnecting — showing the last update"
              : `${ready.length} ready · ${preparing.length} preparing`}
        </p>
        {!soundOn && (
          <button type="button" className="kds-chip" onClick={enableSound}>
            Enable sound
          </button>
        )}
      </header>

      <div className="orb-cols">
        <section className="orb-col" aria-label="Preparing">
          <h2>
            Preparing
            <small lang="my">ပြင်ဆင်နေသည်</small>
          </h2>
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

        <section className="orb-col orb-col-ready" aria-label="Ready for pickup">
          <h2>
            Ready
            <small lang="my">ယူသွားနိုင်ပါပြီ</small>
          </h2>
          {ready.length === 0 ? (
            <p className="orb-empty">Ready orders light up here.</p>
          ) : (
            <ul role="list">
              {ready.map((o) => (
                <BoardCard key={o.code} order={o} flash={flashes.get(o.code) ?? null} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
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
