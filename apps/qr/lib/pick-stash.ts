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
 *    generation — never a TTL alone — AND, since Codex r2 on #311, a load whose own navigation is a
 *    reload or comes from this origin: a page of another site in between, or a tab closed and
 *    restored, cannot advance the generation), only from a stash whose WRITER HAS UNLOADED (`closed`, stamped
 *    at its `pagehide`), and only while the newest pick is younger than `PICK_RESUME_MS`. A window still open reopens with the time it had left; every other entry
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
 * ⚠️ `closed` is the critic's F5: sessionStorage is CLONED into a duplicated tab, so the copy claims
 * seq N+1 at the same path and — on the load generation alone — would resume the original tab's
 * live picks, and later commit one the person undid over there. A writer that is still open never
 * stamped `closed`, so its copy is a remark at most. A writer that died without a `pagehide` (an OS
 * kill) degrades the same way: a remark, never a send.
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
export type PickStash = {
  v: 1;
  seq: number;
  path: string;
  picks: StashedPick[];
  /** Stamped by the writing document's `pagehide`: it has unloaded (a reload, a navigation away).
   *  Absent while it is open — a duplicated tab's copy of it never resumes (F5). */
  closed?: true;
};

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
    if (v.closed !== undefined && v.closed !== true) return null;
    const picks: StashedPick[] = [];
    for (const p of v.picks) {
      const ok = parsePick(p);
      if (ok === null) return null;
      picks.push(ok);
    }
    const out: PickStash = { v: 1, seq: v.seq as number, path: v.path, picks };
    if (v.closed === true) out.closed = true;
    return out;
  } catch {
    return null;
  }
}

/** A stash nothing can resume or remark: no picks, and a load no document ever claims. */
const EMPTY_STASH: PickStash = { v: 1, seq: 0, path: "", picks: [] };

/** Clear the stash. A store that cannot REMOVE is overwritten with an empty stash instead (critic F7):
 *  a leftover carries THIS document's seq — exactly the one before the next load — so it would be
 *  read as resumable, and remark (or send) picks this document already undid or landed. */
export function clearPickStash(store: TabStore | null): void {
  if (store === null) return;
  try {
    store.removeItem(PICK_STASH_KEY);
  } catch {
    // Deliberate: the fallback below; a store that refuses both leaves whatever it holds, and the
    // `closed` stamp (absent on anything this document wrote while open) keeps it a remark at most.
    writePickStash(store, EMPTY_STASH);
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
  if (s.closed === true && isImmediatelyAfter(s, load) && newest < PICK_RESUME_MS) {
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

/**
 * The stash the lane's mirror writes, or null (nothing held: clear it). `here` is this document's
 * load and page.
 *
 * ⚠️ While a found stash is UNDECIDED it keeps THAT stash's own load and page (critic F1), never this
 * document's: stamped with this document's seq, a reload before the first read decided it would make
 * the NEXT load read a stranger's picks as "immediately after" and send them. Kept on its own, older
 * load, a second reload remarks — and so does anything picked here before the decision, which is why
 * `resumableUntil` answers null for it.
 */
/**
 * Does this `pagehide` stamp the stash `closed`? Only an UNLOAD does (Codex r1 on #311, P2iz). A
 * hide into the back-forward cache (`persisted`) parks a document that is still alive — its picks
 * are still its own, and `pageshow` takes the stamp off when it returns — so a tab DUPLICATED while
 * it sits there must find the stash open (a remark at most), never closed (a resume, then a send of
 * another tab's picks). A parked page that is then evicted without coming back leaves an open stash:
 * the next load remarks — the safe direction.
 */
export function hideClosesStash(persisted: boolean): boolean {
  return !persisted;
}

export function mirrorStash(
  pending: PickStash | null,
  live: readonly StashedPick[],
  here: { seq: number; path: string },
  closed = false,
): PickStash | null {
  const picks = mirrorPicks(pending?.picks ?? null, live);
  if (picks.length === 0) return null;
  const gen = pending ?? here;
  const s: PickStash = { v: 1, seq: gen.seq, path: gen.path, picks };
  if (closed) s.closed = true;
  return s;
}

/**
 * Until when a reload of this page, starting NOW, would RESUME the stash just written — `restorePicks`'
 * own gates, applied to the load that reload would be (`here.seq + 1` at `here.path`): null when it
 * would not resume at all (an undecided stash on its own, older load; a load counter that failed).
 * The bound is the OLDEST pick's, so whichever of them the next read still shows ready, the newest of
 * those is younger than `PICK_RESUME_MS` (critic F4: past it, the next load remarks or forgets, and
 * `survives`/the caveat must stop saying the pick is kept).
 */
export function resumableUntil(
  s: PickStash | null,
  here: { seq: number; path: string },
): number | null {
  if (s === null || s.picks.length === 0) return null;
  // The load a reload starting now would be: a reload continues (`loadContinues`).
  if (!isImmediatelyAfter(s, { seq: here.seq + 1, initialPath: here.path, continues: true }))
    return null;
  return Math.min(...s.picks.map((p) => p.at)) + PICK_RESUME_MS;
}

/**
 * Phase 2i (D3 · critic F2) — the "mark these again" line, kept in the tab too: it is the only record
 * that a bag reading "ready" was in fact taken, so a reload (our own, the stall cure's, Next's) must
 * not erase it. Not bound to a load: whoever opens the lane next in this tab is told.
 */
export const PICK_REMARK_KEY = "mms.lane.remark";

/** Write the line's bags (none → removed). Deliberate swallow: a store that refuses keeps today's
 *  behaviour — the line simply does not outlive a reload. */
export function writeRemark(store: TabStore | null, bags: readonly StashedPick[]): void {
  if (store === null) return;
  try {
    if (bags.length === 0) store.removeItem(PICK_REMARK_KEY);
    else store.setItem(PICK_REMARK_KEY, JSON.stringify({ v: 1, bags }));
  } catch {
    // Deliberate (above).
  }
}

/** Read the line's bags STRICTLY (one malformed entry → none). Never throws. */
export function readRemark(store: TabStore | null): StashedPick[] {
  if (store === null) return [];
  try {
    const raw = store.getItem(PICK_REMARK_KEY);
    if (raw === null) return [];
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v) || v.v !== 1 || !Array.isArray(v.bags)) return [];
    const bags: StashedPick[] = [];
    for (const b of v.bags) {
      const ok = parsePick(b);
      if (ok === null) return [];
      bags.push(ok);
    }
    return bags;
  } catch {
    return [];
  }
}

/**
 * The bags the line still names after a read (critic F3): each one still READY and younger than
 * `PICK_REMARK_MS`, once — a bag handed over elsewhere, or forgotten by age, drops out ALONE; the rest
 * stay named. Empty → the line goes.
 */
export function remarkLeft(
  bags: readonly StashedPick[],
  ready: ReadonlySet<string>,
  now: number,
): StashedPick[] {
  const seen = new Set<string>();
  return bags.filter((b) => {
    if (!ready.has(b.orderId) || seen.has(b.orderId)) return false;
    if (Math.max(0, now - b.at) >= PICK_REMARK_MS) return false;
    seen.add(b.orderId);
    return true;
  });
}

/** A pick of ONE bag takes that bag off the line (critic F3) — never the others it names. */
export function remarkWithout(bags: readonly StashedPick[], orderId: string): StashedPick[] {
  return bags.filter((b) => b.orderId !== orderId);
}
