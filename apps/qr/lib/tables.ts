import { serviceClient } from "@mms/db/server";

/** K2 — one registered dine-in table for the picker: its number + honest occupancy (is a party
 *  currently seated). The sticker TOKEN is never included — the picker routes by number (`?table=N`)
 *  and the mint resolves the token server-side, so the token never reaches the client. */
export type DineInTable = { tableNumber: number; occupied: boolean };

/**
 * Server-only read for the dine-in table picker (the "can't scan the sticker" fallback). Lists the
 * active registered tables with truth-at-read-time occupancy — occupancy is NOT a reservation, just
 * "is there an active, non-expired session for this table right now" (mirrors the mint's own
 * active-session predicate: status='active' AND expires_at>now()). Read via the service client from
 * an RSC ONLY (never a client component) so the tokens stay server-side; a read failure returns [] so
 * the picker degrades to "scan your sticker" rather than crashing the dine-in door.
 */
export async function getDineInTables(): Promise<DineInTable[]> {
  const db = serviceClient();
  const { data: tables, error } = await db
    .from("qr_tables")
    .select("table_number,qr_code")
    .eq("active", true)
    .order("table_number");
  if (error || !tables) return [];

  const { data: active } = await db
    .from("table_sessions")
    .select("qr_code")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  const seated = new Set((active ?? []).map((s) => s.qr_code));

  return tables.map((t) => ({ tableNumber: t.table_number, occupied: seated.has(t.qr_code) }));
}
