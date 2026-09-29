import { isScanGoBasket } from "./expo-rules";
import type { ExpoTicket } from "./expo-types";
import type { FloorTable } from "./floor-types";

/**
 * Phase 2d · bell — WHEN the counter bell rings. Pure, so a value can falsify every rule; the
 * WebAudio half is `counter-sound.ts` and the provider that joins them is `CounterBell.tsx`.
 *
 * The owner's rule (decision 5c, 2026-09-29): the counter home rings for a GUEST — a table asking to
 * pay at the counter, a pickup guest's "I'm here", a scan-and-go basket waiting at the exit check —
 * and for FOOD — the kitchen finishing a to-go bag. Every one is a fact the two boards already poll
 * (`getFloorView`, `getExpoQueue`); nothing here reads anything new.
 *
 * ── The one thing a bell must never do ──────────────────────────────────────────────────────────
 * Ring falsely or ring twice. A bell that cries wolf teaches the family to mute it, and a muted bell
 * is worse than none: the chip says the counter will hear, and it will not. So a ring is a KEY seen
 * for the first time on this mount, never a state compared with the previous poll:
 *
 *   · the first GOOD facts a board sees SEED its set and ring nothing — the mount, a StrictMode
 *     replay, a reload, a lane that mounted into an outage (it seeds on its first good poll);
 *   · after that, a key rings at most ONCE per mount, however it comes and goes. The advisory
 *     kitchen read (`expo.ts` answers ok with every bag `unknown` when the cart lines fail) makes a
 *     done bag read done → unknown → done; a KDS bump-undo makes it done → cooking → done; a card
 *     lock makes an ask read counter → paying → counter with the SAME stamp (a re-ask keeps the first
 *     `counter_requested_at`). Diffing against the previous poll rings each of those twice;
 *   · a board that is frozen reports nothing (it only calls in on a good poll); on recovery a key
 *     never seen before rings once, a key seen before the outage never again.
 *
 * The set only grows. It is bounded by the asks, arrivals, baskets and finished bags of ONE mount —
 * a shift's worth of short strings — and pruning it is exactly what would let a flap re-ring.
 */

export type CounterRingKind = "guest" | "food";

/** One board's attention facts, as keys. A key names ONE event: seeing it again is not news. */
export type CounterFacts = { guest: ReadonlySet<string>; food: ReadonlySet<string> };

/**
 * Two boards answer on one tick (the floor's ask and the lane's arrival for the same rush): the
 * provider refuses the same kind again inside this gap, so a burst — including the one an outage's
 * recovery delivers — is one ring per kind. ⚠️ Spec starting value (feedback spec, 2026-09-24),
 * not measured on the counter iPad; OPEN-ITEMS row.
 */
export const RING_GAP_MS = 2000;

/**
 * The floor's facts: a table ASKING to pay at the counter (`status === "counter"`). Keyed by the
 * session AND the ask's stamp: a re-ask keeps the first stamp (so it is the same event), while a
 * table that asks again after its ask was answered carries a new stamp (a new event, a new ring).
 * The floor has no food fact — its "food up" is a dine-in pass notice, not the counter's bell.
 */
export function floorFacts(
  tables: readonly Pick<FloorTable, "sessionId" | "status" | "counterRequestedAt">[],
): CounterFacts {
  const guest = new Set<string>();
  for (const t of tables)
    if (t.status === "counter") guest.add(`ask:${t.sessionId}:${t.counterRequestedAt}`);
  return { guest, food: new Set() };
}

/**
 * The lane's facts.
 *   guest — a guest said "I'm here" (`arrivedAt`, at any stage), and a scan-and-go basket waiting at
 *           the exit check (the preparing stage — a verified basket already met the counter). The
 *           basket test is the card's own `isScanGoBasket`, named once.
 *   food  — a food bag the kitchen has finished (`kitchen === "done"`: `unknown` is a failed read
 *           and never rings) that the counter has not bagged yet (preparing) and whose guest is not
 *           already standing there: an arrived guest already rang, and the bag is theirs to hand
 *           over — a second bell for the same person is noise.
 */
export function laneFacts(
  tickets: readonly Pick<ExpoTicket, "orderId" | "status" | "arrivedAt" | "kitchen" | "lines">[],
): CounterFacts {
  const guest = new Set<string>();
  const food = new Set<string>();
  for (const t of tickets) {
    const basket = isScanGoBasket(t.lines);
    if (t.arrivedAt !== null) guest.add(`here:${t.orderId}`);
    if (basket && t.status === "preparing") guest.add(`verify:${t.orderId}`);
    if (!basket && t.status === "preparing" && t.kitchen === "done" && t.arrivedAt === null)
      food.add(`food:${t.orderId}`);
  }
  return { guest, food };
}

/** What one good poll decides: the ring (one per poll, a guest outranks food), the keys that are
 *  news (each lane card among them takes the one-shot ring), and the grown set. */
export type CounterRing = {
  ring: CounterRingKind | null;
  fresh: ReadonlySet<string>;
  seen: ReadonlySet<string>;
};

/**
 * A board's good poll against its seen set. `seen === null` SEEDS: nothing rings, nothing is news,
 * and every key present is recorded. Otherwise the news is `next \ seen` and the set grows by
 * `next` — so a key rings once per mount, whatever happens to it between polls. A guest outranks
 * food in one poll: the person waiting is the more urgent of the two, and one ring is one ring.
 */
export function counterRing(seen: ReadonlySet<string> | null, next: CounterFacts): CounterRing {
  const keys = [...next.guest, ...next.food];
  if (seen === null) return { ring: null, fresh: new Set(), seen: new Set(keys) };
  const fresh = new Set(keys.filter((k) => !seen.has(k)));
  const grown = new Set([...seen, ...keys]);
  const freshGuest = [...next.guest].some((k) => fresh.has(k));
  const freshFood = [...next.food].some((k) => fresh.has(k));
  const ring: CounterRingKind | null = freshGuest ? "guest" : freshFood ? "food" : null;
  return { ring, fresh, seen: grown };
}

/**
 * The subject of a fact key — the session of an ask, the order of a lane fact — so a board can put
 * the one-shot ring on the card the news is about. Keys are `kind:subject[:stamp]`; a uuid carries
 * no colon, an ISO stamp does, so the subject is the SECOND segment.
 */
export function factSubject(key: string): string {
  return key.split(":")[1] ?? "";
}

/**
 * May the provider ring `ring` now, given the last ring it PLAYED? Always after the gap (inclusive:
 * a gap is "at least this long"). Inside it the same kind is refused — two boards on one tick, or a
 * recovery's burst, are one ring — and so is food after a guest (the guest's ring already turned
 * the counter's head). A guest after food is the one exemption: a person waiting is never
 * swallowed by a bag.
 */
export function mayRing(
  last: { ring: CounterRingKind; at: number } | null,
  ring: CounterRingKind,
  now: number,
  gapMs = RING_GAP_MS,
): boolean {
  if (last === null) return true;
  if (now - last.at >= gapMs) return true;
  return ring === "guest" && last.ring === "food";
}
