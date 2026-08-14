import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { publicClient, serviceClient } from "@mms/db/server";
import { requireStaffPage } from "@/lib/staff";
import { getTableDetail } from "@/lib/floor";
import { StaffMenuBrowser, type StaffMenuItem } from "@/components/staff/StaffMenuBrowser";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { requiredChoiceUnavailable, shapeModifierGroups } from "@/lib/menu/modifiers";

export const metadata = { title: "Add items — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The staff order screen (S1.3, grown up in W6a): the same public-RLS catalog read as the diner menu —
 * now WITH the modifier embed — searched and filtered client-side, adding to THIS session's open cart
 * via staffAddItem (server re-derives the price, cardinality enforced). Counter (`reg-`) orders get a
 * name-capture strip; the header speaks "table" only when there is one.
 */
export default async function StaffAddItems({ params }: { params: Promise<{ id: string }> }) {
  const caller = await requireStaffPage();
  const { id } = await params;
  // W10b: an unknowable gate/read keeps the URL and renders the outage shell — never a redirect
  // that pretends a verdict (the old `!detail → /staff` bounce fired on outage too).
  if (!caller) return <StaffOutageShell what="this table" />;

  const res = await getTableDetail(id);
  if (res.kind === "outage") return <StaffOutageShell what="this table" />;
  if (res.kind === "signin") redirect("/staff/login"); // gate race between requireStaffPage and the read
  if (res.kind === "closed") redirect("/staff");
  const detail = res.detail;
  if (detail.cartId == null) redirect(`/staff/table/${id}`); // settled/no open order — nothing to add to

  // W6a: a counter order is a register-minted (`reg-`) session — table-less by design. Its header and
  // back-link speak the counter's language, and it captures the customer name (the expo call-out).
  const counterOrder = detail.label.startsWith("reg-");
  const svc = serviceClient();
  const { data: cartRow } = counterOrder
    ? await svc.from("qr_carts").select("customer_name").eq("id", detail.cartId).maybeSingle()
    : { data: null };

  const db = publicClient();
  const { data } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,base_price_cents,image_url,is_sold_out,menu_categories(name,sort_order),item_modifier_groups(modifier_groups(id,slug,name,name_my,selection_type,min_select,max_select,modifier_options(id,slug,name,name_my,price_delta_cents,sort_order,is_active,allergens)))",
    )
    .eq("is_active", true)
    .order("name_en");
  const raw = data ?? [];

  const items: StaffMenuItem[] = raw.map((i) => ({
    id: i.id,
    nameEn: i.name_en,
    nameMy: i.name_my,
    priceCents: i.base_price_cents,
    imageUrl: i.image_url,
    // Same honesty rule as the diner menu: a required choice with no active options is unaddable —
    // show it sold-out rather than an item whose every add the server refuses.
    soldOut: !!i.is_sold_out || requiredChoiceUnavailable(i.item_modifier_groups),
    category: i.menu_categories?.name ?? "Menu",
    groups: shapeModifierGroups(i.item_modifier_groups),
  }));
  const categories = [
    ...new Map(
      raw.map((i) => [i.menu_categories?.name ?? "Menu", i.menu_categories?.sort_order ?? 999]),
    ).entries(),
  ]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  const backLabel = counterOrder ? "Register" : `Table ${detail.label}`;
  const backHref = counterOrder ? "/staff/register" : `/staff/table/${id}`;

  return (
    <main style={wrap}>
      <header
        style={{
          position: "sticky",
          top: 0,
          background: "var(--pg)",
          // clear the iOS notch under viewport-fit=cover — sticky top:0 pins to the true viewport top
          padding: "calc(8px + env(safe-area-inset-top, 0px)) 0 10px",
          // token scale: must exceed the textured rows' children (z1 via .card-textured > *), or the
          // rows would paint over the pinned header (same z, later in DOM wins)
          zIndex: "var(--z-toolbar)" as CSSProperties["zIndex"],
        }}
      >
        <Link href={backHref} style={back}>
          ← {backLabel}
        </Link>
        <h1 style={{ fontSize: "var(--fs-h1)", margin: "var(--s3) 0 0" }}>
          {counterOrder ? "Counter order" : "Add items"}
        </h1>
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "4px 0 0" }}>
          {counterOrder
            ? "Walk-up or phone order — review and settle from the order page."
            : `Ordering for table ${detail.label}. Tap to add — it lands on the table’s order instantly.`}
        </p>
        {counterOrder && (
          <Link href={`/staff/table/${id}`} style={reviewLink}>
            Review order & settle →
          </Link>
        )}
      </header>

      <StaffMenuBrowser
        sessionId={id}
        items={items}
        categories={categories}
        counterOrder={counterOrder}
        initialName={cartRow?.customer_name ?? null}
      />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "var(--s5) var(--s6) 96px",
};
const back: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  textDecoration: "none",
};
const reviewLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac-strong)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  textDecoration: "none",
};
