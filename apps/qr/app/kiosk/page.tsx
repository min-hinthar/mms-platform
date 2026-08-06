import { publicClient } from "@mms/db/server";
import { KioskShell } from "@/components/kiosk/KioskShell";
import type { KioskItem } from "@/components/kiosk/types";
import {
  requiredChoiceUnavailable,
  shapeModifierGroups,
} from "@/lib/menu/modifiers";

export const metadata = {
  title: "Order — Mandalay Morning Star",
  robots: { index: false }, // a device bookmark, never a search destination (the /board pattern)
};
export const dynamic = "force-dynamic";

/**
 * The self-serve kiosk (W6b — S5, M6·P6.1). Bookmarked on the lobby device as `/kiosk?k=<token>`.
 * The page is UNGATED — the kiosk server actions verify the token (the /board "API is the gate"
 * pattern), so a tokenless visit renders a shell whose first order attempt lands on the honest
 * not-configured state rather than leaking anything. The catalog is read fresh per RSC pass; the
 * flow calls `router.refresh()` on every reset, so each customer starts on current data.
 */
export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  const { k } = await searchParams;

  const db = publicClient();
  const { data } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,base_price_cents,image_url,is_sold_out,tags,menu_categories(name,sort_order),item_modifier_groups(modifier_groups(id,slug,name,name_my,selection_type,min_select,max_select,modifier_options(id,slug,name,name_my,price_delta_cents,sort_order,is_active,allergens)))",
    )
    .eq("is_active", true)
    .order("name_en");
  const raw = data ?? [];

  const items: KioskItem[] = raw.map((i) => ({
    id: i.id,
    nameEn: i.name_en,
    nameMy: i.name_my,
    priceCents: i.base_price_cents,
    imageUrl: i.image_url,
    // Same honesty rule as the diner/staff menus: an unaddable required-choice item shows sold-out.
    soldOut: !!i.is_sold_out || requiredChoiceUnavailable(i.item_modifier_groups),
    category: i.menu_categories?.name ?? "Menu",
    tags: i.tags ?? [],
    groups: shapeModifierGroups(i.item_modifier_groups),
  }));
  const categories = [
    ...new Map(
      raw.map((i) => [i.menu_categories?.name ?? "Menu", i.menu_categories?.sort_order ?? 999]),
    ).entries(),
  ]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  return <KioskShell token={k ?? ""} items={items} categories={categories} />;
}
