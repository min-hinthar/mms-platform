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
 *
 * ⚠️ REOPENING `selfServeSplit` IS NO LONGER A ONE-LINE FLIP, and the reason is A3 (M201). The
 * split's same-host re-open (even ↔ by-person before anyone authorizes) rode
 * `acquireSettlement`'s `settle_by.eq.<uid>` arm, and that arm was the counter's double-mint —
 * `settleCash` / `closeSecureTab` inherited it by passing a shared uid — so A3 removed it rather
 * than argue around it. `openSettlement` still acquires under the host's seat uid and every release
 * in `split.ts` is scoped to it — narrower than the by-cart form it replaced, but a seat uid is a
 * PERSON, not a request, so the counter's uniqueness argument does not transfer (two opens by one
 * host share it). Flipping the constant therefore reopens a door whose freeze is scoped but not
 * request-unique, and whose same-host re-open is gone: a second `openSettlement` by the same host
 * answers `settling_other` until the freeze ages out. Reopening needs BOTH: a per-open uuid as the
 * owner (carried on the share intents as `settleOwner`, which the route already stamps), and the
 * re-open restored as release-own-then-acquire (refusing if any share is already authorized) —
 * never by putting the arm back.
 *
 * A THIRD prerequisite since #280's Codex round 4 (OPEN-ITEMS M215): the capture gate.
 * `onShareAuthorized` proves ownership with a READ and `captureAllIfReady` gates on a bare non-null
 * `settle_at`, so a stale-ours row the counter takes between the two statements captures every
 * share under a foreign fresh freeze — the re-claim must be atomic and the capture must refuse
 * any other owner.
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
