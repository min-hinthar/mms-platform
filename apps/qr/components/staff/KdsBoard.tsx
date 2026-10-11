"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bumpLine, bumpTicket, fireTicketNow, getKitchenQueue, recallTicket } from "@/lib/kitchen";
import { setItemSoldOut } from "@/lib/menu-availability";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { boundWrite } from "@/lib/bounded-write";
import { createPollGate, type PollGate } from "@/lib/poll-gate";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { useWakeLock } from "@/lib/useWakeLock";
import { KdsChime, getKdsSoundWanted, setKdsSoundWanted } from "@/lib/kds-sound";
import { soundPosture, soundTapIntent, soundWord } from "@/lib/counter-chime";
import { allDayRows } from "@/lib/ticket-names";
import { kdsBadgeKeys, kdsLateCount, kdsTicketLevel, type KdsBadgeLead } from "@/lib/kds-urgency";
import {
  canEightySix,
  lineDescribedBy,
  lineMenuSubject,
  overlaySoldOut,
  pruneSoldOut,
  qtyStands,
  recordSoldOut,
  type SoldOutOverride,
} from "@/lib/kds-line";
import { RailRowText, TicketLineText, TicketNote } from "./TicketText";
import { KdsLineMenu } from "./KdsLineMenu";
import type {
  KdsThresholds,
  KitchenLine,
  KitchenQueue,
  KitchenStation,
  KitchenTicket,
} from "@/lib/kitchen-types";
import Link from "next/link";
import { EmptyState, Icon, removeHeld, useSheetSubject } from "@mms/ui";
import { useEchoesShown, useStaffLang } from "./StaffLangProvider";
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
import { ReloadButton } from "./ReloadOffer";
import { useReloadHold } from "./useReloadHold";
import { Chrome } from "./Chrome";
import { STAFF_CHANNEL_KEY, ts, type StaffKey } from "@/lib/i18n/staff";
import { staffClock } from "@/lib/staff-clock";
import { plural, tf } from "@/lib/i18n/fill";
import { al, chromeVisible, dishVisible, sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";
import { servedMoreKey } from "@/lib/kitchen-stats";
import { KDS_UNDO_MS } from "@/lib/kds-undo";
import {
  cardTags,
  decideRounds,
  sessionStillOn,
  stampLabel,
  stubOf,
  type RoundDecision,
  type RoundStub,
  type RoundTag,
  type TagCard,
} from "@/lib/kitchen-rounds";

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
// PD5 (round 3) — the undo window is `KDS_UNDO_MS` (lib/kds-undo.ts), the ONE settle constant the
// TV's TURN and the phone's pay door read too; it is never typed here again.
const RECALL_MS = 120_000; // mirror of the SQL 2-minute recall window (the server is the authority)

/**
 * A bumped CARD on the Bring-back rail (PD5: one Send, one card). `key` is the card's own key —
 * the rail, the undo pill and the held subject are keyed by it, never by the cart, because a table
 * with two cards must be able to bring back round 1 without touching round 2's chip (m5 risk 1).
 * `label` is the name the tap was made under, captured once (correction 14); `stillOn` is the
 * table whose OTHER card was still on the board at the bump, or null (decision 12), captured with
 * it so the pill's second line never moves the Undo under a finger mid-window (m5 appendix C).
 */
type RecallEntry = {
  key: string;
  cartId: string;
  sessionId: string;
  /** The card as `cardTags` reads it, so a chip on the rail keeps taking part in the ties: a live
   *  card is told apart from the chip of its bumped twin, not only from the cards beside it. */
  card: TagCard;
  /** The card's round DECISION at the tap — the frozen number its face drew and its `label` says.
   *  The rail's ties read it (never the live read), and a recall re-seeds it, so a card that comes
   *  back after a merge re-ranked its session wears the number Mom read (the blind pass on #328). */
  decision: RoundDecision | undefined;
  label: string;
  lineIds: string[];
  /** The device instant of the All done TAP (Codex round 2 on #328). The server stamps `bumped_at`
   *  between the tap and its answer, so a window measured from the tap ends no later than the
   *  server's: the pill closes before `trackStage` (and the TV's TURN, and the pay door) can count
   *  the line served, and the chip before `mms_recall_ticket`'s two minutes run out. */
  tappedAt: number;
  expiresAt: number;
  stillOn: string | null;
};
/** K22 — what the undo bar can take back: a bump (the SQL 2-minute recall behind it) or an 86 (the
 *  reverse compare-and-swap on `menu_items.is_sold_out`). One bar, one 6-second window, two kinds.
 *  Phase 2b — the 86's entry carries `shownAt` (the pill's mount, `performance.now()`): the pill
 *  appears where the ⋯ sheet's button just was, so its Undo is held for `SAME_GESTURE_MS` (§24). */
type UndoEntry =
  | ({ kind: "bump" } & RecallEntry)
  | { kind: "eighty6"; menuItemId: string; label: string; expiresAt: number; shownAt: number };

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
 *
 * PD5 — `tag` is what the card's name, its undo pill and its Bring-back chip ADD after the table
 * (`cardTags`, lib/kitchen-rounds.ts): the round when it is known ("Table 4 · Round 1"), else the
 * card's stamp to the second plus a discriminator only while two labels would still tie ("Table 4
 * · 7:42:05 · 3f2a"; corrections 14 and 17). It is composed HERE, once, so the pill, the chip, the
 * region, the bump's name and the refusals all say the same words (decision 11). Null — a lone
 * card — is today's label, byte for byte. The strip's node never carries it: the round shows as
 * the stub, in its own row.
 */
function ticketId(
  lang: StaffLang,
  t: KitchenTicket,
  tag: RoundTag | null = null,
): { main: string; node: ReactNode; sub: string | null } {
  // The time tag prints the stamp as the restaurant's clock reads it and, only while two labels
  // would tie (or the stamp cannot be printed), the card's discriminator — never an empty part. A
  // counter order that sends twice takes it too ("Min · 7:42:05"): its cards carry no number.
  const tail =
    tag === null
      ? ""
      : tag.kind === "round"
        ? ` · ${tf(lang, "kds.round", { id: tag.n })}${tag.disc === null ? "" : ` · ${tag.disc}`}`
        : [stampLabel(tag.stampIso), tag.disc ?? ""]
            .filter((part) => part !== "")
            .map((part) => ` · ${part}`)
            .join("");
  if (t.channel === "dinein") {
    const vars = { id: t.tableNumber ?? t.label };
    const table = tf(lang, "kds.table", vars);
    return {
      main: `${table}${tail}`,
      node: <Chrome lang={lang} k="kds.table" vars={vars} />,
      sub: null,
    };
  }
  // Phase 2f — an UNPAID counter ticket has no #CODE yet (the order does not exist until it is
  // paid), and its session label is the raw `reg-` token, which means nothing to a cook and must
  // never be printed: the name, or "Walk-up", is its whole handle.
  const code = t.shortCode ? `#${t.shortCode}` : t.unpaid ? null : t.label;
  const main = t.customerName ?? code ?? ts(lang, "reg.row.walkup");
  // The strip's node stays the bare handle (the stamp is the name's, like a dine-in round).
  return { main: `${main}${tail}`, node: main, sub: t.customerName ? code : null };
}

/** Phase 2f — the Unpaid line's words exactly as it draws them (`echo="stack"`, the device's `shown`),
 *  for the ticket's name (WCAG 2.5.3 — the name contains the visible label). */
function unpaidWords(lang: StaffLang, shown: boolean): string {
  return chromeVisible(lang, "settle.unpaid", "stack", shown);
}

/** Phase 3d — a badge's lead word as the badge draws it and the card's name speaks it: the
 *  dictionary value with its trailing " · " separator dropped ("Later", "Late"). */
const badgeWord = (lang: StaffLang, k: KdsBadgeLead): string =>
  ts(lang, k).trim().replace(/ ·$/, "");

// ── Phase 3d ── the sound circle in the bar (the counter's three postures, `lib/counter-chime.ts`).
/** The circle's marker: a tap on it is ITS arm, with its lock — never the board's first-tap re-arm
 *  (which would arm first, then let the circle's own tap read "on" and MUTE). */
const SOUND_SELECTOR = "[data-kds-sound]";
/** A refused (or never-answered) arm, said in the board's ONE region beside an icon-only control. */
const SOUND_REFUSED: KdsMsg = { k: "floor.sound.refused" };
/** The board's chime, made once per mount, carrying the kitchen's mute as a predicate `play()` reads
 *  at every call (the TV wall builds its own with none — the default plays). */
function chimeIn(ref: { current: KdsChime | null }): KdsChime {
  return (ref.current ??= new KdsChime(getKdsSoundWanted));
}

/** tips-1's sweep — the restaurant's clock, never the tablet's (`lib/staff-clock.ts`). */
function fmtSlot(iso: string): string {
  return staffClock(iso);
}

// ── Phase 2h (9b · 9e) ── a kitchen write, bounded. ─────────────────────────────────────────────────
// Next runs Server Actions one at a time per tab, and under `startTransition(async …)` a transition's
// `pending` stays true until its action ANSWERS — while any one hangs, every other transition's
// pending AND every router commit on the tab is held with it (LEARNINGS #149 · #200). So every write
// on this board is called OUTSIDE a transition and awaited through `boundWrite`, and the control's
// busy is a state cleared in `finally`: it frees at the bound. A write still out at the bound has
// THREE honest outcomes, never two: it answered (the server's own words), it threw (the answer was
// lost — it may have landed: "we couldn't confirm", never "couldn't"), or it is still out ("no answer
// yet — it may still go through — reload the board to see"), and its LATE answer is applied when it
// comes: a late ok lands, a late refusal is said. The KDS is never refused while stalled (9d): a
// kitchen tap is not money, and a cook mid-rush must not be stopped by a stuck read elsewhere.

/** The waiting line for a write about `x` (the ticket or the dish those arms already name). */
const waitingMsg = (x: string): KdsMsg => ({ k: "kds.err.waiting", vars: { x } });
/** The thrown (couldn't-confirm) line for a write about `x`. */
const unknownMsg = (x: string): KdsMsg => ({ k: "kds.err.unknown", vars: { x } });
/** The region is saying "reload the board to see" — its Reload button stands beside it. */
const saysWaiting = (m: KdsMsg | null): boolean =>
  m !== null && typeof m !== "string" && m.k === "kds.err.waiting";

/** Where a board write's outcome is said: the board's one region (`err`), and the retire of a
 *  waiting line that a late answer has made stale — ITS OWN, never a newer line. */
type KdsSay = {
  err: (m: KdsMsg | null) => void;
  drop: (m: KdsMsg) => void;
  /** A NEW tap clears the region — but never a standing waiting line: that write is still out, and
   *  its line carries the only Reload on the board. Only its own late answer retires it (`drop`). */
  clear: () => void;
  /** Subjects (`cart:` · `line:` · `dish:`) whose write is still out past the bound. */
  held: ReadonlySet<string>;
  hold: (key: string, m: KdsMsg) => void;
  release: (key: string) => void;
  /** A tap on a held subject: its waiting line is said again (the same line, so its own late answer
   *  still retires it) and NOTHING is sent. True when refused. */
  refuse: (key: string) => boolean;
};

/** The subject a kitchen write holds while it is out past the bound (see `KdsSay.held`). PD5 — a
 *  CARD's writes (its bump, its Cook now, its recall) hold the card's key, never the cart: a waiting
 *  bump on round 1 must not refuse round 2's bump (m5 risk 1). */
const cardKey = (key: string) => `card:${key}`;
const lineKey = (lineId: string) => `line:${lineId}`;
const dishKey = (menuItemId: string) => `dish:${menuItemId}`;

/**
 * One bounded kitchen write. `land` applies an ANSWER — on time (awaited, so the control's busy covers
 * the refetch it starts) or late (the late ok lands, a late refusal is said). Never rejects.
 *
 * Still out at the bound, it HOLDS `key` until its late answer (critic B1): the control is free (its
 * busy ended), but a second tap of the same ticket, line or dish is refused with the waiting line —
 * the line says "don't tap again", and a second write queued behind the hung one would land its own
 * stale refusal ("already updated") over the first one's landing. Every OTHER subject stays live.
 */
async function kitchenWrite<T>(
  raw: Promise<T>,
  x: string,
  key: string,
  say: KdsSay,
  land: (value: T) => void | Promise<void>,
): Promise<void> {
  // ⚠️ The RAW action promise — never `boundWrite(raceTimeout(x))`, whose own timer reads a hang as
  // a throw and drops the late answer (lib/bounded-write.ts).
  const out = await boundWrite(raw);
  if (out.kind === "answer") return land(out.value);
  if (out.kind === "threw") return say.err(unknownMsg(x));
  const waiting = waitingMsg(x);
  say.err(waiting);
  say.hold(key, waiting);
  void out.late.then((late) => {
    // `late` never rejects. The subject is free again, the waiting line goes (if it still stands),
    // and the answer is applied.
    say.release(key);
    say.drop(waiting);
    if (late.kind === "answer") void land(late.value);
    else say.err(unknownMsg(x));
  });
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
  // Phase 2h — the line standing NOW, for a late answer to retire only its own waiting line.
  const errRef = useRef<KdsMsg | null>(null);
  const showErr = useCallback((m: KdsMsg | null) => {
    errSince.current = m ? Date.now() : null;
    errRef.current = m;
    setErr(m);
  }, []);
  const dropErr = useCallback(
    (m: KdsMsg) => {
      if (errRef.current === m) showErr(null);
    },
    [showErr],
  );
  // Phase 2h · critic B12 — a new tap clears a standing refusal, never a standing waiting line.
  const clearErr = useCallback(() => {
    if (!saysWaiting(errRef.current)) showErr(null);
  }, [showErr]);
  // Phase 2h · critic B1 — the subjects whose write is still out past the bound, each with its own
  // waiting line. The REF is what a tap reads (LEARNINGS #126); the state is what `aria-disabled`
  // renders. Released only by the write's own late answer (or a reload).
  const heldRef = useRef(new Map<string, KdsMsg>());
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const hold = useCallback((key: string, m: KdsMsg) => {
    heldRef.current.set(key, m);
    setHeld(new Set(heldRef.current.keys()));
  }, []);
  const release = useCallback((key: string) => {
    if (heldRef.current.delete(key)) setHeld(new Set(heldRef.current.keys()));
  }, []);
  const refuseHeld = useCallback(
    (key: string): boolean => {
      const m = heldRef.current.get(key);
      if (m === undefined) return false;
      showErr(m);
      return true;
    },
    [showErr],
  );
  const say = useMemo<KdsSay>(
    () => ({
      err: showErr,
      drop: dropErr,
      clear: clearErr,
      held,
      hold,
      release,
      refuse: refuseHeld,
    }),
    [showErr, dropErr, clearErr, held, hold, release, refuseHeld],
  );
  // Mounted — re-armed at setup, latched in the poll effect's cleanup (below). Read after every await
  // that can outlive the board: the poll's answer and a write's late refusal.
  const alive = useRef(true);
  // A refused server action: the dictionary's sentence in the device language, or the exit to
  // /staff/login when the refusal is "go sign in" — a banner in the wrong language is not an answer.
  const onRefused = useCallback(
    (res: { error: string; code: KitchenErrCode }, act: KdsAct, x: string) => {
      const out = kitchenErrOutcome(res, act, x);
      if (out.kind === "leave") {
        // Phase 2h · review b (B1) — a LATE refusal can land after the board is gone: a dead board
        // sends nobody anywhere (the screen now showing reads its own session).
        if (alive.current) window.location.assign(out.href);
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

  // W3c attention state: keyed flash nonces per new arrival + the offscreen "N new" pill. PD5 — all
  // keyed by the CARD key, so a table's second Send flashes and chimes as its own arrival (and a
  // no-fire-time bucket, keyed from the raw row, never re-arrives on a poll — correction 3).
  const [pulses, setPulses] = useState<Map<string, number>>(new Map());
  const pulseNonce = useRef(0);
  const prevLive = useRef<Set<string>>(
    new Set(initial.tickets.filter((t) => !t.held).map((t) => t.key)),
  );
  const [newCount, setNewCount] = useState(0);
  // PD5 — the ONE round decision each card carries (`decideRounds`): the face's stub and the
  // composed name both read it, never the live read, so a merge that re-ranks a session's batches
  // can never renumber a card Mom has read (the blind pass on #328). A definite decision is made
  // once; a card that landed while the advisory read had not answered stays provisional and takes
  // its number from the first read that does. Seeded from the server render — the first landing —
  // and advanced in the same batch as each snapshot.
  const [rounds, setRounds] = useState<ReadonlyMap<string, RoundDecision>>(() =>
    decideRounds(new Map(), initial.tickets),
  );
  // A bumped card leaves `rounds` with the next snapshot; its decision rides its rail entry. A
  // recall puts it HERE, and the snapshot that brings the card back seeds `rounds` from it — the
  // number its face drew before the bump, never a fresh read a merge may have re-ranked.
  const returning = useRef(new Map<string, RoundDecision>());

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
  // Phase 2b — the KDS sound truth (§15: "wanted" and "armed" are two facts). `soundOn` FOLLOWS the
  // engine (the subscription below), so a context suspended under a sleeping tablet turns the circle
  // to its warn posture instead of claiming a sound nothing can make.
  const [soundOn, setSoundOn] = useState(false);
  // kitchen-8 — "this device wanted sound": armed on a previous mount (or on this one — the circle's
  // arm sets it), cleared by the circle's mute.
  const [soundWanted, setSoundWanted] = useState(false);
  // Phase 3d — the circle's three postures, the counter's rule (`lib/counter-chime.ts`): off · on ·
  // paused (wanted, the context not running). Only `on` makes a sound — a MUTED board keeps its
  // context running (so unmuting needs no new gesture) and `play()` refuses through the mute.
  const posture = soundPosture(soundWanted, soundOn);
  const soundLive = posture === "on";
  // Phase 3d — the circle's own arm is in flight (§17: the REF is the tap-time guard, the state what
  // `aria-busy` renders); bounded by `armWithin`, so it always frees.
  const [arming, setArming] = useState(false);
  const armingRef = useRef(false);
  const chime = useRef<KdsChime | null>(null);
  // Phase 2i (P2bi) — what a reload for a new build would lose here: the Undo bar (unsent — refuses
  // a person's tap too), the recall rail (the only "Bring back" — refuses the automatic reload), and
  // live sound (a reload turns it off — the automatic reload waits for a person). Phase 3d: LIVE
  // means sounding — a muted board, its context still running, has nothing a reload would silence.
  useReloadHold("unsent", "kitchenUndo", "kds", undo !== null);
  useReloadHold("unread", "kitchenRecall", "kds", recall.length > 0);
  useReloadHold("sound", "kdsSound", "kds", soundLive);

  // Phase 2b · kitchen — the board's CONFIRMED override of a dish's sold-out flag, keyed on the poll
  // sequence (`lib/kds-line.ts`). `fetchSeq` counts every refresh that actually STARTS (a coalesced
  // call starts nothing); an OK 86 records `afterSeq` = the latest started, and a snapshot drops it
  // only when its own fetch started later. So a poll already in flight at the write cannot
  // resurrect the ⋯ (the coalesced-refresh defect), and the first post-write snapshot is the truth
  // even when a second writer moved the dish — never "until the prop agrees" (menu-3's blind pass).
  const fetchSeq = useRef(0);
  const [soldOverrides, setSoldOverrides] = useState<ReadonlyMap<string, SoldOutOverride>>(
    () => new Map(),
  );

  // The elapsed clock: 1s tick, seeded from the SERVER clock (skew-safe — never trust the tablet).
  // clockOffset is computed inside callbacks only (Date.now() in render is impure under the compiler);
  // until the first tick lands, nowMs = the server snapshot itself, which is within 1s of true.
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.serverNow));
  const clockOffset = useRef<number | null>(null);
  useEffect(() => {
    clockOffset.current ??= Date.parse(initial.serverNow) - Date.now();
    const id = setInterval(() => {
      setNowMs(Date.now() + (clockOffset.current ?? 0));
    }, 1000);
    return () => clearInterval(id);
    // initial.serverNow is a mount-time snapshot (the prop never changes identity meaningfully).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The undo pill and the recall chips leave AT their deadlines (the blind pass on #328) — a timer
  // set to `expiresAt` on the LOCAL clock the entries are minted with, never the next 1 s tick, so
  // the pill is never offered past the six seconds `trackStage` keeps (the SQL's two minutes stay
  // the chips' real authority; this keeps the UI honest). The handler refuses a tap that lands
  // between a deadline and its timer (`doRecall`).
  useEffect(() => {
    if (undo === null) return;
    const deadline = undo.expiresAt;
    const id = setTimeout(
      () => setUndo((u) => (u !== null && u.expiresAt <= deadline ? null : u)),
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(id);
  }, [undo]);
  useEffect(() => {
    if (recall.length === 0) return;
    const deadline = Math.min(...recall.map((r) => r.expiresAt));
    const id = setTimeout(
      () => setRecall((prev) => prev.filter((r) => r.expiresAt > deadline)),
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(id);
  }, [recall]);

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
        sound: getKdsSoundWanted(),
      }))
      .then(({ station: s, rail, size: sz, sound }) => {
        if (!active) return;
        if (s === "wok" || s === "cold" || s === "drinks") setStation(s);
        if (rail === "1") setRailOpen(true);
        setSize(parseKdsSize(sz));
        setSoundWanted(sound);
      })
      .catch(() => {
        /* private mode — defaults are fine */
      });
    return () => {
      active = false;
    };
  }, []);

  // Stamp the degrade in the SAME clock space as `nowMs` (server-space, offset-corrected), so the
  // escalation elapsed cancels any device-clock skew. The BOARD's clock, for its own stamps only —
  // the poll gate and the stall ledger read this device's monotonic `monoNow()` (F2 · Codex r2 B4).
  const stampNow = useCallback(() => Date.now() + (clockOffset.current ?? 0), []);
  // ── Phase 2h (9f) ── polls never stack (`lib/poll-gate.ts`). A read `raceTimeout` gave up on at 15 s
  // is still IN Next's one-at-a-time queue: a tick that started a "fresh" read after it only queued
  // another abandoned call behind the hung one, every 5 s — and the next bump had to wait behind all
  // of them. While the RAW read is unanswered no new read starts; the ticks it refused are owed ONE
  // read, kicked just after it answers. Made ONCE for the board's life, on first use from a callback
  // (never during render, never in an effect's setup — a re-setup would forget the hung read), never
  // disposed from a cleanup (Strict Mode would latch it): the kick is guarded by `alive` (declared
  // above `onRefused`, which reads it too), re-armed.
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
  /** One missed read — a failed, hung, or refused-past-the-bound one. Two in a row arm the banner. */
  const miss = useCallback(() => {
    fails.current += 1;
    if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", stampNow()));
  }, [stampNow]);

  const refresh = useCallback(async () => {
    // Phase 2h · critic B4 — a write's LATE answer can land after the board is gone (writes left
    // their transitions, so a navigation commits while one is out), and its `land` asks for a
    // re-read: a dead board starts none — no read queued on the tab, no sign-in verdict sending the
    // tablet away from the screen the cook moved on to.
    if (!alive.current) return;
    const gate = gateOf();
    const asked = gate.ask(); // no clock — never `stampNow()` here (F2)
    if (asked.go === "owed") {
      // Phase 2h (9f) — a tick refused while the raw read has been out a hang's worth of time IS a
      // miss, so the banner arms (and escalates) over a hung read instead of hiding it.
      if (asked.missed) miss();
      return;
    }
    // A bare coalesce is safe: the gate's owed kick is deferred past this read's `finally`, and
    // nothing below is awaited after the read.
    if (inFlight.current) return; // coalesce overlapping fetches
    inFlight.current = true;
    const seq = ++fetchSeq.current; // Phase 2b — stamped at the START (see `fetchSeq`)
    try {
      // raceTimeout (W10b): a HUNG poll (socket that never settles) would hold inFlight forever and
      // stop all polling with the board still wearing its live face — turn it into the catch path.
      // The gate watches the RAW read: the race frees this caller at 15 s, never Next's queue.
      const res = await raceTimeout(gate.watch(getKitchenQueue()), "read");
      // Phase 2h · review b (B1) — the read can answer AFTER the board is gone (it queued behind the
      // lock, a sign-out, another screen's action): `alive` is re-checked after the await, before any
      // side effect — a dead board's "locked" must not hard-reload the screen the cook moved to.
      if (!alive.current) return;
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
      const added = liveNow.filter((t) => !prevLive.current.has(t.key));
      prevLive.current = new Set(liveNow.map((t) => t.key));
      if (added.length > 0) {
        setPulses((prev) => {
          const next = new Map(prev);
          for (const t of added) next.set(t.key, ++pulseNonce.current);
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
      // PD5 — in the same batch: each card's round decision, carried forward and only sharpened; a
      // recalled card takes back the decision it was bumped with. The priors are a SNAPSHOT for the
      // updater (pure), and a card back on the board needs its prior no longer.
      const priors = new Map(returning.current);
      for (const t of queue.tickets) returning.current.delete(t.key);
      setRounds((prev) => decideRounds(prev, queue.tickets, priors));
      // Phase 2b — in the same batch as the snapshot: every override this fetch supersedes drops.
      setSoldOverrides((prev) => pruneSoldOut(prev, seq));
      // A fresh good snapshot clears a STALE action-error banner (no perma-stuck error) — stale by
      // the dwell, not by the poll: a refusal younger than ERR_DWELL_MS is still being read.
      if (actionErrorStale(errSince.current, Date.now(), ERR_DWELL_MS)) {
        errSince.current = null;
        errRef.current = null;
        setErr(null);
      }
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // A transient fetch error keeps the last good queue; the poll + realtime self-heal recover.
      // After 2 consecutive failures, tell the line it's working a stale board (S2-audit S9).
      // Cause `unknown`: this end failed, which is NOT evidence the platform is down (it could be
      // this tablet's wifi) — the copy stays neutral. A later server-verdict outage upgrades it.
      miss();
      console.error("[KdsBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, [gateOf, miss, stampNow]);
  useEffect(() => {
    kick.current = () => void refresh();
  }, [refresh]);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange);

  useEffect(() => {
    alive.current = true; // re-armed at setup (Strict Mode runs cleanup between two setups)
    const id = setInterval(refresh, 5000);
    return () => {
      alive.current = false;
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  // W3c re-chime: a ticket sitting fully UN-STARTED past the config window nags softly, at most once
  // per window per ticket — audible without being a klaxon (O-C). Phase 3d: gated on the context
  // RUNNING, not on the posture — a muted board keeps advancing every timer (`play()` refuses
  // through the mute), so unmuting never releases the whole backlog in one blast.
  const lastRechime = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!soundOn) return;
    const windowMs = snap.thresholds.rechimeSec * 1000;
    for (const t of snap.tickets) {
      if (t.held || !t.lines.every((l) => l.state === "fired")) continue;
      const age = nowMs - Date.parse(t.firedAt);
      if (age < windowMs) continue;
      const last = lastRechime.current.get(t.key) ?? 0;
      if (nowMs - last >= windowMs) {
        // ALWAYS advance the per-ticket timer, even while degraded — then stay silent if degraded.
        // A chime asserts "this ticket still needs you", a liveness claim a board that cannot
        // refresh has no standing to make. But an earlier cut simply returned before this line, so
        // every window stayed expired for the whole degrade and the recovery poll fired all of them
        // in one synchronous pass — KdsChime schedules each tone at the same ctx.currentTime, so
        // they sum into one blast across a kitchen (pre-merge review). Advancing keeps the state
        // honest: after recovery a genuinely stale ticket nags again one full window later.
        lastRechime.current.set(t.key, nowMs);
        if (!degraded) chime.current?.play(t.channel === "dinein" ? "dinein" : "pickup", true);
      }
    }
    // Drop tracking for tickets that left the board so the map can't grow unbounded.
    const liveIds = new Set(snap.tickets.map((t) => t.key));
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
  // (Its effect is declared AFTER the 86 landing's, below — see there.)

  // ── Derived board state ────────────────────────────────────────────────────────────────────────
  // Phase 2b — the tickets as the board KNOWS them: the snapshot with every confirmed sold-out
  // override laid over it. The ONE binding the row, the tag, the ⋯, the sheet, `expectedSoldOut`
  // and the line's name all read — never `snap.tickets` directly.
  const tickets = useMemo(
    () => overlaySoldOut(snap.tickets, soldOverrides),
    [snap.tickets, soldOverrides],
  );
  const filtered = useMemo(() => {
    if (station === "all") return tickets;
    // The station chip filters LINES (a mixed ticket shows only this station's work); a ticket with
    // nothing for this station drops. Ticket bumps send only the DISPLAYED line ids, so a wok-screen
    // bump can never silently serve the drinks a barista hasn't made.
    return tickets
      .map((t) => ({ ...t, lines: t.lines.filter((l) => l.station === station) }))
      .filter((t) => t.lines.length > 0);
  }, [tickets, station]);

  // PD5 — what each card's name, pill and chip add after "Table 4" (`cardTags`): read over the WHOLE
  // snapshot (held cards included) plus the CARDS still on the Bring-back rail, so two cards of one
  // table — or a card and its bumped twin's chip — are never called the same thing; the round comes
  // from the frozen decision the face draws.
  const railCards = useMemo(() => recall.map((r) => r.card), [recall]);
  // A chip's round is the decision its card was bumped with (the rail's tie check reads it too).
  const tagDecisions = useMemo(() => {
    const out = new Map(rounds);
    for (const r of recall) if (!out.has(r.key) && r.decision) out.set(r.key, r.decision);
    return out;
  }, [rounds, recall]);
  const tags = useMemo(
    () => cardTags(tickets, railCards, tagDecisions),
    [tickets, railCards, tagDecisions],
  );

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

  // Phase 3d — the glance strip's Late: the station-filtered tickets whose badge says Late (one
  // predicate, `kdsTicketLevel`, for the count and every badge). The Oldest stat is retired: tickets
  // sort oldest-first, so the oldest is the first card's own clock.
  const lateCount = kdsLateCount(live, nowMs, snap.thresholds);

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
  // Phase 3d — the sound circle's tap (the counter chip's `onTap`, `CounterBell.tsx`). The intent is
  // read from the STORES at the tap, never from the render that drew the circle: `on` mutes; `off`
  // and `paused` both arm — a paused circle's tap is the way back to sound, never a second mute.
  const tapSound = () => {
    if (armingRef.current) return; // §17 — the handler refuses re-entry; never `disabled`
    const c = chimeIn(chime);
    if (soundTapIntent(soundPosture(getKdsSoundWanted(), c.armed)) === "mute") {
      haptic("pick"); // the circle leaving the lit cap is the visible half
      setKdsSoundWanted(false);
      setSoundWanted(false);
      return;
    }
    armingRef.current = true;
    setArming(true);
    // Synchronously, inside this handler: the resume must ride the tap (iOS arms audio nowhere else).
    // `armWithin` never rejects — the engine answers false for any failure and the timer bounds it.
    void c.armWithin().then((ok) => {
      armingRef.current = false;
      setArming(false);
      if (!alive.current) {
        if (ok) setKdsSoundWanted(true); // the tap asked for sound, and it armed: say so next mount
        return;
      }
      setSoundOn(ok);
      if (!ok) {
        // Said in the ONE region (the circle is icon-only), never over a standing waiting line —
        // that line carries the board's only Reload. The words never blame the volume or silent
        // mode: neither can refuse an arm.
        if (!saysWaiting(errRef.current)) showErr(SOUND_REFUSED);
        return;
      }
      dropErr(SOUND_REFUSED);
      // Wanted on THIS mount too (Phase 2b): without it, a device armed for the first time went
      // silent after sleep showing "Turn on sound", and the first-tap re-arm below never attached.
      setKdsSoundWanted(true);
      setSoundWanted(true);
      haptic("pick"); // …with the circle lighting as its visible half
      // The tap IS the volume check — played AFTER the flag, so the chime's mute lets it through.
      c.play("dinein");
    });
  };
  // Phase 2b — the engine's state, heard: arming, and a suspension out from under an armed context
  // (sleep, a call, an OS interruption), each re-read from `armed` in the subscription callback.
  useEffect(() => {
    const c = chimeIn(chime);
    return c.subscribe(() => {
      setSoundOn(c.armed);
      // Phase 3d — a resume the browser let through AFTER the bound lights a paused circle; "tap to
      // try again" beside a lit circle invites the very tap that MUTES it. The refusal goes the
      // moment the context runs (the counter chip drops its alert on the same edge).
      if (c.armed) dropErr(SOUND_REFUSED);
    });
  }, [dropErr]);
  // kitchen-8 — a device that wanted sound re-arms off the FIRST tap of the shift (usually a bump):
  // browsers need some gesture, not the circle's. One attempt, silent (no confirmation tone — nobody
  // asked for one); if the device has no audio the warn circle stays and says so. Phase 3d: the
  // circle's OWN tap is excluded — it is that tap's arm, with its lock; armed here first, the
  // circle's handler would read "on" and MUTE the board it was tapped to turn on.
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!soundWanted || soundOn) return;
    const root = rootRef.current;
    if (!root) return;
    const onFirstTap = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(SOUND_SELECTOR)) return;
      root.removeEventListener("click", onFirstTap, true);
      void chimeIn(chime)
        .arm()
        .then((ok) => {
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
      setUndo(
        (prev) =>
          prev?.kind === "eighty6" && prev.expiresAt > Date.now()
            ? prev
            : entry.tappedAt + KDS_UNDO_MS > Date.now()
              ? { kind: "bump", ...entry, expiresAt: entry.tappedAt + KDS_UNDO_MS }
              : prev, // a late answer past the window: no pill — the rail still brings it back
      );
      // PD5 (decision 12) — the maître d's one quiet line, said once with the bump sentence and
      // only while true: the table's OTHER card is still on the board.
      setNotice(
        tf(lang, "kds.live.bumped", { x: label }) +
          (entry.stillOn === null ? "" : ` ${tf(lang, "kds.undo.stillOn", { x: entry.stillOn })}`),
      );
      void refresh();
    },
    // `lang` is a REAL dependency, not a lint appeasement: `refresh` is permanently stable, so a
    // deps list of [refresh] freezes this closure at its first render and the live region keeps
    // announcing the bump in whichever language the console started in, for the rest of the shift.
    [lang, refresh],
  );

  // K22 — the 86 has had a 6-second undo in the bar since K22 (the bump's since W3d). Same bar, same
  // window, same key. The reverse is the compare-and-swap back to available, with
  // `expectedSoldOut: true` because that is the state this board just wrote — anyone who put it back
  // on /staff/menu in between makes the swap refuse honestly. Phase 2b: no haptic here any more —
  // the 86 buzzes at its TAP (§3: the haptic weights the gesture, never the network).
  const onEightySixed = useCallback(
    (entry: { menuItemId: string; label: string }) => {
      setUndo({
        kind: "eighty6",
        ...entry,
        expiresAt: Date.now() + KDS_UNDO_MS,
        shownAt: performance.now(),
      });
      setNotice(tf(lang, "kds.live.86", { x: entry.label }));
    },
    [lang],
  );
  // Phase 2h (9b) — busy is STATE cleared in `finally` (it frees at the bound), never a transition's
  // `pending`; the REF is the guard read at tap time (LEARNINGS #126), the state what renders.
  const [undo86Busy, setUndo86Busy] = useState(false);
  const undo86BusyRef = useRef(false);
  const undoEightySix = async (entry: Extract<UndoEntry, { kind: "eighty6" }>) => {
    // Phase 2b — the pill mounts in the footprint of the ⋯ sheet's 86 button, so a stray second tap
    // of the 86 would land here and put the dish straight back on sale: held for SAME_GESTURE_MS
    // from the pill's mount, refused with no visual (§24).
    if (removeHeld(entry.shownAt, performance.now())) return;
    if (undo86BusyRef.current) return; // §17 — the handler refuses re-entry; never `disabled`
    // (No held-dish refusal here: the bar leaves at its own six seconds, long before a put-back can
    // be out past the bound, and while the dish is off the menu nothing else can write it.)
    haptic("commit"); // §3 — at the tap; the bar leaving (or the refusal) is the visible half
    say.clear();
    undo86BusyRef.current = true;
    setUndo86Busy(true);
    try {
      await kitchenWrite(
        setItemSoldOut({ menuItemId: entry.menuItemId, soldOut: false, expectedSoldOut: true }),
        entry.label,
        dishKey(entry.menuItemId),
        say,
        (res) => {
          if (!res.ok) {
            showErr(eightySixOutcome(res, entry.label));
            return;
          }
          // The put-back is confirmed: the line wears its ⋯ again at once, before any poll.
          setSoldOverrides((p) => recordSoldOut(p, entry.menuItemId, false, fetchSeq.current));
          // Only THIS dish's bar: a late answer must never take down a newer bump's undo.
          setUndo((u) => (u?.kind === "eighty6" && u.menuItemId === entry.menuItemId ? null : u));
          setNotice(tf(lang, "kds.live.86.undone", { x: entry.label }));
          void refresh();
        },
      );
    } finally {
      undo86BusyRef.current = false;
      setUndo86Busy(false);
    }
  };

  // ── Phase 2b · kitchen — the ⋯ sheet and the 86 behind it ─────────────────────────────────────
  // The sheet's subject is the LIVE line, looked up by id in the overlaid tickets on every render:
  // a line that leaves the board closes the sheet, and the id is cleared in the SAME render (the
  // adjust-state-from-a-prop idiom), so a recall that brings it back never reopens it.
  const [menuLineId, setMenuLineId] = useState<string | null>(null);
  const menuLine = lineMenuSubject(tickets, menuLineId);
  if (menuLineId !== null && menuLine === null) setMenuLineId(null);
  const menu = useSheetSubject(menuLine);
  // The key of the open whose 86 LANDED: that instance is UNMOUNTED, never closed — a closing sheet
  // keeps the board aria-hidden through its exit, and the region's "off the menu" would be spoken
  // under it (sheet.tsx; the cash confirm's worked example).
  const [landedKey, setLandedKey] = useState<number | null>(null);
  // The sheet's one region: a refusal for the line it is about (cleared on open and on each tap).
  const [menuMsg, setMenuMsg] = useState<KdsMsg | null>(null);
  // In flight, per DISH (menuItemId → the line whose sheet sent it). The REF is the guard read at tap
  // time (LEARNINGS #126); the state is what the ⋯ and the sheet render.
  const pending86Ref = useRef(new Set<string>());
  const [pending86, setPending86] = useState<ReadonlyMap<string, string>>(() => new Map());
  // Which line's sheet is open NOW, for routing a result that lands after the render that sent it.
  const menuLineRef = useRef<string | null>(null);
  useEffect(() => {
    menuLineRef.current = menuLineId;
  }, [menuLineId]);
  // Blind review (2026-09-24) — an 86 that lands while ANOTHER line's sheet is open. The success
  // path used to close whatever sheet was open (`setMenuLineId(null)`) and mount the Undo bar in
  // the footprint of that sheet's own sold-out button: the cook reading dish B lost B's sheet, and
  // a tap meant for B's button could land on A's Undo and put A straight back on sale. Now that
  // sheet is left alone, the fact goes to the board's region, and A's Undo waits HERE until the
  // open sheet closes — then it mounts with its own fresh window (and its own same-gesture hold).
  // A REF, read when the sheet id changes: parking changes nothing on screen, so it re-renders
  // nothing; the unpark is the commit where `menuLineId` goes null (Esc, a dismiss, the line leaving).
  const parked86 = useRef<{ menuItemId: string; label: string; seq: number } | null>(null);
  // Codex rounds 2–3 on #304 — ONE Undo slot, so only the NEWEST sold-out tap may fill it, whichever
  // response lands first. Every tap takes the next number; a result whose number is no longer the
  // latest says what happened and offers no Undo (the newer dish owns the slot).
  const tap86Seq = useRef(0);
  // Codex round 5 — ownership goes to the newest SUCCESSFUL tap: a newer tap that is refused or
  // throws changed nothing and must not strip an older success of its Undo.
  const won86Seq = useRef(0);
  useEffect(() => {
    const p = parked86.current;
    if (menuLineId !== null || p === null) return;
    parked86.current = null;
    if (p.seq === won86Seq.current) onEightySixed(p);
  }, [menuLineId, onEightySixed]);
  // The line whose 86 just landed — focus goes to its own button once, and only if focus was
  // orphaned. Set only on OK, consumed by the commit that applied the override, whatever happened.
  const landRef = useRef<string | null>(null);
  useEffect(() => {
    const id = landRef.current;
    if (id === null) return;
    landRef.current = null;
    const ae = document.activeElement;
    if (ae === null || ae === document.body)
      document.getElementById(`kds-line-${id}`)?.focus({ preventScroll: true });
  }, [soldOverrides]);
  // The focus catch-all (above) — declared AFTER the landing, ON PURPOSE (Phase 2h · integration b,
  // K1): React runs a commit's effects in declaration order, and a landed 86 can commit together
  // with a snapshot. Run first, the catch-all took the orphaned focus to the heading, and the landing
  // then found focus "somewhere real" and left it there — never on the dish's line.
  useEffect(() => {
    if (document.activeElement === document.body && hadRealFocus.current)
      headingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [snap]);

  const openMenu = (line: KitchenLine) => {
    // A dish whose 86 is in flight refuses its ⋯ (aria-disabled says so); a sold-out or grocery line
    // has no ⋯ at all.
    if (!canEightySix(line) || (line.menuItemId && pending86Ref.current.has(line.menuItemId)))
      return;
    // Critic B1 — the dish's last write (its 86, or the put-back) is still out past the bound: the
    // ⋯ says so again instead of opening a sheet whose 86 would only queue behind the hung one.
    if (line.menuItemId && say.refuse(dishKey(line.menuItemId))) return;
    haptic("pick"); // the sheet rising is the visible half
    setMenuMsg(null);
    setMenuLineId(line.id);
    // Codex round 5 — the routing ref follows the OPEN too (the close paths already clear it in the
    // same step): an older answer settling right after this tap must see B's sheet, not "none".
    menuLineRef.current = line.id;
  };

  const eightySix = async (line: KitchenLine) => {
    const id = line.menuItemId;
    if (!canEightySix(line) || id === null || pending86Ref.current.has(id)) return;
    // (A held dish never reaches here: its ⋯ refuses to open a sheet, and the sheet already open
    // when the hold was taken has its 86 `blocked` — the Button refuses the tap itself.)
    const key = menu.key;
    const dish = dishVisible(lang, line.name, line.nameMy);
    const seq = ++tap86Seq.current;
    pending86Ref.current.add(id);
    setPending86((p) => new Map(p).set(id, line.id));
    haptic("commit"); // §3 — at the tap, synchronously; the busy button is the visible half
    setMenuMsg(null);
    // Codex round 5 — a stale board error (a failed Done, bring-back or Undo) outranks the notice
    // and outlives it; the old inline sold-out handler cleared it here, and so does this one — never
    // a standing waiting line (critic B12: that write is still out; only its own answer retires it).
    say.clear();
    // A refusal lands where the cook is looking: in the sheet that is open — this line's, or (Codex
    // round 3 on #304) ANOTHER line's, because a modal sheet makes the board behind it aria-hidden
    // and a refusal spoken there would never be heard; the sentence names its dish either way.
    // With no sheet open, the board's one region (with its 8 s dwell).
    const refuse = (m: KdsMsg) => {
      if (menuLineRef.current !== null) setMenuMsg(m);
      else showErr(m);
    };
    // The answer, applied — on time, or LATE (Phase 2h · 9e: a late ok still lands, with the same
    // routing the on-time one takes, read at the moment it lands).
    const settle86 = (res: Awaited<ReturnType<typeof setItemSoldOut>>) => {
      if (res.ok) {
        setSoldOverrides((p) => recordSoldOut(p, id, true, fetchSeq.current));
        // The newest SUCCESS owns the one Undo slot (a newer tap that failed does not count).
        const newest = seq > won86Seq.current;
        if (newest) won86Seq.current = seq;
        if (menuLineRef.current === null || menuLineRef.current === line.id) {
          // ONE commit: the override (SOLD OUT, the ⋯ gone), the sheet unmounted, the undo bar,
          // the region's notice, and the focus landing's flag.
          landRef.current = line.id;
          setLandedKey(key);
          setMenuLineId(null);
          // Codex round 4 on #304 — the routing ref follows the CLOSE now, not the effect after it:
          // another answer settling in this same batch (an older refusal) must see "no sheet" and
          // reach the board's region, not a sheet that is unmounting under it.
          menuLineRef.current = null;
          if (newest) {
            // THIS dish's Undo wins: an older result parked under this sheet is dropped (the
            // drain would otherwise publish it the moment this sheet unmounts).
            parked86.current = null;
            onEightySixed({ menuItemId: id, label: dish });
          } else {
            // A NEWER sold-out was tapped after this one (Codex round 3 — the older response
            // landing LAST): that dish owns the one Undo slot. This one stays sold out, says so,
            // promises nothing, and goes back on from /staff/menu like any other.
            setNotice(tf(lang, "kds.live.86.parked", { x: dish }));
          }
        } else if (!newest) {
          setNotice(tf(lang, "kds.live.86.parked", { x: dish }));
        } else {
          // ANOTHER line's sheet is open (the refusal path's mirror): never touch it. The notice
          // goes to the board's region; the Undo is parked until that sheet closes (above).
          setNotice(tf(lang, "kds.live.86.parked", { x: dish }));
          parked86.current = { menuItemId: id, label: dish, seq };
        }
      } else {
        // After a `stale` refusal (someone else 86'd it) or the landed-but-unlogged ledger sentence,
        // the refresh below shows the dish sold out and the sheet's body turns into the statement.
        refuse(eightySixOutcome(res, dish));
      }
    };
    try {
      // W23a — takes the DISH off the menu; the ticket in front of the cook was already sold, so no
      // line on ANY ticket is touched. `expectedSoldOut` is the LIVE line's flag as the board knows
      // it (snapshot + confirmed override) — `canEightySix` above already refused a line that reads
      // sold out, so this is `false` by construction, and the server re-checks it against the row.
      // Phase 2h — awaited bounded (the RAW promise): the sheet's busy frees at the bound.
      const out = await boundWrite(
        setItemSoldOut({ menuItemId: id, soldOut: true, expectedSoldOut: line.soldOut }),
      );
      if (out.kind === "answer") settle86(out.value);
      else if (out.kind === "threw")
        refuse(unknownMsg(dish)); // the answer was lost: it may have landed
      else {
        // No answer yet: said where the cook is looking (the open sheet), AND on the board's own
        // region, which carries the Reload the sentence promises once the sheet is put away.
        const waiting = waitingMsg(dish);
        showErr(waiting);
        if (menuLineRef.current !== null) setMenuMsg(waiting);
        // Critic B1 — the DISH is held until the late answer: its ⋯ (and this sheet's 86, and an
        // Undo for it) refuse, saying this line again, so no second write queues behind this one.
        hold(dishKey(id), waiting);
        void out.late.then((late) => {
          release(dishKey(id));
          dropErr(waiting);
          setMenuMsg((m) => (m === waiting ? null : m));
          if (late.kind === "answer") settle86(late.value);
          else refuse(unknownMsg(dish));
          void refresh(); // only a fresh snapshot can say what is true now
        });
      }
    } finally {
      pending86Ref.current.delete(id);
      setPending86((p) => {
        const next = new Map(p);
        next.delete(id);
        return next;
      });
      // On EVERY outcome: the ledger-insert failure answers `ok:false` although the flag landed, and
      // only a fresh snapshot can tell the cook what is true.
      void refresh();
    }
  };

  // Phase 2h (9b) — state busy cleared in `finally`, the ref the tap-time guard (see the 86 undo).
  const [recallBusy, setRecallBusy] = useState(false);
  const recallBusyRef = useRef(false);
  // Has an entry's window closed? Read on the device clock its deadline was minted on, AT the tap —
  // a callback like `stampNow`, so the clock is never read during render.
  const windowClosed = useCallback((expiresAt: number) => Date.now() >= expiresAt, []);
  const doRecall = async (entry: RecallEntry, from: "pill" | "chip") => {
    // Refused at the TAP once its window has closed (the blind pass on #328): a tap landing between
    // the deadline and the timer that unmounts it sends nothing. Past the pill's six seconds
    // `trackStage` already counts the line served, so the pill just leaves (the rail's chip still
    // brings the card back inside its own window); past the chip's two minutes the SQL refuses too,
    // so the chip leaves and the region says why.
    if (windowClosed(entry.expiresAt)) {
      if (from === "pill") setUndo((u) => (u?.kind === "bump" && u.key === entry.key ? null : u));
      else {
        setRecall((prev) => prev.filter((r) => r.key !== entry.key));
        showErr({ k: "kds.err.recall.window", vars: { x: entry.label } });
      }
      return;
    }
    if (recallBusyRef.current) return; // §17 — refuse re-entry in the handler, never via `disabled`
    // Critic B1 — this card's last write is still out past the bound: said again, nothing sent
    // (a second recall queued behind it would answer "too late" over a recall that landed).
    if (say.refuse(cardKey(entry.key))) return;
    say.clear();
    recallBusyRef.current = true;
    setRecallBusy(true);
    try {
      await kitchenWrite(
        recallTicket({ cartId: entry.cartId, lineIds: entry.lineIds }),
        entry.label,
        cardKey(entry.key),
        say,
        async (res) => {
          if (!res.ok) {
            onRefused(res, "recall", entry.label);
            return;
          }
          setNotice(tf(lang, "kds.live.restored", { x: entry.label }));
          // The card comes back wearing the round it was bumped with (the blind pass on #328).
          if (entry.decision) returning.current.set(entry.key, entry.decision);
          // Filter by the CARD key, not object identity — the undo toast holds a spread COPY of the
          // rail's entry, so an identity filter would leave a dead rail button behind (adversarial
          // LOW-1) — and never by the cart: recalling round 1 must leave round 2's chip (PD5).
          setRecall((prev) => prev.filter((r) => r.key !== entry.key));
          // Read at the moment it lands (a late answer's closure is stale): only this card's undo.
          setUndo((u) => (u?.kind === "bump" && u.key === entry.key ? null : u));
          await refresh();
        },
      );
    } finally {
      recallBusyRef.current = false;
      setRecallBusy(false);
    }
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
          filter as a segmented control in the middle, and the tail — Phase 3d, "the pass at two
          distances": TV · sound · Aa · ? · Lock. The sound circle and the Aa circle are the two
          one-tap controls a cook reaches wet-handed (K38); Aa is HelpButton's (it opens the Help
          sheet straight onto Text size), the language still lives inside Help (P2e). In Night the
          bar is glass the tickets scroll under. */}
      <StaffBar
        lang={lang}
        title="kds.title"
        titleId="kds-h"
        titleRef={headingRef}
        titleTabIndex={-1}
        lock={hasPin}
        live={degraded ? "not_updating" : "live"} // Phase 2b · feedback — the banner's own truth
        // A4·5 — the wall (`/board`, the TV the kitchen keeps an eye on) is the KITCHEN's, so its
        // link rides this bar as a circle now that the doors' More is three tiles; it was the one
        // surface reachable in-app only from that grid (before P7, only by bookmark). Named by
        // sr-only text like the counter's approvals circle. Same tab, as the tile was: a tablet
        // peeking at the wall comes back with the browser's own Back.
        trailing={
          <>
            <Link href="/board" className="staff-circ staff-press">
              <Icon name="tv" size={20} />
              <span className="sr-only">
                <Chrome lang={lang} k="kds.nav.wall" />
              </span>
            </Link>
            {/* Phase 3d — the sound circle (K38): the counter chip's three postures as a bar circle,
                named by sr-only text like every circle here (§17 narrowed — the counter keeps its
                chip only for the 390 manager bar's width). Lit cap when on (the shared pressed
                list), warn ring + dot when paused, the plain circle when off. Busy is the
                attribute, never `disabled`; its bounded arm always frees it. */}
            <button
              type="button"
              className="staff-circ staff-press"
              data-kds-sound=""
              aria-pressed={posture === "on"}
              data-muted={posture === "paused" || undefined}
              aria-busy={arming || undefined}
              aria-disabled={arming || undefined}
              onClick={tapSound}
            >
              <Icon name={posture === "on" ? "volume" : "volume-off"} size={20} />
              <span className="sr-only">
                <Chrome lang={lang} k={soundWord(posture)} />
              </span>
            </button>
          </>
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
            // The undo window the second card quotes is the kitchen's ONE constant, never typed twice.
            cardVars={{ 2: { n: KDS_UNDO_MS / 1000 } }}
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
        {/* Phase 3d — the glance strip: Open · Late, the two numbers read from across the kitchen,
            drawn at the identity tier (`--kfs-id`, the table number's size). Oldest is the first
            card's own clock; Avg today moved to the Served view, where the day's work is. */}
        <div className="kds-stats" role="group" aria-label={sx(lang, "kds.a11y.stats")}>
          <p className="kds-stat" style={{ margin: 0 }}>
            <b>{count}</b>
            <span lang={lang}>{ts(lang, "kds.stat.open")}</span>
          </p>
          <p className={`kds-stat${lateCount > 0 ? " kds-stat-late" : ""}`} style={{ margin: 0 }}>
            <b>{lateCount}</b>
            <span lang={lang}>{ts(lang, "kds.stat.late")}</span>
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
        {/* Phase 2h — "no answer yet … reload the board to see": the console is installed standalone
            (no browser reload), so the button the sentence promises stands BESIDE the one region,
            never inside it (a control in a live region; a second region). */}
        {saysWaiting(err) && (
          <div className="mms-rise">
            <ReloadButton lang={lang} />
          </div>
        )}

        <div className="kds-controls">
          {/* The station filter moved into the bar (P7·1b), and Phase 3d moved the sound control
              there too, as a circle beside the Aa that opens the text size (K38): the all-day rail,
              the arrival pill and the pager stay here — they are the board's, not the chrome's. */}
          <button type="button" className="kds-chip" aria-pressed={railOpen} onClick={toggleRail}>
            <Chrome lang={lang} k="kds.allday.chip" />
          </button>
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
          {/* P2e — the language control is the Help sheet's Language row (rule 4 reaches it through
              `HelpButton`); the bar is sticky and 68px, and P4 measures the board under it. */}
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
                key={t.key}
                ticket={t}
                tag={tags.get(t.key) ?? null}
                stub={stubOf(rounds.get(t.key))}
                decision={rounds.get(t.key)}
                // Decision 12: the table's OTHER card is on the board — the whole snapshot, held
                // cards included, never the station-filtered view (m5 risk 9).
                stillOn={t.channel === "dinein" && sessionStillOn(t, tickets)}
                nowMs={nowMs}
                thresholds={snap.thresholds}
                pulse={pulses.get(t.key) ?? null}
                onBumped={onBumped}
                menuOpenId={menuLineId}
                pending86={pending86}
                onOpenMenu={openMenu}
                onRefused={onRefused}
                say={say}
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
                {/* Phase 3d — "Avg today" left the glance strip for the view about the day's work.
                    Shown only on a day something was served: an unknown count (null — the stats
                    read failed) and a zero both draw NOTHING, never a made-up "0:00". */}
                {snap.stats.servedToday ? (
                  <p className="kds-stat kds-served-avg">
                    <b>{fmtElapsed(snap.stats.avgSecs * 1000)}</b>
                    <span lang={lang}>{ts(lang, "kds.stat.avg")}</span>
                  </p>
                ) : null}
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
                  key={`${r.key}-${r.expiresAt}`}
                  type="button"
                  className="kds-recall-btn"
                  onClick={() => void doRecall(r, "chip")}
                  aria-disabled={recallBusy || held.has(cardKey(r.key)) || undefined}
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

      {/* Phase 2b — the ⋯ sheet, ONE per board. Held through its exit by `useSheetSubject` (a
          dismissed sheet slides down with its subject), keyed per open, and UNMOUNTED — not
          closed — once its 86 has landed (`landedKey`). */}
      {menu.held && landedKey !== menu.key && (
        <KdsLineMenu
          key={menu.key}
          line={menu.held}
          open={menu.open}
          size={size}
          pending={
            menu.held.menuItemId !== null && pending86.get(menu.held.menuItemId) === menu.held.id
          }
          blocked={
            menu.held.menuItemId !== null &&
            ((pending86.has(menu.held.menuItemId) &&
              pending86.get(menu.held.menuItemId) !== menu.held.id) ||
              // Critic B1 — the dish's 86 (or put-back) is still out past the bound.
              held.has(dishKey(menu.held.menuItemId)))
          }
          msg={menuMsg}
          // Phase 2h · integration b (K2) — the board behind the sheet is aria-hidden: while the
          // sheet's region says "reload the board to see", the sheet offers the Reload itself.
          reload={saysWaiting(menuMsg)}
          on86={(l) => void eightySix(l)}
          onOpenChange={(o) => {
            if (!o) {
              setMenuLineId(null);
              menuLineRef.current = null; // see the 86 success path (Codex round 4)
            }
          }}
        />
      )}

      {undo && (
        <div className="kds-undo">
          {/* PD5 — the pill keeps today's cream shape and words (the board's ONE cream object,
              decision 14). After a bump it names the card (`label`, the composed id) and, only
              while the table's other card was still on the board at the bump, says so on a second
              line — frozen with the entry for the pill's life, so the Undo never slides under a
              finger when a sibling leaves mid-window (appendix C). */}
          <span className="kds-undo-text">
            {undo.kind === "bump" ? (
              <Chrome lang={lang} k="kds.undo.bumped" vars={{ x: undo.label }} />
            ) : (
              <Chrome lang={lang} k="kds.undo.86" vars={{ x: undo.label }} />
            )}
            {undo.kind === "bump" && undo.stillOn !== null && (
              <span className="kds-undo-sub">
                <Chrome lang={lang} k="kds.undo.stillOn" vars={{ x: undo.stillOn }} />
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() =>
              void (undo.kind === "bump" ? doRecall(undo, "pill") : undoEightySix(undo))
            }
            // §17: the attribute is a STATEMENT about the handler behind it — exactly the write this
            // entry's handler refuses on, never both (a rail recall in flight must not dim the 86's
            // only undo while the tap still acts, or the reverse).
            aria-disabled={(undo.kind === "bump" ? recallBusy : undo86Busy) || undefined}
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
  tag,
  stub,
  decision,
  stillOn,
  nowMs,
  thresholds,
  pulse,
  onBumped,
  menuOpenId,
  pending86,
  onOpenMenu,
  onRefused,
  say,
  onRefresh,
}: {
  ticket: KitchenTicket;
  /** PD5 — what this card's name, pill and chip add after the table (`cardTags`); null = today's. */
  tag: RoundTag | null;
  /** PD5 — the round stub this card wears, decided at its first landing; null = no row B. */
  stub: RoundStub | null;
  /** PD5 — the card's round decision (what `stub` and `tag` were drawn from), for its rail entry. */
  decision: RoundDecision | undefined;
  /** PD5 — the table's OTHER card is on the board right now (decision 12). */
  stillOn: boolean;
  nowMs: number;
  thresholds: KdsThresholds;
  pulse: number | null;
  onBumped: (entry: RecallEntry, label: string) => void;
  /** Phase 2b — the line whose ⋯ sheet is open (its ⋯ is `aria-expanded`). */
  menuOpenId: string | null;
  /** Phase 2b — dishes whose 86 is in flight → the line whose sheet sent it. */
  pending86: ReadonlyMap<string, string>;
  onOpenMenu: (line: KitchenLine) => void;
  onRefused: (res: { error: string; code: KitchenErrCode }, act: KdsAct, x: string) => void;
  /** Phase 2h — where a bounded write's waiting / couldn't-confirm line goes (the board's region). */
  say: KdsSay;
  onRefresh: () => Promise<void> | void;
}) {
  const lang = useStaffLang();
  // P2e review (A5) — the device's echo state, the value <Chrome> reads: every name below that
  // composes an echoed label takes it too, so the name follows the mode the label renders in.
  const echoes = useEchoesShown();
  // Phase 2h (9b) — busy is STATE cleared in `finally` (it frees at the bound), never a transition's
  // `pending`; the ref is the tap-time guard (LEARNINGS #126). The name stays `pending` for the render.
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const id = ticketId(lang, ticket, tag);
  const ageMs = nowMs - Date.parse(ticket.firedAt);
  // Phase 3d — ONE predicate for this strip, its badge's word and the glance strip's Late count.
  const level = kdsTicketLevel(ticket, nowMs, thresholds);
  // "Later" on a held card, "Late" on a red one — the badge says it and the card's name speaks it
  // (WCAG 1.4.1: under reduced motion the pulse stops, and red would differ from amber by hue alone).
  const leadWords = kdsBadgeKeys(ticket.held, level).map((k) => badgeWord(lang, k));
  const stripClass =
    level === "red"
      ? "kds-strip kds-strip-red kds-strip-pulse"
      : level === "amber"
        ? "kds-strip kds-strip-amber"
        : "kds-strip";

  // Critic B1 — this card's last write is still out past the bound (a bump or a Cook now): the
  // control is free, but a second tap only says the waiting line again and sends nothing.
  const subject = cardKey(ticket.key);
  const waiting = say.held.has(subject);

  const bumpAll = async () => {
    if (pendingRef.current) return; // §17 — refuse re-entry here; native `disabled` drops focus
    if (say.refuse(subject)) return;
    haptic("commit"); // kitchen-9 — the biggest commit on the console buzzes like every door does
    say.clear(); // a standing refusal goes — never another write's waiting line (critic B12)
    pendingRef.current = true;
    setPending(true);
    try {
      // PD5 — exactly THIS card's displayed ids: a table's other card is untouched (the RPC serves
      // only the ids it is given, so no RPC change).
      const lineIds = ticket.lines.map((l) => l.id);
      const label = id.main; // the name the tap was made under — a late answer says the same one
      const tappedAt = Date.now(); // the windows start here, never at the answer
      // Decision 12, captured at the tap: the table whose other card is still on the board.
      const still = stillOn
        ? tf(lang, "kds.table", { id: ticket.tableNumber ?? ticket.label })
        : null;
      await kitchenWrite(
        bumpTicket({ cartId: ticket.cartId, lineIds }),
        label,
        subject,
        say,
        (res) => {
          if (!res.ok) onRefused(res, "bump", label);
          else
            onBumped(
              {
                key: ticket.key,
                cartId: ticket.cartId,
                sessionId: ticket.sessionId,
                card: {
                  key: ticket.key,
                  sessionId: ticket.sessionId,
                  channel: ticket.channel,
                  fireBatch: ticket.fireBatch,
                  round: ticket.round,
                  stampIso: ticket.stampIso,
                  tableNumber: ticket.tableNumber,
                  label: ticket.label,
                },
                decision,
                label,
                lineIds,
                tappedAt,
                expiresAt: tappedAt + RECALL_MS,
                stillOn: still,
              },
              label,
            );
        },
      );
    } finally {
      pendingRef.current = false;
      setPending(false); // frees AT THE BOUND (9a's fact 3), whatever the action is doing
    }
  };

  const fireNow = async () => {
    if (pendingRef.current) return; // §17
    if (say.refuse(subject)) return;
    haptic("commit");
    say.clear();
    pendingRef.current = true;
    setPending(true);
    try {
      const label = id.main;
      await kitchenWrite(
        fireTicketNow({ cartId: ticket.cartId }),
        label,
        subject,
        say,
        async (res) => {
          if (!res.ok) onRefused(res, "fire", label);
          else await onRefresh(); // on time, busy covers the refetch — no stale-label flicker
        },
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    // The <li> IS the card (never display:contents — Safari drops listitem semantics). Long tickets
    // span two grid rows so text never shrinks to fit a slot (Toast Grid rule).
    <li
      className={`kds-ticket card-textured${ticket.held ? " kds-ticket-held" : ""}`}
      aria-label={`${id.main} — ${ts(lang, STAFF_CHANNEL_KEY[ticket.channel])}${leadWords.map((w) => `, ${w}`).join("")}${ticket.unpaid ? `, ${unpaidWords(lang, echoes)}` : ""}`}
      style={ticket.lines.length > 5 ? { gridRow: "span 2" } : undefined}
    >
      {pulse != null && <span key={pulse} className="kds-flash" aria-hidden="true" />}
      {/* PD5 — a card with a round stub gets a second strip row (row B); row A is byte-identical to
          a card without one, and nothing on this card changes because another card arrived or left
          (decision 5). */}
      <header className={`${stripClass}${stub === null ? "" : " kds-strip-rows"}`}>
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
              device's language alone. Phase 3d — its lead word (`kdsBadgeKeys`): "Later · " on a
              held card, byte-identical to before; "Late · " on a red one. */}
          <span className="kds-badge" lang={lang}>
            {leadWords.map((w) => `${w} · `).join("")}
            {ts(lang, STAFF_CHANNEL_KEY[ticket.channel])}
          </span>
        </span>
        {/* THE ROUND STUB (m5): a label, never a control — an outline plus a dotted perforation
            with coupon notches (the vocabulary's one stub shape), at the clock's tier, never filled
            and never louder than Late (MARK tier; appendix B4/B5). "အလှည့် 2" with a Latin digit
            (`kds.round`'s identifier slot), or the guest's own "next round" word when the number
            cannot be read and an older card of this table is live (decision 10). No echo: the
            round is part of the identity, which has none (decision 13). It rides the card's own
            arrival flash and adds no motion of its own. */}
        {stub !== null && (
          <p className="kds-round">
            {stub.kind === "n" ? (
              <Chrome lang={lang} k="kds.round" vars={{ id: stub.n }} />
            ) : (
              <Chrome lang={lang} k="kds.round.next" />
            )}
          </p>
        )}
      </header>

      {/* Phase 2f — sent before it was paid (a counter order, pay at pickup). Said, NOT in warn: the
          kitchen cooks it the same either way; the money is the counter's to take. */}
      {ticket.unpaid && (
        <p className="kds-unpaid">
          <Icon name="receipt" size={18} aria-hidden />
          <Chrome lang={lang} k="settle.unpaid" echo="stack" />
        </p>
      )}

      {ticket.held && ticket.pickupSlot && (
        <p className="kds-slot" id={`kds-slot-${ticket.key}`}>
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
            slotId={ticket.held && ticket.pickupSlot ? `kds-slot-${ticket.key}` : undefined}
            menuOpen={menuOpenId === l.id}
            pending86={pending86}
            onOpenMenu={onOpenMenu}
            onRefused={onRefused}
            say={say}
            onRefresh={onRefresh}
          />
        ))}
      </ul>

      {ticket.held ? (
        <button
          type="button"
          className="kds-bump kds-bump-fire staff-press"
          onClick={() => void fireNow()}
          aria-disabled={pending || waiting || undefined}
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
          onClick={() => void bumpAll()}
          aria-disabled={pending || waiting || undefined}
          aria-busy={pending || undefined}
          aria-label={
            al(lang, {
              kind: "bump",
              echo: "stack",
              shown: echoes,
              id: id.main,
              items: ticket.lines.length,
            }).aria
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
  menuOpen,
  pending86,
  onOpenMenu,
  onRefused,
  say,
  onRefresh,
}: {
  line: KitchenLine;
  held: boolean;
  /** The ticket's slot line (`.kds-slot`), present only on a held ticket — names WHY a line refuses. */
  slotId?: string;
  /** Phase 2b — this line's ⋯ sheet is open. */
  menuOpen: boolean;
  pending86: ReadonlyMap<string, string>;
  onOpenMenu: (line: KitchenLine) => void;
  onRefused: (res: { error: string; code: KitchenErrCode }, act: KdsAct, x: string) => void;
  /** Phase 2h — where a bounded write's waiting / couldn't-confirm line goes (the board's region). */
  say: KdsSay;
  onRefresh: () => Promise<void> | void;
}) {
  const lang = useStaffLang();
  // Phase 2h (9b) — state busy cleared in `finally`, the ref the tap-time guard (see TicketCard).
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const to = line.state === "fired" ? "in_progress" : "served";

  const tap = async () => {
    if (pendingRef.current || held) return; // §17 — refused in the handler; a held line has nothing to act on
    // Critic B1 — this line's last write is still out past the bound: said again, nothing sent.
    if (say.refuse(lineKey(line.id))) return;
    haptic("pick"); // kitchen-9 — the row wash is the visible half
    say.clear(); // clear any prior board-level refusal as we retry — never a waiting line (B12)
    pendingRef.current = true;
    setPending(true);
    const dish = dishVisible(lang, line.name, line.nameMy);
    try {
      // S2-audit B3: a thrown action must not silently no-op the tap — it is said on the board region
      // (Phase 2h: as "couldn't confirm", since a lost answer may have landed).
      await kitchenWrite(
        bumpLine({ lineId: line.id, to }),
        dish,
        lineKey(line.id),
        say,
        async (res) => {
          if (!res.ok) onRefused(res, "line", dish);
          // AWAIT the refresh so busy covers the refetch — releasing on the write alone flickered the
          // row back to its stale state for a beat before the new snapshot landed.
          else await onRefresh();
        },
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const noteId = line.notes ? `kds-note-${line.id}` : undefined;
  const inFlight = line.menuItemId !== null && pending86.has(line.menuItemId);
  // Critic B1 — this line's own write, and its dish's 86 / put-back, still out past the bound.
  const lineWaiting = say.held.has(lineKey(line.id));
  const dishWaiting = line.menuItemId !== null && say.held.has(dishKey(line.menuItemId));
  const togo = line.fulfillment === "togo";
  const cooking = line.state === "in_progress";

  return (
    // Phase 2b — the <li> is the ITEM: the row (the Start/Done tap and its ⋯), then the dish's note.
    // `data-state` lives here so the started tint covers the row, the ⋯ and the note together, and
    // the divider (border-top) sits on the item, so a note can only belong to the dish above it.
    <li className="kds-item" data-state={line.state}>
      <div className="kds-item-row">
        {/* Per-line check-off: the whole row is the tap. Held lines aren't tappable — the kitchen
            hasn't been handed them yet (the SQL guards refuse it anyway; don't offer what can't act). */}
        <button
          id={`kds-line-${line.id}`}
          type="button"
          className="kds-line"
          onClick={() => void tap()}
          aria-disabled={pending || held || lineWaiting || undefined}
          aria-busy={pending || undefined}
          // The held ticket's slot line says WHY a held line refuses ("fires at 5:48 PM"), and the
          // dish's kitchen note is the line's description — slot first, then the note; nothing when
          // neither exists (`lineDescribedBy`, never an empty attribute).
          aria-describedby={lineDescribedBy({ slot: held ? slotId : undefined, note: noteId })}
          aria-label={
            al(lang, {
              kind: "line",
              done: line.state !== "fired",
              qty: line.qty,
              name: line.name,
              nameMy: line.nameMy,
              modifiers: line.modifiers,
              // Phase 2b — the name REPLACES the content for assistive tech, so the OFF THE MENU tag
              // below is announced only through this clause.
              soldOut: line.soldOut,
            }).aria
          }
        >
          {/* Phase 2b (commit 2) — a single is a quiet ringed numeral; only a multiple wears the lit
              accent fill (`qtyStands`), so a 2 no longer reads like a 1 at arm's length. */}
          <span className="kds-qty" data-many={qtyStands(line.qty) || undefined} aria-hidden="true">
            {line.qty}
          </span>
          <span className="kds-line-main">
            {/* P1 — the line Mom reads a hundred times a night: Burmese first when the catalog has
                it, English beneath (`TicketText.tsx`, pinned by its own jsdom suite). P2 — the
                aria-label above follows it: `lib/staff-labels.ts` builds the name from the SAME
                string this renders (WCAG 2.5.3). The name is flat and therefore carries no lang;
                that trade is argued in `staff-labels.ts`. */}
            <TicketLineText line={line} />
            {/* The tag row: Bag it · Cooking · OFF THE MENU, joined by " · " text nodes inside a
                block <p> (§6's flex whitespace rule cannot eat them). Phase 2b — sold out is a FACT
                on the line, in --tx beside a warn dot (warn ink measured 4.44:1 on the started
                tint), never the full-width band a control used to leave behind. */}
            {(togo || cooking || line.soldOut) && (
              <p className="kds-line-tag" lang={lang}>
                {togo ? ts(lang, "kds.line.bagit") : ""}
                {togo && cooking ? " · " : ""}
                {cooking ? ts(lang, "kds.line.cooking") : ""}
                {line.soldOut && (togo || cooking) ? " · " : ""}
                {line.soldOut && (
                  <span className="kds-line-off">
                    <span className="kds-line-off-dot" aria-hidden="true" />
                    {ts(lang, "kds.86.done")}
                  </span>
                )}
              </p>
            )}
          </span>
        </button>
        {/* Phase 2b (K22) — the 86 lives behind this ⋯, never one tap under the line: a test pass
            86'd a live dish by clicking the first such band. A SIBLING of the line button, never
            nested (a button in a button is invalid), 48px wide and the row's full height so its
            hit box shares the line's edge. Only where there is something to 86 (`canEightySix`):
            a grocery barcode and a dish already off the menu have none — the put-back is the 6s
            undo, then /staff/menu (server-and-up), never this ticket. Named by sr-only dictionary
            text through <Chrome> (§17's circle idiom), never an aria-label. */}
        {canEightySix(line) && (
          <button
            id={`kds-more-${line.id}`}
            type="button"
            className="kds-line-more staff-press"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-disabled={inFlight || dishWaiting || undefined}
            aria-busy={
              (line.menuItemId !== null && pending86.get(line.menuItemId) === line.id) || undefined
            }
            onClick={() => onOpenMenu(line)}
          >
            <Icon name="more" strokeWidth={2.25} />
            <span className="sr-only">
              <Chrome
                lang={lang}
                k="kds.line.more"
                vars={{ x: dishVisible(lang, line.name, line.nameMy) }}
              />
            </span>
          </button>
        )}
      </div>
      {/* Phase 2b — the kitchen note sits DIRECTLY under its dish (the allergy channel, the only
          warn band inside a ticket): outside the line button, so the held line's fade never
          reaches it, and after no control, so it can never read as a caption for one. */}
      {line.notes && <TicketNote id={noteId} lang={lang} note={line.notes} className="kds-note" />}
    </li>
  );
}
