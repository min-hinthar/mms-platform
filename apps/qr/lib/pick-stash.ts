import type { ExpoSubject } from "./expo-errors";
import { PICKED_UNDO_MS } from "./expo-rules";
import type { TabStore } from "./settled-view";
import { isImmediatelyAfter, type TabLoad } from "./tab-load";

/**
 * Phase 2i (P2bi · owner D3) — the lane's picks, kept in the TAB across a reload of the page.
 *
 * "Picked up" waits on a six-second undo window (`PICKED_UNDO_MS`) before its write goes out, and the
 * window lives only in the lane's component state. A reload inside it — ours for a new build, Next's
 * own after a revalidating tap on a stale screen, the stall cure's Reload — forgot the pick, and the
 * bag the guest had already walked away with read "ready" again. So every change of the lane's picks
 * is mirrored here, and the NEXT document decides what to do with them:
 *
 *  - `resume` — only on the IMMEDIATELY next load of the same page (`isImmediatelyAfter`, the load
 *    generation — never a TTL alone) and only while the newest pick is younger than
 *    `PICK_RESUME_MS`. A window still open reopens with the time it had left; every other entry
 *    (its window closed, or its write already on the wire) SENDS, through the lane's normal
 *    status-guarded commit.
 *  - `remark` — any other load (another page in between, a sign-in, a second reload) or an older
 *    stash: nothing is sent on a stranger's behalf, the lane says which bags to mark again.
 *  - `none` — nothing still ready, or everything older than `PICK_REMARK_MS` (the old "the bag stays
 *    ready" direction: a quarter of an hour on, the counter has long since moved on).
 *
 * The decision is taken against `ready`, the lane's FIRST read that started after the mount: a pick
 * whose bag is no longer ready either landed or the bag moved, and re-sending it would only earn the
 * honest "stale" line for a bag that already left.
 *
 * Storage that throws or is absent (a private window, a full quota) degrades to today's behaviour:
 * `writePickStash` answers false, the lane's reload hold then reports `survives:false`, and the
 * "Reloading forgets a bag…" caveat keeps saying so.
 */
export const PICK_STASH_KEY = "mms.lane.picks";
/** Resume (= SEND) only this young, AND only on the immediately next load. */
export const PICK_RESUME_MS = 5 * 60_000;
/** Older than this: forgotten. */
export const PICK_REMARK_MS = 15 * 60_000;

/** One pick as the lane holds it. `at` is the device clock, as the lane's own (`Date.now()`). */
export type StashedPick = {
  orderId: string;
  at: number;
  subject: ExpoSubject;
  committing: boolean;
};
export type PickStash = { v: 1; seq: number; path: string; picks: StashedPick[] };

/** The longest identifier a subject carries (a diner's name with its short code); a stash is never
 *  allowed to carry more into the lane's region. */
const SUBJECT_MAX = 200;
const ID_MAX = 100;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseSubject(v: unknown): ExpoSubject | null {
  if (!isRecord(v)) return null;
  if (v.kind === "table")
    return Number.isSafeInteger(v.id) && (v.id as number) > 0
      ? { kind: "table", id: v.id as number }
      : null;
  if (v.kind === "bag" || v.kind === "verify")
    return typeof v.x === "string" && v.x.length > 0 && v.x.length <= SUBJECT_MAX
      ? { kind: v.kind, x: v.x }
      : null;
  return null;
}

function parsePick(v: unknown): StashedPick | null {
  if (!isRecord(v)) return null;
  const { orderId, at, committing } = v;
  if (typeof orderId !== "string" || orderId.length === 0 || orderId.length > ID_MAX) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (typeof committing !== "boolean") return null;
  const subject = parseSubject(v.subject);
  if (subject === null) return null;
  return { orderId, at, subject, committing };
}

/** Write the stash. True only when the write itself succeeded — that answer is the hold's
 *  `survives`, so a false "true" would let a retired tab reload over a pick it cannot restore. */
export function writePickStash(store: TabStore | null, s: PickStash): boolean {
  if (store === null) return false;
  try {
    store.setItem(PICK_STASH_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Read the stash STRICTLY: any malformed field, anywhere, is no stash at all (it would otherwise put
 *  a stranger's text in the lane's region, or send a write for an order id nobody picked). Never
 *  throws. */
export function readPickStash(store: TabStore | null): PickStash | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(PICK_STASH_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v) || v.v !== 1) return null;
    if (!Number.isSafeInteger(v.seq) || (v.seq as number) < 0) return null;
    if (typeof v.path !== "string") return null;
    if (!Array.isArray(v.picks)) return null;
    const picks: StashedPick[] = [];
    for (const p of v.picks) {
      const ok = parsePick(p);
      if (ok === null) return null;
      picks.push(ok);
    }
    return { v: 1, seq: v.seq as number, path: v.path, picks };
  } catch {
    return null;
  }
}

export function clearPickStash(store: TabStore | null): void {
  if (store === null) return;
  try {
    store.removeItem(PICK_STASH_KEY);
  } catch {
    // Deliberate: a store that cannot remove leaves the stash, and the next load's decision reads it
    // as a stranger's (its seq is this document's, never the one before the next) — a remark at
    // most, never a send.
  }
}

export type PickRestore =
  | { kind: "none" }
  | { kind: "resume"; reopen: Array<StashedPick & { remainingMs: number }>; send: StashedPick[] }
  | { kind: "remark"; bags: StashedPick[] };

/**
 * What the lane does with the stash it found at mount. `ready`: the order ids the lane's FIRST read
 * that started after the mount shows still ready.
 *
 * A reopened entry's `at` is REBASED to `now − elapsed`, so a device clock that ran backwards across
 * the reload (an `at` in the future) reopens with the full window, never a longer one; on a clock that
 * did not, it is the original `at`.
 */
export function restorePicks(
  s: PickStash | null,
  load: TabLoad,
  now: number,
  ready: ReadonlySet<string>,
): PickRestore {
  if (s === null) return { kind: "none" };
  const seen = new Set<string>();
  const live = s.picks.filter((p) => {
    if (!ready.has(p.orderId) || seen.has(p.orderId)) return false;
    seen.add(p.orderId);
    return true;
  });
  if (live.length === 0) return { kind: "none" };
  const age = (p: StashedPick) => Math.max(0, now - p.at);
  const newest = Math.min(...live.map(age));
  if (isImmediatelyAfter(s, load) && newest < PICK_RESUME_MS) {
    const reopen: Array<StashedPick & { remainingMs: number }> = [];
    const send: StashedPick[] = [];
    for (const p of live) {
      const remainingMs = PICKED_UNDO_MS - age(p);
      if (!p.committing && remainingMs > 0) reopen.push({ ...p, at: now - age(p), remainingMs });
      else send.push(p);
    }
    return { kind: "resume", reopen, send };
  }
  const bags = live.filter((p) => age(p) < PICK_REMARK_MS);
  return bags.length > 0 ? { kind: "remark", bags } : { kind: "none" };
}

/**
 * What the mirror writes while a found stash is still UNDECIDED: the stash's own picks plus the
 * lane's live ones (a live pick of the same bag wins). Writing only the live picks would overwrite the
 * one record of the picks the reload interrupted before the first read could decide them.
 */
export function mirrorPicks(
  pending: readonly StashedPick[] | null,
  live: readonly StashedPick[],
): StashedPick[] {
  if (pending === null) return [...live];
  const liveIds = new Set(live.map((p) => p.orderId));
  return [...pending.filter((p) => !liveIds.has(p.orderId)), ...live];
}

/** The "mark these again" line stands while ANY bag it names is still ready on the lane. */
export function remarkStands(orderIds: readonly string[], ready: ReadonlySet<string>): boolean {
  return orderIds.some((id) => ready.has(id));
}
