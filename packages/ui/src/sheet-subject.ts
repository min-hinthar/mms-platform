"use client";
import { useState } from "react";

/**
 * M76 — a sheet its parent UNMOUNTS on close cannot exit: Radix's `Presence` can only hold a node
 * whose `open` went false, never one React removed. Three of the console's sheets were mounted as
 * `{subject && <XSheet open …/>}` — the right shape for per-open freshness (a remount resets the
 * PIN, the reason, the selection), and exactly the shape that cuts. This hook keeps both: the
 * SUBJECT is held through the exit (so the sheet can render it while sliding down), `open` follows
 * the caller's live subject, and `key` advances on every open edge — render `<XSheet key={key}
 * open={open} …={held}>` and each open is still a fresh instance, mounted while the previous one
 * is already gone. The transition is `holdSubject`, pure, so the four cases it must get right are
 * value-falsifiable; the hook only stores the result.
 *
 * Derived during render (the sanctioned adjust-state-on-prop-change shape), never in an effect —
 * an effect would paint one frame with the previous subject, or none.
 */
export type SheetSubjectState<T> = { held: T | null; open: boolean; key: number };

/**
 * The next state for a live `subject`. Rules: `open` IS `subject !== null`; `held` is the live
 * subject while open (a parent that refreshes the object mid-open must reach the sheet) and the
 * LAST subject once closed; `key` advances only on the closed→open edge, so a re-render while open
 * never remounts the sheet, and a close never touches it (the exiting instance keeps its key).
 */
export function holdSubject<T>(
  prev: SheetSubjectState<T>,
  subject: T | null,
): SheetSubjectState<T> {
  const open = subject !== null;
  if (open) return { held: subject, open, key: prev.open ? prev.key : prev.key + 1 };
  return { held: prev.held, open, key: prev.key };
}

const INITIAL: SheetSubjectState<never> = { held: null, open: false, key: 0 };

export function useSheetSubject<T>(subject: T | null): SheetSubjectState<T> {
  const [state, setState] = useState<SheetSubjectState<T>>(INITIAL);
  const next = holdSubject(state, subject);
  // Store only what changed: an open edge (the key) or the subject/openness. Same-render setState
  // is React's own idiom for derived state; it re-renders this component before any child paints.
  if (next.open !== state.open || next.key !== state.key || next.held !== state.held)
    setState(next);
  return next;
}
