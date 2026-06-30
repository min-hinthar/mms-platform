import { publicClient } from "@mms/db/server";
import { TableCartProvider } from "@/components/TableCartProvider";
import { MenuBrowser, type MenuItem } from "@/components/menu/MenuBrowser";
import type { ModGroup } from "@/lib/menu/modifiers";

// RSC menu — reads the catalog (`menu_items`) server-side with the ANON/publishable key (gated by
// public-read RLS, least privilege). Fetches the fields the R6 browse layer needs (name EN/MY,
// description, price cents, image, sold-out, tags + allergens for badges/diet filters, category) and the
// R6b item sheet's modifier groups (eagerly embedded — most items have none), then hands the shaped rows to
// the client `MenuBrowser`. Data stays server-fetched (fast TTFB); only the interaction is client-side.
export const revalidate = 300;

// Raw shape of the nested modifier embed (one row per item→group link).
type RawModLink = {
  modifier_groups: {
    id: string;
    name: string;
    selection_type: string;
    min_select: number;
    max_select: number;
    modifier_options: {
      id: string;
      name: string;
      price_delta_cents: number;
      sort_order: number;
      is_active: boolean;
    }[];
  } | null;
};

// Shape the embed → ModGroup[]: active options only (sorted), required groups (min_select≥1) first so the
// sheet shows the radios before the optional checkboxes. Advisory data only — the server re-prices on add.
function shapeModifierGroups(links: RawModLink[] | null | undefined): ModGroup[] {
  const groups = (links ?? [])
    .map((l) => l.modifier_groups)
    .filter((g): g is NonNullable<RawModLink["modifier_groups"]> => g != null)
    .map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selection_type === "multiple" ? ("multiple" as const) : ("single" as const),
      minSelect: g.min_select,
      maxSelect: g.max_select,
      options: [...(g.modifier_options ?? [])]
        .filter((o) => o.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({ id: o.id, name: o.name, priceDeltaCents: o.price_delta_cents })),
    }))
    .filter((g) => g.options.length > 0);
  // Required (radio) groups before optional (checkbox) ones; stable within each.
  return groups.sort((a, b) => (b.minSelect >= 1 ? 1 : 0) - (a.minSelect >= 1 ? 1 : 0));
}

// An item with a REQUIRED group whose options are ALL inactive can't be completed (the required choice has
// no options), and the server's `enforceCardinality` would reject every add. Treat it as unavailable so the
// menu shows it sold-out (honest) rather than an addable item that always fails.
function requiredChoiceUnavailable(links: RawModLink[] | null | undefined): boolean {
  return (links ?? []).some((l) => {
    const g = l.modifier_groups;
    return !!g && g.min_select >= 1 && !(g.modifier_options ?? []).some((o) => o.is_active);
  });
}

export default async function Menu({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; t?: string; j?: string }>;
}) {
  // `t` = a scanned table-sticker token (may provision a new table); `j` = the host's invite code
  // (join-only — a wrong code must NOT mint a phantom table). Both are the dine-in session key (M3·P3.1).
  const { mode = "scango", t, j } = await searchParams;
  const code = t ?? j;
  const joinOnly = !t && !!j;
  const db = publicClient();
  const { data } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,description_en,base_price_cents,image_url,is_sold_out,tags,allergens,menu_categories(name,sort_order),item_modifier_groups(modifier_groups(id,name,selection_type,min_select,max_select,modifier_options(id,name,price_delta_cents,sort_order,is_active)))",
    )
    .eq("is_active", true)
    .order("name_en");
  // Stable-sort by category sort_order (the fetch already ordered by name_en, so rows stay name-ordered
  // within a category). Flatten the to-one `menu_categories` embed to a plain `category` string.
  const items: MenuItem[] = [...(data ?? [])]
    .sort((a, b) => (a.menu_categories?.sort_order ?? 999) - (b.menu_categories?.sort_order ?? 999))
    .map((i) => ({
      id: i.id,
      name_en: i.name_en,
      name_my: i.name_my,
      description_en: i.description_en,
      base_price_cents: i.base_price_cents,
      image_url: i.image_url,
      // Unavailable if flagged sold-out OR a required modifier group has no active options to choose from.
      is_sold_out: i.is_sold_out || requiredChoiceUnavailable(i.item_modifier_groups),
      tags: i.tags ?? [],
      allergens: i.allergens ?? [],
      category: i.menu_categories?.name ?? "Menu",
      modifierGroups: shapeModifierGroups(i.item_modifier_groups),
    }));

  return (
    <TableCartProvider mode={mode} code={code} joinOnly={joinOnly}>
      <MenuBrowser items={items} mode={mode} />
    </TableCartProvider>
  );
}
