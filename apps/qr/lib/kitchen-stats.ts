import type { KdsStats } from "./kitchen-types";

/**
 * A4·1 (Codex round 1) — `mms_kds_stats` is ADVISORY: `getKitchenQueue` never fails the queue on it,
 * so its absence must stay an ABSENCE. `servedToday` is `null` when the rpc answered nothing, never
 * 0 — the first draft's zero read "Showing the last 40 of 0 served today" over a full rail. A genuine
 * zero (nothing served yet) stays 0; the Avg cell draws "—" for both. Since Codex round 2 the rail's
 * capped sentence no longer reads this count at all — its denominator rides the rows read
 * (`ServedRail.total`, one statement, one snapshot) — so this shape feeds the Avg cell alone.
 */
export function shapeKdsStats(
  row: { avg_secs: number | null; served_count: number | null } | undefined | null,
): KdsStats {
  if (!row) return { avgSecs: 0, servedToday: null };
  return { avgSecs: row.avg_secs ?? 0, servedToday: row.served_count ?? null };
}

/** Which sentence a capped rail shows: the day's count when the rail's own count came back, else the honest form. */
export function servedMoreKey(total: number | null): "kds.served.more" | "kds.served.moreUnknown" {
  return total === null ? "kds.served.moreUnknown" : "kds.served.more";
}
