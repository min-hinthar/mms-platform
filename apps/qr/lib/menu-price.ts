"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { setMenuPriceInput } from "@mms/db/schemas";
import { staffGate, STAFF_WRITE_OUTAGE } from "./staff";

/**
 * W17b — the staff price editor (owner: "staff portal should be able to update prices?").
 *
 * This is the ONE place in the app where a money amount crosses from a human into the system. Every
 * other amount is server-derived: the diner sends an item id and modifier ids, `priceItem` re-derives
 * the charge from THIS stored price, and the Stripe intent comes from `getCartTotals`. That rule is
 * not weakened here — a manager setting the menu price is the decision the rule protects, not an
 * exception to it. What changes is which number `priceItem` will read next time.
 *
 * Consequences worth stating, because they are the honest answer to "did this just re-price a live
 * order?":
 *   - Lines ALREADY in a cart keep the price they were quoted. `unit_price_cents` is stamped on the
 *     line at add time, and nothing here touches `qr_cart_items` — a guest is never re-priced
 *     mid-meal by an edit made while they are sitting down.
 *   - Paid orders are history and are untouched by definition.
 *   - The new price takes effect on the NEXT add, everywhere at once (diner menu, register, kiosk,
 *     reorder), because all four go through `priceItem`.
 */

export type SetMenuPriceResult = { ok: true; priceCents: number } | { ok: false; error: string };

/** Latin digits, integer cents — never a locale-formatted numeral on the money path. */
const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const PRICE_OUTAGE =
  "Can’t reach the menu right now — the price is unchanged. Try again in a moment.";

export async function setMenuPrice(raw: unknown): Promise<SetMenuPriceResult> {
  const parsed = setMenuPriceInput.safeParse(raw);
  // The bound is the message: a manager who typed 190000 should be told the ceiling, not handed a
  // generic refusal that reads like a bug.
  if (!parsed.success) return { ok: false, error: "Enter a price between $0.25 and $5,000.00." };
  const { menuItemId, priceCents } = parsed.data;

  // MANAGER floor. Server Actions are public POST endpoints — the console's UI gating is cosmetic
  // and this is the authority. staffGate distinguishes outage from sign-in from role, so a manager
  // mid-outage is told the truth instead of being sent to a login screen.
  const gate = await staffGate("manager", PRICE_OUTAGE);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Service client AFTER the gate — authz is proven before elevation. `menu_items` has no staff
  // write policy (its RLS is public-read only), so the elevated client is the only way to write it;
  // keeping the write on this one path is what makes the ledger below unskippable.
  const db = serviceClient();

  // Read the OLD price first: it is half the ledger row, and it also tells us the item exists before
  // we claim success on a write that matched nothing.
  const { data: before, error: readErr } = await db
    .from("menu_items")
    .select("id,name_en,base_price_cents")
    .eq("id", menuItemId)
    .maybeSingle();
  // postgrest-js RESOLVES a transport failure into { data: null, error } — a `{ data }`-only
  // destructure would answer "no such dish" for a network blip. Split the two.
  if (readErr) {
    console.error("[menu-price] read failed", readErr.message);
    return { ok: false, error: PRICE_OUTAGE };
  }
  if (!before) return { ok: false, error: "That dish is no longer on the menu." };
  if (before.base_price_cents === priceCents) return { ok: true, priceCents }; // no-op: no ledger row

  // COMPARE-AND-SWAP on the price we just read, not just the id. Two managers on two tablets can be
  // editing the same dish at once; keyed on `id` alone, both writes land and the SECOND one records a
  // ledger row saying it changed the price from a value that was already gone. The live price would
  // still be whoever wrote last — but the ledger is the thing that has to answer "from what?", and a
  // stale `old_price_cents` breaks exactly the question it exists for. Losing the race means zero
  // rows here, which we turn into an honest "someone else just changed it" below.
  const { data: written, error: writeErr } = await db
    .from("menu_items")
    .update({ base_price_cents: priceCents })
    .eq("id", menuItemId)
    .eq("base_price_cents", before.base_price_cents)
    .select("id")
    .maybeSingle();
  if (writeErr) {
    // The column CHECK is the belt behind Zod. If it ever fires, the price is unchanged and saying so
    // is the whole job — never report a success we did not get.
    console.error("[menu-price] write failed", writeErr.message);
    return { ok: false, error: PRICE_OUTAGE };
  }
  // `.update()` returns no row count — the `.select("id")` above is what makes a zero-row update
  // visible instead of a silent 200 over a write that matched nothing. Zero rows now means one of two
  // things, and they deserve different sentences: the dish is gone, or we lost the race. Re-read to
  // find out which, and treat an unreadable answer as the race (the conservative direction: it tells
  // the manager to look again, rather than claiming a dish vanished when it did not).
  if (!written) {
    const { data: now } = await db
      .from("menu_items")
      .select("base_price_cents")
      .eq("id", menuItemId)
      .maybeSingle();
    if (now == null) return { ok: false, error: "That dish is no longer on the menu." };
    return {
      ok: false,
      error: `Someone else just set ${before.name_en} to ${dollars(now.base_price_cents)} — nothing was changed. Check the new price and try again.`,
    };
  }

  // The ledger is written AFTER the price, and its failure is surfaced, not swallowed. A price
  // change with no record of who made it is exactly the thing this table exists to prevent — so the
  // manager is told the record is missing rather than being left to assume it is there. The price
  // itself did land, and the copy says so; it is not rolled back, because an unrecorded correct
  // price is better than a reverted one the kitchen has already been told about.
  const { error: auditErr } = await db.from("menu_price_audit").insert({
    menu_item_id: menuItemId,
    changed_by: gate.caller.staffId,
    old_price_cents: before.base_price_cents,
    new_price_cents: priceCents,
  });

  // The menu is force-dynamic, but the staff page and any cached catalog read should reflect the new
  // number immediately rather than on the next natural revalidate.
  revalidatePath("/staff/menu");
  revalidatePath("/menu");

  if (auditErr) {
    console.error("[menu-price] audit insert failed", auditErr.message);
    return {
      ok: false,
      error: `Price saved, but the change wasn’t recorded in the log — tell the owner it was you who set ${before.name_en}.`,
    };
  }
  return { ok: true, priceCents };
}
