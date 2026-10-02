"use client";
import { useState } from "react";

/**
 * Phase 2h · integration c (critic F1) — a count that moves every time a sheet SETS its message, even
 * to the sentence already standing. Key the live region's CONTENT with it (never the region itself:
 * a newly inserted live region is not announced) so a re-said sentence REPLACES the node and is
 * announced again.
 *
 * Why it is needed: a re-tap refused while the sheet's own write is still out re-says the waiting
 * line that is already in the region. React renders equal text into the same node as no DOM change at
 * all, so a screen reader hears nothing and a sighted person sees nothing — the tap reads as dead.
 * Every `setMsg({ … })` makes a NEW object, so identity is the signal: the count moves on a new
 * object and only on one (a re-render with the same state never moves it).
 *
 * Pass the message STATE, never a value derived during render (a lockout countdown or a drift notice
 * built fresh each render would move the count on every render — a loop).
 */
export function useResaid(said: unknown): number {
  const [seen, setSeen] = useState({ said, n: 0 });
  if (seen.said === said) return seen.n;
  // The sanctioned "adjust state while rendering" shape: React re-runs this render with the new
  // state before committing, so the key the region receives is already the moved one.
  const next = { said, n: seen.n + 1 };
  setSeen(next);
  return next.n;
}
