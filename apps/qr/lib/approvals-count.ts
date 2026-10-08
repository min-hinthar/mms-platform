/**
 * PD8 (m8 decision 4) — what the bar's approvals circle may claim from a head-count read.
 *
 * `countPendingApprovals` used to answer `0` on any error — a deliberate degrade while the badge was
 * an ornament on a nav link (W10b). A4·5 made that circle the counter's ONE pending-approvals signal,
 * and a false all-clear on it is a manager walking away from a pending loss. So the verdict is a value:
 * a count only when one was read; `{ ok: false }` otherwise (the circle then draws a dashed ring with
 * no number and says "couldn't check"). Pure, so it is falsified here and mutated in verify:slice.
 */
export type PendingCount = { ok: true; count: number } | { ok: false };

export function pendingCountVerdict(read: { count: number | null; error: unknown }): PendingCount {
  if (read.error) return { ok: false };
  const n = read.count;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, count: n };
}
