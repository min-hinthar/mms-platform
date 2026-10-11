import { MAX_PARTY_SIZE } from "./limits";

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
