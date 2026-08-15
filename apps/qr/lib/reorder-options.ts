/**
 * M3 — faithful-reorder decision helpers (pure; pinned by lib/reorder-options.test.ts + the
 * verify:slice mutants). The action (lib/reorder.ts) delegates BOTH decisions here so they stay
 * testable by construction:
 *  - which stored ids a historical line actually carries (legacy rows predate the column → []);
 *  - whether the re-added dish must be DISCLOSED as different from the original (`optionsReset`).
 */

/** The stored `modifier_option_ids` jsonb, normalized to a string[] — legacy '[]', null, or any
 *  malformed shape reads as "no ids" (today's label-only behavior), never a throw. */
export function storedOptionIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Did the reordered line come back DIFFERENT than the original's options?
 *  - Legacy line (no stored ids) that HAD option labels → it returns as the BASE dish (we never
 *    guess what "extra chili oil" was) → disclose.
 *  - Id-carrying line where priceItem honored FEWER ids than stored (an option vanished or was
 *    deactivated) → the dish is partial → disclose.
 *  - Every stored id honored → the line is faithful → say nothing.
 */
export function optionsCameBackDifferent(
  storedCount: number,
  honoredCount: number,
  originalHadOptionLabels: boolean,
): boolean {
  if (storedCount === 0) return originalHadOptionLabels;
  return honoredCount < storedCount;
}
