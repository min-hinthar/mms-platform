import { chosenName } from "./send-nudge-state";

/**
 * The ONE identity a table's pass prints — "Show a server" (PD1) and the counter ask (PD2) alike.
 *
 * ⚠️ NEVER THE SESSION'S JOIN CODE (owner-delegated decision, 2026-10-09; the blind pass on #335).
 * A table with no number yet (it is bound at the first Send, §33) used to print `SplitContext.qrCode`
 * at the 40px holder tier — PATH_DESIGN reconciliation 6. That code is the session's BEARER join
 * secret and its RLS key (`lib/session-code.ts`: "the code IS the qr_code … the shareable invite
 * code and the realtime/RLS session key"): anyone close enough to read eight characters off a pass
 * held up in the dining room could join the table, add dishes that fire with its next Send, and
 * read its names and cart. So a numberless pass prints a NON-SECRET identity instead — the host's
 * first name when the table chose one ("Aye’s table"), otherwise "Your table" — and the server finds
 * the table on the console by its open cart, never by a code read off a phone.
 *
 * This function does not take the code at all: there is no argument a caller could route it
 * through. The MY lines are K15 drafts (m1/m2 §H).
 */
export type PassIdentityProps =
  | { figure: string; figureKind: "table"; fallback?: undefined }
  | { figure?: undefined; figureKind?: undefined; fallback: { en: string; my: string } };

export function passIdentity(
  tableNumber: number | null,
  /** The host's display name as the table holds it (`session_members`); null when there is none. */
  hostName: string | null,
): PassIdentityProps {
  if (tableNumber != null) return { figure: String(tableNumber), figureKind: "table" };
  const first = chosenName(hostName)?.split(/\s+/)[0] ?? null;
  return first
    ? { fallback: { en: `${first}’s table`, my: `${first} ရဲ့ စားပွဲ` } }
    : { fallback: { en: "Your table", my: "သင့်စားပွဲ" } };
}
