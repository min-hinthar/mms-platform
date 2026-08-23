"use server";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { reorderInput } from "@mms/db/schemas";
import { carryNote } from "./reorder-notes";
import { assertCartMember } from "./authz";
import { assertMutationRate } from "./rate";
import { lineTax } from "./tax";
import { insertOrIncLine, priceItem, touchCart } from "./order-lines";
import { optionsCameBackDifferent, storedOptionIds } from "./reorder-options";
import { getPostHogClient } from "./posthog-server";

/**
 * J5 — reorder "your usual" (docs/JOURNEY_PLAN.md · recognition; the deferred M4 item, done right).
 * Brings a PAST paid order back as fresh DRAFT lines in the caller's CURRENT cart.
 *
 * Money rules (the whole point of doing it server-side):
 *  - Every amount is re-derived at TODAY's prices via the same `priceItem` the add path uses — the
 *    historical `unit_price_cents` is never copied, so a menu price change is honored automatically.
 *  - Every insert goes through `insertOrIncLine` (the status-atomic core addItem uses) — no new write
 *    primitive, so the cart-open guard, draft-merge semantics, and by_seat provenance are inherited.
 *  - AuthZ: the caller must be a member of the target cart (assertCartMember: active session, not
 *    locked/settling) AND the order's stamped earner (`earned_by = uid`) — you reorder YOUR orders.
 *
 * Honesty rules (what history can't give us, we say out loud instead of guessing):
 *  - M3: lines fulfilled after 20260815100000 store the option IDS beside the labels, so a modified
 *    line comes back WITH its surviving options (re-priced by id at today's deltas). `optionsReset`
 *    reports lines that came back DIFFERENT: a legacy labels-only line (base dish — never a silent
 *    guess at what "extra chili oil" was) or an id line missing a vanished/deactivated option.
 *  - Items that vanished, went sold-out, or REQUIRE choices (priceItem's cardinality check throws for
 *    those on an empty selection) are skipped with a per-item reason.
 *  - Grocery lines are skipped — a shelf item scanned in person isn't reorderable from a menu.
 *  - Every dish lands at qty 1 (`quantitiesReset` says so when the original had more) — the atomic
 *    insert core is qty-1 by design, and one stepper tap beats a new money path.
 */

const LINE_CAP = 30; // bound the work regardless of history size

export type ReorderSkipReason = "gone" | "sold_out" | "needs_choices" | "grocery";
export type ReorderResult =
  | {
      ok: true;
      added: number;
      /** Dishes that came back DIFFERENT than the original's options (M3): a legacy labels-only
       *  line returns as the base dish; an id-carrying line may return missing a vanished option.
       *  A line whose every stored id survived is faithful and is NOT listed here. */
      optionsReset: string[];
      /** True when any original line had qty > 1 (everything lands at 1 — bump with the stepper). */
      quantitiesReset: boolean;
      /** True when the order had more lines than the cap — the outcome message discloses it. */
      capped: boolean;
      /** W9c — dishes whose kitchen note could NOT be carried over (a legacy note longer than today's
       *  160-char cap). Named out loud rather than dropped quietly: the item sheet promises "add any
       *  allergy in the note below and the kitchen will see it", so a silently-lost allergy note is
       *  the one failure on this path that can hurt someone. */
      notesDropped: string[];
      skipped: { name: string; reason: ReorderSkipReason }[];
    }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reorderOrder(raw: {
  cartId: string;
  orderId: string;
}): Promise<ReorderResult> {
  const parsed = reorderInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That order isn’t available to reorder." };
  const { cartId, orderId } = parsed.data;

  // AuthZ first (cart membership + freeze state), then the flood guard — one gesture, one rate tick.
  // Accepted TOCTOU note: the lock/settle check is entry-time; a peer's create-intent landing during
  // the (seconds-long) line loop can race lines into the pay window. Bounded + recoverable by design:
  // the webhook re-derives totals and 409s on an amount mismatch (qr_refunds_needed ledger) — never a
  // mispriced capture. Same class as addItem's ~100ms window, just wider; revisit if it ever bites.
  let uid: string, mode: string;
  try {
    const authz = await assertCartMember(cartId);
    if (authz.locked) return { ok: false, error: "Order is locked while someone checks out" };
    if (authz.settling)
      return { ok: false, error: "The table is settling up — you can’t edit while everyone pays" };
    uid = authz.uid;
    mode = authz.mode;
    await assertMutationRate(uid);
  } catch {
    // One generic string for every guard miss (no-such-cart / not-a-member / expired / rate): thrown
    // Server Action messages are redacted in prod for exactly this reason — returning them as data
    // would re-expose guard internals and make an existence probe out of the error text.
    return { ok: false, error: "Couldn’t reorder just now — start from the menu." };
  }

  const db = serviceClient();

  // The order must be the caller's OWN (earned_by = uid) and paid. One generic error for every miss —
  // no oracle distinguishing "exists but not yours" from "unknown id".
  const { data: order } = await db
    .from("qr_orders")
    .select("id,earned_by,status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.earned_by !== uid || order.status !== "paid")
    return { ok: false, error: "That order isn’t available to reorder." };

  const { data: lines } = await db
    .from("qr_order_items")
    // `notes` IS snapshotted onto the order at fulfillment (w3_kitchen.sql) — it was simply never
    // selected here, so every reorder silently dropped the diner's allergy note (W9c).
    .select("menu_item_id,name,qty,modifiers,modifier_option_ids,fulfillment,notes")
    .eq("order_id", orderId)
    .order("id") // deterministic under the cap — never a different 30 on retry
    .limit(LINE_CAP + 1); // +1 = exact truncation detection (an exactly-at-cap order isn't "capped")
  if (!lines || lines.length === 0)
    return { ok: false, error: "That order isn’t available to reorder." };
  const capped = lines.length > LINE_CAP;
  if (capped) lines.length = LINE_CAP;

  // The new lines' dine-in/to-go default follows the CURRENT session's mode (same rule as addItem) —
  // reordering last week's pickup at the table today makes table food, not a phantom bag. M108: the
  // mode rides out of `assertCartMember`, which read it off the row that proved the session active
  // and 503s when that read fails. The second read this replaced discarded its error, so an
  // unreadable session re-added a dine-in table's food as `togo` at the to-go tax.
  const dineIn = mode === "dinein";

  // Today's availability for the food lines, one batch read.
  const foodIds = [
    ...new Set(lines.filter((l) => UUID_RE.test(l.menu_item_id)).map((l) => l.menu_item_id)),
  ];
  const { data: itemRows } = foodIds.length
    ? await db.from("menu_items").select("id,is_active,is_sold_out").in("id", foodIds)
    : { data: [] as { id: string; is_active: boolean; is_sold_out: boolean }[] };
  const itemById = new Map((itemRows ?? []).map((i) => [i.id, i]));

  let added = 0;
  const optionsReset: string[] = [];
  const notesDropped: string[] = [];
  const skipped: { name: string; reason: ReorderSkipReason }[] = [];
  let quantitiesReset = false;

  for (const l of lines) {
    if (l.fulfillment === "grocery" || !UUID_RE.test(l.menu_item_id)) {
      skipped.push({ name: l.name, reason: "grocery" });
      continue;
    }
    const item = itemById.get(l.menu_item_id);
    if (!item || !item.is_active) {
      skipped.push({ name: l.name, reason: "gone" });
      continue;
    }
    if (item.is_sold_out) {
      skipped.push({ name: l.name, reason: "sold_out" });
      continue;
    }
    try {
      // M3 — faithful reorder: lines fulfilled after 20260815100000 carry the STABLE option ids, so
      // the dish comes back WITH its options, re-priced by id at TODAY's deltas through the exact
      // same priceItem the add path uses. Legacy rows ('[]' — labels only) keep today's behavior:
      // an empty selection, so the dish returns as the BASE and `optionsReset` says so (never a
      // guess at what "extra chili oil" was). enforceCardinality stays the honesty backstop either
      // way: a vanished option that empties a REQUIRED group throws → the dish is skipped
      // "needs_choices" rather than silently served without its style.
      const storedIds = storedOptionIds(l.modifier_option_ids);
      const { name, unitPriceCents, category, opts, optionIds } = await priceItem(
        l.menu_item_id,
        storedIds,
        { enforceCardinality: true },
      );
      // Re-clamp against TODAY's rule (Zod `.max(160)` + the qr_cart_items.notes column CHECK). A
      // legacy note from before the cap would otherwise raise inside `mms_cart_item_insert_if_open`
      // and be caught below as an availability failure — turning one long note into a skipped dish.
      //
      // Over-cap notes are DROPPED, never truncated: cutting "no peanuts, no shellfish…" mid-sentence
      // produces a note that reads as complete and is not. The diner is told instead (`notesDropped`).
      const carried = carryNote(l.notes);
      await insertOrIncLine(
        cartId,
        {
          menuItemId: l.menu_item_id,
          name,
          opts,
          optionIds, // M3 — the surviving ids ride the NEW line too (reorder-of-a-reorder stays faithful)
          unitPriceCents,
          taxCents: lineTax(unitPriceCents, category, dineIn),
          fulfillment: dineIn ? "dinein" : "togo",
          // ⚠️ A noted line never merges in either direction (order-lines.ts) — so reordering three
          // identical NOTED lines now inserts three rows where it used to fold them into one. That is
          // the correct trade: the note is per-line kitchen instruction, and folding would attach one
          // diner's allergy note to another diner's plate.
          notes: carried.carry ? carried.note : undefined,
        },
        uid,
      );
      added += 1;
      // Reported only AFTER the insert lands — a dish that threw is already surfaced as `skipped`, and
      // telling the diner to "tap it to add the note again" for a line that isn't in their cart is a
      // instruction to nowhere.
      if (!carried.carry && carried.dropped) notesDropped.push(name);
      // M3 — `optionsReset` now means "came back DIFFERENT than the original's options":
      //  • legacy line (labels, no ids) → base dish, exactly as before;
      //  • id-carrying line where some option vanished/deactivated (priceItem honors fewer ids
      //    than stored) → partial dish — say so rather than let the diner assume their usual.
      // A line whose every stored id survived comes back faithful and is NOT reported.
      const originalHadOptions = Array.isArray(l.modifiers) && l.modifiers.length > 0;
      if (optionsCameBackDifferent(storedIds.length, optionIds.length, originalHadOptions))
        optionsReset.push(name);
      if (l.qty > 1) quantitiesReset = true;
    } catch (e) {
      // insertOrIncLine's status-atomic guard: the cart closed mid-loop (a webhook capture landed).
      // That is NOT an availability fact about the remaining dishes — stop and say what happened.
      if (e instanceof Error && e.message === "Cart is no longer open")
        return { ok: false, error: "Your cart just closed — start a fresh order from the menu." };
      // Otherwise priceItem threw: required choices on an empty selection (or a mid-loop vanish).
      skipped.push({ name: l.name, reason: "needs_choices" });
    }
  }

  if (added > 0) await touchCart(cartId, "reorder");

  // Counts-only analytics (J-F evidence for the funnels) — drained off the response path.
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: uid,
          event: "reorder_used",
          properties: { added, skipped: skipped.length, options_reset: optionsReset.length },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }

  return { ok: true, added, optionsReset, quantitiesReset, capped, skipped, notesDropped };
}
