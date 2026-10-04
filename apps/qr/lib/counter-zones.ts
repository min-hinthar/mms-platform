/**
 * Phase 3a (D5) — which zone of the counter home the reader is IN, from the zone headings' measured
 * tops: the LAST heading at or above the strip's edge. Before the first heading arrives, the first
 * zone is current (the strip's job is "where am I", and the answer at the top is the top). Pure, so
 * the strip's one decision is pinned without a scroll.
 */
export function currentZone(
  tops: { id: string; top: number }[],
  edge: number,
  /** The document is scrollable and scrolled to its end (deep pass on #312): the LAST zone whose
   *  heading is present is current — a short last zone's heading may never climb to the edge, and a
   *  chip the reader tapped would otherwise never light. A missing heading (infinite top) still
   *  never wins. */
  atBottom = false,
): string | null {
  if (tops.length === 0) return null;
  if (atBottom) {
    const present = tops.filter((t) => Number.isFinite(t.top));
    const last = present[present.length - 1];
    if (last) return last.id;
  }
  let current = tops[0]!.id;
  for (const t of tops) if (t.top <= edge) current = t.id;
  return current;
}
