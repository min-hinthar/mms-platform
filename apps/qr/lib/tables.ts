import { serviceClient } from "@mms/db/server";
import { occupancyFor, seatedTableNumbers } from "./seated";

/** K2 — one registered dine-in table for the picker: its number + honest occupancy (is a party
 *  currently seated). The sticker TOKEN is never included — the picker routes by number (`?table=N`)
 *  and the mint resolves the token server-side, so the token never reaches the client. */
export type DineInTable = { tableNumber: number; occupied: boolean };

/**
 * Server-only read for the dine-in table grid (the DoorSheet's section and the Send sheet's).
 * Lists the active registered tables with truth-at-read-time occupancy — occupancy is NOT a
 * reservation, just "is there a live dine-in session seated at this NUMBER right now", decided by
 * the ONE predicate (`seatedTableNumbers`, lib/seated.ts — Phase 3c-ii D23). Keyed on the number,
 * not the sticker token: a generated-code session bound to 7 at Send (D21) carries the number and
 * never the sticker's code, so a token-keyed read would have offered that table as Open. Read via
 * the service client from an RSC ONLY (never a client component) so the tokens stay server-side.
 * A failed read is NO list (`[]`) — the picker degrades to "scan your sticker" — never a list with
 * every table Open (finding 6: the sessions read used to have no error branch). The registry's
 * sticker code is read HERE so a NUMBERLESS live row on it (the stranded shape — the party
 * `seatedSessionFor`'s token read finds) marks its table too (Codex r2 on #314); `occupancyFor`
 * consumes the code and never emits it.
 */
export async function getDineInTables(): Promise<DineInTable[]> {
  const db = serviceClient();
  // Two independent reads, issued TOGETHER (blind pass on 3c-i · perf): the sheet now reads this on
  // the to-go menu's RSC too, so a serial pair was one round trip of TTFB for nothing (J30).
  const [{ data: tables, error }, seated] = await Promise.all([
    db.from("qr_tables").select("table_number,qr_code").eq("active", true).order("table_number"),
    seatedTableNumbers(db),
  ]);
  if (error || !tables) return [];
  return occupancyFor(
    tables.map((t) => ({ tableNumber: t.table_number, qrCode: t.qr_code })),
    seated,
  );
}
