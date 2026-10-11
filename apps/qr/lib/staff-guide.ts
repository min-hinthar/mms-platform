import type { StaffKey } from "./i18n/staff";
import type { HelpDoorScreen } from "./help";
import { guideSeenKey } from "./guide-seen";
import { CLEAR_UNDO_MS } from "./clear-window";
import { KDS_UNDO_MS } from "./kds-undo";
import { floorTone } from "./floor-tone";
import type { FloorStatus } from "./floor-types";

/**
 * PD12 (PATH_DESIGN 2026-10-07 decision 12 · `docs/path-design-2026-10-07/m12-staff-guides.md`) —
 * the staff step guides' pure part: the five steps per station, when a guide offers itself, and
 * when a tap on it counts. `StepGuide.tsx` draws it; `lib/guide-seen.ts` is the ONE seen-key rule
 * it shares with the diner's guide (PD11).
 *
 * THE STATION IS THE ROLE (m12 change 1): there is no kitchen or counter role — the roles are
 * server · manager · owner — so a guide offers itself once per PERSON, per STATION, per TABLET: the
 * seen key carries the signed-in staff id, the station and the guide's revision.
 *
 * A GUIDE NEVER TEACHES A CONTROL ITS SCREEN DOES NOT HAVE (m12 change 9; decision 20): each
 * station's guide ships as ONE revision, after every control it teaches. `STAFF_GUIDE_SHIPS` is
 * that gate, read by every host (the in-place first run AND the Help door's row), so a station that
 * has not shipped keeps its shipped Help door exactly as it was.
 *
 *   counter — SHIPS: the strip (Phase 2d), the hollow ring (PD1 · P2do), the ask tile and the pane's
 *             ask pass (PD2), the till tray (PD6), the clear window (PD7) are all on the screen.
 *   kitchen — SHIPS (M270 (1)): its fifth step teaches the "Table N left — stop cooking" card, and the
 *             board draws it — one per Send of every open stop record PD7's clear writes, in its
 *             ticket's slot, until "Got it" (`lib/kitchen-stop-read.ts`, `lib/kds-stop.ts`).
 *             `staff-guide.test.ts` still refuses the kitchen's ship while `KdsBoard.tsx` renders no
 *             LIVE `<KdsStopCard>`, so the guide can never again teach a card the board stopped
 *             drawing. The flip's other condition, a tap aimed at Next meeting the work that replaced
 *             the guide, is `guideReplacedHeld` below.
 */

export type GuidePicture =
  | "counter.floor"
  | "counter.ring"
  | "counter.ask"
  | "counter.cash"
  | "counter.clear"
  | "kitchen.card"
  | "kitchen.round"
  | "kitchen.bump"
  | "kitchen.late"
  | "kitchen.stop";

/** One sentence under a step's title: a dictionary key and the values its slots take. */
export type GuideLine = { k: StaffKey; vars?: Readonly<Record<string, number>> };

/**
 * One step: the title is the CONTROL'S OWN KEY (pointing-and-calling — m12 decision 8 and the
 * critic's B7), one or two sentences, and the picture of the real control.
 */
export type GuideStep = {
  title: StaffKey;
  titleVars?: Readonly<Record<string, number>>;
  lines: readonly GuideLine[];
  picture: GuidePicture;
};

/**
 * The example tables the titles and the pictures share (m12 decision 22, like for like with the
 * moments: m5's tables on the board, m2's asked Table 4, m6's $50 note, m7's Table 7). Named ONCE:
 * a title that says "Round 2" over a picture of round 3 is the drift this prevents.
 */
export const GUIDE_SAMPLE = {
  counter: {
    /** m7's floor: Table 3 ordering, Table 5 just seated, the strip's free tiles around them. */
    ordering: 3,
    seated: 5,
    /** m2: Table 4 — ordering on the calm floor (step 1), then asking to pay at the counter (step 3:
     *  the one thing that changed, the tile that fills — m12's "face A, live"). The pane's pass
     *  carries the total. */
    asking: 4,
    askTotalCents: 4641,
    /** m6: the guest hands over a $50 note → $3.59 change (5000 − 4641). */
    noteCents: 5000,
    /** m7: Table 7 paid and left; the clear window is open. */
    clearing: 7,
  },
  kitchen: {
    /** m5: Table 11's Chicken Curry has just landed. */
    landed: 11,
    /** m5: Table 4 sent again — its second card wears "Round 2". */
    rounds: 4,
    round: 2,
    /** m5: Table 9 was just bumped. */
    bumped: 9,
    /** m5: Table 2 is Late. */
    late: 2,
    /** m7's own Table 3, cleared while it still had food on the board. */
    stopped: 3,
  },
} as const;

const S = GUIDE_SAMPLE;

/** The strip tiles the counter pictures crop from — tables 1–5. */
export const GUIDE_FLOOR_TILES: readonly number[] = [1, 2, 3, 4, 5];

/**
 * The ONE floor every counter picture crops from, at its two moments (the blind pass on #345: the
 * pictures had drifted — Table 5 seated on step 1 but free on step 3). `calm` is step 1's quiet
 * evening: Table 3 and Table 4 ordering, Table 5 just seated, the rest free. `ask` is the same room
 * minutes later, step 3's CALL: ONLY the asking table changed — it filled (`counter`, the ask tone).
 * `null` is a free tile.
 */
export function guideFloor(moment: "calm" | "ask"): ReadonlyMap<number, FloorStatus | null> {
  const S = GUIDE_SAMPLE.counter;
  const floor = new Map<number, FloorStatus | null>(GUIDE_FLOOR_TILES.map((n) => [n, null]));
  floor.set(S.ordering, "ordering");
  floor.set(S.asking, "ordering");
  floor.set(S.seated, "seated");
  if (moment === "ask") floor.set(S.asking, "counter");
  return floor;
}

/** The five steps per station, each walking one rung of the loudness ladder (m12 decision 1). */
export const STAFF_GUIDE_STEPS: Readonly<Record<HelpDoorScreen, readonly GuideStep[]>> = {
  counter: [
    // CALM — the floor at a glance: the strip's own label, and the shipped card's sentence.
    { title: "floor.strip.label", lines: [{ k: "help.how.counter.2" }], picture: "counter.floor" },
    // MARK — the hollow ring and its one word (`pad.group.unsent`, the vocabulary's one key).
    {
      title: "pad.group.unsent",
      lines: [{ k: "help.guide.counter.ring" }],
      picture: "counter.ring",
    },
    // CALL — the one filled tile, and the pane's ask pass (the same total the guest's phone shows).
    {
      title: "table.detail.counterAsk",
      lines: [{ k: "help.guide.counter.ask" }],
      picture: "counter.ask",
    },
    // The gold till — the tray's own title.
    {
      title: "settle.cash.title",
      lines: [{ k: "help.guide.counter.cash" }],
      picture: "counter.cash",
    },
    // Dashed pending — the clear window; its seconds are the window's own constant, never typed.
    {
      title: "settle.clear.btn",
      lines: [{ k: "help.guide.counter.clear", vars: { n: CLEAR_UNDO_MS / 1000 } }],
      picture: "counter.clear",
    },
  ],
  kitchen: [
    // A card — titled by the pictured card's own identity (the critic's B7: a control's key).
    {
      title: "kds.table",
      titleVars: { id: S.kitchen.landed },
      lines: [{ k: "help.guide.kitchen.card" }],
      picture: "kitchen.card",
    },
    // MARK — the round stub, through its own key.
    {
      title: "kds.round",
      titleVars: { id: S.kitchen.round },
      lines: [{ k: "help.guide.kitchen.round" }],
      picture: "kitchen.round",
    },
    // The two ways back, each word in its own place (D3): ပြန်ဖျက် on the cream pill, ပြန်ယူ on the
    // rail. The two shipped sentences; the second quotes the board's ONE undo constant.
    {
      title: "kds.bump",
      lines: [
        { k: "help.how.kitchen.1" },
        { k: "help.how.kitchen.2", vars: { n: KDS_UNDO_MS / 1000 } },
      ],
      picture: "kitchen.bump",
    },
    // ALARM — Late: red AND the word, so it holds under reduced motion (no minutes: configurable).
    { title: "kds.stat.late", lines: [{ k: "help.guide.kitchen.late" }], picture: "kitchen.late" },
    // ALARM without motion — the stop card, through its own key.
    {
      title: "kds.stop",
      titleVars: { id: S.kitchen.stopped },
      lines: [{ k: "help.guide.kitchen.stop" }],
      picture: "kitchen.stop",
    },
  ],
};

/** A guide whose steps changed is a new first morning (the shipped precedent, `lib/help.ts`). */
export const STAFF_GUIDE_REVISION: Readonly<Record<HelpDoorScreen, number>> = {
  counter: 1,
  kitchen: 1,
};

/** The gate (see the docblock): a station's guide offers itself, and Help opens it, only once true. */
export const STAFF_GUIDE_SHIPS: Readonly<Record<HelpDoorScreen, boolean>> = {
  counter: true,
  kitchen: true,
};

export function staffGuideShips(screen: HelpDoorScreen): boolean {
  return STAFF_GUIDE_SHIPS[screen];
}

/** The seen key: this person, at this station, on this tablet, for this revision of the guide. */
export function staffGuideKey(screen: HelpDoorScreen, staffId: string): string {
  return guideSeenKey(screen, STAFF_GUIDE_REVISION[screen], staffId);
}

/**
 * The hosts' key: `staffGuideKey`, or null when there is no person or the id is not a key segment —
 * then NO guide (and no mark), never a throw during render or in a Help tap (the blind pass on #345).
 * `staffId` is `staff.user_id`, a uuid primary key, so a malformed one is a programming error the
 * screen must survive, not one it should crash on.
 */
export function staffGuideKeyFor(
  screen: HelpDoorScreen,
  staffId: string | null | undefined,
): string | null {
  if (staffId === null || staffId === undefined) return null;
  try {
    return staffGuideKey(screen, staffId);
  } catch {
    return null;
  }
}

/**
 * The arm (m12 decision 10; Codex round 3 E1). After the guide mounts AND after every step change,
 * its controls hold for this long: the tap that loaded the screen never acts on the guide, and a
 * double-tap on step 4's Next never also fires step 5's Got it in the same slot (the guide is marked
 * seen at open, so a guide finished unseen never comes back). Its own constant (the critic's C), at
 * least the kit's same-gesture guard — `staff-guide.test.ts` pins that.
 */
export const GUIDE_ARM_MS = 400;

/**
 * Does a tap on a guide control count? `shownAt` is when the current step was shown — null until the
 * guide's first commit has stamped it, and a tap then is refused (the blind pass on #345: a click
 * handled before the mount's effect flushed read an unset clock as long armed); `downAt` is when the
 * pointer that produced this tap went down (null for a keyboard press). Refused while the step's
 * controls are not yet armed, and refused for a press that BEGAN before they armed — a slow second
 * half of a double-tap that is released after the arm is still the first gesture.
 */
export function guideActAccepted(t: {
  now: number;
  shownAt: number | null;
  downAt: number | null;
}): boolean {
  if (t.shownAt === null) return false; // not yet shown: arming
  if (t.now - t.shownAt < GUIDE_ARM_MS) return false;
  if (t.downAt !== null && t.downAt - t.shownAt < GUIDE_ARM_MS) return false;
  return true;
}

/**
 * M270 (1) — the kitchen flip's condition (b) (m12 §H, Taken 1): WORK replaces the guide in place —
 * the first ticket, or a stop card — and a tap already on its way to the guide's Next meets the
 * control that took its place: an All done with no arm of its own (its only way back is the Undo
 * bar), or a stop card's "Got it", which has no undo at all. So from the moment work replaced the
 * guide, the board's own controls hold for the guide's own arm (`GUIDE_ARM_MS`): the finger aimed at
 * Next never acts on the card under it. `replacedAt` null — the guide never stood on this board, or
 * the person closed it themselves (their next tap is meant for the board) — holds nothing.
 */
export function guideReplacedHeld(replacedAt: number | null, now: number): boolean {
  return replacedAt !== null && now - replacedAt < GUIDE_ARM_MS;
}

/**
 * The counter's quiet, decided at MOUNT only (m12 WHEN rule 2): the split shows the pane beside the
 * floor (`PANE_IDLE_QUERY` — below it there is no in-place host, and nothing auto-opens: the
 * critic's B5), no table is selected (the pane is idle), and no table is asking to pay. The floor is
 * updating by construction at mount: an unreadable floor renders the outage shell, not this screen.
 */
export function counterGuideQuiet(q: {
  wide: boolean;
  paneIdle: boolean;
  asking: boolean;
}): boolean {
  return q.wide && q.paneIdle && !q.asking;
}

/**
 * Is any table asking to pay at the counter in this floor read? The floor's ONE tone map says it — the
 * ask tile is the `ask` tone — so the guide's quiet and the strip's one filled tile never disagree.
 */
export function counterAskingAtMount(tables: readonly { status: FloorStatus }[]): boolean {
  return tables.some((t) => floorTone(t.status, null) === "ask");
}

/**
 * The kitchen's quiet: the board holds no ticket at all (any station, held cards included) and no
 * stop card (M270 (1) — a table that left is work: its "Got it" is waiting), it is updating, and no
 * error shows. `tickets` counts both. Read at mount to OFFER the guide, and on every render after to
 * KEEP it — the first card that lands, a freeze or an error pushes it away for good (work wins).
 */
export function kitchenGuideQuiet(q: {
  tickets: number;
  degraded: boolean;
  failed: boolean;
}): boolean {
  return q.tickets === 0 && !q.degraded && !q.failed;
}

/**
 * Whether the Help row may say the guide "opens itself the first time" ON THIS DEVICE: the kitchen's
 * empty board hosts it at any width; the counter's host is the pane, which is only there from
 * `PANE_IDLE_QUERY` — below it the row must not promise an auto-open the screen never makes.
 */
export function staffGuideOpensItself(screen: HelpDoorScreen, wide: boolean): boolean {
  return screen === "kitchen" || wide;
}
