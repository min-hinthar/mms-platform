import type { serviceClient } from "@mms/db/server";
import { isUuid, uuidOptionIds } from "./ticket-names";

/**
 * A4·1 (F18) — the ONE loader for the Burmese half of an order line, promoted from the copy
 * `expo.ts` carried (the general case) so kitchen.ts, expo.ts, `/api/board` and the served rail
 * read one function instead of keeping a copy each. The rules it names once:
 *
 *  · `menu_item_id` is a SOFT ref that carries dish uuids AND grocery barcodes, so the ids are
 *    PARTITIONED before the IN-lists — one barcode inside a uuid list errors the whole query, and
 *    the failure would strip Burmese from every line, not the one bad ref.
 *  · `modifier_option_ids` is soft jsonb; only uuid-shaped values are asked for (`uuidOptionIds`).
 *  · Every read here is ADVISORY. A failed table logs, BY TABLE, and that half renders the English
 *    snapshot — exactly what the surface showed before P1. A name read cannot misidentify a bag or a
 *    ticket, so freezing a board over a label is the over-blocking direction; a caller that gates
 *    its own menu read on `outage` (the KDS, whose menu read also carries stations and sold-out)
 *    passes `menu: "skip"` and supplies that map itself.
 *
 * Server-only by construction (it takes the service client); `ticket-names.ts` stays pure because
 * `TicketText.tsx` — a client component — imports it, and a DB import there would drag the server
 * client into the KDS bundle.
 */
export type LineNameRef = {
  menu_item_id: string;
  /** Absent on reads that do not select it (the board's pulse lines) — then no options are asked for. */
  modifier_option_ids?: unknown;
};

export type LineNames = {
  /** `menu_items.name_my` by uuid and `grocery_items.name_my` by barcode — the ref as stored. */
  nameMyByRef: Map<string, string | null>;
  /** `modifier_options.name_my` by option id. */
  optionNameMy: Map<string, string | null>;
};

type Db = ReturnType<typeof serviceClient>;
type NamedRow = { id: string; name_my: string | null };
const NONE = { data: [] as NamedRow[], error: null };

export async function loadLineNames(
  db: Db,
  refs: readonly LineNameRef[],
  opts: { tag: string; menu?: "read" | "skip" },
): Promise<LineNames> {
  const readMenu = opts.menu !== "skip";
  const menuIds = readMenu ? [...new Set(refs.map((r) => r.menu_item_id).filter(isUuid))] : [];
  const barcodes = readMenu
    ? [...new Set(refs.map((r) => r.menu_item_id).filter((id) => !isUuid(id)))]
    : [];
  const optionIds = [...new Set(refs.flatMap((r) => uuidOptionIds(r.modifier_option_ids)))];

  const [menuRes, groceryRes, optRes] = await Promise.all([
    menuIds.length ? db.from("menu_items").select("id,name_my").in("id", menuIds) : NONE,
    barcodes.length
      ? db.from("grocery_items").select("barcode,name_my").in("barcode", barcodes)
      : { data: [] as { barcode: string; name_my: string | null }[], error: null },
    optionIds.length ? db.from("modifier_options").select("id,name_my").in("id", optionIds) : NONE,
  ]);
  for (const [what, r] of [
    ["menu_items", menuRes],
    ["grocery_items", groceryRes],
    ["modifier_options", optRes],
  ] as const) {
    if (r.error)
      console.error(`[${opts.tag}] ${what} name_my read failed — that half renders EN`, {
        message: r.error.message,
      });
  }

  const nameMyByRef = new Map<string, string | null>();
  for (const m of menuRes.error ? [] : (menuRes.data ?? [])) nameMyByRef.set(m.id, m.name_my);
  for (const g of groceryRes.error ? [] : (groceryRes.data ?? []))
    nameMyByRef.set(g.barcode, g.name_my);
  const optionNameMy = new Map<string, string | null>(
    (optRes.error ? [] : (optRes.data ?? [])).map((o) => [o.id, o.name_my] as const),
  );
  return { nameMyByRef, optionNameMy };
}
