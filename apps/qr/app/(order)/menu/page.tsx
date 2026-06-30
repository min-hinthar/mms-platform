import { publicClient } from "@mms/db/server";
import { TableCartProvider } from "@/components/TableCartProvider";
import { MenuBrowser, type MenuItem } from "@/components/menu/MenuBrowser";

// RSC menu — reads the catalog (`menu_items`) server-side with the ANON/publishable key (gated by
// public-read RLS, least privilege). Fetches the fields the R6 browse layer needs (name EN/MY,
// description, price cents, image, sold-out, tags + allergens for badges/diet filters, category) and hands
// the shaped rows to the client `MenuBrowser` (search · category rail · diet filters · blur-up). Data stays
// server-fetched (fast TTFB); only the interaction is client-side.
export const revalidate = 300;

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
      "id,name_en,name_my,description_en,base_price_cents,image_url,is_sold_out,tags,allergens,menu_categories(name,sort_order)",
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
      is_sold_out: i.is_sold_out,
      tags: i.tags ?? [],
      allergens: i.allergens ?? [],
      category: i.menu_categories?.name ?? "Menu",
    }));

  return (
    <TableCartProvider mode={mode} code={code} joinOnly={joinOnly}>
      <MenuBrowser items={items} mode={mode} />
    </TableCartProvider>
  );
}
