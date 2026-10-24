import type { serviceClient } from "@mms/db/server";

/**
 * Guest names on the kitchen's screens (owner, 2026-10-24: "guest names should also be in kitchen
 * tickets and boards" — the reversal of K16's "no guest names on kitchen tickets" and of m9 decision
 * 19's "the code is the one identity on the wall").
 *
 * Two sources, both typed by the guest themselves, and nothing else:
 *   · `session_members.display_name` — the name a diner joined the table under, keyed by the seat
 *     (`seat_id`) that `qr_cart_items.added_by` freezes at insert (M87). So a dish carries the name
 *     of the guest who ADDED it — never the one paying for it (`by_seat` is the bill's, not the
 *     kitchen's).
 *   · `qr_carts.customer_name` / `qr_orders.customer_name` — the call-out name a pickup, scan-and-go
 *     or counter order gave at checkout (≤ 40, a column CHECK).
 *
 * A name is what the guest typed, so it is SHAPED here, once, for a ticket and a TV: whitespace
 * collapsed, blank → none, and cut to `GUEST_NAME_MAX` characters (an ellipsis marks the cut) so a
 * long name can never push a dish or a table number off a ticket. Never invented: a line nobody
 * named (a staff-added dish, a seat that left before the read) carries no name.
 *
 * PURE except `readGuestNames`, whose failure is ADVISORY (logged, every name absent): a name is a
 * label, and freezing a working kitchen over a label would be the over-blocking direction (the P1
 * posture `lib/kitchen.ts` takes for the Burmese names).
 */

/** The longest name a ticket or the wall draws — a first name and an initial fit, a paragraph does not. */
export const GUEST_NAME_MAX = 24;

/** A typed name, shaped for a ticket: trimmed, inner whitespace collapsed, cut at `GUEST_NAME_MAX`. */
export function guestCallName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0) return null;
  const chars = [...name];
  return chars.length > GUEST_NAME_MAX ? `${chars.slice(0, GUEST_NAME_MAX - 1).join("")}…` : name;
}

/** The seat → name key: a seat id is only unique within its session. */
export const seatKey = (sessionId: string, seatId: string) => `${sessionId}|${seatId}`;

export type GuestMemberRow = { session_id: string; seat_id: string; display_name: string | null };

/** `session_members` rows → a seat-keyed name map, shaped; a nameless member is absent. */
export function guestNameBySeat(rows: readonly GuestMemberRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const name = guestCallName(r.display_name);
    if (name) out.set(seatKey(r.session_id, r.seat_id), name);
  }
  return out;
}

/** The name of the guest who added a line, or null when the line has no seat or the seat no name. */
export function lineGuest(
  names: ReadonlyMap<string, string>,
  sessionId: string,
  addedBy: string | null | undefined,
): string | null {
  if (!addedBy) return null;
  return names.get(seatKey(sessionId, addedBy)) ?? null;
}

/**
 * The distinct names on a set of lines, in the order they first appear. The wall lists who a dish
 * row is for without counting them (a quantity is never published), so two bowls one guest added
 * name them once.
 */
export function distinctGuests(guests: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const g of guests) if (g && !out.includes(g)) out.push(g);
  return out;
}

/** The members cap: tables of a few guests each, on at most a day's sessions. */
export const GUEST_MEMBER_CAP = 1000;

type MembersDb = ReturnType<typeof serviceClient>;

/**
 * One ADVISORY read of the members behind `sessionIds`: a failure (or a read that came back full,
 * which did not see every member) logs and answers an EMPTY map — every line then carries no name,
 * which is what the board showed before names existed. Never throws.
 */
export async function readGuestNames(
  db: MembersDb,
  sessionIds: readonly string[],
  tag: string,
): Promise<Map<string, string>> {
  if (sessionIds.length === 0) return new Map();
  try {
    const { data, error } = await db
      .from("session_members")
      .select("session_id,seat_id,display_name")
      .in("session_id", [...sessionIds])
      .limit(GUEST_MEMBER_CAP);
    if (error) {
      console.error(`[${tag}] guest name read failed — tickets carry no names this poll`, {
        message: error.message,
      });
      return new Map();
    }
    const rows = data ?? [];
    if (rows.length >= GUEST_MEMBER_CAP) {
      console.error(`[${tag}] guest name read saturated — tickets carry no names this poll`, {
        cap: GUEST_MEMBER_CAP,
      });
      return new Map();
    }
    return guestNameBySeat(rows);
  } catch (e) {
    console.error(`[${tag}] guest name read threw — tickets carry no names this poll`, e);
    return new Map();
  }
}
