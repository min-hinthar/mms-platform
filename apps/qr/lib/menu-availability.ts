"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { setItemSoldOutInput } from "@mms/db/schemas";
import { staffGate } from "./staff";

/**
 * W23a — the 86 button (owner: "shouldn't the checkout be allowed only after kitchen accepts the
 * order per items or rejects if out of stock … so that refunds are minimal or avoided?").
 *
 * The answer to that question turned out to be a missing write, not a missing gate.
 * `menu_items.is_sold_out` has existed since the platform init migration and is READ by ~15 surfaces —
 * the diner menu greys the card, the kiosk skips it, `reorder` reports `sold_out`, the floor console
 * flags it, `addItem` advisory-disables the "+". Nothing has ever written it. `menu_items` carries a
 * public-read policy and NO write policy, and no code path updated the column. So the kitchen could
 * not tell the app it had run out, and every downstream surface was faithfully respecting a flag
 * nobody could set.
 *
 * This is the prevention half of the owner's goal, and it is the cheaper half: an item that cannot be
 * ordered produces no refund to process, no manager walk, no PIN, no guest conversation. It costs the
 * line ONE tap per sold-out item per service — made at the moment the cook already knows the pan is
 * empty — rather than a blocking tap on every ticket forever.
 *
 * Role floor is SERVER, deliberately lower than `setMenuPrice`'s manager. The person who discovers a
 * dish is out is at the wok or the counter, not at a manager tablet, and an 86 is operational and
 * reversible where a price change is a money decision. The ledger is what keeps it accountable.
 *
 * ⚠️ NO auto-clear. The owner chose a manual lifetime with a visible "sold out since 6:40pm" stamp:
 * a flag that expires on a timer can quietly put a genuinely-empty dish back on sale mid-service,
 * which is the more expensive mistake. `sold_out_at` is the only thing standing in for an expiry, so
 * every surface that shows the flag should show the stamp too.
 */

export type SetItemSoldOutResult = { ok: true; soldOut: boolean } | { ok: false; error: string };

const AVAILABILITY_OUTAGE =
  "Can’t reach the menu right now — nothing changed. Try again in a moment.";

export async function setItemSoldOut(raw: unknown): Promise<SetItemSoldOutResult> {
  const parsed = setItemSoldOutInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Couldn’t read that request — nothing changed." };
  const { menuItemId, soldOut, expectedSoldOut } = parsed.data;

  // Server Actions are public POST endpoints — the console's UI gating is cosmetic and this is the
  // authority. staffGate distinguishes outage from sign-in from role, so a cook mid-outage is told
  // the truth instead of being sent to a login screen mid-service.
  const gate = await staffGate("server", AVAILABILITY_OUTAGE);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Service client AFTER the gate — authz proven before elevation. `menu_items` has no staff write
  // policy (public-read only), so the elevated client is the only way to write it; keeping the write
  // on this one path is what makes the ledger below unskippable. Deliberately NOT widening the RLS:
  // a policy permitting staff writes also permits direct PostgREST writes that bypass the role gate
  // and the ledger, which is the delivery repo's documented lesson.
  const db = serviceClient();

  const { data: before, error: readErr } = await db
    .from("menu_items")
    .select("id,name_en,is_sold_out")
    .eq("id", menuItemId)
    .maybeSingle();
  // postgrest-js RESOLVES a transport failure into { data: null, error } — a `{ data }`-only
  // destructure would answer "no such dish" for a network blip. Split the two.
  if (readErr) {
    console.error("[menu-availability] read failed", readErr.message);
    return { ok: false, error: AVAILABILITY_OUTAGE };
  }
  if (!before) return { ok: false, error: "That dish is no longer on the menu." };

  // The tap is only valid against the state the staff member SAW. On a busy console the
  // render-to-confirm window is minutes, and two people can be looking at the same dish.
  if (before.is_sold_out !== expectedSoldOut)
    return {
      ok: false,
      error: `Someone else already marked ${before.name_en} ${before.is_sold_out ? "sold out" : "available"} — nothing changed.`,
    };
  // Already in the requested state: a no-op, and deliberately no ledger row. Two cooks tapping "86"
  // on the same empty pan should not read as two decisions.
  if (before.is_sold_out === soldOut) return { ok: true, soldOut };

  // COMPARE-AND-SWAP on the state we just read, not just the id — the server's own read-to-write
  // window. Losing the race means zero rows, which becomes an honest "someone else just changed it".
  const { data: written, error: writeErr } = await db
    .from("menu_items")
    .update({
      is_sold_out: soldOut,
      // Stamped together with the flag so the two can never disagree. Cleared on the way back to
      // available, so a stale timestamp can never outlive the flag it describes.
      sold_out_at: soldOut ? new Date().toISOString() : null,
    })
    .eq("id", menuItemId)
    .eq("is_sold_out", before.is_sold_out)
    .select("id")
    .maybeSingle();
  if (writeErr) {
    console.error("[menu-availability] write failed", writeErr.message);
    return { ok: false, error: AVAILABILITY_OUTAGE };
  }
  // `.update()` returns no row count — the `.select("id")` is what makes a zero-row update visible
  // instead of a silent success over a write that matched nothing. Zero rows means the dish is gone
  // or we lost the race; re-read to say which, and treat an unreadable answer as the race (the
  // conservative direction — it tells the person to look again rather than claiming a dish vanished).
  if (!written) {
    const { data: now, error: nowErr } = await db
      .from("menu_items")
      .select("is_sold_out")
      .eq("id", menuItemId)
      .maybeSingle();
    if (nowErr) {
      console.error("[menu-availability] re-read failed", nowErr.message);
      return { ok: false, error: AVAILABILITY_OUTAGE };
    }
    if (now == null) return { ok: false, error: "That dish is no longer on the menu." };
    return {
      ok: false,
      error: `Someone else already marked ${before.name_en} ${now.is_sold_out ? "sold out" : "available"} — nothing changed.`,
    };
  }

  // The ledger is appended AFTER the flag and its failure is surfaced, not swallowed: an 86 with no
  // record of who took the dish off is exactly what this table exists to prevent. The flag itself did
  // land and the copy says so — it is not rolled back, because an unrecorded correct flag beats
  // putting a dish the kitchen cannot make back on sale.
  const { error: auditErr } = await db.from("menu_availability_audit").insert({
    menu_item_id: menuItemId,
    changed_by: gate.caller.staffId,
    sold_out: soldOut,
  });

  revalidatePath("/staff/menu");
  revalidatePath("/staff/kitchen");
  revalidatePath("/menu");

  if (auditErr) {
    console.error("[menu-availability] audit insert failed", auditErr.message);
    return {
      ok: false,
      error: `${before.name_en} is ${soldOut ? "off the menu" : "back on"}, but the change wasn’t logged — tell the owner it was you.`,
    };
  }
  return { ok: true, soldOut };
}
