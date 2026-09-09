/**
 * A1 — the PARKED surfaces (Option A, "subtract to the core", owner's go 2026-09-09).
 *
 * Three doors are switched off here, in ONE place, as constants rather than env flags: a constant
 * cannot drift between Vercel environments, is visible to `tsc` and the tests, and flips back with
 * a one-line commit when a real demand shows up. The code behind each door stays in the repo —
 * its tests and mutants keep running — so parking is reversible; what changes is that no diner or
 * staff screen OFFERS the door, and the server actions behind it refuse.
 *
 *  - `selfServeSplit` — "Split & pay separately" across phones (M3·P3.3b). Measured 2026-09-09:
 *    2 shares in 30 days on the production host. The per-seat REFERENCE breakdown on the Bill is
 *    not parked (it is presentation); only the settlement door is.
 *  - `cardOnFileTabs` — the diner's "Save a card" and the staff "Open a tab" affordances (S3).
 *    6 setups in 30 days. An EXISTING secure tab still closes through `closeSecureTab`, so a card
 *    already on file is never stranded.
 *  - `kiosk` — the lobby device (W6b). 1 view in 30 days, and the device token has never been set
 *    on prod (OPEN-ITEMS C20). The page renders its honest closed state and the actions refuse.
 *
 * ⚠️ Read these where the door is DRAWN and where it is ANSWERED, never only one: a hidden button
 * with a live action behind it is a door with the sign taken down, not a parked one. Answered at:
 * `openSettlement` + `create-share-intent` (split), `openTab` + `setup-intent` (tabs),
 * `openKioskOrder` + the kiosk page (kiosk) — each pinned by a test that flips the constant and a
 * `surfaces/*` mutant that deletes the refusal.
 */
export const SURFACES = {
  selfServeSplit: false,
  cardOnFileTabs: false,
  kiosk: false,
} as const;

export type Surface = keyof typeof SURFACES;

/** The one predicate every consumer reads, so a test can falsify the wiring against the table. */
export function surfaceOpen(surface: Surface): boolean {
  return SURFACES[surface];
}
