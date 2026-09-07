import { type CSSProperties } from "react";
import { publicClient } from "@mms/db/server";
import { requireStaffPage } from "@/lib/staff";
import { readStaffLang } from "@/lib/staff-lang-server";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { staffHasPin } from "@/lib/staff-pin";
import { Chrome } from "@/components/staff/Chrome";
import { MenuPriceEditor, type PricedItem } from "@/components/staff/MenuPriceEditor";

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
 * P2 — the chrome speaks the device language, and the switch is mounted HERE rather than by
 * `app/staff/layout.tsx`: the layout renders no chrome of its own, because a strip it added would be
 * silently subtracted from every measured surface beneath it. `check-staff-lang.mjs` rule 4 is what
 * holds this surface to the mount.
 */
export default async function StaffMenuPrices() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect
  // that destroys where you were mid-service.
  if (!caller) return <StaffOutageShell what="what.menuPrices" />;
  const hasPin = await staffHasPin(caller.staffId);

  const canEditPrice = caller.role !== "server";
  // Read AFTER the gate: the unknowable-gate branch above renders `StaffOutageShell`, which carries
  // its own control, so the cookie is only needed on the path that renders this page's chrome.
  const lang = await readStaffLang();

  const db = publicClient();
  const { data, error } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,base_price_cents,is_sold_out,sold_out_at,menu_categories(name,sort_order)",
    )
    .eq("is_active", true)
    .order("name_en");
  // A failed read is UNKNOWABLE, not "the menu is empty" — an empty editor would read as a catalog
  // that lost its dishes (W10a: a failure must never render as emptiness).
  if (error) return <StaffOutageShell what="what.menuPrices" />;

  const items: PricedItem[] = (data ?? []).map((i) => ({
    id: i.id,
    nameEn: i.name_en,
    nameMy: i.name_my,
    priceCents: i.base_price_cents,
    category: i.menu_categories?.name ?? "Menu",
    soldOut: !!i.is_sold_out,
    soldOutAt: i.sold_out_at ?? null,
  }));

  return (
    <main className="staff-main" style={wrap}>
      <StaffBar
        lang={lang}
        title={canEditPrice ? "browse.price.title" : "browse.price.titleAvail"}
        lock={hasPin}
      />
      <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 var(--s6)" }}>
        <Chrome
          lang={lang}
          k={canEditPrice ? "browse.price.leadManager" : "browse.price.leadServer"}
          echo="stack"
        />
      </p>
      <MenuPriceEditor items={items} canEditPrice={canEditPrice} />
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto" };
