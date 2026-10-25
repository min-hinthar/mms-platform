/**
 * The menu studio's rules (owner, 2026-10-24: "elevate full features … to menu-editor"), decided
 * once and PURE, so the Server Actions (`lib/menu-studio.ts`), the sheets and the tests read one
 * answer. Each rule is falsified by a value in `menu-studio-rules.test.ts` and a `menu-studio/*`
 * mutant.
 */

/** The catalog's tax categories (the `menu_items.tax_category` CHECK), with the label a manager
 *  reads. The ORDER is the picker's: the common case first. */
export const TAX_CATEGORIES = [
  "hot_prepared",
  "cold_food",
  "beverage_hot",
  "beverage_cold",
  "grocery_food",
  "retail_nonfood",
] as const;
export type MenuTaxCategory = (typeof TAX_CATEGORIES)[number];

/** Bounds — the schema's `.max()` and the migration's column CHECKs (20261024120100). */
export const MENU_NAME_MAX = 80;
export const MENU_DESCRIPTION_MAX = 400;
export const CATEGORY_NAME_MAX = 60;
export const SLUG_MAX = 80;

/**
 * A dish's or category's slug from its English name: lowercase ASCII words joined by single dashes
 * (the `menu_items_slug_shape` the diner URLs and the seed use), at most `SLUG_MAX`, and never empty
 * — a name with no Latin letters at all (a Burmese-only name) slugs to `fallback`.
 */
export function slugify(name: string, fallback = "dish"): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return s === "" ? fallback : s;
}

/** The first of `base`, `base-2`, `base-3`, … not already taken — slugs are UNIQUE in the catalog. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A typed text field: whitespace collapsed and trimmed; blank is null (the column's "none"). */
export function cleanText(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return t === "" ? null : t;
}

/** The dish fields the studio edits (the price keeps its own audited action, `setMenuPrice`). */
export type DishFields = {
  nameEn: string;
  nameMy: string | null;
  descriptionEn: string | null;
  descriptionMy: string | null;
  categoryId: string;
  taxCategory: MenuTaxCategory;
  isActive: boolean;
};

const DISH_FIELD_COLUMN: Record<keyof DishFields, string> = {
  nameEn: "name_en",
  nameMy: "name_my",
  descriptionEn: "description_en",
  descriptionMy: "description_my",
  categoryId: "category_id",
  taxCategory: "tax_category",
  isActive: "is_active",
};

export type FieldChange = { field: string; oldValue: string | null; newValue: string | null };

/**
 * What a save CHANGES, field by field, as the ledger records it (`menu_edit_audit`: the column name,
 * old → new as text). Empty means nothing changed — the action writes nothing and says so, so a
 * re-tapped Save never stamps a dish as edited.
 */
export function dishChanges(before: DishFields, after: DishFields): FieldChange[] {
  const out: FieldChange[] = [];
  for (const k of Object.keys(DISH_FIELD_COLUMN) as (keyof DishFields)[]) {
    const a = before[k];
    const b = after[k];
    if (a === b) continue;
    out.push({
      field: DISH_FIELD_COLUMN[k],
      oldValue: a === null ? null : String(a),
      newValue: b === null ? null : String(b),
    });
  }
  return out;
}

/** The update a set of changes writes — only the changed columns, never a full-row overwrite (a
 *  full row would revert a concurrent 86 or price change it never meant to touch). */
export function dishUpdate(
  after: DishFields,
  changes: readonly FieldChange[],
): Record<string, unknown> {
  const byColumn = new Map<string, unknown>(
    (Object.keys(DISH_FIELD_COLUMN) as (keyof DishFields)[]).map((k) => [
      DISH_FIELD_COLUMN[k],
      after[k],
    ]),
  );
  const out: Record<string, unknown> = {};
  for (const c of changes) out[c.field] = byColumn.get(c.field);
  return out;
}

// ── photos ──────────────────────────────────────────────────────────────────────────────────────

/** The types the `menu-photos` bucket accepts (the migration's `allowed_mime_types`). */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** The bucket's per-object limit (5 MiB). The client resizes well under it. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** The longest edge the client resizes a photo to — sharp on a 3× phone at the item sheet's hero. */
export const PHOTO_MAX_EDGE = 1600;

export type PhotoVerdict = "ok" | "empty" | "type" | "size";

export function photoVerdict(file: { type: string; size: number }): PhotoVerdict {
  if (file.size <= 0) return "empty";
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > PHOTO_MAX_BYTES) return "size";
  return "ok";
}

/** Where a dish's photo lives in the bucket: one folder per dish, a fresh name per upload (so the
 *  CDN never serves the old bytes under the new URL). */
export function photoPath(itemId: string, type: string, nowMs: number): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `${itemId}/${nowMs}.${ext}`;
}

/** The size a photo is drawn at before upload: the longest edge at most `PHOTO_MAX_EDGE`, never
 *  enlarged, aspect kept, whole pixels. */
export function fitWithin(
  width: number,
  height: number,
  max = PHOTO_MAX_EDGE,
): { w: number; h: number } {
  const edge = Math.max(width, height);
  if (edge <= max) return { w: width, h: height };
  const k = max / edge;
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

/**
 * Whether a dish's category is on the menu — a HIDDEN category (`menu_categories.is_active` false,
 * the studio's Hide) takes its dishes off every guest and staff ordering surface with it. A dish with
 * no category read (null), or a read that carried no flag, stays shown: hiding is a positive act.
 */
export function categoryShown(c: { is_active?: boolean | null } | null | undefined): boolean {
  return c?.is_active !== false;
}

// ── categories ──────────────────────────────────────────────────────────────────────────────────

export type CategoryOrder = { id: string; sortOrder: number };

/** A new category goes LAST: ten past the highest order (gaps leave room), 10 for the first. */
export function nextSortOrder(categories: readonly CategoryOrder[]): number {
  return categories.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 10;
}

/**
 * Moving a category one place up or down SWAPS its order with its neighbour's, in the list as the
 * menu draws it (by order, then id — a tie never reads two ways). Null at an edge or for an id not
 * in the list: nothing to write.
 */
export function moveCategory(
  categories: readonly CategoryOrder[],
  id: string,
  direction: "up" | "down",
): [CategoryOrder, CategoryOrder] | null {
  const sorted = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const i = sorted.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const j = direction === "up" ? i - 1 : i + 1;
  const me = sorted[i];
  const other = sorted[j];
  if (!me || !other) return null;
  // Equal orders cannot be swapped into a change: separate them first, the mover taking the side
  // it is moving to.
  if (me.sortOrder === other.sortOrder) {
    const sign = direction === "up" ? -1 : 1;
    return [
      { id: me.id, sortOrder: other.sortOrder + sign },
      { id: other.id, sortOrder: other.sortOrder },
    ];
  }
  return [
    { id: me.id, sortOrder: other.sortOrder },
    { id: other.id, sortOrder: me.sortOrder },
  ];
}
