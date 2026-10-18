"use client";
// The decision it schedules is `counterPayOutcome` (lib/counter-pay) and its cadence is
// `endPollDelayMs` (lib/session-truth), both mutant-pinned; its own rule — never while the page is
// hidden — carries `lcs/poll-runs-while-hidden` against `end-poll.test.tsx`.
import { useEffect, useRef } from "react";

/**
 * Session truth — the ONE terminal-state probe, shared by the menu (`TableCartProvider`) and the Bill
 * (`Checkout`). A staff Clear, a Merge and the sweep close the session in the same transaction that
 * ends the cart, so `is_member` is already false when Realtime authorizes the change and no event ever
 * reaches the phone: a screen that is not being tapped would sit frozen — a stale, editable bill on
 * /cart (Codex round 1 on #361), "being made" over voided dishes on /menu — for as long as it is open.
 *
 * `delayMs` is `endPollDelayMs` (null = do not poll: not a table, no cart, or already ended), so both
 * surfaces read ONE cadence rule. A tick is skipped while the page is hidden — a pocketed phone asks
 * nothing, and each surface's visibility re-read covers the return. `tick` is held in a ref so a new
 * closure each render never restarts the interval.
 */
export function useEndPoll(delayMs: number | null, tick: () => void): void {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);
  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      tickRef.current();
    }, delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}
