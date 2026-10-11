"use client";
import { useCallback, useEffect, useRef } from "react";
import type { FocusTarget } from "../grocery-focus";

/**
 * PD4 (Codex on #329's head `ff29547`) — hand focus to a target that is not mounted YET.
 *
 * "Start a fresh basket" unmounts with the banner it sits in. On the Scan door there is no field to
 * park on, and the stage that should take focus mounts only on the NEXT render — so parking at the
 * tap picked the pressed button itself, and focus fell to <body> as it left (WCAG 2.4.3).
 *
 * `request()` focuses `pick()`'s answer at once when there is one (the Browse field); otherwise it
 * WAITS, and after each commit asks `pick()` again until a target exists. It gives up the moment
 * focus has gone somewhere real — the shopper moved on, and a late landing must never pull focus
 * back from wherever they went.
 */
export function usePendingFocus(pick: () => FocusTarget | null): () => void {
  const pending = useRef(false);
  /** Where focus was at the request — the pressed control. Still on it is not "moved on". */
  const from = useRef<Element | null>(null);
  useEffect(() => {
    if (!pending.current) return;
    const ae = document.activeElement;
    // ⚠️ The pressed control keeping focus through a commit is NOT the shopper moving on (the blind
    // pass on #329 @ f0d013f): giving up there let focus fall to <body> the moment it left.
    if (ae && ae !== document.body && ae !== from.current) {
      pending.current = false;
      return;
    }
    const target = pick();
    if (!target) return;
    pending.current = false;
    target.focus({ preventScroll: true });
  });
  return useCallback(() => {
    const target = pick();
    if (target) target.focus({ preventScroll: true });
    else {
      pending.current = true;
      from.current = document.activeElement;
    }
  }, [pick]);
}
