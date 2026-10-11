/**
 * The wall TV's KITCHEN constants — and the record of the boundary this file used to hold.
 *
 * ⚠️ THE BOUNDARY WAS REVERSED BY THE OWNER, 2026-10-07 (PATH_DESIGN decision 11; OPEN-ITEMS K32(b),
 * P6a). From P6 until PD9 this file shaped a "kitchen pulse" band under a rule written here in these
 * words: "a dish list attributed to that number is a different fact: it is what those particular
 * people chose, which nothing in the room publishes today" — so the wall published a ticket count,
 * the oldest ticket's age, an UNATTRIBUTED all-day rail behind an exposure floor, and dine-in tables
 * as NUMBER + `cooking`/`up` only. The owner's message — "TV board display shows live order progress
 * in details (per item per table etc.,) for customers and staff" — is the decision K32(b) was waiting
 * for, and it reverses that rule knowingly: the room now reads WHAT EACH TABLE ORDERED while it
 * cooks, dish by dish, for as long as the table is on the wall.
 *
 * What still holds, now enforced by `lib/board-tables.ts`'s output type (the new boundary):
 * a table number and dish names ONLY. No guest name, id, quantity (same-name dishes in a Send are ONE
 * row), modifier, note, seat, comp, void, amount, staff attribution, time, age or ETA. A dish not
 * yet sent, or inside its Send's grace, never appears. The band's load figures (count, oldest age,
 * the all-day rail) are retired from the wall with it — lateness belongs to the KDS alone — which
 * also closes P6a, the frame-delta channel through the rail.
 *
 * What is left here is shared, which is why the file stays: the floor board (`lib/floor-kitchen.ts`)
 * reads the cooking states and the linger, and the TV shaper reads the modes and the linger. One
 * home each, so the wall, the floor and the KDS never disagree about what "cooking" and "just out"
 * mean.
 */

/**
 * The session modes whose tables may appear on the wall, written as the set it IS — an ALLOWLIST,
 * so a fourth value added to `table_sessions.mode`'s CHECK later appears nowhere until somebody
 * decides it should. `!== "pickup"`-shaped thinking is what put names on this wall twice before.
 */
export const PULSE_TABLE_MODES: ReadonlySet<string> = new Set(["dinein"]);

/**
 * The line states that mean "food is on the wok right now" (`qr_cart_items.state`) — the same two the
 * KDS queue reads, so the wall, the floor and the pass count the same food. `voided` and `draft` are
 * absent because neither is cooking; `comped` is not a state and is not consulted — a comped dish is
 * still cooked, still plated and still owed by the kitchen.
 */
export const PULSE_COOKING_STATES: ReadonlySet<string> = new Set(["fired", "in_progress"]);

/**
 * How long food stays on the wall (and on the floor's "ready to serve" count) after its last bump.
 *
 * A DISPLAY WINDOW over a fact, not a bound on a claim: `bumped_at` (stamped by `mms_bump_ticket` and
 * by `mms_line_transition`'s served edge, cleared again by `mms_recall_ticket`) says the pass finished
 * the food, and that stays true; what stops being USEFUL is a five-minute-old announcement, so the
 * wall stops repeating it. It is also the bound on how long a frozen wall may keep showing a table it
 * can no longer read (the table may have gone: m9 critic B7).
 */
export const PULSE_PASS_LINGER_MS = 5 * 60 * 1000;

/**
 * The parent cart. `status` is CARRIED, not merely filtered upstream — the read narrows it to
 * open/paid, and the KDS's gate reads it.
 */
export type PulseCartRow = { id: string; session_id: string; status: string };

/**
 * The session behind a cart: what decides whether it is a TABLE, and which one.
 *
 * `mode` and `status` are non-null because `table_sessions` declares them `not null` with a CHECK
 * (`20260618000000_qr_platform_init.sql`); `table_number` is the nullable one — it was added later
 * (`20260713000000_k2_table_registry.sql`) as an optional FK, so a dine-in session started at an
 * UNREGISTERED sticker genuinely has no number, and that case is handled rather than assumed away.
 */
export type PulseSessionRow = {
  id: string;
  mode: string;
  status: string;
  table_number: number | null;
  /**
   * The 4-hour mint TTL, `not null` in the schema and NEVER extended by anything in this repo. Past
   * it `is_member` refuses the diners themselves, and nothing closes the session
   * (`app/api/session/route.ts`: no background sweeper) — so a table past its TTL is a GHOST, and one
   * unbumped line would otherwise pin its number to a public wall for good. The floor board, which
   * owns table state, has always filtered it; the wall does too (`lib/board-tables.ts`).
   */
  expires_at: string;
  /** PD9 (the blind pass on #336) — read only to tell a staff COUNTER order (`reg-` on a pickup
   *  session, `isCounterOrder`), which cooks before it is paid, so "All clear" is never said over it.
   *  Never published. */
  qr_code: string;
};
