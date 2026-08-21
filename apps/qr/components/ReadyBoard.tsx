"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/lib/useWakeLock";
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
  | { kind: "unlinked" } // no/bad token or unconfigured — an honest setup message, not an error wall
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
  const [soundOn, setSoundOn] = useState(false);
  const chime = useRef<KdsChime | null>(null);

  useWakeLock(); // a TV browser tab must never sleep mid-service

  const poll = useCallback(async () => {
    try {
      // Always polls, token or not: an empty `k` is the staff-session path, which only the server
      // can adjudicate.
      const res = await fetch(`/api/board?k=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 401 || res.status === 503) {
        // 401 and a `not_configured` 503 are verdicts about the DEVICE — say so. An `unavailable`
        // 503 is the auth service being unreachable, which is not a verdict about anything: fall
        // through to the retry path so a running display keeps its last-known orders instead of
        // blanking mid-service on a blip (W10b; Codex round 1, P2).
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        if (body?.reason !== "unavailable") {
          setState({ kind: "unlinked" });
          return;
        }
        throw new Error("board poll: sign-in service unavailable");
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
      // Keep the last good snapshot through a blip; after 2 misses say so (never silently stale).
      setState((prev) =>
        prev.kind === "live" && fails.current >= 2
          ? { ...prev, stale: true }
          : prev.kind === "live"
            ? prev
            : { kind: "loading" },
      );
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
        <p className="orb-empty">
          This screen isn’t linked yet — open the board with its device link (ask a manager).
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
