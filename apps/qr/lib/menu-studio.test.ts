import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Menu studio's writes (owner, 2026-10-24) — asserted as the CALLS each action makes against a
 * recording fake (the degenerate-mock lesson: the predicate and the payload, never an answer we
 * chose). Each rule carries a `menu-studio/*` mutant.
 */
vi.mock("server-only", () => ({}));
// OA9 — the console lock, read by every money-out and price-authority write.
let consoleLocked = false;
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(consoleLocked) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const gateRoles: unknown[] = [];
let gateOk = true;
vi.mock("./staff", () => ({
  STAFF_SIGNIN_REQUIRED: "Staff sign-in required.",
  staffGate: (minRole?: unknown) => {
    gateRoles.push(minRole);
    return Promise.resolve(
      gateOk
        ? { ok: true, caller: { staffId: "mgr-1", role: "manager" } }
        : { ok: false, error: "Managers only." },
    );
  },
}));

type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };
const calls: Call[] = [];
/** Per table: what a read answers; what an update/insert answers (`null` row = no row matched). */
let reads: Record<string, unknown> = {};
let lists: Record<string, unknown[]> = {};
let writes: Record<string, { data: unknown; error: unknown }[]> = {};
let auditError: unknown = null;
const uploads: { path: string; opts: unknown }[] = [];
let uploadError: { message: string } | null = null;

function chain(table: string, op: string, payload?: unknown) {
  const call: Call = { table, op, payload, filters: [] };
  calls.push(call);
  const c: Record<string, unknown> = {};
  const add = (kind: string) => (col: string, v: unknown) => {
    call.filters.push([kind, col, v]);
    return c;
  };
  c.select = () => c;
  c.eq = add("eq");
  c.like = add("like");
  c.order = () => c;
  c.limit = () => Promise.resolve({ data: lists[table] ?? [], error: null });
  c.maybeSingle = () => {
    if (op === "select") return Promise.resolve({ data: reads[table] ?? null, error: null });
    const q = writes[`${table}:${op}`];
    return Promise.resolve(
      q?.shift() ?? { data: { id: "new-1", updated_at: "2026-10-24T10:00:00.000Z" }, error: null },
    );
  };
  c.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: table === "menu_edit_audit" ? auditError : null }).then(
      res,
    );
  return c;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (p: unknown) => chain(table, "update", p),
      insert: (p: unknown) => chain(table, "insert", p),
    }),
    storage: {
      from: () => ({
        upload: (path: string, _body: unknown, opts: unknown) => {
          uploads.push({ path, opts });
          return Promise.resolve({ error: uploadError });
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://fasnpdhtvqtzjlvruqcu.supabase.co/storage/v1/object/public/menu-photos/${path}`,
          },
        }),
      }),
    },
  }),
}));

const { editDish, createDish, setDishPhoto, saveCategory, moveCategoryAction } =
  await import("./menu-studio");

const ITEM = "11111111-1111-4111-8111-111111111111";
const CAT = "22222222-2222-4222-8222-222222222222";
const CAT2 = "33333333-3333-4333-8333-333333333333";
const STAMP = "2026-10-24T09:00:00.000Z";
const row = {
  id: ITEM,
  name_en: "Mohinga",
  name_my: null,
  description_en: null,
  description_my: null,
  category_id: CAT,
  tax_category: "hot_prepared",
  is_active: true,
  updated_at: STAMP,
};
const edit = {
  itemId: ITEM,
  expectedUpdatedAt: STAMP,
  nameEn: "Mohinga",
  nameMy: null,
  descriptionEn: null,
  descriptionMy: null,
  categoryId: CAT,
  taxCategory: "hot_prepared",
  isActive: true,
};
const updates = () => calls.filter((c) => c.op === "update");
const audits = () => calls.filter((c) => c.table === "menu_edit_audit");

beforeEach(() => {
  calls.length = 0;
  gateRoles.length = 0;
  uploads.length = 0;
  gateOk = true;
  reads = { menu_items: row };
  lists = {};
  writes = {};
  auditError = null;
  uploadError = null;
});

describe("editDish", () => {
  it("is a MANAGER's write; a refused gate writes nothing (`menu-studio/edit-server-floor`)", async () => {
    gateOk = false;
    expect(await editDish(edit)).toEqual({ ok: false, reason: "gate", message: "Managers only." });
    expect(gateRoles).toEqual(["manager"]);
    expect(updates()).toHaveLength(0);
  });

  it("a sheet that read an OLDER dish is refused before any write (`menu-studio/edit-stale-ignored`)", async () => {
    expect(
      await editDish({ ...edit, nameEn: "X", expectedUpdatedAt: "2026-10-24T08:00:00.000Z" }),
    ).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(updates()).toHaveLength(0);
  });

  it("nothing changed writes nothing", async () => {
    expect(await editDish(edit)).toMatchObject({ ok: true, changed: 0 });
    expect(updates()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("writes only the changed columns, swapped on the stamp it read, and records each change", async () => {
    const res = await editDish({ ...edit, nameMy: "  မုန့်ဟင်းခါး ", categoryId: CAT2 });
    expect(res).toMatchObject({ ok: true, audited: true, changed: 2 });
    const u = updates()[0]!;
    expect(Object.keys(u.payload as object).sort()).toEqual([
      "category_id",
      "name_my",
      "updated_at",
    ]);
    expect((u.payload as Record<string, unknown>).name_my).toBe("မုန့်ဟင်းခါး");
    expect(u.filters).toContainEqual(["eq", "updated_at", STAMP]);
    expect(u.filters).toContainEqual(["eq", "id", ITEM]);
    const a = audits()[0]!.payload as { field: string; changed_by: string }[];
    expect(a.map((r) => r.field)).toEqual(["name_my", "category_id"]);
    expect(a[0]!.changed_by).toBe("mgr-1");
  });

  it("a write that matched no row (the stamp moved) is stale, never ok (`menu-studio/edit-zero-rows-ok`)", async () => {
    writes["menu_items:update"] = [{ data: null, error: null }];
    expect(await editDish({ ...edit, nameEn: "Mohinga 2" })).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(audits()).toHaveLength(0);
  });

  it("a ledger that cannot be written leaves the edit standing, answered audited:false", async () => {
    auditError = { message: "relation does not exist" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await editDish({ ...edit, isActive: false })).toMatchObject({
      ok: true,
      audited: false,
    });
  });
});

describe("createDish", () => {
  // The creation key is looked up first: by default no dish holds it yet.
  beforeEach(() => {
    reads = {};
  });
  const NEW = "44444444-4444-4444-8444-444444444444";
  const add = {
    itemId: NEW,
    nameEn: " Tea Leaf  Salad ",
    nameMy: null,
    descriptionEn: null,
    descriptionMy: null,
    categoryId: CAT,
    taxCategory: "cold_food",
    priceCents: 1450,
  };
  it("a unique slug from the name, the typed fields, ON the menu (`menu-studio/create-slug-taken`)", async () => {
    lists = { menu_items: [{ slug: "tea-leaf-salad" }] };
    expect(await createDish(add)).toMatchObject({ ok: true, itemId: "new-1" });
    const ins = calls.find((c) => c.table === "menu_items" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({
      slug: "tea-leaf-salad-2",
      name_en: "Tea Leaf Salad",
      base_price_cents: 1450,
      tax_category: "cold_food",
      category_id: CAT,
      is_active: true,
    });
    expect(gateRoles).toEqual(["manager"]);
  });
  it("a retry of an Add that already landed answers ok for that dish and inserts nothing (`menu-studio/create-key-ignored`)", async () => {
    reads = { menu_items: { id: NEW } };
    expect(await createDish(add)).toEqual({ ok: true, audited: true, itemId: NEW });
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });
  it("the insert carries the creation key as the row's id", async () => {
    reads = {};
    await createDish(add);
    expect(calls.find((c) => c.table === "menu_items" && c.op === "insert")!.payload).toMatchObject(
      {
        id: NEW,
      },
    );
  });
  it("a slug taken between the read and the insert is retried once", async () => {
    writes["menu_items:insert"] = [{ data: null, error: { code: "23505", message: "dup" } }];
    expect(await createDish(add)).toMatchObject({ ok: true });
    expect(calls.filter((c) => c.table === "menu_items" && c.op === "insert")).toHaveLength(2);
  });
  it("a price outside the menu's bounds is refused before any read", async () => {
    expect(await createDish({ ...add, priceCents: 10 })).toEqual({ ok: false, reason: "invalid" });
    expect(calls).toHaveLength(0);
  });
});

describe("setDishPhoto", () => {
  const form = (type = "image/jpeg", size = 2000) => {
    const f = new FormData();
    f.set("itemId", ITEM);
    f.set("expectedUpdatedAt", STAMP);
    f.set("photo", new File([new Uint8Array(size)], "p", { type }));
    return f;
  };
  it("a type the bucket refuses is refused before the gate or any upload (`menu-studio/photo-type-unchecked`)", async () => {
    expect(await setDishPhoto(form("image/heic"))).toEqual({ ok: false, reason: "type" });
    expect(uploads).toHaveLength(0);
    expect(gateRoles).toHaveLength(0);
  });
  it("uploads under the dish's folder and points the dish at the public URL", async () => {
    reads = { menu_items: { id: ITEM, image_url: null, updated_at: STAMP } };
    const res = await setDishPhoto(form());
    expect(res).toMatchObject({ ok: true });
    expect(uploads[0]!.path).toMatch(new RegExp(`^${ITEM}/\\d+\\.jpg$`));
    expect(uploads[0]!.opts).toMatchObject({ upsert: false, contentType: "image/jpeg" });
    const u = updates()[0]!.payload as Record<string, unknown>;
    expect(u.image_url).toBe(
      `https://fasnpdhtvqtzjlvruqcu.supabase.co/storage/v1/object/public/menu-photos/${uploads[0]!.path}`,
    );
  });
  it("a sheet that read an OLDER dish cannot advance its stamp with a photo (`menu-studio/photo-stale-ignored`)", async () => {
    reads = {
      menu_items: { id: ITEM, image_url: null, updated_at: "2026-10-24T09:30:00.000Z" },
    };
    expect(await setDishPhoto(form())).toEqual({ ok: false, reason: "stale" });
    expect(uploads).toHaveLength(0);
    expect(updates()).toHaveLength(0);
  });
  it("the pointer write is swapped on the stamp it read", async () => {
    reads = { menu_items: { id: ITEM, image_url: null, updated_at: STAMP } };
    await setDishPhoto(form());
    expect(updates()[0]!.filters).toContainEqual(["eq", "updated_at", STAMP]);
  });
  it("no bucket yet is `storage` — said, never a generic failure", async () => {
    reads = { menu_items: { id: ITEM, image_url: null, updated_at: STAMP } };
    uploadError = { message: "Bucket not found" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setDishPhoto(form())).toEqual({ ok: false, reason: "storage" });
    expect(updates()).toHaveLength(0);
  });
});

describe("categories", () => {
  it("a new category goes last (`menu-studio/category-sort-first`)", async () => {
    lists = {
      menu_categories: [
        { id: "a", slug: "noodles", sort_order: 10 },
        { id: "b", slug: "curry", sort_order: 30 },
      ],
    };
    expect(await saveCategory({ name: "Noodles", isActive: true })).toMatchObject({ ok: true });
    const ins = calls.find((c) => c.table === "menu_categories" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ slug: "noodles-2", name: "Noodles", sort_order: 40 });
  });
  it("a rename is swapped on the name it read; no match is stale (`menu-studio/category-cas-dropped`)", async () => {
    reads = { menu_categories: { id: CAT, name: "Soups", is_active: true } };
    writes["menu_categories:update"] = [{ data: null, error: null }];
    expect(
      await saveCategory({
        categoryId: CAT,
        name: "Soup",
        isActive: true,
        expected: { name: "Soups", isActive: true },
      }),
    ).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(updates()[0]!.filters).toContainEqual(["eq", "name", "Soups"]);
  });
  it("an edit compares against what the SHEET showed: a category hidden since is refused, never re-shown (`menu-studio/category-expected-ignored`)", async () => {
    // Another manager hid it after this sheet read it shown; this sheet's rename carries isActive:true.
    reads = { menu_categories: { id: CAT, name: "Soups", is_active: false } };
    expect(
      await saveCategory({
        categoryId: CAT,
        name: "Soup",
        isActive: true,
        expected: { name: "Soups", isActive: true },
      }),
    ).toEqual({ ok: false, reason: "stale" });
    expect(updates()).toHaveLength(0);
    // An edit with no expected values is refused at the schema.
    expect(await saveCategory({ categoryId: CAT, name: "Soup", isActive: true })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
  it("a move swaps the two orders, each guarded on the order read", async () => {
    lists = {
      menu_categories: [
        { id: CAT, sort_order: 10 },
        { id: CAT2, sort_order: 20 },
      ],
    };
    expect(await moveCategoryAction({ categoryId: CAT2, direction: "up" })).toMatchObject({
      ok: true,
    });
    const u = updates();
    expect(u.map((c) => c.payload)).toEqual([{ sort_order: 10 }, { sort_order: 20 }]);
    expect(u[0]!.filters).toContainEqual(["eq", "sort_order", 20]);
    expect(u[1]!.filters).toContainEqual(["eq", "sort_order", 10]);
  });
  it("a crossing move that refuses the second write puts the first back (`menu-studio/move-no-undo`)", async () => {
    lists = {
      menu_categories: [
        { id: CAT, sort_order: 10 },
        { id: CAT2, sort_order: 20 },
      ],
    };
    writes["menu_categories:update"] = [
      { data: { id: CAT2 }, error: null },
      { data: null, error: null },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await moveCategoryAction({ categoryId: CAT2, direction: "up" })).toEqual({
      ok: false,
      reason: "stale",
    });
    const u = updates();
    expect(u).toHaveLength(3);
    // The undo writes CAT2 back to 20, guarded on the 10 it just wrote.
    expect(u[2]!.payload).toEqual({ sort_order: 20 });
    expect(u[2]!.filters).toContainEqual(["eq", "id", CAT2]);
    expect(u[2]!.filters).toContainEqual(["eq", "sort_order", 10]);
    expect(audits()).toHaveLength(0);
  });
});

describe("OA9 — a locked console changes nothing on the menu", () => {
  it("every studio write answers `locked` before any read (`menu-studio/locked-writes`)", async () => {
    consoleLocked = true;
    expect(await editDish({ ...edit, nameEn: "X" })).toEqual({ ok: false, reason: "locked" });
    expect(await moveCategoryAction({ categoryId: CAT2, direction: "up" })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(calls).toHaveLength(0);
  });
});
