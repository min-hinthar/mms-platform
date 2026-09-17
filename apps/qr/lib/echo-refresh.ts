"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * M193 — ONE coalescer for every realtime cart echo, because there are TWO screens, not one.
 *
 * #275 fixed the defect where it was found — `TableCartProvider`, the /menu subtree — and left the
 * other `useCartRealtime` consumer exactly as the row described it: `Checkout.tsx` passed an arrow
 * that ignored its `CartChange` and called `refresh()` on every row event. /cart is a separate route
 * with a separate tree, so the provider's coalescer is not mounted there and could never have
 * covered it. It is also the screen where the cost bites hardest: the pre-payment surface, where a
 * `getCartView` chain (~7 sequential DB round trips) competes with create-intent.
 *
 * So the window, the arithmetic and the timer live HERE and both screens read them — the repo's
 * "name it ONCE" rule applied to a policy rather than to a money value. A second copy of `150` and
 * `600` in a component is how the two screens drift apart again.
 */

/**
 * How long to wait for a burst of realtime echoes to settle before re-reading the cart. One tap
 * produces at least two (the line INSERT and the cart `touchCart`), and each read is ~7 sequential
 * DB round trips. Short enough to stay imperceptible on a peer's change; long enough to collapse
 * the actor's own burst into one.
 */
export const ECHO_COALESCE_MS = 150;

/**
 * The longest the trailing coalescer may postpone a re-read (blind adversarial pass on #275, PERF).
 *
 * A pure trailing debounce STARVES on a sustained stream: `clearTimeout` runs on every event and the
 * timer re-arms from zero, so events arriving under 150 ms apart mean the read never fires at all.
 * That is not a latency question — the two things the coalescer exists to PRESERVE are recovery
 * paths (the "written, unreadable" heal via `viewAfterWrite`, and T14's stale-freeze correction
 * riding the `qr_carts` UPDATE), and a burst that does not end is exactly when a table needs them.
 * The guard that should have noticed fires three events and then waits, so by construction it only
 * ever measured bursts that end.
 *
 * Two concurrent mutators on one cart is enough to hold the gap under 150 ms: a table of four with
 * overlapping taps, or a diner adding while staff step a quantity. So the window is a MAXIMUM, not
 * just a quiet period — past it the read runs regardless of how busy the channel still is.
 */
export const ECHO_MAX_WAIT_MS = 600;

/**
 * How long the next re-read may be postponed, given how long the pending burst has ALREADY waited.
 *
 * Pure so it can be falsified by a value rather than by a render: the quiet period and the deadline
 * are two different rules and a fixture that only exercises short bursts cannot tell them apart.
 * `Math.max(0, …)` is load-bearing — past the deadline the inner term goes negative, and a negative
 * `setTimeout` delay is clamped to 0 by the runtime anyway, but the intent must be readable here and
 * not inferred from browser behaviour.
 */
export function echoDelayMs(waitedMs: number): number {
  return Math.max(0, Math.min(ECHO_COALESCE_MS, ECHO_MAX_WAIT_MS - waitedMs));
}

/**
 * Collapse a burst of realtime echoes into ONE re-read. Returns a stable `schedule()` the caller
 * invokes per event; the read itself fires once the burst quietens, or at the deadline — whichever
 * comes first.
 *
 * Coalescing rather than SKIPPING the self-echo is deliberate, because the echo is a recovery path,
 * not noise. When a mutation's own view comes back unreadable — the "written, unreadable" case
 * `viewAfterWrite` exists for — this refresh is what heals the screen; and T14's stale-freeze
 * correction rides the `qr_carts` UPDATE specifically. Dropping either would trade a latency win for
 * a stuck screen.
 *
 * ⚠️ TWO PRECONDITIONS THAT HOLD ON /menu AND NOT ON /cart — stated because the first draft of this
 * docblock offered the first of them as the safety argument for BOTH callers (blind adversarial pass
 * on #287):
 *
 *   • `TableCartProvider`'s `readView` is TICKETED (`issueRead`/`acceptView`, `lib/view-seq.ts`), so
 *     a coalesced read landing after a fresher one is discarded by sequence number. `Checkout`'s
 *     `refresh` has no ticket, and postponing the second of two in-flight reads strictly widens the
 *     age gap between them — filed as OPEN-ITEMS **M225**.
 *   • `TableCartProvider` EXPLAINS a refused write (`explainCaught` → `classifyRefusedWrite`).
 *     `Checkout.changeQty` swallows it in a comment-only `catch`, so a tap in the window before the
 *     lock lands snaps back saying nothing — OPEN-ITEMS **M224**. That window is pre-existing
 *     (realtime delivery plus a ~7-round-trip read); coalescing widens it by up to
 *     `ECHO_COALESCE_MS`, or to the deadline under a sustained burst.
 *
 * ⚠️ CLEANUP IS KEYED ON `refresh`, NOT `[]` (Codex round 2 on #275, P2). An empty dep list only
 * clears on UNMOUNT, so a pending echo outlived a cart change: the /menu subtree stays mounted when
 * the same client switches table or re-mints a session, and the timer kept the OLD `refresh`
 * closure. It could then fire after the NEW cart's first read, take a fresher sequence ticket for
 * the PREVIOUS cart — still readable, so `readIsOurs` has no reason to discard it — and paint one
 * cart's items, totals and freeze over another's. A caller's `refresh` closes over its cart id, so
 * re-running this on its identity is exactly "the cart or its reader changed". The burst ANCHOR is
 * reset with the timer, or the next cart would inherit a deadline measured from the old one's.
 *
 * ⚠️ THE PRICE OF THAT, AND THE CALLER'S OBLIGATION: `refresh` MUST BE STABLE — a `useCallback`, or
 * a module-level binding. An unmemoized reader gets a new identity every render, so any render
 * between the last event and the timer firing clears the pending read and arms no replacement, and
 * the cart misses that change until the next event or interaction (Codex round 5 on #287).
 * `check:echo-coalesce` enforces this, so it is a mechanical requirement rather than a comment.
 */
export function useCoalescedRefresh(refresh: () => unknown): () => void {
  /** Trailing window that collapses one tap's several realtime echoes into a single re-read. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * When the pending burst's FIRST event arrived — the anchor the max-wait is measured from.
   *
   * ⚠️ MONOTONIC, NOT WALL-CLOCK (M226(c)). `Date.now()` can move BACKWARD — an NTP correction, a
   * manual set — and this is an ELAPSED DURATION, which is the one thing a wall clock cannot
   * measure. A backward jump mid-burst makes `waitedMs` negative, so `ECHO_MAX_WAIT_MS - waitedMs`
   * exceeds the quiet period and `Math.min` picks the quiet period on EVERY event: the deadline
   * stops binding and a stream of events under 150 ms apart re-arms the timer forever. That starves
   * the recovery read — the exact failure `ECHO_MAX_WAIT_MS` exists to prevent, restored by a clock
   * that went backwards. `performance.now()` is monotonic by specification and is what an elapsed
   * duration is measured with. Both ends must read the SAME clock or the subtraction is meaningless,
   * which is why the mutant pins them as a pair.
   */
  const since = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      since.current = null;
    },
    [refresh],
  );

  return useCallback(() => {
    if (since.current === null) since.current = performance.now();
    const delay = echoDelayMs(performance.now() - since.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      since.current = null; // the burst is over; the next event starts a fresh deadline
      void refresh();
    }, delay);
  }, [refresh]);
}
