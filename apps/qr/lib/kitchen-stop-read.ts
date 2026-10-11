import "server-only";
import type { serviceClient } from "@mms/db/server";
import type { KitchenStation, KitchenStop, KitchenStopLine } from "./kitchen-types";
import { cardStamp, ticketKey } from "./kitchen-rounds";
import { loadLineNames, type LineNames } from "./line-names";
import { catalogNameMy, isUuid, pairModifiersMy } from "./ticket-names";
import { queueEmptiness } from "./queue-window";
import { stationForCategory } from "./kitchen-station";

/**
 * M270 (1) · PATH_DESIGN correction 12 — THE stop read: the "Table N left — stop cooking" cards the
 * kitchen has not acknowledged yet. `mms_clear_table` (M182) voids the kitchen's lines and closes the
 * session in one transaction, so the cleared cart's tickets leave the live read on the next poll;
 * what it ALSO writes is the durable stop record — `qr_table_clears.stop_line_ids`, the kitchen lines
 * that clear voided — and this reads it back: the open records (`stop_acknowledged_at` null, at least
 * one stopped line), each Send's struck dishes, and the table they belong to. Server-only, and NOT a
 * `"use server"` module (nothing here may become a public Server Action); `getKitchenQueue` calls it
 * behind the staff gate, with the service-role client.
 *
 * It fails SOFT, all the way down: any failed leg answers `null` — never a partial card (a card
 * missing its table would attribute food to no one; one missing its dishes would under-say what to
 * stop) — and `settleKitchenStops` bounds it so it never gates the pass. The board keeps the cards it
 * last drew on a `null` (`foldStopRead`), so a failed read neither blanks the board nor says a table
 * was acknowledged when it was not.
 */

/** The newest open records the read takes, newest FIRST (so a fresh clear is never crowded out by an
 *  old one nobody acknowledged; the board draws them oldest-Send-first). Past it the read logs and
 *  draws the newest — each card it draws is a true open record, and "Got it" on them lets the older
 *  ones in on the next read; nothing on the board claims there are no more (the region's All clear
 *  needs no stop card standing). A teahouse kitchen holds a handful. */
export const STOP_CLEAR_CAP = 24;
/** The stopped lines one read takes (well under PostgREST's 1 000 `max_rows`): whole records only,
 *  newest first — a record that does not fit waits for the next read rather than being drawn with
 *  part of its dishes. */
export const STOP_LINE_CAP = 500;
/** The ids ONE request asks for: the dishes read is split into IN-lists of at most this many, run in
 *  parallel — 500 uuids in one query string is ~18.5 KB of URL, past what a proxy may take. */
export const STOP_ID_CHUNK = 100;
/** How long the LIVE queue waits for the stop read before answering without it (`null`). */
export const STOP_READ_BUDGET_MS = 2_500;

type Db = ReturnType<typeof serviceClient>;

export type StopClearRow = {
  id: string;
  session_id: string;
  stop_line_ids: string[];
  created_at: string;
};
export type StopLineRow = {
  id: string;
  name: string;
  qty: number;
  modifiers: unknown;
  modifier_option_ids: unknown;
  menu_item_id: string;
  cart_id: string;
  fire_batch: string | null;
  fire_at: string | null;
  created_at: string;
};
export type StopSessionRow = { id: string; qr_code: string; table_number: number | null };

/**
 * The ids to read, newest record first, WHOLE records only, under `cap`. A record that would push the
 * read past the cap waits (with every older one) for a later read, after "Got it" has retired newer
 * ones — never drawn with some of its dishes. A single record larger than the cap on its own is taken
 * alone, and WHOLE: one "Got it" retires the record, so a card drawn with part of its dishes would
 * retire the rest unseen (the read chunks its requests, so the size is the request's, never a cut).
 */
export function stopLineBudget(
  clears: readonly StopClearRow[],
  cap: number = STOP_LINE_CAP,
): { clears: StopClearRow[]; ids: string[] } {
  const taken: StopClearRow[] = [];
  const ids = new Set<string>();
  for (const c of clears) {
    const fresh = c.stop_line_ids.filter((id) => !ids.has(id));
    if (ids.size + fresh.length > cap) {
      if (taken.length > 0) break;
      taken.push(c);
      for (const id of fresh) ids.add(id);
      break;
    }
    taken.push(c);
    for (const id of fresh) ids.add(id);
  }
  return { clears: taken, ids: [...ids] };
}

/** `ids` in IN-lists of at most `size`, in order (none for none). */
export function chunkIds(ids: readonly string[], size: number = STOP_ID_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * The pure half: records → stop cards. One card per SEND of each record (m5 B1 — the Send's own
 * `ticketKey`, the key its live ticket had), its dishes in the record's own order, standing where its
 * ticket stood (`firedAt`, the Send's earliest raw stamp). A record whose table cannot be read is not
 * drawn under a name it does not have (the live read drops an orphan the same way); a record whose
 * line rows are all missing still draws ONE card — the table and the warn word — so it can be
 * acknowledged. Oldest Send first, the board's own order.
 *
 * Each dish carries its STATION (`stations`, by menu item — the tickets' own derivation), so a
 * station's view shows a stop card only when it stopped that station's food. `stations` null (the
 * menu read failed), or a dish the read did not find: the station is unknown (`null`), and the card
 * shows on every station's view rather than on none.
 */
export function shapeKitchenStops(
  clears: readonly StopClearRow[],
  lines: readonly StopLineRow[],
  sessions: readonly StopSessionRow[],
  names: LineNames,
  stations: ReadonlyMap<string, KitchenStation> | null = null,
): KitchenStop[] {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const sessById = new Map(sessions.map((s) => [s.id, s]));
  const out: KitchenStop[] = [];
  for (const c of clears) {
    const sess = sessById.get(c.session_id);
    if (sess === undefined) continue;
    const base = { clearId: c.id, tableNumber: sess.table_number ?? null, label: sess.qr_code };
    const bySend = new Map<string, StopLineRow[]>();
    for (const id of c.stop_line_ids) {
      const l = lineById.get(id);
      if (l === undefined) continue;
      const k = ticketKey(l);
      const ls = bySend.get(k);
      if (ls === undefined) bySend.set(k, [l]);
      else ls.push(l);
    }
    if (bySend.size === 0) {
      out.push({ ...base, key: `stop|${c.id}|none`, firedAt: c.created_at, lines: [] });
      continue;
    }
    for (const [k, ls] of bySend) {
      out.push({
        ...base,
        key: `stop|${c.id}|${k}`,
        firedAt: cardStamp(ls),
        lines: ls.map((l): KitchenStopLine => {
          const modifiers = Array.isArray(l.modifiers) ? (l.modifiers as string[]) : [];
          return {
            id: l.id,
            name: l.name,
            nameMy: catalogNameMy(names.nameMyByRef.get(l.menu_item_id), l.name),
            qty: l.qty,
            modifiers,
            modifiersMy: pairModifiersMy(l.modifier_option_ids, modifiers, names.optionNameMy),
            station: stations?.get(l.menu_item_id) ?? null,
          };
        }),
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt));
}

/**
 * The read: the open records (newest first, capped), then — in parallel — the tables and the stopped
 * lines (in IN-lists of at most `STOP_ID_CHUNK`), then the dishes' menu rows (their stations and
 * Burmese names) and their options' Burmese — both ADVISORY: a failed menu read renders English and
 * an unknown station (the card shows on every station's view), never `null`. `null` on any failed
 * table or dishes leg, logged.
 */
export async function readKitchenStops(db: Db): Promise<KitchenStop[] | null> {
  // Open, with something stopped. M182's partial index `qr_table_clears_stop_open` is keyed on
  // `cardinality(stop_line_ids) > 0`, which PostgREST cannot express, so the planner cannot match it
  // to this `<> '{}'` read: a scan (0 rows in prod today; OPEN-ITEMS M272). The empty-array
  // refusal is the SQL's, BEFORE the cap — a free clear (a paid table) writes a record
  // with no stopped line and nothing ever acknowledges it, so filtered after the cap those records
  // would crowd the read until it answered no cards over a real stop (M180's lie, again).
  const { data, error } = await db
    .from("qr_table_clears")
    .select("id,session_id,stop_line_ids,created_at")
    .is("stop_acknowledged_at", null)
    // `stop_line_ids=neq.{}` on the wire (`.neq` is typed for an array's elements; this is the array)
    .filter("stop_line_ids", "neq", "{}")
    .order("created_at", { ascending: false })
    .limit(STOP_CLEAR_CAP);
  if (error || !data) {
    console.error("[kitchen] stop read failed — the board keeps the stop cards it has", {
      message: error?.message,
    });
    return null;
  }
  if (queueEmptiness(data.length, STOP_CLEAR_CAP) === "cannot-say")
    console.error("[kitchen] stop read saturated — drawing the newest open stops", {
      cap: STOP_CLEAR_CAP,
    });
  const open = data.filter((c) => Array.isArray(c.stop_line_ids) && c.stop_line_ids.length > 0);
  const { clears, ids } = stopLineBudget(open);
  if (clears.length === 0) return [];
  const sessionIds = [...new Set(clears.map((c) => c.session_id))];
  const [sessRes, ...lineReads] = await Promise.all([
    db.from("table_sessions").select("id,qr_code,table_number").in("id", sessionIds),
    ...chunkIds(ids).map((chunk) =>
      db
        .from("qr_cart_items")
        .select(
          "id,name,qty,modifiers,modifier_option_ids,menu_item_id,cart_id,fire_batch,fire_at,created_at",
        )
        .in("id", chunk),
    ),
  ]);
  // Each leg on its own: a card with no table to name it, or with its dishes missing, is never drawn.
  if (sessRes.error) {
    console.error("[kitchen] stop read (tables) failed — the board keeps its stop cards", {
      message: sessRes.error.message,
    });
    return null;
  }
  const lineError = lineReads.find((r) => r.error)?.error;
  if (lineError) {
    console.error("[kitchen] stop read (dishes) failed — the board keeps its stop cards", {
      message: lineError.message,
    });
    return null;
  }
  const sessions = sessRes.data ?? [];
  const dishes = lineReads.flatMap((r) => r.data ?? []);
  // The dishes' menu rows: their station (the tickets' rule) and their Burmese, in one ADVISORY read;
  // the options' Burmese through the one loader. Kitchen lines are always menu dishes (grocery never
  // fires), but the soft ref is uuid-filtered first, as every menu read here does.
  const menuIds = [...new Set(dishes.map((l) => l.menu_item_id).filter(isUuid))];
  // The menu read is chunked like the dishes read (#347 r2): one IN-list per `STOP_ID_CHUNK` dishes.
  const [menuReads, options] = await Promise.all([
    Promise.all(
      chunkIds(menuIds).map((chunk) =>
        db.from("menu_items").select("id,name_my,menu_categories(slug)").in("id", chunk),
      ),
    ),
    loadLineNames(db, dishes, { tag: "kitchen/stops", menu: "skip" }),
  ]);
  const menuError = menuReads.find((r) => r.error)?.error;
  if (menuError)
    console.error("[kitchen] stop read (menu) failed — names English, stations unknown", {
      message: menuError.message,
    });
  const stations = menuError ? null : new Map<string, KitchenStation>();
  const nameMyByRef = new Map<string, string | null>();
  for (const m of menuError ? [] : menuReads.flatMap((r) => r.data ?? [])) {
    stations?.set(m.id, stationForCategory(m.menu_categories?.slug));
    nameMyByRef.set(m.id, m.name_my);
  }
  return shapeKitchenStops(
    clears,
    dishes,
    sessions,
    { nameMyByRef, optionNameMy: options.optionNameMy },
    stations,
  );
}

/**
 * Bound the stop read's cost to the live queue (the served rail's posture, `settleServedRail`): the
 * pass is answered when IT is ready, and the stops ride along only if they finished inside the
 * budget — otherwise `null` (the board keeps its cards). A read that rejects is a `null` too, never a
 * rejected queue.
 */
export async function settleKitchenStops(
  read: Promise<KitchenStop[] | null>,
  budgetMs: number = STOP_READ_BUDGET_MS,
): Promise<KitchenStop[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error("[kitchen] stop read exceeded its budget — answering the queue without it", {
        budgetMs,
      });
      resolve(null);
    }, budgetMs);
  });
  try {
    return await Promise.race([
      read.catch((e: unknown) => {
        console.error("[kitchen] stop read rejected — the board keeps its stop cards", {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }),
      budget,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
