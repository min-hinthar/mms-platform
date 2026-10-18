"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { setGroceryAvailableInput } from "@mms/db/schemas";
import { staffGate } from "./staff";
import { MARKET_OUTAGE } from "./staff-outage";

/**
 * M190 (lifecycle residuals) — the market's out-of-stock toggle: the first writer
 * `grocery_items.available` has ever had.
 *
 * The column has existed since the platform init and three shopper paths honour it — `scanAdd`
 * answers `unavailable` ("That item isn’t available today."), and both the aisle grid
 * (`getGroceryCatalog`) and the name search (`mms_grocery_search`) leave an unavailable item out —
 * but nothing could set it, exactly the pre-W23a state of `menu_items.is_sold_out`. So a jar the
 * shelf ran out of stayed scannable and on the grid, and the shopper learned at the counter.
 *
 * MIRRORS `setItemSoldOut` (lib/menu-availability.ts), deliberately: the same gate and role floor
 * (`staffGate("server", …)` — the person who finds the empty shelf is on the floor, not at a manager
 * tablet, and the flip is operational and reversible), the same read → compare against the state the
 * SCREEN showed → compare-and-swap on the state just read, the same `.select(…)` row count (a blocked
 * `.update()` reports success otherwise — the W17 lesson), and the same zero-row re-read to say
 * "gone" from "someone else". What it does NOT have is a ledger: `menu_availability_audit` is keyed
 * on a menu item, and a grocery twin is a migration (filed with M190's close, no migration here).
 *
 * `grocery_items` carries a public-read policy and no write policy, so the service client — after the
 * gate — is the only way to write it, and keeping the write on this one path keeps it gated.
 */

export type GroceryAvailErrCode = "sentence" | "invalid" | "gone" | "stale";
export type SetGroceryAvailableResult =
  | { ok: true; available: boolean }
  | { ok: false; error: string; code: GroceryAvailErrCode };

// The outage sentence is the dictionary's (`browse.market.err.outage`), so `<OutageText>` can twin it
// in Burmese at the render site — a literal here stays English on a Burmese tablet (Codex r2 on #363).

export async function setGroceryAvailable(raw: unknown): Promise<SetGroceryAvailableResult> {
  const parsed = setGroceryAvailableInput.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "Couldn’t read that request — nothing changed.", code: "invalid" };
  const { barcode, available, expectedAvailable } = parsed.data;

  // A Server Action is a public POST endpoint: the screen's gating is affordance, this is the
  // authority — the same floor as the menu's 86.
  const gate = await staffGate("server", MARKET_OUTAGE);
  if (!gate.ok) return { ok: false, error: gate.error, code: "sentence" };

  const db = serviceClient();
  const { data: before, error: readErr } = await db
    .from("grocery_items")
    .select("barcode,name,available")
    .eq("barcode", barcode)
    .maybeSingle();
  // A transport failure resolves into `{ data: null, error }` — never read as "no such item".
  if (readErr) {
    console.error("[market-availability] read failed", readErr.message);
    return { ok: false, error: MARKET_OUTAGE, code: "sentence" };
  }
  if (!before) return { ok: false, error: "That item is no longer in the market.", code: "gone" };

  // The tap is only valid against the state the staff member SAW.
  if (before.available !== expectedAvailable)
    return {
      ok: false,
      error: `Someone else already marked ${before.name} ${before.available ? "in stock" : "out of stock"} — nothing changed.`,
      code: "stale",
    };
  // Already in the requested state: a no-op, never a second write.
  if (before.available === available) return { ok: true, available };

  // COMPARE-AND-SWAP on the state just read — the server's own read-to-write window. Losing the race
  // is zero rows, and `.select("barcode")` is what makes zero rows visible.
  const { data: written, error: writeErr } = await db
    .from("grocery_items")
    .update({ available })
    .eq("barcode", barcode)
    .eq("available", before.available)
    .select("barcode")
    .maybeSingle();
  if (writeErr) {
    console.error("[market-availability] write failed", writeErr.message);
    return { ok: false, error: MARKET_OUTAGE, code: "sentence" };
  }
  if (!written) {
    const { data: now, error: nowErr } = await db
      .from("grocery_items")
      .select("available")
      .eq("barcode", barcode)
      .maybeSingle();
    if (nowErr) {
      console.error("[market-availability] re-read failed", nowErr.message);
      return { ok: false, error: MARKET_OUTAGE, code: "sentence" };
    }
    if (now == null)
      return { ok: false, error: "That item is no longer in the market.", code: "gone" };
    return {
      ok: false,
      error: `Someone else already marked ${before.name} ${now.available ? "in stock" : "out of stock"} — nothing changed.`,
      code: "stale",
    };
  }

  revalidatePath("/staff/menu");
  revalidatePath("/grocery");
  return { ok: true, available };
}
