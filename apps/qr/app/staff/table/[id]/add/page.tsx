import { redirect } from "next/navigation";
import { publicClient, serviceClient } from "@mms/db/server";
import { requireStaffPage } from "@/lib/staff";
import { getTableDetail } from "@/lib/floor";
import { OrderPad, type PadCatalog } from "@/components/staff/OrderPad";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { staffHasPin } from "@/lib/staff-pin";
import { requiredChoiceUnavailable, shapeModifierGroups } from "@/lib/menu/modifiers";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";

export const metadata = { title: "Add items — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The ORDER PAD (Phase 2c · pad, DESIGN-LANGUAGE §28) — a server adding to a table, or the counter
 * building a walk-up / phone order, on a tablet or a phone. The page is the pad's APP SHELL: it reads
 * the table (the gate, the outage, the closed and settled exits are unchanged) and the catalog, and
 * hands both to `OrderPad`, which owns the live order from then on.
 *
 * The catalog is the same public-RLS read as the diner menu, WITH the modifier embed and now the
 * category's slug and sort, and it binds its error: an unreadable menu is an OUTAGE the pad says out
 * loud ("the order still works"), never an empty menu that reads as "nothing matches".
 *
 * P2 — the language control reaches this page through `OrderPad` → `StaffBar` (`check-staff-lang`
 * rule 4 walks that import).
 */
export default async function StaffAddItems({ params }: { params: Promise<{ id: string }> }) {
  const caller = await requireStaffPage();
  const { id } = await params;
  // W10b: an unknowable gate/read keeps the URL and renders the outage shell — never a redirect
  // that pretends a verdict (the old `!detail → /staff` bounce fired on outage too).
  if (!caller) return <StaffOutageShell what="what.table" />;
  const hasPin = await staffHasPin(caller.staffId);

  const res = await getTableDetail(id);
  if (res.kind === "outage") return <StaffOutageShell what="what.table" />;
  if (res.kind === "signin") redirect("/staff/login"); // gate race between requireStaffPage and the read
  // The floor BY NAME: a bare `/staff` resolves by the door cookie, and a kitchen door would land a
  // server who was adding to a table on the kitchen board (the tablet fix, applied here too).
  if (res.kind === "closed") redirect(STAFF_DOOR_TARGET.counter);
  const detail = res.detail;
  if (detail.cartId == null) redirect(`/staff/table/${id}`); // settled/no open order — nothing to add to

  // W6a: a counter order is a register-minted (`reg-`) session — table-less by design. It captures
  // the customer name (the expo call-out).
  const counterOrder = detail.label.startsWith("reg-");
  const svc = serviceClient();
  // Advisory: an unread name leaves the field empty (the order still works; the name is optional).
  const { data: cartRow } = counterOrder
    ? await svc.from("qr_carts").select("customer_name").eq("id", detail.cartId).maybeSingle()
    : { data: null };

  const db = publicClient();
  const { data, error } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,base_price_cents,is_sold_out,menu_categories(slug,name,sort_order),item_modifier_groups(modifier_groups(id,slug,name,name_my,selection_type,min_select,max_select,modifier_options(id,slug,name,name_my,price_delta_cents,sort_order,is_active,allergens)))",
    )
    .eq("is_active", true)
    .order("name_en");

  const catalog: PadCatalog =
    error || !data
      ? { kind: "outage" }
      : {
          kind: "ok",
          items: data.map((i) => ({
            id: i.id,
            nameEn: i.name_en,
            nameMy: i.name_my,
            priceCents: i.base_price_cents,
            // Same honesty rule as the diner menu: a required choice with no active options is
            // unaddable — show it sold out rather than a dish whose every add the server refuses.
            soldOut: !!i.is_sold_out || requiredChoiceUnavailable(i.item_modifier_groups),
            category: i.menu_categories?.name ?? "Menu",
            categorySlug: i.menu_categories?.slug ?? "menu",
            categorySort: i.menu_categories?.sort_order ?? 999,
            groups: shapeModifierGroups(i.item_modifier_groups),
          })),
        };

  return (
    // An APP SHELL (§17): the bar on top, the pad's panes scrolling beneath it.
    <main className="staff-main pad-main">
      <OrderPad
        sessionId={id}
        initialDetail={detail}
        catalog={catalog}
        counterOrder={counterOrder}
        initialName={cartRow?.customer_name ?? null}
        hasPin={hasPin}
      />
    </main>
  );
}
