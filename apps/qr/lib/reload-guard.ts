import type { StaffKey } from "./i18n/staff";

/**
 * Phase 2i (P2bi) — what must not be lost to a reload for a new build, and the two verdicts that
 * read it. Pure (a module-level register and two functions of a snapshot); client-safe.
 *
 * TWO VERDICTS, because two different things decide to reload:
 *  - MANUAL — a person tapped "Reload the page". They are reading the screen, so only what a reload
 *    would SILENTLY lose refuses them: work not yet sent (an open pick window, the KDS Undo bar) and
 *    a write young enough to be saving now. A stall never refuses them — the reload is its cure, and
 *    Phase 2h already offers it — and neither does live sound (refusing it is the 2g deadlock: a
 *    sound-live board could then never reload at all).
 *  - AUTO — nobody asked. Everything that could be lost or unread refuses it, and heuristic inputs
 *    (a quiet window, an open dialog, typing, the answer window) can only ever REFUSE, never permit.
 *
 * RETIRED (an action id this screen sends is gone — `UnrecognizedActionError`, or the served
 * contract changed) relaxes exactly three things and nothing else: unsent holds whose work is stashed
 * and restored after a load (`survives`), live sound, and the two windows (shortened). Young, in-flight
 * and stalled writes, unread money lines, dialogs and typing still refuse: a rename retires ONE id,
 * so everything else this tab sends may still land.
 */

/**
 * Each kind's reasons, named once — and the PAIRING is the type: `Hold` is a union over this map, so
 * an `unsent` hold with an `unread` reason does not compile (S0 critic F6). It matters because the
 * MANUAL verdict refuses on any `unsent` hold and `blockKey` gives a sentence only for the unsent
 * reasons — a mismatched hold would refuse a person's tap with nothing to say.
 */
export type HoldReasonOf = {
  /** The lane's open pick windows (`pick`) · the KDS Undo bar (`kitchenUndo`). */
  unsent: "pick" | "kitchenUndo";
  /** The KDS recall rail · the counter pane's lost-payment line · a declined/cancelled reader outcome. */
  unread: "kitchenRecall" | "paneLine" | "readerOutcome";
  sound: "kdsSound" | "bellSound";
  /** A Phase 2h "reload the page" offer on screen. */
  standing: "reloadOffer";
};
export type HoldKind = keyof HoldReasonOf;
export type HoldReason = HoldReasonOf[HoldKind];

/** What a caller registers: a kind with one of ITS reasons. */
export type HoldInput = {
  [K in HoldKind]: {
    kind: K;
    reason: HoldReasonOf[K];
    subject: string;
    /** The work is stashed and restored after a document load (only the lane's picks can say true). */
    survives: boolean;
  };
}[HoldKind];
export type Hold = HoldInput & { seq: number };

type Token = { hold: Hold };
const tokens = new Set<Token>();
const listeners = new Set<() => void>();
let nextSeq = 1;
/** The snapshot handed to `useSyncExternalStore`: rebuilt only when the register changes. */
let snapshot: readonly Hold[] = [];

function changed(): void {
  snapshot = [...tokens].map((t) => t.hold).sort((a, b) => a.seq - b.seq);
  for (const listener of [...listeners]) listener();
}

/**
 * Register a hold; returns its release, bound to THIS registration only and idempotent — Strict
 * Mode's setup → cleanup → setup releases the first token and registers a second, and a second call
 * to the first release must never release the second.
 */
export function holdReload(h: HoldInput): () => void {
  const token: Token = { hold: { ...h, seq: nextSeq++ } };
  tokens.add(token);
  changed();
  return () => {
    if (!tokens.delete(token)) return;
    changed();
  };
}

/** Every hold now, oldest first. The same array (by identity) until the register changes. */
export function reloadHolds(): readonly Hold[] {
  return snapshot;
}

/** Called on every register change; returns the unsubscribe (`useSyncExternalStore`'s shape). */
export function subscribeReloadHolds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: forget every hold (module state, shared by every case in a file). */
export function resetHoldsForTests(): void {
  tokens.clear();
  snapshot = [];
  nextSeq = 1;
}

/** AUTO: no pointer, key or touch input for this long (a document load counts as input). */
export const QUIET_MS = 15_000;
export const RETIRED_QUIET_MS = 5_000;
/** AUTO: this long since any WRITE answered — its line may still be being read. */
export const ANSWER_READ_MS = 30_000;
export const RETIRED_ANSWER_MS = 5_000;

/** Each duration is measured on its OWN source's clock by `readGuardInput`; the verdict never
 *  mixes clocks. */
export type GuardInput = {
  online: boolean;
  holds: readonly Hold[];
  youngWrite: boolean;
  stalledWrite: boolean;
  ownWait: boolean;
  msSinceWriteSettled: number | null;
  /** `performance.now() − (lastInputAt ?? 0)`: a document load counts as input. */
  msSinceInput: number;
  dialogOpen: boolean;
  typing: boolean;
  retired: boolean;
};

export type ApplyBlock =
  | { kind: "offline" }
  | { kind: "down" } // pre-flight only
  | { kind: "check" } // pre-flight only
  | { kind: "hold"; reason: HoldReason }
  | { kind: "saving" }
  | { kind: "waiting" }
  | { kind: "screen" }
  | { kind: "input" }
  | { kind: "answer" };

/** The oldest hold of `kind` that still refuses (`skipSurviving`: retired skips stashed work). */
function firstHold(holds: readonly Hold[], kind: HoldKind, skipSurviving: boolean): Hold | null {
  let oldest: Hold | null = null;
  for (const h of holds) {
    if (h.kind !== kind) continue;
    if (skipSurviving && h.survives) continue;
    if (oldest === null || h.seq < oldest.seq) oldest = h;
  }
  return oldest;
}

/** Steps 1-3, shared by both verdicts, in this order: offline, unsent work, a young write. */
function sharedBlock(i: GuardInput): ApplyBlock | null {
  if (!i.online) return { kind: "offline" };
  const unsent = firstHold(i.holds, "unsent", i.retired);
  if (unsent !== null) return { kind: "hold", reason: unsent.reason };
  // A young write refuses even while a read is stalled: the stall's cure would lose it.
  if (i.youngWrite) return { kind: "saving" };
  return null;
}

/**
 * A PERSON tapped reload: refused only for what a reload would silently lose — unsent work and a
 * write saving now. Never for a stall or an own-wait (the reload is their cure), never for sound,
 * unread lines, a standing offer or a dialog (a person tapping is reading).
 */
export function manualBlock(i: GuardInput): ApplyBlock | null {
  return sharedBlock(i);
}

/** NOBODY asked: everything that could be lost or unread refuses, and the heuristics only refuse. */
export function autoBlock(i: GuardInput): ApplyBlock | null {
  const shared = sharedBlock(i);
  if (shared !== null) return shared;
  if (i.stalledWrite || i.ownWait) return { kind: "waiting" };
  const unread = firstHold(i.holds, "unread", false);
  if (unread !== null) return { kind: "hold", reason: unread.reason };
  const standing = firstHold(i.holds, "standing", false);
  if (standing !== null) return { kind: "hold", reason: standing.reason };
  if (!i.retired) {
    const sound = firstHold(i.holds, "sound", false);
    if (sound !== null) return { kind: "hold", reason: sound.reason };
  }
  if (i.dialogOpen || i.typing) return { kind: "screen" };
  if (i.msSinceInput < (i.retired ? RETIRED_QUIET_MS : QUIET_MS)) return { kind: "input" };
  if (
    i.msSinceWriteSettled !== null &&
    i.msSinceWriteSettled < (i.retired ? RETIRED_ANSWER_MS : ANSWER_READ_MS)
  )
    return { kind: "answer" };
  return null;
}

/**
 * The refusal sentence a person can meet at a tap, named ONCE: every block `manualBlock` or the
 * executor's pre-flight can return. Null for the auto-only blocks (no person is told about those —
 * the automatic reload simply waits).
 */
export function blockKey(b: ApplyBlock): StaffKey | null {
  switch (b.kind) {
    case "offline":
      return "shell.version.wait.offline";
    case "down":
      return "shell.version.wait.down";
    case "check":
      return "shell.version.wait.check";
    case "saving":
      return "shell.version.wait.saving";
    case "hold":
      if (b.reason === "pick") return "shell.version.wait.pick";
      if (b.reason === "kitchenUndo") return "shell.version.wait.undo";
      return null;
    case "waiting":
    case "screen":
    case "input":
    case "answer":
      return null;
  }
}
