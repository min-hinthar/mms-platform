"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import {
  menuCategoryMoveInput,
  menuCategorySaveInput,
  menuDishCreateInput,
  menuDishEditInput,
} from "@mms/db/schemas";
import { staffGate, STAFF_SIGNIN_REQUIRED } from "./staff";
import { isUuid as uuidShape } from "./ticket-names";
import {
  cleanText,
  dishChanges,
  dishUpdate,
  moveCategory,
  nextSortOrder,
  photoPath,
  photoVerdict,
  slugify,
  uniqueSlug,
  type DishFields,
  type FieldChange,
  type MenuTaxCategory,
} from "./menu-studio-rules";

/**
 * The menu studio's writes (owner, 2026-10-24: "elevate full features (iOS photo upload, add new menu
 * items categories etc, updates to names prices categories etc,) to menu-editor").
 *
 * MANAGER-AND-UP, every one, re-checked here because a Server Action is a public POST — the screen
 * only offers these controls to a manager. `menu_items` / `menu_categories` are public-READ with no
 * staff write policy, so the service role (after the gate) is the one writer, and these functions are
 * the one path — which is what makes the ledger below unskippable in the app.
 *
 * THE PRICE IS NOT HERE. It keeps its own audited, compare-and-swapped action (`setMenuPrice`, W17b),
 * which the studio's sheets call for a price; a dish ADDED here is the one moment a price is set
 * without it (there is no "before" to swap against), and it is recorded in `menu_edit_audit`.
 *
 * Concurrency: a dish edit is compare-and-swapped on the row's `updated_at` AS THE SHEET READ IT (two
 * managers' saves cannot silently overwrite each other — the second is told it changed), and writes
 * ONLY the columns that changed (`dishUpdate`), so a concurrent 86 or price change is never reverted.
 * `.update()` returns no row count, so every guarded write chains `.select()` and checks the row.
 *
 * The ledger (`menu_edit_audit`, 20261024120100) is ADVISORY until that migration applies: a failed
 * ledger write is logged and answered (`audited: false`, which the sheet says), never a rollback of
 * an edit the manager can see landed.
 */

export type MenuStudioRefusal =
  | "signin"
  | "gate"
  | "invalid"
  | "outage"
  | "gone"
  | "stale"
  | "category"
  | "storage"
  | "type"
  | "size"
  | "empty"
  | "error";

export type MenuStudioResult<T = object> =
  | ({ ok: true; audited: boolean } & T)
  | { ok: false; reason: MenuStudioRefusal; message?: string };

type Db = ReturnType<typeof serviceClient>;

const STUDIO_OUTAGE =
  "Can’t reach the menu right now — nothing was changed. Try again in a moment.";

async function managerGate(): Promise<
  { ok: true; staffId: string } | { ok: false; reason: MenuStudioRefusal; message?: string }
> {
  const gate = await staffGate("manager", STUDIO_OUTAGE);
  if (gate.ok) return { ok: true, staffId: gate.caller.staffId };
  return gate.error === STAFF_SIGNIN_REQUIRED
    ? { ok: false, reason: "signin" }
    : { ok: false, reason: "gate", message: gate.error };
}

/** The ledger write — ADVISORY (see the header): false, logged, when it did not land. */
async function audit(
  db: Db,
  staffId: string,
  target: { menuItemId?: string; categoryId?: string },
  changes: readonly FieldChange[],
): Promise<boolean> {
  if (changes.length === 0) return true;
  const { error } = await db.from("menu_edit_audit").insert(
    changes.map((c) => ({
      menu_item_id: target.menuItemId ?? null,
      category_id: target.categoryId ?? null,
      changed_by: staffId,
      field: c.field,
      old_value: c.oldValue === null ? null : c.oldValue.slice(0, 2000),
      new_value: c.newValue === null ? null : c.newValue.slice(0, 2000),
    })),
  );
  if (error) {
    console.error("[menu-studio] edit ledger write failed — the edit stands, unrecorded", {
      target,
      message: error.message,
    });
    return false;
  }
  return true;
}

function revalidateMenus() {
  revalidatePath("/staff/menu");
  revalidatePath("/menu");
  revalidatePath("/kiosk");
}

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

// ── dishes ──────────────────────────────────────────────────────────────────────────────────────

export async function editDish(
  raw: unknown,
): Promise<MenuStudioResult<{ updatedAt: string; changed: number }>> {
  const parsed = menuDishEditInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const gate = await managerGate();
  if (!gate.ok) return gate;
  const input = parsed.data;
  const db = serviceClient();

  const { data: row, error: readErr } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,description_en,description_my,category_id,tax_category,is_active,updated_at",
    )
    .eq("id", input.itemId)
    .maybeSingle();
  if (readErr) return { ok: false, reason: "outage" };
  if (!row) return { ok: false, reason: "gone" };
  // The sheet saw an older dish than the one here now: another edit landed first.
  if (!sameInstant(row.updated_at, input.expectedUpdatedAt)) return { ok: false, reason: "stale" };

  const before: DishFields = {
    nameEn: row.name_en,
    nameMy: row.name_my,
    descriptionEn: row.description_en,
    descriptionMy: row.description_my,
    categoryId: row.category_id,
    taxCategory: row.tax_category as MenuTaxCategory,
    isActive: row.is_active,
  };
  const after: DishFields = {
    nameEn: cleanText(input.nameEn) ?? before.nameEn,
    nameMy: cleanText(input.nameMy),
    descriptionEn: cleanText(input.descriptionEn),
    descriptionMy: cleanText(input.descriptionMy),
    categoryId: input.categoryId,
    taxCategory: input.taxCategory,
    isActive: input.isActive,
  };
  const changes = dishChanges(before, after);
  if (changes.length === 0)
    return { ok: true, audited: true, updatedAt: row.updated_at, changed: 0 };

  const stamp = new Date().toISOString();
  const { data: written, error: writeErr } = await db
    .from("menu_items")
    .update({ ...dishUpdate(after, changes), updated_at: stamp })
    .eq("id", input.itemId)
    .eq("updated_at", row.updated_at)
    .select("id,updated_at")
    .maybeSingle();
  if (writeErr) {
    // 23503 — the category named does not exist (an FK refusal, not an outage).
    if (writeErr.code === "23503") return { ok: false, reason: "category" };
    console.error("[menu-studio] dish edit failed", {
      itemId: input.itemId,
      message: writeErr.message,
    });
    return { ok: false, reason: "error" };
  }
  // No row: the stamp moved between the read and the write — another edit got there first.
  if (!written) return { ok: false, reason: "stale" };

  const audited = await audit(db, gate.staffId, { menuItemId: input.itemId }, changes);
  revalidateMenus();
  return { ok: true, audited, updatedAt: written.updated_at, changed: changes.length };
}

export async function createDish(raw: unknown): Promise<MenuStudioResult<{ itemId: string }>> {
  const parsed = menuDishCreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const gate = await managerGate();
  if (!gate.ok) return gate;
  const input = parsed.data;
  const db = serviceClient();
  const nameEn = cleanText(input.nameEn) ?? input.nameEn;
  const base = slugify(nameEn);

  // Two tries: a slug taken between the read and the insert (another manager adding the same name)
  // answers 23505, and the second read sees it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: taken, error: slugErr } = await db
      .from("menu_items")
      .select("slug")
      .like("slug", `${base}%`)
      .limit(500);
    if (slugErr) return { ok: false, reason: "outage" };
    const slug = uniqueSlug(base, new Set((taken ?? []).map((t) => t.slug)));
    const { data: inserted, error: insErr } = await db
      .from("menu_items")
      .insert({
        category_id: input.categoryId,
        slug,
        name_en: nameEn,
        name_my: cleanText(input.nameMy),
        description_en: cleanText(input.descriptionEn),
        description_my: cleanText(input.descriptionMy),
        base_price_cents: input.priceCents,
        tax_category: input.taxCategory,
        is_active: true,
      })
      .select("id")
      .maybeSingle();
    if (insErr?.code === "23505") continue;
    if (insErr?.code === "23503") return { ok: false, reason: "category" };
    if (insErr || !inserted) {
      console.error("[menu-studio] dish add failed", { message: insErr?.message });
      return { ok: false, reason: "error" };
    }
    const audited = await audit(db, gate.staffId, { menuItemId: inserted.id }, [
      { field: "created", oldValue: null, newValue: nameEn },
      { field: "base_price_cents", oldValue: null, newValue: String(input.priceCents) },
    ]);
    revalidateMenus();
    return { ok: true, audited, itemId: inserted.id };
  }
  return { ok: false, reason: "error" };
}

/**
 * A dish's photo, from the sheet's FormData (`itemId`, `photo`): the sheet resizes it on the phone
 * first (iOS hands over a HEIC-free JPEG through the canvas), and this re-checks type and size
 * (`photoVerdict` — the bucket's own limits), uploads to `menu-photos/<item>/<now>.<ext>` and points
 * the dish at the new public URL. A fresh name per upload, so a cached old photo is never served
 * under the new URL. Before 20261024120100 applies there is no bucket: answered `storage`.
 */
export async function setDishPhoto(
  form: FormData,
): Promise<MenuStudioResult<{ imageUrl: string; updatedAt: string }>> {
  const itemId = form.get("itemId");
  const photo = form.get("photo");
  if (typeof itemId !== "string" || !uuidShape(itemId)) return { ok: false, reason: "invalid" };
  if (!(photo instanceof Blob)) return { ok: false, reason: "empty" };
  const verdict = photoVerdict({ type: photo.type, size: photo.size });
  if (verdict !== "ok") return { ok: false, reason: verdict };
  const gate = await managerGate();
  if (!gate.ok) return gate;
  const db = serviceClient();

  const { data: row, error: readErr } = await db
    .from("menu_items")
    .select("id,image_url")
    .eq("id", itemId)
    .maybeSingle();
  if (readErr) return { ok: false, reason: "outage" };
  if (!row) return { ok: false, reason: "gone" };

  const path = photoPath(itemId, photo.type, Date.now());
  const bucket = db.storage.from("menu-photos");
  const { error: upErr } = await bucket.upload(path, photo, {
    contentType: photo.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upErr) {
    const missing = /bucket not found|not found/i.test(upErr.message);
    console.error("[menu-studio] photo upload failed", { itemId, message: upErr.message });
    return { ok: false, reason: missing ? "storage" : "error" };
  }
  const imageUrl = bucket.getPublicUrl(path).data.publicUrl;
  const stamp = new Date().toISOString();
  const { data: written, error: writeErr } = await db
    .from("menu_items")
    .update({ image_url: imageUrl, image_updated_at: stamp, updated_at: stamp })
    .eq("id", itemId)
    .select("id,updated_at")
    .maybeSingle();
  if (writeErr || !written) {
    console.error("[menu-studio] photo pointer write failed", {
      itemId,
      message: writeErr?.message,
    });
    return { ok: false, reason: writeErr ? "error" : "gone" };
  }
  const audited = await audit(db, gate.staffId, { menuItemId: itemId }, [
    { field: "image_url", oldValue: row.image_url, newValue: imageUrl },
  ]);
  revalidateMenus();
  return { ok: true, audited, imageUrl, updatedAt: written.updated_at };
}

/** Take a dish's photo off (the menu draws its designed placeholder). The stored object is kept —
 *  the ledger names it, and a mistaken removal is undone by pointing back at it. */
export async function clearDishPhoto(
  raw: unknown,
): Promise<MenuStudioResult<{ updatedAt: string }>> {
  const itemId = (raw as { itemId?: unknown } | null)?.itemId;
  if (typeof itemId !== "string" || !uuidShape(itemId)) return { ok: false, reason: "invalid" };
  const gate = await managerGate();
  if (!gate.ok) return gate;
  const db = serviceClient();
  const { data: row, error: readErr } = await db
    .from("menu_items")
    .select("id,image_url")
    .eq("id", itemId)
    .maybeSingle();
  if (readErr) return { ok: false, reason: "outage" };
  if (!row) return { ok: false, reason: "gone" };
  const stamp = new Date().toISOString();
  const { data: written, error } = await db
    .from("menu_items")
    .update({ image_url: null, image_updated_at: stamp, updated_at: stamp })
    .eq("id", itemId)
    .select("id,updated_at")
    .maybeSingle();
  if (error || !written) return { ok: false, reason: error ? "error" : "gone" };
  const audited = await audit(db, gate.staffId, { menuItemId: itemId }, [
    { field: "image_url", oldValue: row.image_url, newValue: null },
  ]);
  revalidateMenus();
  return { ok: true, audited, updatedAt: written.updated_at };
}

// ── categories ──────────────────────────────────────────────────────────────────────────────────

export async function saveCategory(
  raw: unknown,
): Promise<MenuStudioResult<{ categoryId: string }>> {
  const parsed = menuCategorySaveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const gate = await managerGate();
  if (!gate.ok) return gate;
  const { categoryId, isActive } = parsed.data;
  const name = cleanText(parsed.data.name) ?? parsed.data.name;
  const db = serviceClient();

  if (!categoryId) {
    const { data: all, error: readErr } = await db
      .from("menu_categories")
      .select("id,slug,sort_order")
      .limit(500);
    if (readErr) return { ok: false, reason: "outage" };
    const rows = all ?? [];
    const slug = uniqueSlug(slugify(name, "category"), new Set(rows.map((r) => r.slug)));
    const { data: inserted, error } = await db
      .from("menu_categories")
      .insert({
        slug,
        name,
        sort_order: nextSortOrder(rows.map((r) => ({ id: r.id, sortOrder: r.sort_order }))),
        is_active: isActive,
      })
      .select("id")
      .maybeSingle();
    if (error || !inserted) {
      console.error("[menu-studio] category add failed", { message: error?.message });
      return { ok: false, reason: "error" };
    }
    const audited = await audit(db, gate.staffId, { categoryId: inserted.id }, [
      { field: "created", oldValue: null, newValue: name },
    ]);
    revalidateMenus();
    return { ok: true, audited, categoryId: inserted.id };
  }

  const { data: row, error: readErr } = await db
    .from("menu_categories")
    .select("id,name,is_active")
    .eq("id", categoryId)
    .maybeSingle();
  if (readErr) return { ok: false, reason: "outage" };
  if (!row) return { ok: false, reason: "gone" };
  // The sheet's values, not this read, are what the manager decided against: another manager's hide
  // or rename since then is refused here, never silently undone by a write carrying the old field.
  const expected = parsed.data.expected;
  if (!expected || row.name !== expected.name || row.is_active !== expected.isActive)
    return { ok: false, reason: "stale" };
  const changes: FieldChange[] = [];
  if (row.name !== name) changes.push({ field: "name", oldValue: row.name, newValue: name });
  if (row.is_active !== isActive)
    changes.push({
      field: "is_active",
      oldValue: String(row.is_active),
      newValue: String(isActive),
    });
  if (changes.length === 0) return { ok: true, audited: true, categoryId };
  // Compare-and-swap on what was read: a rename that crossed another is refused, never merged.
  const { data: written, error } = await db
    .from("menu_categories")
    .update({ name, is_active: isActive })
    .eq("id", categoryId)
    .eq("name", row.name)
    .eq("is_active", row.is_active)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: "error" };
  if (!written) return { ok: false, reason: "stale" };
  const audited = await audit(db, gate.staffId, { categoryId }, changes);
  revalidateMenus();
  return { ok: true, audited, categoryId };
}

export async function moveCategoryAction(raw: unknown): Promise<MenuStudioResult> {
  const parsed = menuCategoryMoveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const gate = await managerGate();
  if (!gate.ok) return gate;
  const db = serviceClient();
  const { data: all, error: readErr } = await db
    .from("menu_categories")
    .select("id,sort_order")
    .limit(500);
  if (readErr) return { ok: false, reason: "outage" };
  const rows = (all ?? []).map((r) => ({ id: r.id, sortOrder: r.sort_order }));
  const pair = moveCategory(rows, parsed.data.categoryId, parsed.data.direction);
  // At an edge (or an id no longer listed) there is nothing to write — not an error.
  if (!pair) return { ok: true, audited: true };
  const before = new Map(rows.map((r) => [r.id, r.sortOrder]));
  // Each row swapped only if it still holds the order read (a crossing move is refused).
  const swap = (id: string, from: number, to: number) =>
    db
      .from("menu_categories")
      .update({ sort_order: to })
      .eq("id", id)
      .eq("sort_order", from)
      .select("id")
      .maybeSingle();
  const [first, second] = pair;
  const one = await swap(first.id, before.get(first.id) ?? -1, first.sortOrder);
  if (one.error) return { ok: false, reason: "error" };
  if (!one.data) return { ok: false, reason: "stale" };
  const two = await swap(second.id, before.get(second.id) ?? -1, second.sortOrder);
  if (two.error || !two.data) {
    // Two writes, no transaction: a crossing move refused the second, so put the first back (guarded
    // on the order it just wrote) rather than leave two categories sharing one place in the menu.
    // A failed undo is logged — the next move re-reads the orders, and `moveCategory` separates a tie.
    const undo = await swap(first.id, first.sortOrder, before.get(first.id) ?? -1);
    if (undo.error || !undo.data) console.error("[menu-studio] move undo failed", first.id);
    return { ok: false, reason: two.error ? "error" : "stale" };
  }
  let audited = true;
  for (const p of pair)
    audited =
      (await audit(db, gate.staffId, { categoryId: p.id }, [
        { field: "sort_order", oldValue: String(before.get(p.id)), newValue: String(p.sortOrder) },
      ])) && audited;
  revalidateMenus();
  return { ok: true, audited };
}
