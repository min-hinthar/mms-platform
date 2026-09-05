"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { bumpLine, bumpTicket, fireTicketNow, getKitchenQueue, recallTicket } from "@/lib/kitchen";
import { setItemSoldOut } from "@/lib/menu-availability";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { useWakeLock } from "@/lib/useWakeLock";
import { KdsChime, getKdsVolume, setKdsVolume } from "@/lib/kds-sound";
import { allDayRows } from "@/lib/ticket-names";
import { RailRowText, TicketLineText } from "./TicketText";
import type {
  KdsThresholds,
  KitchenLine,
  KitchenQueue,
  KitchenStation,
  KitchenTicket,
} from "@/lib/kitchen-types";
import { EmptyState, Icon } from "@mms/ui";
import { useStaffLang } from "./StaffLangProvider";
import { StaffLangSwitch } from "./StaffLangSwitch";
import { Chrome } from "./Chrome";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { plural, tf } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * The KDS — kitchen display (S2.1b, rebuilt by W3 to SPEC-KDS). Server-rendered initial queue, kept
 * live by Postgres-Changes (useFloorRealtime → re-fetch the server-authoritative getKitchenQueue;
 * never client state-math) with a 5s poll BACKSTOP. W3 adds: every channel (pickup/scango HELD cards
 * that auto-turn live at fire time) · kitchen-scale type + 2-threshold urgency strips + mm:ss ·
 * gesture-armed per-channel chime + re-chime + "N new" + edge flash · fixed grid with paging and an
 * unmissable "+N more" · the All-Day rail · ticket bump with 6s undo + a 2-minute recall rail ·
 * station chips · wake lock · and honest 401/lock redirects (never an eternal "Reconnecting…").
 * ONE polite live region (bump errors take precedence over the count); body contrast never changes
 * with urgency — only the header strip ages.
 */

const PAGE_SIZE = 8; // the 2×4 landscape envelope (SPEC-KDS §2); smaller screens page the same set
const STATION_KEY = "mms.kds.station";
const RAIL_KEY = "mms.kds.rail";
const UNDO_MS = 6_000;
const RECALL_MS = 120_000; // mirror of the SQL 2-minute recall window (the server is the authority)

type RecallEntry = { cartId: string; label: string; lineIds: string[]; expiresAt: number };

// P2 — keys, not labels. The four station names stay LATIN in both tongues by owner decision
// (2026-09-05): they are set-once English kitchen jargon, and a wrong Burmese word here HIDES
// TICKETS. The dictionary carries them as Latin-by-design with that reason attached.
const STATIONS: { key: "all" | KitchenStation; k: StaffKey }[] = [
  { key: "all", k: "kds.station.all" },
  { key: "wok", k: "kds.station.wok" },
  { key: "cold", k: "kds.station.cold" },
  { key: "drinks", k: "kds.station.drinks" },
];

/**
 * The ticket's call-out identity: dine-in = the table; pickup/scango = first name (+ short code).
 *
 * Returns BOTH forms from one derivation, because they are needed in two shapes and must never
 * drift: `main` is the flat string an accessible name and a recall entry carry, `node` is what the
 * strip renders. Only the dine-in arm is CHROME — "Table {id}" is our sentence and speaks the
 * device's language, so its node goes through `Chrome` (which marks the Burmese and wraps the Latin
 * table number `lang="en"`, per that module's rule 3). A guest's name and a `#CODE` are DATA: they
 * are printed on a slip in Latin and are rendered unmarked in both tongues, because marking them
 * `lang="my"` would claim a name is Burmese and let `overflow-wrap: anywhere` break a code.
 *
 * The table NUMBER stays Latin in both tongues either way — it is read off the physical tent.
 */
function ticketId(
  lang: StaffLang,
  t: KitchenTicket,
): { main: string; node: ReactNode; sub: string | null } {
  if (t.channel === "dinein") {
    const vars = { id: t.tableNumber ?? t.label };
    return {
      main: tf(lang, "kds.table", vars),
      node: <Chrome lang={lang} k="kds.table" vars={vars} />,
      sub: null,
    };
  }
  const code = t.shortCode ? `#${t.shortCode}` : t.label;
  const main = t.customerName ?? code;
  return { main, node: main, sub: t.customerName ? code : null };
}

const CHANNEL_KEY: Record<KitchenTicket["channel"], StaffKey> = {
  dinein: "kds.channel.dinein",
  pickup: "kds.channel.pickup",
  scango: "kds.channel.togo",
};

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSlot(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function urgency(t: KitchenTicket, ageMs: number, th: KdsThresholds): "ok" | "amber" | "red" {
  const amber = t.channel === "dinein" ? th.dineinAmberMin : th.pickupAmberMin;
  const red = t.channel === "dinein" ? th.dineinRedMin : th.pickupRedMin;
  const min = ageMs / 60_000;
  if (min >= red) return "red";
  if (min >= amber) return "amber";
  return "ok";
}

export function KdsBoard({ initial }: { initial: KitchenQueue }) {
  // P2 — the device language, from app/staff/layout.tsx. The outage banner below is the first
  // thing on this board to speak it; the rest of the chrome follows in its own commit.
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  const [err, setErr] = useState<string | null>(null); // one board-level action-error region (S8)
  // W10b — ONE degraded state carrying WHEN it started and WHY. `outage` = the server told us it
  // can't reach the platform (immediate, no debounce); `unknown` = repeated transport failures from
  // this tablet (after 2 misses), which must NOT assert whose fault it is. `since` is stamped in the
  // SAME clock space as `nowMs` below (server-space, offset-corrected) so the elapsed used for the
  // paper-flow escalation is skew-free — mixing a server instant with a device clock is exactly the
  // bug the pre-merge review caught.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // one-shot SR announcement (bump/recall)
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  // W3c attention state: keyed flash nonces per new arrival + the offscreen "N new" pill.
  const [pulses, setPulses] = useState<Map<string, number>>(new Map());
  const pulseNonce = useRef(0);
  const prevLive = useRef<Set<string>>(
    new Set(initial.tickets.filter((t) => !t.held).map((t) => t.cartId)),
  );
  const [newCount, setNewCount] = useState(0);

  // W3d recall/undo state (client mirrors of the SQL 2-minute window).
  const [recall, setRecall] = useState<RecallEntry[]>([]);
  const [undo, setUndo] = useState<RecallEntry | null>(null);

  // Board controls (persisted per device).
  const [station, setStation] = useState<"all" | KitchenStation>("all");
  const [railOpen, setRailOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const chime = useRef<KdsChime | null>(null);

  // The elapsed clock: 1s tick, seeded from the SERVER clock (skew-safe — never trust the tablet).
  // clockOffset is computed inside callbacks only (Date.now() in render is impure under the compiler);
  // until the first tick lands, nowMs = the server snapshot itself, which is within 1s of true.
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.serverNow));
  const clockOffset = useRef<number | null>(null);
  useEffect(() => {
    clockOffset.current ??= Date.parse(initial.serverNow) - Date.now();
    const id = setInterval(() => {
      const localNow = Date.now();
      setNowMs(localNow + (clockOffset.current ?? 0));
      // Expire undo/recall entries on the LOCAL clock in the same tick callback (entries are minted
      // with Date.now(); the SQL 2-minute window is the real authority — this keeps the UI honest).
      setRecall((prev) =>
        prev.some((r) => r.expiresAt <= localNow)
          ? prev.filter((r) => r.expiresAt > localNow)
          : prev,
      );
      setUndo((prev) => (prev && prev.expiresAt <= localNow ? null : prev));
    }, 1000);
    return () => clearInterval(id);
    // initial.serverNow is a mount-time snapshot (the prop never changes identity meaningfully).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useWakeLock(); // O-F: a kitchen display that sleeps mid-rush is a downed station

  useEffect(() => {
    // Persisted controls hydrate AFTER mount via a microtask (the TableCartProvider NAME_KEY pattern):
    // SSR + first client render agree, and the setStates run in a callback, not the effect body.
    let active = true;
    void Promise.resolve()
      .then(() => ({
        station: localStorage.getItem(STATION_KEY),
        rail: localStorage.getItem(RAIL_KEY),
        volume: getKdsVolume(),
      }))
      .then(({ station: s, rail, volume: v }) => {
        if (!active) return;
        if (s === "wok" || s === "cold" || s === "drinks") setStation(s);
        if (rail === "1") setRailOpen(true);
        setVolume(v);
      })
      .catch(() => {
        /* private mode — defaults are fine */
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // coalesce overlapping fetches
    inFlight.current = true;
    // Stamp the degrade in the SAME clock space as `nowMs` (server-space, offset-corrected), so the
    // escalation elapsed cancels any device-clock skew.
    const stampNow = () => Date.now() + (clockOffset.current ?? 0);
    try {
      // raceTimeout (W10b): a HUNG poll (socket that never settles) would hold inFlight forever and
      // stop all polling with the board still wearing its live face — turn it into the catch path.
      const res = await raceTimeout(getKitchenQueue());
      if (!res.ok) {
        // W10b (M32): "outage" means the platform is unreachable — NOT a verdict about the cookie.
        // The old redirect here destroyed the queue mid-service, exactly when the kitchen needed its
        // last-known state most. Freeze the ledger and keep polling for recovery.
        if (res.reason === "outage") {
          // Stamp `since` ONCE (keep the original moment across repeated outage polls) in the same
          // server-space clock as `nowMs`, so the escalation measures real elapsed time.
          setDegraded((d) => nextDegraded(d, "outage", stampNow()));
          return;
        }
        // K10 (O-F): an expired staff session or a locked console is NOT a network blip — leave the
        // board for the honest surface instead of wearing "Reconnecting…" until someone reboots it.
        window.location.assign(res.reason === "locked" ? "/staff/lock" : "/staff/login");
        return;
      }
      const queue = res.queue;
      clockOffset.current = Date.parse(queue.serverNow) - Date.now();

      // W3c: diff LIVE tickets (held→live counts — that's new work landing). Flash + chime + pill.
      const liveNow = queue.tickets.filter((t) => !t.held);
      const added = liveNow.filter((t) => !prevLive.current.has(t.cartId));
      prevLive.current = new Set(liveNow.map((t) => t.cartId));
      if (added.length > 0) {
        setPulses((prev) => {
          const next = new Map(prev);
          for (const t of added) next.set(t.cartId, ++pulseNonce.current);
          return next;
        });
        // One chime per arrival wave per channel kind — the counter tone wins if both landed.
        const hasCounter = added.some((t) => t.channel !== "dinein");
        const hasDinein = added.some((t) => t.channel === "dinein");
        if (hasCounter) chime.current?.play("pickup");
        if (hasDinein) chime.current?.play("dinein");
        setNewCount((n) => n + added.length);
      }

      setSnap(queue);
      setErr(null); // a fresh good snapshot clears a stale action-error banner (no perma-stuck error)
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // A transient fetch error keeps the last good queue; the poll + realtime self-heal recover.
      // After 2 consecutive failures, tell the line it's working a stale board (S2-audit S9).
      // Cause `unknown`: this end failed, which is NOT evidence the platform is down (it could be
      // this tablet's wifi) — the copy stays neutral. A later server-verdict outage upgrades it.
      fails.current += 1;
      if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", stampNow()));
      console.error("[KdsBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => {
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  // W3c re-chime: a ticket sitting fully UN-STARTED past the config window nags softly, at most once
  // per window per ticket — audible without being a klaxon (O-C).
  const lastRechime = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!soundOn) return;
    const windowMs = snap.thresholds.rechimeSec * 1000;
    for (const t of snap.tickets) {
      if (t.held || !t.lines.every((l) => l.state === "fired")) continue;
      const age = nowMs - Date.parse(t.firedAt);
      if (age < windowMs) continue;
      const last = lastRechime.current.get(t.cartId) ?? 0;
      if (nowMs - last >= windowMs) {
        // ALWAYS advance the per-ticket timer, even while degraded — then stay silent if degraded.
        // A chime asserts "this ticket still needs you", a liveness claim a board that cannot
        // refresh has no standing to make. But an earlier cut simply returned before this line, so
        // every window stayed expired for the whole degrade and the recovery poll fired all of them
        // in one synchronous pass — KdsChime schedules each tone at the same ctx.currentTime, so
        // they sum into one blast across a kitchen (pre-merge review). Advancing keeps the state
        // honest: after recovery a genuinely stale ticket nags again one full window later.
        lastRechime.current.set(t.cartId, nowMs);
        if (!degraded) chime.current?.play(t.channel === "dinein" ? "dinein" : "pickup", true);
      }
    }
    // Drop tracking for tickets that left the board so the map can't grow unbounded.
    const liveIds = new Set(snap.tickets.map((t) => t.cartId));
    for (const id of lastRechime.current.keys())
      if (!liveIds.has(id)) lastRechime.current.delete(id);
  }, [nowMs, snap, soundOn, degraded]);

  // One-shot notices (bump/recall confirmations) yield the live region back to the count.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  // Focus catch-all (WCAG 2.4.3; the FloorDetailLive pattern): a bump that drops a ticket unmounts the
  // control that held focus. Edge-triggered — restore to the board heading only when focus HAD been on
  // a real control and fell to <body>, so an idle touch device is never focus-planted by the 5s poll.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    if (document.activeElement === document.body && hadRealFocus.current)
      headingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [snap]);

  // ── Derived board state ────────────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (station === "all") return snap.tickets;
    // The station chip filters LINES (a mixed ticket shows only this station's work); a ticket with
    // nothing for this station drops. Ticket bumps send only the DISPLAYED line ids, so a wok-screen
    // bump can never silently serve the drinks a barista hasn't made.
    return snap.tickets
      .map((t) => ({ ...t, lines: t.lines.filter((l) => l.station === station) }))
      .filter((t) => t.lines.length > 0);
  }, [snap.tickets, station]);

  const live = useMemo(() => filtered.filter((t) => !t.held), [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const moreAfter = filtered.length - (safePage + 1) * PAGE_SIZE;
  // New LIVE tickets land at the tail of the live SECTION — which sorts BEFORE the held cards, so
  // "last page" is the wrong jump target when holds exist (adversarial MED-1: the pill would send the
  // cook to a page of held cards). The live tail's page is where an arrival actually renders.
  const liveTailPage = Math.floor(Math.max(0, live.length - 1) / PAGE_SIZE);

  const lateCount = live.filter(
    (t) => urgency(t, nowMs - Date.parse(t.firedAt), snap.thresholds) === "red",
  ).length;
  const oldestMs = live.reduce((max, t) => Math.max(max, nowMs - Date.parse(t.firedAt)), 0);

  // All-Day rail: pure client-side reduce over the LIVE lines (station-filtered — the rail answers
  // "how many mohinga does THIS screen owe right now"), grouped item+modifiers, largest first.
  // P1 moved the reduce into lib/ticket-names.ts (`allDayRows`) so its two rules — the key is the
  // English label, and a row carries the most Burmese known for it — are falsified by a value.
  const allDay = useMemo(() => allDayRows(live.flatMap((t) => t.lines)), [live]);

  // ── Control handlers ───────────────────────────────────────────────────────────────────────────
  const pickStation = (key: "all" | KitchenStation) => {
    setStation(key);
    setPage(0);
    try {
      if (key === "all") localStorage.removeItem(STATION_KEY);
      else localStorage.setItem(STATION_KEY, key);
    } catch {
      /* private mode */
    }
  };
  const toggleRail = () => {
    setRailOpen((open) => {
      try {
        localStorage.setItem(RAIL_KEY, open ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !open;
    });
  };
  const enableSound = async () => {
    chime.current ??= new KdsChime();
    const ok = await chime.current.arm();
    setSoundOn(ok);
    if (ok) chime.current.play("dinein"); // audible confirmation — the tap IS the volume check
  };
  const changeVolume = (v: number) => {
    setVolume(v);
    setKdsVolume(v);
  };
  const jumpToNew = () => {
    setPage(liveTailPage);
    setNewCount(0);
  };

  const onBumped = useCallback(
    (entry: RecallEntry, label: string) => {
      setRecall((prev) => [entry, ...prev].slice(0, 5)); // last 5 (SPEC-KDS §4)
      setUndo({ ...entry, expiresAt: Date.now() + UNDO_MS });
      setNotice(tf(lang, "kds.live.bumped", { x: label }));
      void refresh();
    },
    // `lang` is a REAL dependency, not a lint appeasement: `refresh` is permanently stable, so a
    // deps list of [refresh] freezes this closure at its first render and the live region keeps
    // announcing the bump in whichever language the console started in, for the rest of the shift.
    [lang, refresh],
  );

  const [recallPending, startRecall] = useTransition();
  const doRecall = (entry: RecallEntry) => {
    setErr(null);
    startRecall(async () => {
      try {
        const res = await recallTicket({ cartId: entry.cartId, lineIds: entry.lineIds });
        if (!res.ok) setErr(res.error);
        else {
          setNotice(tf(lang, "kds.live.restored", { x: entry.label }));
          // Filter by CART, not object identity — the undo toast holds a spread COPY of the rail's
          // entry, so an identity filter would leave a dead rail button behind (adversarial LOW-1).
          setRecall((prev) => prev.filter((r) => r.cartId !== entry.cartId));
          if (undo && undo.cartId === entry.cartId) setUndo(null);
          await refresh();
        }
      } catch {
        setErr(tf(lang, "kds.err.recall", { x: entry.label }));
      }
    });
  };

  const count = live.length;
  const heldCount = filtered.length - live.length;

  return (
    <section className="kds-root dark" aria-labelledby="kds-h" onFocusCapture={markFocus}>
      <header className="kds-head">
        <h1 id="kds-h" ref={headingRef} tabIndex={-1} className="kds-title">
          <Chrome lang={lang} k="kds.title" echo="stack" />
        </h1>
        <a
          href="/staff"
          style={{
            color: "var(--t2)",
            fontSize: "var(--kfs-meta)",
            fontWeight: 700,
            textDecoration: "none",
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <Chrome lang={lang} k="kds.back" />
        </a>

        {/* `role="group"`: a bare <div> is the `generic` role, which prohibits an author name — the
            `aria-label` below was silently discarded until rule 3d went in. */}
        <div className="kds-stats" role="group" aria-label={sx(lang, "kds.a11y.stats")}>
          <p className="kds-stat" style={{ margin: 0 }}>
            <b>{count}</b>
            <span lang={lang}>{ts(lang, "kds.stat.open")}</span>
          </p>
          <p className="kds-stat" style={{ margin: 0 }}>
            <b>{count === 0 ? "—" : fmtElapsed(oldestMs)}</b>
            <span lang={lang}>{ts(lang, "kds.stat.oldest")}</span>
          </p>
          <p className={`kds-stat${lateCount > 0 ? " kds-stat-late" : ""}`} style={{ margin: 0 }}>
            <b>{lateCount}</b>
            <span lang={lang}>{ts(lang, "kds.stat.late")}</span>
          </p>
          <p className="kds-stat" style={{ margin: 0 }}>
            <b>{snap.stats.servedToday === 0 ? "—" : fmtElapsed(snap.stats.avgSecs * 1000)}</b>
            <span lang={lang}>{ts(lang, "kds.stat.avg")}</span>
          </p>
        </div>

        {/* ONE board-level live region (S2-audit S8): action errors take precedence, then the poll
            state, then one-shot bump/recall notices, then the count. Bare role="status" implies
            aria-live=polite (the codebase idiom). */}
        <p
          role="status"
          // The region's whole content is chrome in the device language (never a pair — a bilingual
          // live region announces everything twice), so the MARK belongs on the region itself.
          lang={lang}
          style={{
            margin: 0,
            fontSize: "var(--kfs-meta)",
            color: err || degraded ? "var(--warn)" : "var(--t2)",
          }}
        >
          {/* A degraded board wears the shared vocabulary (W10b): snap.serverNow is the ledger's own
              "as of" stamp (display), while the escalation measures elapsed from `degraded.since` —
              BOTH in server-space, so a skewed tablet clock can't decide when staff are told to fall
              back to paper. Elapsed clocks keep ticking on the frozen cards: the food really has
              been waiting that long — that's the truth, not fake liveness. */}
          {err ??
            (degraded
              ? frozenBoardCopy(
                  lang,
                  snap.serverNow,
                  nowMs - degraded.since,
                  "what.queue",
                  degraded.cause,
                )
              : (notice ??
                (count === 0
                  ? ts(lang, "kds.allclear")
                  : tf(lang, plural(count, "kds.open.one", "kds.open.many"), { n: count }) +
                    (heldCount > 0 ? tf(lang, "kds.held.count", { n: heldCount }) : ""))))}
        </p>

        <div className="kds-controls">
          <div
            role="group"
            aria-label={sx(lang, "kds.a11y.stationFilter")}
            style={{ display: "flex", gap: 8 }}
          >
            {STATIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className="kds-chip"
                aria-pressed={station === s.key}
                onClick={() => pickStation(s.key)}
              >
                <Chrome lang={lang} k={s.k} />
              </button>
            ))}
          </div>
          <button type="button" className="kds-chip" aria-pressed={railOpen} onClick={toggleRail}>
            <Chrome lang={lang} k="kds.allday.chip" />
          </button>
          {soundOn ? (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: "var(--kfs-meta)",
              }}
            >
              <Icon name="volume" size={18} />
              <span className="sr-only">{sx(lang, "kds.a11y.volume")}</span>
              <input
                type="range"
                className="kds-vol"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
              />
            </label>
          ) : (
            // Browsers gate audio behind a gesture — this tap at shift start IS the arming (O-C).
            <button type="button" className="kds-chip" onClick={enableSound}>
              <Chrome lang={lang} k="kds.sound.enable" />
            </button>
          )}
          {/* Offscreen-arrival pill: only when the live tail (where arrivals render) is NOT the page
              being watched — never for held-card overflow alone (MED-1). */}
          {newCount > 0 && safePage !== liveTailPage && (
            <button type="button" className="kds-new-pill" onClick={jumpToNew}>
              <Chrome lang={lang} k="kds.new" vars={{ n: newCount }} />
            </button>
          )}
          {/* P2 — last in the control row, after the station chips and the sound control. Mounted
              per surface rather than by the layout: a layout-owned strip would steal height from
              `.kds-root { min-height: 100dvh }`, which is exactly what P4 measures on the real
              15.6" tablet ("count how many tickets scroll"). `check-staff-lang.mjs` rule 4 holds
              THIS surface and `/staff/login` to that mount and reddens if either loses it; the
              other 13 staff pages are on its ratchet, un-converted, and PR B takes them. */}
          <StaffLangSwitch lang={lang} />
        </div>
      </header>

      <div className="kds-body">
        {filtered.length === 0 ? (
          <div style={{ flex: 1 }}>
            {/* W10b — an EMPTY board mid-freeze must not read as an all-clear, and must not promise
                arrivals we can't deliver ("tickets appear the moment an order is sent" is false
                while we can't hear about orders at all). */}
            <EmptyState
              title={<Chrome lang={lang} k={degraded ? "kds.empty.degraded" : "kds.empty"} />}
              subtitle={<Chrome lang={lang} k={degraded ? "kds.empty.outage" : "kds.empty.hint"} />}
            />
          </div>
        ) : (
          <ul className="kds-grid" role="list" aria-label={sx(lang, "kds.a11y.tickets")}>
            {visible.map((t) => (
              <TicketCard
                key={t.cartId}
                ticket={t}
                nowMs={nowMs}
                thresholds={snap.thresholds}
                pulse={pulses.get(t.cartId) ?? null}
                onBumped={onBumped}
                onError={setErr}
                onRefresh={refresh}
              />
            ))}
          </ul>
        )}

        {railOpen && (
          <aside className="kds-rail" aria-label={sx(lang, "kds.a11y.allDay")}>
            <h3>
              <Chrome lang={lang} k="kds.allday.title" echo="stack" />
            </h3>
            {allDay.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--kfs-meta)", color: "var(--t2)" }}>
                <Chrome lang={lang} k="kds.allday.empty" />
              </p>
            ) : (
              <ul role="list">
                {allDay.map((row) => (
                  <li key={row.label}>
                    <span style={{ minWidth: 0 }}>
                      <RailRowText row={row} />
                    </span>
                    <b>×{row.qty}</b>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      {(pageCount > 1 || recall.length > 0) && (
        <footer style={{ display: "grid", gap: 8 }}>
          {pageCount > 1 && (
            <nav className="kds-pager" aria-label={sx(lang, "kds.a11y.pager")}>
              <button
                type="button"
                className="kds-page-btn"
                onClick={() => {
                  const p = Math.max(0, safePage - 1);
                  setPage(p);
                  if (p === liveTailPage) setNewCount(0); // stepping back onto the live tail counts too
                }}
                disabled={safePage === 0}
                aria-label={sx(lang, "kds.a11y.prevPage")}
              >
                ‹
              </button>
              <span className="kds-dots" aria-hidden="true">
                {Array.from({ length: pageCount }, (_, i) => (
                  <span key={i} className="kds-dot" data-current={i === safePage} />
                ))}
              </span>
              <span className="sr-only" lang={lang}>
                {tf(lang, "kds.page", { n: safePage + 1, total: pageCount })}
              </span>
              <button
                type="button"
                className="kds-page-btn"
                onClick={() => {
                  const p = Math.min(pageCount - 1, safePage + 1);
                  setPage(p);
                  // Reaching the live tail = you've seen the newest arrivals; the pill's debt is paid.
                  if (p === liveTailPage) setNewCount(0);
                }}
                disabled={safePage >= pageCount - 1}
                aria-label={sx(lang, "kds.a11y.nextPage")}
              >
                ›
              </button>
              {moreAfter > 0 && (
                <span className="kds-more">
                  <Chrome lang={lang} k="kds.more" vars={{ n: moreAfter }} />
                </span>
              )}
            </nav>
          )}

          {recall.length > 0 && (
            <div className="kds-recall" role="group" aria-label={sx(lang, "kds.a11y.recall")}>
              <span
                style={{
                  fontSize: "var(--kfs-meta)",
                  fontWeight: 800,
                  color: "var(--t2)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  flex: "none",
                }}
              >
                <Chrome lang={lang} k="kds.recall" />
              </span>
              {recall.map((r) => (
                <button
                  key={`${r.cartId}-${r.expiresAt}`}
                  type="button"
                  className="kds-recall-btn"
                  onClick={() => doRecall(r)}
                  disabled={recallPending}
                  aria-label={al(lang, { kind: "recall", label: r.label }).aria}
                >
                  <Icon name="undo" size={16} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </footer>
      )}

      {undo && (
        <div className="kds-undo">
          <span>
            <Chrome lang={lang} k="kds.undo.bumped" vars={{ x: undo.label }} />
          </span>
          <button
            type="button"
            onClick={() => doRecall(undo)}
            disabled={recallPending}
            aria-label={al(lang, { kind: "undo", label: undo.label }).aria}
          >
            <Chrome lang={lang} k="kds.undo" />
          </button>
        </div>
      )}
    </section>
  );
}

function TicketCard({
  ticket,
  nowMs,
  thresholds,
  pulse,
  onBumped,
  onError,
  onRefresh,
}: {
  ticket: KitchenTicket;
  nowMs: number;
  thresholds: KdsThresholds;
  pulse: number | null;
  onBumped: (entry: RecallEntry, label: string) => void;
  onError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const lang = useStaffLang();
  const [pending, startTransition] = useTransition();
  const id = ticketId(lang, ticket);
  const ageMs = nowMs - Date.parse(ticket.firedAt);
  const level = ticket.held ? "ok" : urgency(ticket, ageMs, thresholds);
  const stripClass =
    level === "red"
      ? "kds-strip kds-strip-red kds-strip-pulse"
      : level === "amber"
        ? "kds-strip kds-strip-amber"
        : "kds-strip";

  const bumpAll = () => {
    onError(null);
    startTransition(async () => {
      try {
        const lineIds = ticket.lines.map((l) => l.id);
        const res = await bumpTicket({ cartId: ticket.cartId, lineIds });
        if (!res.ok) onError(res.error);
        else
          onBumped(
            { cartId: ticket.cartId, label: id.main, lineIds, expiresAt: Date.now() + RECALL_MS },
            id.main,
          );
      } catch {
        onError(tf(lang, "kds.err.bump", { x: id.main }));
      }
    });
  };

  const fireNow = () => {
    onError(null);
    startTransition(async () => {
      try {
        const res = await fireTicketNow({ cartId: ticket.cartId });
        if (!res.ok) onError(res.error);
        else await onRefresh();
      } catch {
        onError(tf(lang, "kds.err.fire", { x: id.main }));
      }
    });
  };

  return (
    // The <li> IS the card (never display:contents — Safari drops listitem semantics). Long tickets
    // span two grid rows so text never shrinks to fit a slot (Toast Grid rule).
    <li
      className={`kds-ticket${ticket.held ? " kds-ticket-held" : ""}`}
      aria-label={`${id.main} — ${ts(lang, CHANNEL_KEY[ticket.channel])}${ticket.held ? `, ${ts(lang, "kds.held").trim().replace(/ ·$/, "")}` : ""}`}
      style={ticket.lines.length > 5 ? { gridRow: "span 2" } : undefined}
    >
      {pulse != null && <span key={pulse} className="kds-flash" aria-hidden="true" />}
      <header className={stripClass}>
        <span className="kds-id">
          {id.node}
          {id.sub && <small>{id.sub}</small>}
        </span>
        <span className="kds-strip-side">
          <span className="kds-clock" aria-hidden="true">
            {ticket.held ? fmtSlot(ticket.firedAt) : fmtElapsed(ageMs)}
          </span>
          <span className="sr-only">
            {ticket.held
              ? `fires at ${fmtSlot(ticket.firedAt)}`
              : `${Math.floor(ageMs / 60000)} minutes ${Math.floor((ageMs % 60000) / 1000)} seconds elapsed`}
          </span>
          {/* Class C — a badge this size cannot legibly stack two scripts, so it speaks the
              device's language alone. */}
          <span className="kds-badge" lang={lang}>
            {ticket.held ? ts(lang, "kds.held") : ""}
            {ts(lang, CHANNEL_KEY[ticket.channel])}
          </span>
        </span>
      </header>

      {ticket.held && ticket.pickupSlot && (
        <p className="kds-slot">
          <Chrome lang={lang} k="kds.slot" vars={{ t: fmtSlot(ticket.pickupSlot) }} echo="stack" />
        </p>
      )}

      <ul className="kds-lines" role="list">
        {ticket.lines.map((l) => (
          <KdsLineRow
            key={l.id}
            line={l}
            held={ticket.held}
            onError={onError}
            onRefresh={onRefresh}
          />
        ))}
      </ul>

      {ticket.held ? (
        <button
          type="button"
          className="kds-bump kds-bump-fire"
          onClick={fireNow}
          disabled={pending}
        >
          {pending ? "…" : <Chrome lang={lang} k="kds.fire" echo="stack" />}
        </button>
      ) : (
        <button
          type="button"
          className="kds-bump"
          onClick={bumpAll}
          disabled={pending}
          aria-label={al(lang, { kind: "bump", id: id.main, items: ticket.lines.length }).aria}
        >
          {pending ? (
            "…"
          ) : (
            <>
              <Chrome lang={lang} k="kds.bump" echo="stack" />{" "}
              <Icon name="check" size={22} strokeWidth={2.25} style={{ verticalAlign: "-3px" }} />
            </>
          )}
        </button>
      )}
    </li>
  );
}

function KdsLineRow({
  line,
  held,
  onError,
  onRefresh,
}: {
  line: KitchenLine;
  held: boolean;
  onError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const lang = useStaffLang();
  const [pending, startTransition] = useTransition();
  const [eightySixing, setEightySixing] = useState(false);
  const to = line.state === "fired" ? "in_progress" : "served";

  // W23a — take the DISH off the menu from the ticket that just revealed it is out. Deliberately does
  // NOT touch this line: the ticket in front of the cook was already sold and someone is waiting for
  // it, so the kitchen still owes whatever it can make. What this stops is the NEXT order — which is
  // the only thing an 86 can honestly do.
  const flip = async (menuItemId: string) => {
    setEightySixing(true);
    onError(null);
    try {
      const res = await setItemSoldOut({
        menuItemId,
        soldOut: true,
        // The state this ticket RENDERED with — never a hardcoded `false`. The board polls, so a
        // dish 86’d on another console is already reflected here; asserting `false` would make the
        // compare-and-swap refuse a flip the cook can plainly see is unnecessary.
        expectedSoldOut: line.soldOut,
      });
      // A refusal here is usually "someone already 86'd it", which is a success from the cook's point
      // of view — but say what the server said rather than inventing a cheerful verdict.
      if (!res.ok) onError(res.error);
      else await onRefresh();
    } catch {
      onError(tf(lang, "kds.err.86", { x: line.name }));
    } finally {
      setEightySixing(false);
    }
  };

  const tap = () => {
    onError(null); // clear any prior board-level error as we retry
    startTransition(async () => {
      try {
        const res = await bumpLine({ lineId: line.id, to });
        if (!res.ok) onError(res.error);
        // AWAIT the refresh so `pending` covers the refetch — releasing on the write alone flickered
        // the row back to its stale state for a beat before the new snapshot landed.
        else await onRefresh();
      } catch {
        // S2-audit B3: a thrown action must not silently no-op the tap — surface it on the board region.
        onError(tf(lang, "kds.err.line", { x: line.name }));
      }
    });
  };

  return (
    <li>
      {/* Per-line check-off: the whole row is the tap. Held lines aren't tappable — the kitchen
          hasn't been handed them yet (the SQL guards refuse it anyway; don't offer what can't act). */}
      <button
        type="button"
        className="kds-line"
        data-state={line.state}
        onClick={tap}
        disabled={pending || held}
        aria-label={
          al(lang, {
            kind: "line",
            done: line.state !== "fired",
            qty: line.qty,
            name: line.name,
            nameMy: line.nameMy,
            modifiers: line.modifiers,
          }).aria
        }
      >
        <span className="kds-qty" aria-hidden="true">
          {line.qty}
        </span>
        <span className="kds-line-main">
          {/* P1 — the line Mom reads a hundred times a night: Burmese first when the catalog has it,
              English beneath (`TicketText.tsx`, pinned by its own jsdom suite). P2 — the aria-label
              above now follows it: `lib/staff-labels.ts` builds the name from the SAME string this
              renders, so the accessible name contains the visible label in whichever language is on
              screen (WCAG 2.5.3, the deferral this comment used to record). The name is flat and
              therefore carries no lang; that trade is argued in `staff-labels.ts`. */}
          <TicketLineText line={line} />
          {(line.fulfillment === "togo" || line.state === "in_progress") && (
            <p className="kds-line-tag" lang={lang}>
              {line.fulfillment === "togo" ? ts(lang, "kds.line.bagit") : ""}
              {line.fulfillment === "togo" && line.state === "in_progress" ? " · " : ""}
              {line.state === "in_progress" ? ts(lang, "kds.line.cooking") : ""}
            </p>
          )}
        </span>
      </button>
      {/* W23a — 86 the DISH from the ticket that just told the cook it is out. This is the whole
          point of putting it here rather than only on /staff/menu: the person who discovers the pan
          is empty is holding this screen, and the alternative is walking to another console mid-rush
          (which means it does not happen, and the orders keep coming).

          A SIBLING of the bump button, never nested — a button inside a button is invalid, and the
          bump must stay the full-width primary target. Grocery barcodes carry no menuItemId, and
          there is nothing to 86 about a packaged item on a shelf. */}
      {line.menuItemId &&
        (line.soldOut ? (
          // Already off. A STATEMENT, not a disabled button: there is no action left here, and the
          // put-back lives on /staff/menu where the manager can see the whole menu at once. Saying so
          // stops a second cook walking over to 86 a dish that is already 86'd.
          <p className="kds-line-86-done">
            <Chrome lang={lang} k="kds.86.done" echo="stack" />
          </p>
        ) : (
          <button
            type="button"
            className="kds-line-86"
            disabled={eightySixing}
            onClick={() => void flip(line.menuItemId!)}
            aria-label={al(lang, { kind: "eighty6", name: line.name, nameMy: line.nameMy }).aria}
          >
            {eightySixing ? "…" : <Chrome lang={lang} k="kds.86" echo="stack" />}
          </button>
        ))}
      {line.notes && <p className="kds-note">{line.notes}</p>}
    </li>
  );
}
