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
import {
  KdsChime,
  getKdsSoundWanted,
  getKdsVolume,
  setKdsSoundWanted,
  setKdsVolume,
} from "@/lib/kds-sound";
import { allDayRows } from "@/lib/ticket-names";
import { RailRowText, TicketLineText } from "./TicketText";
import type {
  KdsThresholds,
  KitchenLine,
  KitchenQueue,
  KitchenStation,
  KitchenTicket,
} from "@/lib/kitchen-types";
import Link from "next/link";
import { EmptyState, Icon } from "@mms/ui";
import { useStaffLang } from "./StaffLangProvider";
import { StaffBar } from "./StaffBar";
import { haptic } from "@/lib/haptics";
import { KDS_SIZE_KEY, type KdsSize, kdsPageSize, parseKdsSize } from "@/lib/kds-size";
import { fmtElapsed, spokenElapsed } from "@/lib/kds-time";
import {
  actionErrorStale,
  eightySixOutcome,
  ERR_DWELL_MS,
  kitchenErrOutcome,
  type KdsAct,
  type KdsMsg,
} from "@/lib/kds-errors";
import type { KitchenErrCode } from "@/lib/kitchen-types";
import { MsgText } from "./StaffMsg";
import { HelpButton } from "./HelpButton";
import { Chrome } from "./Chrome";
import { STAFF_CHANNEL_KEY, ts, type StaffKey } from "@/lib/i18n/staff";
import { staffClock } from "@/lib/staff-clock";
import { plural, tf } from "@/lib/i18n/fill";
import { al, dishVisible, sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";
import { servedMoreKey } from "@/lib/kitchen-stats";

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

// The page size follows the TEXT SIZE dial (P7 · lib/kds-size.ts): 8 at small (the 2×4 landscape
// envelope, SPEC-KDS §2), 6 at medium and large, where the CSS drops the wide grid to three columns.
const STATION_KEY = "mms.kds.station";
const RAIL_KEY = "mms.kds.rail";
const UNDO_MS = 6_000;
const RECALL_MS = 120_000; // mirror of the SQL 2-minute recall window (the server is the authority)

type RecallEntry = { cartId: string; label: string; lineIds: string[]; expiresAt: number };
/** K22 — what the undo bar can take back: a bump (the SQL 2-minute recall behind it) or an 86 (the
 *  reverse compare-and-swap on `menu_items.is_sold_out`). One bar, one 6-second window, two kinds. */
type UndoEntry =
  | ({ kind: "bump" } & RecallEntry)
  | { kind: "eighty6"; menuItemId: string; label: string; expiresAt: number };

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

/** tips-1's sweep — the restaurant's clock, never the tablet's (`lib/staff-clock.ts`). */
function fmtSlot(iso: string): string {
  return staffClock(iso);
}

function urgency(t: KitchenTicket, ageMs: number, th: KdsThresholds): "ok" | "amber" | "red" {
  const amber = t.channel === "dinein" ? th.dineinAmberMin : th.pickupAmberMin;
  const red = t.channel === "dinein" ? th.dineinRedMin : th.pickupRedMin;
  const min = ageMs / 60_000;
  if (min >= red) return "red";
  if (min >= amber) return "amber";
  return "ok";
}

export function KdsBoard({ initial, hasPin = false }: { initial: KitchenQueue; hasPin?: boolean }) {
  // P2 — the device language, from app/staff/layout.tsx. The outage banner below is the first
  // thing on this board to speak it; the rest of the chrome follows in its own commit.
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  // One board-level action-error region (S8). kitchen-3: a KEY with its slots or a server sentence,
  // never only a string — the region could otherwise only ever render English (§17's wall).
  const [err, setErr] = useState<KdsMsg | null>(null);
  // kitchen-10 — when the banner went up, on the device clock; a good snapshot may clear it only
  // once it has had its dwell (`actionErrorStale`). The 5-second poll is not the reader's clock.
  const errSince = useRef<number | null>(null);
  const showErr = useCallback((m: KdsMsg | null) => {
    errSince.current = m ? Date.now() : null;
    setErr(m);
  }, []);
  // A refused server action: the dictionary's sentence in the device language, or the exit to
  // /staff/login when the refusal is "go sign in" — a banner in the wrong language is not an answer.
  const onRefused = useCallback(
    (res: { error: string; code: KitchenErrCode }, act: KdsAct, x: string) => {
      const out = kitchenErrOutcome(res, act, x);
      if (out.kind === "leave") {
        window.location.assign(out.href);
        return;
      }
      showErr(out.msg);
    },
    [showErr],
  );
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
  const [undo, setUndo] = useState<UndoEntry | null>(null);

  // Board controls (persisted per device).
  const [station, setStation] = useState<"all" | KitchenStation>("all");
  const [railOpen, setRailOpen] = useState(false);
  // K31 (A4·1) — the rail's two views. Not persisted: the served rail is a question ("did table
  // 6's go out?"), the all-day counts are the standing view a cook works from.
  const [railView, setRailView] = useState<"allday" | "served">("allday");
  const [size, setSize] = useState<KdsSize>("s");
  const [page, setPage] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  // kitchen-8 — "this device wanted sound": armed on a previous mount, disarmed by the reload.
  const [soundWanted, setSoundWanted] = useState(false);
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
        size: localStorage.getItem(KDS_SIZE_KEY),
        volume: getKdsVolume(),
        sound: getKdsSoundWanted(),
      }))
      .then(({ station: s, rail, size: sz, volume: v, sound }) => {
        if (!active) return;
        if (s === "wok" || s === "cold" || s === "drinks") setStation(s);
        if (rail === "1") setRailOpen(true);
        setSize(parseKdsSize(sz));
        setVolume(v);
        setSoundWanted(sound);
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
      // A fresh good snapshot clears a STALE action-error banner (no perma-stuck error) — stale by
      // the dwell, not by the poll: a refusal younger than ERR_DWELL_MS is still being read.
      if (actionErrorStale(errSince.current, Date.now(), ERR_DWELL_MS)) {
        errSince.current = null;
        setErr(null);
      }
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
  const pageSize = kdsPageSize(size);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const moreAfter = filtered.length - (safePage + 1) * pageSize;
  // New LIVE tickets land at the tail of the live SECTION — which sorts BEFORE the held cards, so
  // "last page" is the wrong jump target when holds exist (adversarial MED-1: the pill would send the
  // cook to a page of held cards). The live tail's page is where an arrival actually renders.
  const liveTailPage = Math.floor(Math.max(0, live.length - 1) / pageSize);

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
    haptic("pick"); // a reversible filter — the gold cap moving IS the visible half
    setStation(key);
    setPage(0);
    try {
      if (key === "all") localStorage.removeItem(STATION_KEY);
      else localStorage.setItem(STATION_KEY, key);
    } catch {
      /* private mode */
    }
  };
  // P7 — the text-size dial. Page 0 on change because the page size changes with it and a page
  // index past the new count would show an empty board.
  const pickSize = (next: KdsSize) => {
    haptic("pick"); // every `--kfs-*` tier re-sizing under the thumb is the visible half
    setSize(next);
    setPage(0);
    try {
      if (next === "s") localStorage.removeItem(KDS_SIZE_KEY);
      else localStorage.setItem(KDS_SIZE_KEY, next);
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
    if (ok) {
      setKdsSoundWanted(true);
      chime.current.play("dinein"); // audible confirmation — the tap IS the volume check
    }
  };
  const changeVolume = (v: number) => {
    setVolume(v);
    setKdsVolume(v);
    setKdsSoundWanted(v > 0); // an explicit mute is a choice; the next mount does not nag about it
  };
  // kitchen-8 — a device that wanted sound re-arms off the FIRST tap of the shift (usually a bump):
  // browsers need some gesture, not the chip's. One attempt, silent (no confirmation tone — nobody
  // asked for one); if the device has no audio the warn chip stays and says so.
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!soundWanted || soundOn) return;
    const root = rootRef.current;
    if (!root) return;
    const onFirstTap = () => {
      root.removeEventListener("click", onFirstTap, true);
      chime.current ??= new KdsChime();
      void chime.current.arm().then((ok) => {
        if (ok) setSoundOn(true);
      });
    };
    root.addEventListener("click", onFirstTap, true);
    return () => root.removeEventListener("click", onFirstTap, true);
  }, [soundWanted, soundOn]);
  const jumpToNew = () => {
    setPage(liveTailPage);
    setNewCount(0);
  };

  const onBumped = useCallback(
    (entry: RecallEntry, label: string) => {
      setRecall((prev) => [entry, ...prev].slice(0, 5)); // last 5 (SPEC-KDS §4)
      // ONE slot, two kinds — and only the bump has a rail behind it. A bump landing inside an 86's
      // six seconds (the tap beside it, mid-rush — K22's own scenario) must not evict the dish's
      // only way back: the 86 keeps the bar until it expires, and this bump is reachable from the
      // recall rail the whole two minutes. The reverse (an 86 after a bump) may take the slot.
      setUndo((prev) =>
        prev?.kind === "eighty6" && prev.expiresAt > Date.now()
          ? prev
          : { kind: "bump", ...entry, expiresAt: Date.now() + UNDO_MS },
      );
      setNotice(tf(lang, "kds.live.bumped", { x: label }));
      void refresh();
    },
    // `lang` is a REAL dependency, not a lint appeasement: `refresh` is permanently stable, so a
    // deps list of [refresh] freezes this closure at its first render and the live region keeps
    // announcing the bump in whichever language the console started in, for the rest of the shift.
    [lang, refresh],
  );

  // K22 — an 86 from the ticket is one tap on a target beside the bump, mid-rush, with wet hands.
  // The bump has had a 6-second undo since W3d; the 86 had none, and its reverse lives on another
  // screen. Same bar, same window, same key. The reverse is the compare-and-swap back to
  // available, with `expectedSoldOut: true` because that is the state this board just wrote — a
  // manager who put it back on /staff/menu in between makes the swap refuse honestly.
  const onEightySixed = useCallback(
    (entry: { menuItemId: string; label: string }) => {
      setUndo({ kind: "eighty6", ...entry, expiresAt: Date.now() + UNDO_MS });
      setNotice(tf(lang, "kds.live.86", { x: entry.label }));
      haptic("commit");
    },
    [lang],
  );
  const [undo86Pending, startUndo86] = useTransition();
  const undoEightySix = (entry: Extract<UndoEntry, { kind: "eighty6" }>) => {
    if (undo86Pending) return; // §17 — the handler refuses re-entry; the button is never `disabled`
    showErr(null);
    startUndo86(async () => {
      try {
        const res = await setItemSoldOut({
          menuItemId: entry.menuItemId,
          soldOut: false,
          expectedSoldOut: true,
        });
        if (!res.ok) {
          showErr(eightySixOutcome(res, entry.label));
          return;
        }
        setUndo(null);
        setNotice(tf(lang, "kds.live.86.undone", { x: entry.label }));
        haptic("commit");
        void refresh();
      } catch {
        showErr({ k: "kds.err.86.undo", vars: { x: entry.label } });
      }
    });
  };

  const [recallPending, startRecall] = useTransition();
  const doRecall = (entry: RecallEntry) => {
    if (recallPending) return; // §17 — refuse re-entry in the handler, never via `disabled`
    showErr(null);
    startRecall(async () => {
      try {
        const res = await recallTicket({ cartId: entry.cartId, lineIds: entry.lineIds });
        if (!res.ok) onRefused(res, "recall", entry.label);
        else {
          setNotice(tf(lang, "kds.live.restored", { x: entry.label }));
          // Filter by CART, not object identity — the undo toast holds a spread COPY of the rail's
          // entry, so an identity filter would leave a dead rail button behind (adversarial LOW-1).
          setRecall((prev) => prev.filter((r) => r.cartId !== entry.cartId));
          if (undo && undo.kind === "bump" && undo.cartId === entry.cartId) setUndo(null);
          await refresh();
        }
      } catch {
        showErr({ k: "kds.err.recall", vars: { x: entry.label } });
      }
    });
  };

  const count = live.length;
  const heldCount = filtered.length - live.length;

  return (
    <section
      ref={rootRef}
      className="kds-root dark"
      data-size={size}
      aria-labelledby="kds-h"
      onFocusCapture={markFocus}
    >
      {/* P7·1b — the ONE staff bar: the Screens circle (on a kitchen tablet `/staff` is not a floor
          but the doors, and `?doors=1` wins over the remembered door, so the board can always be
          left), the title as the board's h1 (focus lands here after a bump/recall), the station
          filter as a segmented control in the middle, and the Help door (P7·3 — the text size lives
          inside it) before the switch. In
          Night the bar is glass the tickets scroll under. */}
      <StaffBar
        lang={lang}
        title="kds.title"
        titleId="kds-h"
        titleRef={headingRef}
        titleTabIndex={-1}
        lock={hasPin}
        // A4·5 — the wall (`/board`, the TV the kitchen keeps an eye on) is the KITCHEN's, so its
        // link rides this bar as a circle now that the doors' More is three tiles; it was the one
        // surface reachable in-app only from that grid (before P7, only by bookmark). Named by
        // sr-only text like the counter's approvals circle. Same tab, as the tile was: a tablet
        // peeking at the wall comes back with the browser's own Back.
        trailing={
          <Link href="/board" className="staff-circ staff-press">
            <Icon name="tv" size={20} />
            <span className="sr-only">
              <Chrome lang={lang} k="kds.nav.wall" />
            </span>
          </Link>
        }
        middle={
          <div className="staff-seg" role="group" aria-label={sx(lang, "kds.a11y.stationFilter")}>
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
        }
        help={
          <HelpButton
            lang={lang}
            screen="kitchen"
            size={{ value: size, onPick: pickSize }}
            // The undo window the second card quotes is the board's OWN constant, never typed twice.
            cardVars={{ 2: { n: UNDO_MS / 1000 } }}
            // The sheet portals to <body>, outside `.kds-root.dark`: without this it paints in the
            // document's theme — light on a light-OS tablet — over the Night board.
            sheetClassName="dark"
            // What the board believes about its feed, for a report's diagnostics — never guessed.
            connection={degraded ? "not_updating" : "live"}
          />
        }
      />
      <div className="kds-head">
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
            <b>{!snap.stats.servedToday ? "—" : fmtElapsed(snap.stats.avgSecs * 1000)}</b>
            <span lang={lang}>{ts(lang, "kds.stat.avg")}</span>
          </p>
        </div>

        {/* ONE board-level live region (S2-audit S8): action errors take precedence, then the poll
            state, then one-shot bump/recall notices, then the count. Bare role="status" implies
            aria-live=polite (the codebase idiom). */}
        <p
          role="status"
          // The region's content is chrome in the device language (never a pair — a bilingual live
          // region announces everything twice), and each branch carries its OWN mark: a keyed error
          // arrives marked through <Chrome>, while a server sentence with no twin renders as bare
          // English — a `lang` on the region itself would announce it as Burmese (kitchen-3).
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
          {err ? (
            <MsgText lang={lang} msg={err} />
          ) : (
            <span lang={lang}>
              {degraded
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
                      (heldCount > 0 ? tf(lang, "kds.held.count", { n: heldCount }) : "")))}
            </span>
          )}
        </p>

        <div className="kds-controls">
          {/* The station filter and the text size moved into the bar (P7·1b); the all-day rail, the
              sound control and the arrival pill stay here — they are the board's, not the chrome's. */}
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
            // kitchen-8: a device that WANTED sound wears the warn tone until the first tap re-arms it.
            <button
              type="button"
              className="kds-chip"
              data-muted={soundWanted || undefined}
              onClick={enableSound}
            >
              <Chrome lang={lang} k={soundWanted ? "kds.sound.off" : "kds.sound.enable"} />
            </button>
          )}
          {/* Offscreen-arrival pill: only when the live tail (where arrivals render) is NOT the page
              being watched — never for held-card overflow alone (MED-1). */}
          {newCount > 0 && safePage !== liveTailPage && (
            <button type="button" className="kds-new-pill" onClick={jumpToNew}>
              <Chrome lang={lang} k="kds.new" vars={{ n: newCount }} />
            </button>
          )}
          {/* kitchen-4 — the pager and "+N more" live in the HEAD, beside the arrival pill: the
              count IS the rush signal (SPEC-KDS §2, O-D), and a footer under a grid that grows past
              the viewport is the one place a ninth ticket cannot be seen from. */}
          {pageCount > 1 && (
            <nav className="kds-pager" aria-label={sx(lang, "kds.a11y.pager")}>
              <button
                type="button"
                className="kds-page-btn"
                onClick={() => {
                  if (safePage === 0) return; // §17 — the edge is refused here, not by `disabled`
                  const p = Math.max(0, safePage - 1);
                  setPage(p);
                  if (p === liveTailPage) setNewCount(0); // stepping back onto the live tail counts too
                }}
                aria-disabled={safePage === 0 || undefined}
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
                  if (safePage >= pageCount - 1) return; // §17
                  const p = Math.min(pageCount - 1, safePage + 1);
                  setPage(p);
                  // Reaching the live tail = you've seen the newest arrivals; the pill's debt is paid.
                  if (p === liveTailPage) setNewCount(0);
                }}
                aria-disabled={safePage >= pageCount - 1 || undefined}
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
          {/* P2/1b — the language control is in the staff bar above (rule 4 reaches it through
              `StaffBar`); the bar is sticky and 68px, and P4 measures the board under it. */}
        </div>
      </div>

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
                onEightySixed={onEightySixed}
                onError={showErr}
                onRefused={onRefused}
                onRefresh={refresh}
              />
            ))}
          </ul>
        )}

        {railOpen && (
          <aside
            className="kds-rail"
            aria-label={sx(lang, railView === "served" ? "kds.a11y.served" : "kds.a11y.allDay")}
          >
            {/* K31 — one track, two views; the chosen segment wears the gold cap (the same selection
                vocabulary as the stations in the bar), 44px each, `aria-pressed` the state. */}
            <div
              className="staff-seg kds-rail-seg"
              role="group"
              aria-label={sx(lang, "kds.a11y.railView")}
            >
              <button
                type="button"
                className="kds-chip"
                aria-pressed={railView === "allday"}
                onClick={() => {
                  if (railView !== "allday") haptic("pick");
                  setRailView("allday");
                }}
              >
                <Chrome lang={lang} k="kds.allday.chip" />
              </button>
              <button
                type="button"
                className="kds-chip"
                aria-pressed={railView === "served"}
                onClick={() => {
                  if (railView !== "served") haptic("pick");
                  setRailView("served");
                }}
              >
                <Chrome lang={lang} k="kds.served.chip" />
              </button>
            </div>
            {railView === "allday" ? (
              <>
                <h3 id="kds-allday-h">
                  <Chrome lang={lang} k="kds.allday.title" echo="stack" />
                </h3>
                {allDay.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "var(--kfs-meta)", color: "var(--t2)" }}>
                    <Chrome lang={lang} k="kds.allday.empty" />
                  </p>
                ) : (
                  <ul role="list" aria-labelledby="kds-allday-h">
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
              </>
            ) : (
              <>
                <h3 id="kds-served-h">
                  <Chrome lang={lang} k="kds.served.title" echo="stack" />
                </h3>
                {/* Three honest states, never conflated: unreadable (the ADVISORY read failed —
                    said, not shown as an empty day), empty, and the rows newest-first. */}
                {snap.served === null ? (
                  <p style={{ margin: 0, fontSize: "var(--kfs-meta)", color: "var(--warn)" }}>
                    <Chrome lang={lang} k="kds.served.unreadable" />
                  </p>
                ) : snap.served.lines.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "var(--kfs-meta)", color: "var(--t2)" }}>
                    <Chrome lang={lang} k="kds.served.empty" />
                  </p>
                ) : (
                  <>
                    {snap.served.truncated && (
                      <p
                        style={{
                          margin: "0 0 var(--s2)",
                          fontSize: "var(--kfs-meta)",
                          color: "var(--t2)",
                        }}
                      >
                        <Chrome
                          lang={lang}
                          k={servedMoreKey(snap.served.total)}
                          vars={{ n: snap.served.lines.length, total: snap.served.total ?? 0 }}
                        />
                      </p>
                    )}
                    <ul role="list" aria-labelledby="kds-served-h">
                      {snap.served.lines.map((l) => (
                        <li key={l.id} className="kds-served">
                          <span className="kds-served-text">
                            <TicketLineText line={l} />
                          </span>
                          <span className="kds-served-meta">
                            {/* The quantity the live ticket draws (Codex round 2 on A4·1): one
                                portion or three is the question the cook is asking. */}
                            <b>×{l.qty}</b>
                            {l.voided && (
                              <span lang={lang} style={{ color: "var(--warn)" }}>
                                {ts(lang, "kds.served.voided")}
                              </span>
                            )}
                            {/* The same identity the live ticket renders — the dictionary's table
                                word, a Latin number; a pickup by its code. */}
                            <b>
                              {l.tableNumber !== null ? (
                                <Chrome lang={lang} k="kds.table" vars={{ id: l.tableNumber }} />
                              ) : l.shortCode ? (
                                `#${l.shortCode}`
                              ) : (
                                l.label
                              )}
                            </b>
                            <time dateTime={l.bumpedAt}>{l.bumpedAtLabel}</time>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </aside>
        )}
      </div>

      {recall.length > 0 && (
        <footer style={{ display: "grid", gap: 8 }}>
          {recall.length > 0 && (
            <div className="kds-recall" role="group" aria-label={sx(lang, "kds.a11y.recall")}>
              <span
                style={{
                  fontSize: "var(--kfs-meta)",
                  fontWeight: "var(--fw-heavy)",
                  color: "var(--t2)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--track-wide)",
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
                  aria-disabled={recallPending || undefined}
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
            {undo.kind === "bump" ? (
              <Chrome lang={lang} k="kds.undo.bumped" vars={{ x: undo.label }} />
            ) : (
              <Chrome lang={lang} k="kds.undo.86" vars={{ x: undo.label }} />
            )}
          </span>
          <button
            type="button"
            onClick={() => (undo.kind === "bump" ? doRecall(undo) : undoEightySix(undo))}
            // §17: the attribute is a STATEMENT about the handler behind it — exactly the transition
            // this entry's handler refuses on, never both (a rail recall in flight must not dim the
            // 86's only undo while the tap still acts, or the reverse).
            aria-disabled={(undo.kind === "bump" ? recallPending : undo86Pending) || undefined}
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
  onEightySixed,
  onError,
  onRefused,
  onRefresh,
}: {
  ticket: KitchenTicket;
  nowMs: number;
  thresholds: KdsThresholds;
  pulse: number | null;
  onBumped: (entry: RecallEntry, label: string) => void;
  onEightySixed: (entry: { menuItemId: string; label: string }) => void;
  onError: (msg: KdsMsg | null) => void;
  onRefused: (res: { error: string; code: KitchenErrCode }, act: KdsAct, x: string) => void;
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
    if (pending) return; // §17 — refuse re-entry here; native `disabled` would drop focus mid-tap
    haptic("commit"); // kitchen-9 — the biggest commit on the console buzzes like every door does
    onError(null);
    startTransition(async () => {
      try {
        const lineIds = ticket.lines.map((l) => l.id);
        const res = await bumpTicket({ cartId: ticket.cartId, lineIds });
        if (!res.ok) onRefused(res, "bump", id.main);
        else
          onBumped(
            { cartId: ticket.cartId, label: id.main, lineIds, expiresAt: Date.now() + RECALL_MS },
            id.main,
          );
      } catch {
        onError({ k: "kds.err.bump", vars: { x: id.main } });
      }
    });
  };

  const fireNow = () => {
    if (pending) return; // §17
    haptic("commit");
    onError(null);
    startTransition(async () => {
      try {
        const res = await fireTicketNow({ cartId: ticket.cartId });
        if (!res.ok) onRefused(res, "fire", id.main);
        else await onRefresh();
      } catch {
        onError({ k: "kds.err.fire", vars: { x: id.main } });
      }
    });
  };

  return (
    // The <li> IS the card (never display:contents — Safari drops listitem semantics). Long tickets
    // span two grid rows so text never shrinks to fit a slot (Toast Grid rule).
    <li
      className={`kds-ticket card-textured${ticket.held ? " kds-ticket-held" : ""}`}
      aria-label={`${id.main} — ${ts(lang, STAFF_CHANNEL_KEY[ticket.channel])}${ticket.held ? `, ${ts(lang, "kds.held").trim().replace(/ ·$/, "")}` : ""}`}
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
          {/* K28 — spoken through the dictionary in the device language: this was a bare English
              template literal, which `check-staff-lang` rule 5 cannot see because it is not a
              dictionary string. The visible clock above is `aria-hidden`, so this is the age. */}
          <span className="sr-only" lang={lang}>
            {ticket.held
              ? tf(lang, "kds.slot", { t: fmtSlot(ticket.firedAt) })
              : spokenElapsed(lang, ageMs)}
          </span>
          {/* Class C — a badge this size cannot legibly stack two scripts, so it speaks the
              device's language alone. */}
          <span className="kds-badge" lang={lang}>
            {ticket.held ? ts(lang, "kds.held") : ""}
            {ts(lang, STAFF_CHANNEL_KEY[ticket.channel])}
          </span>
        </span>
      </header>

      {ticket.held && ticket.pickupSlot && (
        <p className="kds-slot" id={`kds-slot-${ticket.cartId}`}>
          <Chrome lang={lang} k="kds.slot" vars={{ t: fmtSlot(ticket.pickupSlot) }} echo="stack" />
        </p>
      )}

      {/* P2n — the one list on the board that had no name: "Items for Table 4". */}
      <ul className="kds-lines" role="list" aria-label={tf(lang, "kds.a11y.lines", { x: id.main })}>
        {ticket.lines.map((l) => (
          <KdsLineRow
            key={l.id}
            line={l}
            held={ticket.held}
            // Only when the slot line actually renders (held AND a pickup slot) — a description
            // pointing at a missing id is a broken promise, not a name.
            slotId={ticket.held && ticket.pickupSlot ? `kds-slot-${ticket.cartId}` : undefined}
            onEightySixed={onEightySixed}
            onError={onError}
            onRefused={onRefused}
            onRefresh={onRefresh}
          />
        ))}
      </ul>

      {ticket.held ? (
        <button
          type="button"
          className="kds-bump kds-bump-fire staff-press"
          onClick={fireNow}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
        >
          {/* The label STAYS through the round trip: this button has no `aria-label`, so an "…"
              swap made its accessible name literally "…", and the 64px zone collapsed under the
              thumb. Busy is the attribute + the CSS dim, never a different label. */}
          <Chrome lang={lang} k="kds.fire" echo="stack" />
        </button>
      ) : (
        <button
          type="button"
          className="kds-bump staff-press"
          onClick={bumpAll}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          aria-label={
            al(lang, { kind: "bump", echo: "stack", id: id.main, items: ticket.lines.length }).aria
          }
        >
          <Chrome lang={lang} k="kds.bump" echo="stack" />
          <Icon name="check" size={22} strokeWidth={2.25} />
        </button>
      )}
    </li>
  );
}

function KdsLineRow({
  line,
  held,
  slotId,
  onEightySixed,
  onError,
  onRefused,
  onRefresh,
}: {
  line: KitchenLine;
  held: boolean;
  /** The ticket's slot line (`.kds-slot`), present only on a held ticket — names WHY a line refuses. */
  slotId?: string;
  onEightySixed: (entry: { menuItemId: string; label: string }) => void;
  onError: (msg: KdsMsg | null) => void;
  onRefused: (res: { error: string; code: KitchenErrCode }, act: KdsAct, x: string) => void;
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
    if (eightySixing) return; // §17 — refuse re-entry here, never via `disabled`
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
      // of view — say what the server said, in the device language, rather than inventing a
      // cheerful verdict.
      if (!res.ok) onError(eightySixOutcome(res, dishVisible(lang, line.name, line.nameMy)));
      else {
        // K22 — the undo bar takes it from here: the dish as the cook sees it (Burmese-first, the
        // same rule the accessible name uses), and the id the reverse swap needs.
        onEightySixed({ menuItemId, label: dishVisible(lang, line.name, line.nameMy) });
        await onRefresh();
      }
    } catch {
      onError({ k: "kds.err.86", vars: { x: dishVisible(lang, line.name, line.nameMy) } });
    } finally {
      setEightySixing(false);
    }
  };

  const tap = () => {
    if (pending || held) return; // §17 — refused in the handler; a held line has nothing to act on
    haptic("pick"); // kitchen-9 — the row wash is the visible half
    onError(null); // clear any prior board-level error as we retry
    startTransition(async () => {
      try {
        const res = await bumpLine({ lineId: line.id, to });
        if (!res.ok) onRefused(res, "line", dishVisible(lang, line.name, line.nameMy));
        // AWAIT the refresh so `pending` covers the refetch — releasing on the write alone flickered
        // the row back to its stale state for a beat before the new snapshot landed.
        else await onRefresh();
      } catch {
        // S2-audit B3: a thrown action must not silently no-op the tap — surface it on the board region.
        onError({ k: "kds.err.line", vars: { x: dishVisible(lang, line.name, line.nameMy) } });
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
        aria-disabled={pending || held || undefined}
        aria-busy={pending || undefined}
        // A held line is refused (the kitchen has not been handed it), and the ticket's slot line
        // says why — "fires at 5:48 PM" rides the name instead of a bare no-op with an action verb.
        aria-describedby={held ? slotId : undefined}
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
            aria-disabled={eightySixing || undefined}
            aria-busy={eightySixing || undefined}
            onClick={() => void flip(line.menuItemId!)}
            aria-label={
              al(lang, { kind: "eighty6", echo: "stack", name: line.name, nameMy: line.nameMy })
                .aria
            }
          >
            <Chrome lang={lang} k="kds.86" echo="stack" />
          </button>
        ))}
      {line.notes && <p className="kds-note">{line.notes}</p>}
    </li>
  );
}
