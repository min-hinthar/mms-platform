import { publicClient } from "@mms/db/server";
import { TableCartProvider } from "@/components/TableCartProvider";
import { CartPublisher } from "@/components/CartPublisher";
import { MenuBrowser, type MenuItem } from "@/components/menu/MenuBrowser";
import { requiredChoiceUnavailable, shapeModifierGroups } from "@/lib/menu/modifiers";
import { getMostLoved } from "@/lib/menu/mostLoved";
import { getWelcomeBack } from "@/lib/rewards";
import { getFavoriteIds } from "@/lib/favorites";
import { OutageRefresh } from "@/components/OutageRefresh";
import { readLastGoodCatalog, storeLastGoodCatalog } from "@/lib/menu/catalog-cache";
import { safeImageUrl } from "@/lib/media-url";

// RSC menu — reads the catalog (`menu_items`) server-side with the ANON/publishable key (gated by
// public-read RLS, least privilege). Fetches the fields the R6 browse layer needs (name EN/MY,
// description, price cents, image, sold-out, tags + allergens for badges/diet filters, category) and the
// R6b item sheet's modifier groups (eagerly embedded — most items have none), then hands the shaped rows to
// the client `MenuBrowser`. Data stays server-fetched (fast TTFB); only the interaction is client-side.
//
// W10a — outage resilience is a LAST-GOOD catalog, not ISR: the old `export const revalidate = 300`
// was a silent no-op (the per-diner cookie reads force dynamic rendering), so a paused DB rendered
// "The menu catalog is empty." Instead the catalog read keeps its last successful result in module
// state (survives warm instances); a failed read serves that with an honest staleness strip, and
// only a cold instance with nothing cached shows the full outage state. Stale menu ≫ no menu — the
// catalog is public and changes rarely.

export default async function Menu({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    t?: string;
    j?: string;
    reorder?: string;
    door?: string;
    table?: string;
    resume?: string;
  }>;
}) {
  // `t` = a scanned table-sticker token (may provision a new table); `j` = the host's invite code
  // (join-only — a wrong code must NOT mint a phantom table). Both are the dine-in session key (M3·P3.1).
  // `reorder` (J5) = a past order id to bring back once the cart is ready (validated + earner-gated
  // server-side in reorderOrder; the client only relays the id). `door` (K0/K1) = the diner-facing
  // entrance for analytics only (never authz) — the To-go door sends door=togo on the pickup mode.
  const { mode = "scango", t, j, reorder, door, table, resume } = await searchParams;
  const code = t ?? j;
  const joinOnly = !t && !!j;
  const db = publicClient();
  // J2: the catalog and the counts-only favorites aggregate load in parallel — the aggregate is cached
  // (1h) and can never block or break the menu (it resolves [] on failure inside mostLoved).
  const mostLovedP = getMostLoved();
  // J5 recognition reads (both the caller's OWN, both cookie-scoped, both fail to a quiet default —
  // a broken greeting or missing hearts must never take the menu down).
  const welcomeP = getWelcomeBack();
  const heartedP = getFavoriteIds();
  const { data, error: catalogErr } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,description_en,description_my,base_price_cents,image_url,is_sold_out,tags,allergens,menu_categories(name,sort_order),item_modifier_groups(modifier_groups(id,slug,name,name_my,selection_type,min_select,max_select,modifier_options(id,slug,name,name_my,price_delta_cents,sort_order,is_active,allergens)))",
    )
    .eq("is_active", true)
    .order("name_en");
  // W10a — a failed read is NOT an empty menu (the pre-W10a shape rendered "The menu catalog is
  // empty." for a paused DB — blaming the restaurant's menu for our outage). Serve the last-good
  // catalog with a staleness strip when we have one; the full outage state only when we don't.
  let catalogStale = false;
  if (catalogErr) {
    console.error("[menu] catalog read failed", catalogErr.message);
    if (!readLastGoodCatalog()) {
      return (
        <main style={{ minHeight: "70dvh", display: "grid", placeItems: "center", padding: 24 }}>
          <OutageRefresh
            title="We can’t load the menu right now"
            body="It’s on us, not your connection. The kitchen is still cooking — please try again in a moment, or ask our staff for a paper menu."
            escalatedBody="Still down on our end — sorry. Please ask our staff for a paper menu; ordering will be back shortly."
            focusOnMount
            headingLevel="h1"
          />
        </main>
      );
    }
    catalogStale = true;
  }
  // Stable-sort by category sort_order (the fetch already ordered by name_en, so rows stay name-ordered
  // within a category). Flatten the to-one `menu_categories` embed to a plain `category` string.
  const shaped: MenuItem[] = [...(data ?? [])]
    .sort((a, b) => (a.menu_categories?.sort_order ?? 999) - (b.menu_categories?.sort_order ?? 999))
    .map((i) => ({
      id: i.id,
      name_en: i.name_en,
      name_my: i.name_my,
      description_en: i.description_en,
      description_my: i.description_my,
      base_price_cents: i.base_price_cents,
      // Containment only (lib/media-url): what next/image + the CSP will accept. W16d removed the
      // filename filter that used to null most of these — those rows are REAL per-dish photos.
      image_url: safeImageUrl(i.image_url),
      // Unavailable if flagged sold-out OR a required modifier group has no active options to choose from.
      is_sold_out: i.is_sold_out || requiredChoiceUnavailable(i.item_modifier_groups),
      tags: i.tags ?? [],
      allergens: i.allergens ?? [],
      category: i.menu_categories?.name ?? "Menu",
      modifierGroups: shapeModifierGroups(i.item_modifier_groups),
    }));

  // W10a — the last-good handoff: a fresh read replaces the cache (in its own module — the page
  // body stays render-pure); a failed one (catalogStale) reuses it. The non-null assertion is
  // guarded above: the stale branch is only reachable when the cache held a copy.
  const items: MenuItem[] = catalogStale ? (readLastGoodCatalog() ?? []) : shaped;
  if (!catalogStale) storeLastGoodCatalog(shaped);

  const favoriteIds = (await mostLovedP).map((m) => m.menuItemId);
  const welcome = await welcomeP;
  const heartedIds = await heartedP;

  return (
    <TableCartProvider
      mode={mode}
      code={code}
      joinOnly={joinOnly}
      door={door}
      table={table}
      resume={resume === "1"}
    >
      {/* Publishes the open-cart id to the wayfinding store so the header's "back to cart" works off-menu. */}
      <CartPublisher />
      <MenuBrowser
        items={items}
        mode={mode}
        favoriteIds={favoriteIds}
        heartedIds={heartedIds}
        welcome={welcome}
        reorderId={reorder ?? null}
        catalogStale={catalogStale}
      />
    </TableCartProvider>
  );
}
