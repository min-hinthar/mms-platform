/**
 * Phase 3a (D5) — which zone of the counter home the reader is IN, from the zone headings' measured
 * tops: the LAST heading at or above the strip's edge. Before the first heading arrives, the first
 * zone is current (the strip's job is "where am I", and the answer at the top is the top). Pure, so
 * the strip's one decision is pinned without a scroll.
 */
export function currentZone(tops: { id: string; top: number }[], edge: number): string | null {
  if (tops.length === 0) return null;
  let current = tops[0]!.id;
  for (const t of tops) if (t.top <= edge) current = t.id;
  return current;
}
