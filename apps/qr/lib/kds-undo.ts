/**
 * PD5 (PATH_DESIGN_2026-10-07, round 3) — the kitchen's ONE settle constant, named once.
 *
 * `UNDO_MS` lived in `KdsBoard.tsx` as the undo pill's window. TODAY two modules read it: the
 * board (the pill's window, timed from the tap, and the help card's "6 seconds") and
 * `lib/kitchen-track.ts`, which applies it to every served stamp (`servedSettled`) — a module no
 * surface imports yet. The surfaces that WILL read the same six seconds through it, and must never
 * disagree about them, are the TV board's table TURN (PD9, m9 — a table goes "out" only once its
 * last bump is this old on the DB clock), the phone's pay door (PD10, m10 / D5 — a line counts as
 * served, and create-intent admits it, only once its `bumped_at` is at least this old), and the
 * staff guide's "6 seconds" (m12). Once PD10 lands it gates money's pay door, so it is held as an
 * authority value from today: pinned by `kds-undo.test.ts` and a `verify:slice` mutant.
 *
 * Pure and dependency-free, so a server route can import it without pulling React.
 */
export const KDS_UNDO_MS = 6_000;
