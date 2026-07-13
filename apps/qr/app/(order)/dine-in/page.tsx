import { getDineInTables } from "@/lib/tables";
import { TablePicker } from "@/components/TablePicker";

// K2 (Journey II) — the dine-in table picker route. Reached from the Dine-in door on the entry (the
// "can't scan the sticker" fallback); a scanned physical sticker deep-links straight to
// /menu?mode=dinein&t=<token> and skips this. RSC read of the registered tables + occupancy via the
// service client (the sticker tokens stay server-side); the client TablePicker gets only number +
// occupied and routes by NUMBER (?table=N) so the token never touches the client.
export const dynamic = "force-dynamic"; // occupancy is truth-at-read-time — never cache the picker

export default async function DineIn() {
  const tables = await getDineInTables();
  return <TablePicker tables={tables} />;
}
