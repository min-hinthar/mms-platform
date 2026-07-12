"use server";
import { cookies } from "next/headers";
import { serverClient } from "@mms/db/server";
import { toggleFavoriteInput } from "@mms/db/schemas";
import { assertMutationRate } from "./rate";

/**
 * J5 — uid-scoped menu favorites (docs/JOURNEY_PLAN.md · recognition). Every read/write rides the
 * caller's OWN session through RLS (`qr_favorites`: own rows only) — no authorization decision lives
 * in this module: the DB is the gate (the only service-role touch is the shared rate counter).
 * Bounds: the PK dedupes and the menu_items FK caps rows at catalog size; the input is a real uuid.
 */

/** The caller's hearted menu-item ids, newest first. Never throws — favorites must never take the
 *  menu down (a failed read just renders no rail/hearts, self-healing on the next visit). */
export async function getFavoriteIds(): Promise<string[]> {
  try {
    const supa = serverClient(await cookies());
    const { data } = await supa
      .from("qr_favorites")
      .select("menu_item_id")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((r) => r.menu_item_id);
  } catch {
    // Deliberate swallow (read-only, decorative surface): no session / transient failure → no hearts.
    return [];
  }
}

/**
 * Toggle the caller's heart on a menu item. Returns the new state, or null on failure so the caller
 * can revert its optimistic flip. Delete-then-insert keeps it one round-trip per outcome; a race with
 * yourself on another tab just lands on one of the two valid states.
 */
export async function toggleFavorite(menuItemId: string): Promise<{ on: boolean } | null> {
  const parsed = toggleFavoriteInput.safeParse({ menuItemId });
  if (!parsed.success) return null;
  try {
    const supa = serverClient(await cookies());
    // Same per-device flood guard as every diner mutation (P3.4) — a hammered heart is only DB load
    // (RLS-scoped, PK-bounded rows), but there's no reason to let it be free. Throws → null → revert.
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return null;
    await assertMutationRate(user.id);
    const { data: removed, error: delErr } = await supa
      .from("qr_favorites")
      .delete()
      .eq("menu_item_id", parsed.data.menuItemId)
      .select("menu_item_id");
    if (delErr) return null;
    if ((removed ?? []).length > 0) return { on: false };
    // Not hearted yet → heart it. The FK rejects a non-item id; the RLS check pins user_id to the
    // caller (the column default is auth.uid(), so no id is ever sent from here).
    const { error: insErr } = await supa
      .from("qr_favorites")
      .insert({ menu_item_id: parsed.data.menuItemId });
    if (insErr) return null;
    return { on: true };
  } catch {
    return null; // caller reverts the optimistic heart
  }
}
