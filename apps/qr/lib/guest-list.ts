import { MAX_PARTY_SIZE } from "./limits";
import type { SessionRefusal } from "./session-refusal";

/**
 * The dine-in guest list's party, decided ONCE (M3·P3.1 · P3.4) — read by `GuestList` (the avatars,
 * "Party of N", and whether "Invite" or "Table’s full" stands in the row) AND by PD11's first-visit
 * guide, whose page 1 teaches the Invite control only while the row draws it (Codex round 3 on the
 * m11 spec: a full table is never taught a control it does not have). Two copies of "is the table
 * full?" would drift the day one of them learns about a new kind of seat.
 *
 * Self is always first (presence may not have synced yet) and peers are de-duplicated by seat. At
 * the cap the server refuses further joins (`/api/session`, the `mms_enforce_party_size` trigger),
 * so the row says so instead of offering an invite it cannot honour.
 */
export type GuestSeat = { seat: string; name: string };

export function guestListSeats(me: GuestSeat, members: readonly GuestSeat[]): GuestSeat[] {
  const bySeat = new Map<string, GuestSeat>();
  bySeat.set(me.seat, me);
  for (const m of members) if (!bySeat.has(m.seat)) bySeat.set(m.seat, m);
  return [...bySeat.values()];
}

/**
 * The table is full: the row draws "Table’s full" in Invite's place. With no viewer seat this
 * answers false, and the row draws NOTHING (GuestList renders no party row before the session) —
 * so `false` here is "not full", never "Invite is on screen". A reader that cannot see the row says
 * so with `null` instead (PD11's Account door, `guideInviteLine`): the guide's first run reads this
 * only once the session has joined, when the provider's `me` exists (it is derived from the same
 * session as the cart id — `TableCartProvider`).
 */
export function guestListAtCap(
  me: GuestSeat | null | undefined,
  members: readonly GuestSeat[],
): boolean {
  if (!me) return false;
  return guestListSeats(me, members).length >= MAX_PARTY_SIZE;
}

/**
 * J16 — what the guest row offers when the dine-in join FAILED, decided by the route's machine word
 * (`SESSION_REFUSALS`, lib/session-refusal), never by its sentence. GuestList used to grep the
 * English (`"table is full"`, `"No table found"`), so every arm it could not name — the 409 seated
 * race on a `?table=N` claim, the 400 for a de-registered table — got the generic line and a
 * "Try again" that could only be refused again, and the route's own sentence (which says what to
 * do) was swallowed.
 *
 * - `serverSays` — show the route's sentence: specific and diner-safe where it is a VERDICT. On the
 *   transient arms the generic "Couldn’t join this table." stands, since naming a cause would be a
 *   guess (and a null word may carry a raw "HTTP 502").
 * - `retry` — offer "Try again" only where a re-ask can change the answer. A verdict is not
 *   re-decided by asking twice: the seated race, a retired number, a code that joins nothing (since
 *   W10a an unreadable table is the 503, never this 404) and a full table all answer the same again.
 * - `joinTable` — offer a different code (JoinTable, which routes a fresh `?j=`: join-only, so it can
 *   never provision a table) where a code is the way in — the party's code at a seated table, or
 *   another table's when this one is refused.
 *
 * Every word is decided here, by name: a word the route learns is a compile error until it is
 * placed (the exhaustive `never` below). Null — an older server, an unreadable body, a word this
 * build does not know — is the generic, retryable failure.
 */
export type JoinFailureArm = { serverSays: boolean; retry: boolean; joinTable: boolean };

/** The transient arm: the generic sentence and a retry. */
const RETRY_ARM: JoinFailureArm = { serverSays: false, retry: true, joinTable: false };

export function joinFailureArm(reason: SessionRefusal | null): JoinFailureArm {
  switch (reason) {
    case "seated":
    case "table_not_registered":
    case "code_not_found":
    case "code_invalid":
      return { serverSays: true, retry: false, joinTable: true };
    case "full":
    case "kiosk_order":
    case "table_held":
    case "staff_only":
      return { serverSays: true, retry: false, joinTable: false };
    case "try_again":
    case "unavailable":
    case "rate_limited":
    case "unauthenticated":
    case "bad_request":
    case null:
      return RETRY_ARM;
    default: {
      // Unreachable for a parsed word (`sessionRefusal` answers null for anything unknown); a word
      // added to the list without an arm above fails to compile here.
      const unplaced: never = reason;
      void unplaced;
      return RETRY_ARM;
    }
  }
}
