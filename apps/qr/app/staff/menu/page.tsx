import { type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "@mms/ui";
import { publicClient } from "@mms/db/server";
import { requireStaffPage } from "@/lib/staff";
import { readStaffLang } from "@/lib/staff-lang-server";
import { readStaffDoor } from "@/lib/staff-door-server";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { staffHasPin } from "@/lib/staff-pin";
import { Chrome } from "@/components/staff/Chrome";
import { type PricedItem } from "@/components/staff/MenuPriceEditor";
import { MenuStudio } from "@/components/staff/MenuStudio";
import type { StudioCategory, StudioDish } from "@/components/staff/DishSheet";
import { safeImageUrl } from "@/lib/media-url";
import { categoryShown, TAX_CATEGORIES, type MenuTaxCategory } from "@/lib/menu-studio-rules";
import { MarketShelfEditor, type ShelfItem } from "@/components/staff/MarketShelfEditor";
import { aisleBySlug } from "@/lib/grocery-aisles";
import { shelfDetail } from "@/lib/market-shelf";
import { queueEmptiness } from "@/lib/queue-window";
import { sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";

export const metadata = { title: "Menu — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * W17b — menu prices (owner: "staff portal should be able to update prices?"), plus W23a's 86 control.
 *
 * Gated PER CONTROL, not per page (W23a, Codex P2). Two authorities live on this screen and they do
 * not share a floor: `setMenuPrice` is manager-and-up, `setItemSoldOut` is server-and-up. Bouncing
 * every server at the door — which is what this page used to do — made the lower floor unreachable
 * on the only menu-wide surface there is, so a server who learns at the counter that a dish is out
 * had nowhere to say so until a KDS ticket happened to carry it. A server now gets the list and the
 * 86 control; the price editor is simply not rendered for them.
 *
 * Both actions re-check their own floor server-side (they are public POST endpoints), so everything
 * here is affordance: the page must not OFFER what the authority would refuse, and must not withhold
 * what it would allow.
 *
 * The catalog read is the same public-RLS one the diner menu uses, so this page shows exactly the
 * prices a guest would be charged — the point of the screen.
 *
 * P2 — the chrome speaks the device language. P2e — this screen carries NO language control (no
 * in-service bar does): its Screens circle is one tap from the doors, whose More ends with the
 * bilingual Language tile. `check-staff-lang.mjs` rule 4d is what holds that way up to a wordless
 * leading control.
 *
 * A4·5 — this is the MENU screen, one of the five. The printed word-check sheet (`/staff/glossary`,
 * P5 — a list of every staff word with its Burmese, and the dish names are checked on the ticket)
 * is an ACTION of this screen now, a print circle in the bar, rather than a tile on the doors: it
 * is the menu's paperwork. The sheet itself is unchanged, and stays its own route because it is a
 * printable document with its own layout.
 *
 * M190 (lifecycle residuals) — the screen's SECOND list: the market (`?shelf=market`), where a server
 * marks a grocery item sold out (`setGroceryAvailable`, the 86's twin for `grocery_items.available`,
 * which had no writer). A view, not a section: each list keeps the ONE live region its editor mounts,
 * and the switch is two links on the lit-gold cap (`aria-current="page"`). Same gate as the 86 —
 * server-and-up, re-checked by the action.
 */
export default async function StaffMenuPrices({
  searchParams,
}: {
  searchParams: Promise<{ shelf?: string | string[] }>;
}) {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect
  // that destroys where you were mid-service.
  if (!caller) return <StaffOutageShell what="what.menuPrices" />;
  const hasPin = await staffHasPin(caller.staffId);

  const canEditPrice = caller.role !== "server";
  // Read AFTER the gate: the unknowable-gate branch above renders `StaffOutageShell`, which carries
  // its own control, so the cookie is only needed on the path that renders this page's chrome.
  const [lang, door, sp] = await Promise.all([readStaffLang(), readStaffDoor(), searchParams]);
  const market = sp.shelf === "market";
  if (market) return <MarketShelf lang={lang} door={door} hasPin={hasPin} />;

  const db = publicClient();
  // Menu studio (owner, 2026-10-24) — a manager reads EVERY dish (a hidden one must stay findable
  // to be shown again) and every category; the price list below still lists the dishes on the menu.
  const [itemsRes, catsRes] = await Promise.all([
    db
      .from("menu_items")
      .select(
        "id,name_en,name_my,description_en,description_my,category_id,tax_category,is_active,image_url,updated_at,base_price_cents,is_sold_out,sold_out_at,menu_categories(name,sort_order,is_active)",
      )
      .order("name_en"),
    canEditPrice
      ? db.from("menu_categories").select("id,name,sort_order,is_active").order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const { data: all, error } = itemsRes;
  // A failed read is UNKNOWABLE, not "the menu is empty" — an empty editor would read as a catalog
  // that lost its dishes (W10a: a failure must never render as emptiness).
  if (error || catsRes.error) return <StaffOutageShell what="what.menuPrices" />;
  // The list a guest sees: on the menu, and in a shown category.
  const data = (all ?? []).filter((i) => i.is_active && categoryShown(i.menu_categories));

  const items: PricedItem[] = data.map((i) => ({
    id: i.id,
    nameEn: i.name_en,
    nameMy: i.name_my,
    priceCents: i.base_price_cents,
    category: i.menu_categories?.name ?? "Menu",
    soldOut: !!i.is_sold_out,
    soldOutAt: i.sold_out_at ?? null,
  }));

  return (
    <main className="staff-main">
      <StaffBar
        lang={lang}
        title={canEditPrice ? "browse.price.title" : "browse.price.titleAvail"}
        // Phase 3a (D5) — "up" from this screen is the COUNTER on a counter device (one tap back to
        // work, not two through the doors); the doors everywhere else. Both arms literal (rule 4d).
        leading={
          door === "counter"
            ? { kind: "back", href: "/staff?floor=1", k: "floor.back" }
            : { kind: "screens" }
        }
        // The word-check sheet, as a circle — named by sr-only text like the counter's approvals
        // circle (the sheet's own title, no arrow), and a real link, so it opens with JavaScript off.
        trailing={
          <Link href="/staff/glossary" className="staff-circ staff-press">
            <Icon name="print" size={20} />
            <span className="sr-only">
              <Chrome lang={lang} k="browse.price.wordCheck" />
            </span>
          </Link>
        }
        lock={hasPin}
      />
      <div className="staff-col" style={wrap}>
        <ShelfSwitch lang={lang} market={false} />
        <p style={lead}>
          <Chrome
            lang={lang}
            k={canEditPrice ? "browse.price.leadManager" : "browse.price.leadServer"}
            echo="stack"
          />
        </p>
        {/* menu-4 — the request's clock, so the server render and the hydrating client agree on
            which 86 stamps are from another service day (`lib/sold-out-since.ts`). */}
        <MenuStudio
          items={items}
          canEditPrice={canEditPrice}
          nowIso={new Date().toISOString()}
          studio={canEditPrice ? studioOf(all ?? [], catsRes.data ?? []) : undefined}
        />
      </div>
    </main>
  );
}

/**
 * M190 — the market list. Read through the same public-RLS catalog the aisle grid uses, but EVERY
 * item (the grid shows only `available`, unweighed ones): a sold-out jar must stay findable here to be
 * put back. A failed read is the outage shell, never an empty market (W10a).
 */
async function MarketShelf({
  lang,
  door,
  hasPin,
}: {
  lang: StaffLang;
  door: Awaited<ReturnType<typeof readStaffDoor>>;
  hasPin: boolean;
}) {
  const { data, error } = await publicClient()
    .from("grocery_items")
    .select("barcode,name,name_my,brand,size_qty,size_unit,price_cents,category,available")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    // The barcode last: a total order, so a same-name pair keeps its place between renders.
    .order("barcode", { ascending: true })
    .limit(MARKET_SHELF_CAP);
  if (error) return <StaffOutageShell what="what.market" />;
  // The blind pass on #363 — a read that came back FULL did not see the whole catalog (PostgREST
  // answers at most `max_rows` = 1000 rows, `supabase/config.toml`, whatever was asked), and a list
  // missing its tail would leave an item nobody can mark sold out or put back, with nothing on the
  // screen to say so. So a full read is "cannot say" (`queueEmptiness`, the queues' rule): logged, and
  // the outage shell rather than a partial list. Today's catalog is 405 rows; M191 is the grid's twin.
  if (queueEmptiness((data ?? []).length, MARKET_SHELF_CAP) === "cannot-say") {
    console.error("[staff/menu] market read saturated — refusing a partial list", {
      cap: MARKET_SHELF_CAP,
    });
    return <StaffOutageShell what="what.market" />;
  }
  const items: ShelfItem[] = (data ?? []).map((i) => {
    const aisle = i.category ? aisleBySlug.get(i.category) : undefined;
    return {
      barcode: i.barcode,
      nameEn: i.name,
      nameMy: i.name_my,
      aisleEn: aisle?.en ?? i.category ?? "",
      aisleMy: aisle?.my ?? null,
      detail: shelfDetail({
        brand: i.brand,
        sizeQty: i.size_qty === null ? null : Number(i.size_qty),
        sizeUnit: i.size_unit,
        priceCents: i.price_cents,
        barcode: i.barcode,
      }),
      available: i.available,
    };
  });
  return (
    <main className="staff-main">
      <StaffBar
        lang={lang}
        title="browse.market.title"
        leading={
          door === "counter"
            ? { kind: "back", href: "/staff?floor=1", k: "floor.back" }
            : { kind: "screens" }
        }
        trailing={
          <Link href="/staff/glossary" className="staff-circ staff-press">
            <Icon name="print" size={20} />
            <span className="sr-only">
              <Chrome lang={lang} k="browse.price.wordCheck" />
            </span>
          </Link>
        }
        lock={hasPin}
      />
      <div className="staff-col" style={wrap}>
        <ShelfSwitch lang={lang} market />
        <p style={lead}>
          <Chrome lang={lang} k="browse.market.lead" echo="stack" />
        </p>
        <MarketShelfEditor items={items} />
      </div>
    </main>
  );
}

/** The two lists' switch: real links (they work with JavaScript off), the current one on the
 *  lit-gold cap through `aria-current="page"`, 44px chips, named as a pair. */
function ShelfSwitch({ lang, market }: { lang: StaffLang; market: boolean }) {
  return (
    <nav aria-label={sx(lang, "browse.shelf.a11y.switch")} style={shelfRow}>
      <Link
        href="/staff/menu"
        className="staff-chip staff-press"
        aria-current={market ? undefined : "page"}
        style={shelfChip}
      >
        <Chrome lang={lang} k="browse.shelf.menu" />
      </Link>
      <Link
        href="/staff/menu?shelf=market"
        className="staff-chip staff-press"
        aria-current={market ? "page" : undefined}
        style={shelfChip}
      >
        <Chrome lang={lang} k="browse.shelf.market" />
      </Link>
    </nav>
  );
}

/** The studio's view of the catalog: every dish (its photo contained) and every category with its
 *  dish count. A tax category outside the known set reads as hot food — the column CHECK makes it
 *  unreachable, and the picker must show SOME selected value. */
function studioOf(
  dishes: readonly {
    id: string;
    name_en: string;
    name_my: string | null;
    description_en: string | null;
    description_my: string | null;
    category_id: string;
    tax_category: string;
    is_active: boolean;
    image_url: string | null;
    updated_at: string;
    base_price_cents: number;
  }[],
  cats: readonly { id: string; name: string; sort_order: number; is_active: boolean }[],
): { dishes: StudioDish[]; categories: StudioCategory[] } {
  const counts = new Map<string, number>();
  for (const d of dishes) counts.set(d.category_id, (counts.get(d.category_id) ?? 0) + 1);
  return {
    dishes: dishes.map((d) => ({
      id: d.id,
      nameEn: d.name_en,
      nameMy: d.name_my,
      descriptionEn: d.description_en,
      descriptionMy: d.description_my,
      categoryId: d.category_id,
      taxCategory: (TAX_CATEGORIES as readonly string[]).includes(d.tax_category)
        ? (d.tax_category as MenuTaxCategory)
        : "hot_prepared",
      isActive: d.is_active,
      priceCents: d.base_price_cents,
      imageUrl: safeImageUrl(d.image_url),
      updatedAt: d.updated_at,
    })),
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sort_order,
      isActive: c.is_active,
      dishCount: counts.get(c.id) ?? 0,
    })),
  };
}

/** PostgREST's `max_rows` (`supabase/config.toml`): a larger limit would be clamped to it silently,
 *  and the saturation check would then never fire. */
const MARKET_SHELF_CAP = 1000;
const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto" };
const lead: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s6)",
};
const shelfRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--s2)",
  margin: "0 0 var(--s4)",
};
const shelfChip: CSSProperties = { textDecoration: "none" };
