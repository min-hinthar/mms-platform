/**
 * The offline scan queue (W7b — S3): scans made in a dead spot queue here and REPLAY when the
 * radio returns. Client half of the scan-event idempotency — every entry carries a client-minted
 * `scanId` the server dedupes atomically (see 20260813210000_w7b_scan_events.sql), so an
 * at-least-once replay can never double-add.
 *
 * Money-path invariants (the plan's hard lines):
 *  - An entry is `{scanId, cartId, barcode, queuedAt}` and NOTHING else — never a price, name, or
 *    qty. Replay re-enters `scanAdd`, which re-derives price + tax server-side AT REPLAY TIME; a
 *    stale cached price is display-only and the server price wins.
 *  - The queue is latency-hiding, never a second source of truth: queued scans are not cart lines
 *    and never join the running total (the server may refuse them at replay).
 *  - Drains are SERIALIZED FIFO with spacing — never a parallel burst (the 120/60s mutation rate
 *    reads a burst as flood, and its throw is prod-redacted into a generic transport error).
 *
 * Storage is localStorage in the repo's try/catch-stash idiom: unavailable storage degrades to
 * "scanning needs a connection" honesty (the caller checks `storageWorks()`), corrupt entries are
 * dropped at load (validated shape), and a TTL bounds how stale a replay can be — a week-old
 * queued scan must not land in a basket the shopper forgot.
 */

export type QueuedScan = {
  scanId: string;
  cartId: string;
  barcode: string;
  queuedAt: number;
};

/** What a replay attempt means for the queue (mapped from scanAdd's discriminated result). */
export type ReplayVerdict =
  /** The write landed (or already had — the scan-event dedupe answers ok). Dequeue. */
  | "delivered"
  /** A definitive catalog refusal (unknown/unavailable/weighed). Dequeue + tell the shopper. */
  | "rejected"
  /** The CART is finished (paid/cancelled/expired). Flush the whole cart's queue — replaying into
   *  a re-minted fresh basket would charge it for the dead basket's scans. */
  | "terminal"
  /** Transient (locked/settling/transport/unknown). Keep the entry; the next drain retries. */
  | "retry";

const STORE_KEY = "mms.scanQueue.v1";
const MAX_ENTRIES = 40;
export const QUEUE_TTL_MS = 2 * 60 * 60 * 1000; // the delivery repo's 2h at-least-once horizon
/** Serialized drain spacing — see the rate-limit invariant above. */
export const DRAIN_SPACING_MS = 400;

const TERMINAL_REASONS = new Set(["paid", "cancelled", "session_expired"]);
const REJECT_REASONS = new Set(["unknown_barcode", "unavailable", "weighed_item"]);

/** Map a scanAdd result (or a thrown attempt, passed as null) onto the queue's verdict. */
export function classifyReplay(
  result: { ok: true } | { ok: false; reason: string } | null,
): ReplayVerdict {
  if (result === null) return "retry"; // a throw is transport/unexpected — never permanent
  if (result.ok) return "delivered";
  if (REJECT_REASONS.has(result.reason)) return "rejected";
  if (TERMINAL_REASONS.has(result.reason)) return "terminal";
  return "retry"; // locked / settling / unreadable
}

function isQueuedScan(v: unknown): v is QueuedScan {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.scanId === "string" &&
    /^[0-9a-f-]{36}$/.test(o.scanId) &&
    typeof o.cartId === "string" &&
    typeof o.barcode === "string" &&
    /^\d{8,14}$/.test(o.barcode) &&
    typeof o.queuedAt === "number" &&
    Number.isFinite(o.queuedAt)
  );
}

/** Pure: validate + TTL-prune a raw parsed store (corrupt entries drop, never retry-loop). */
export function pruneEntries(raw: unknown, now: number): QueuedScan[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isQueuedScan).filter((e) => now - e.queuedAt < QUEUE_TTL_MS);
}

export function storageWorks(): boolean {
  try {
    const k = "mms.scanQueue.probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadQueue(now: number = Date.now()): QueuedScan[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    return pruneEntries(JSON.parse(raw), now);
  } catch {
    return []; // deliberate: an unreadable stash is an empty queue, never a crash
  }
}

function saveQueue(entries: QueuedScan[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    /* deliberate: storage gone mid-session — the in-memory drain still runs */
  }
}

/** Enqueue a scan for replay. Returns the stored queue, or null when the cap refuses (the caller
 *  surfaces honest "too many waiting" copy instead of silently dropping). */
export function enqueueScan(
  cartId: string,
  barcode: string,
  now: number = Date.now(),
): QueuedScan[] | null {
  const entries = loadQueue(now);
  if (entries.length >= MAX_ENTRIES) return null;
  const entry: QueuedScan = { scanId: crypto.randomUUID(), cartId, barcode, queuedAt: now };
  const next = [...entries, entry];
  saveQueue(next);
  return next;
}

export function pendingFor(cartId: string, now: number = Date.now()): QueuedScan[] {
  return loadQueue(now).filter((e) => e.cartId === cartId);
}

export function removeEntry(scanId: string): QueuedScan[] {
  const next = loadQueue().filter((e) => e.scanId !== scanId);
  saveQueue(next);
  return next;
}

/** Flush EVERY entry for a cart — the terminal-verdict rule and the "Start a fresh basket" hook. */
export function flushCart(cartId: string): QueuedScan[] {
  const next = loadQueue().filter((e) => e.cartId !== cartId);
  saveQueue(next);
  return next;
}

export type DrainOutcome = { entry: QueuedScan; verdict: ReplayVerdict };

/**
 * Drain a cart's queue: strictly one send at a time, oldest first, spaced. Stops early on the
 * first `retry` (the blocker ahead would also block everything behind it) and on `terminal`
 * (after flushing the cart). The SEND is injected — the page passes its own seq-ticketed add
 * funnel so replays obey the same concurrency discipline as live scans (the W9d rule).
 */
export async function drainCart(
  cartId: string,
  send: (entry: QueuedScan) => Promise<{ ok: true } | { ok: false; reason: string } | null>,
  opts: { spacingMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<DrainOutcome[]> {
  const spacing = opts.spacingMs ?? DRAIN_SPACING_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const outcomes: DrainOutcome[] = [];
  // Snapshot order once; re-read membership per step so a concurrent flush wins.
  for (const entry of pendingFor(cartId)) {
    if (!loadQueue().some((e) => e.scanId === entry.scanId)) continue; // flushed underneath us
    const result = await send(entry).catch(() => null);
    const verdict = classifyReplay(result);
    outcomes.push({ entry, verdict });
    if (verdict === "delivered" || verdict === "rejected") removeEntry(entry.scanId);
    else if (verdict === "terminal") {
      flushCart(cartId);
      break;
    } else break; // retry: the next drain (online event / timer) picks it back up
    if (spacing > 0) await sleep(spacing);
  }
  return outcomes;
}
