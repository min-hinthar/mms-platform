/**
 * PD5 (PATH_DESIGN_2026-10-07, round 3) — the kitchen's ONE settle constant, named once.
 *
 * `UNDO_MS` lived in `KdsBoard.tsx` as the undo pill's window. Three more surfaces now read the
 * same six seconds and must never disagree about them: the TV board's table TURN (m9 — a table
 * goes "out" only once its last bump is this old on the DB clock), the phone's pay door (m10 /
 * D5 — a line counts as served, and create-intent admits it, only once its `bumped_at` is at least
 * this old on the DB clock), and the staff guide's "6 seconds" (m12). `lib/kitchen-track.ts`
 * applies it to every served stamp; the board quotes it on its help card. It gates money's pay
 * door, so it is an authority value: pinned by `kds-undo.test.ts` and a `verify:slice` mutant.
 *
 * Pure and dependency-free, so a server route can import it without pulling React.
 */
export const KDS_UNDO_MS = 6_000;
