import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { publicClient } from "@mms/db/server";
import { requireStaffPage } from "@/lib/staff";
import { getTableDetail } from "@/lib/floor";
import { StaffAddButton } from "@/components/staff/StaffAddButton";

export const metadata = { title: "Add items — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff "order for a guest" menu (S1.3) — the same public-RLS catalog read as the diner menu, but each
 * row adds to THIS table's open cart via staffAddItem (server re-derives the price). Staff + lock gated.
 * If the table is closed or already settled (no open cart) there's nothing to add to → bounce to the
 * drill-down, which shows the honest state.
 */
export default async function StaffAddItems({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();

  const { id } = await params;
  const detail = await getTableDetail(id);
  if (!detail) redirect("/staff");
  if (detail.cartId == null) redirect(`/staff/table/${id}`); // settled/no open order — nothing to add to

  const db = publicClient();
  const { data } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,base_price_cents,image_url,is_sold_out,menu_categories(name,sort_order)",
    )
    .eq("is_active", true)
    .order("name_en");
  const items = data ?? [];
  const cats = [...new Map(items.map((i) => [i.menu_categories?.name ?? "Menu", i])).keys()].sort(
    (a, b) => {
      const sa = items.find((i) => (i.menu_categories?.name ?? "Menu") === a)?.menu_categories
        ?.sort_order;
      const sb = items.find((i) => (i.menu_categories?.name ?? "Menu") === b)?.menu_categories
        ?.sort_order;
      return (sa ?? 999) - (sb ?? 999);
    },
  );

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
        <Link href={`/staff/table/${id}`} style={back}>
          ← Table {detail.label}
        </Link>
        <h1 style={{ fontSize: 24, margin: "var(--s3) 0 0" }}>Add items</h1>
        <p style={{ color: "var(--t2)", fontSize: 14, margin: "4px 0 0" }}>
          Ordering for table {detail.label}. Tap to add — it lands on the table’s order instantly.
        </p>
      </header>

      {cats.map((c) => (
        <section key={c} style={{ padding: "var(--s4) 0" }}>
          <h2 style={{ fontSize: 17, margin: "0 0 var(--s3)" }}>{c}</h2>
          <ul
            role="list"
            aria-label={`${c} items`}
            style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}
          >
            {items
              .filter((i) => (i.menu_categories?.name ?? "Menu") === c)
              .map((i) => (
                <li
                  key={i.id}
                  className="card card-textured"
                  style={{ ...rowCard, opacity: i.is_sold_out ? 0.55 : 1 }}
                >
                  <div style={thumb}>
                    {i.image_url && (
                      <Image
                        src={i.image_url}
                        alt=""
                        width={64}
                        height={64}
                        sizes="64px"
                        style={img}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      {i.name_en}
                      {i.is_sold_out && (
                        <span style={{ color: "var(--t3)", fontWeight: 400 }}> · Sold out</span>
                      )}
                    </div>
                    {i.name_my && (
                      <div
                        style={{ fontFamily: "var(--font-my)", fontSize: 12, color: "var(--t2)" }}
                        lang="my"
                      >
                        {i.name_my}
                      </div>
                    )}
                    <div style={{ fontWeight: 800, marginTop: 4 }}>
                      ${(i.base_price_cents / 100).toFixed(2)}
                    </div>
                  </div>
                  <StaffAddButton
                    sessionId={id}
                    menuItemId={i.id}
                    name={i.name_en}
                    soldOut={i.is_sold_out}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}
      {!items.length && (
        <p style={{ padding: "var(--s5) 0", color: "var(--t2)" }}>The menu catalog is empty.</p>
      )}
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
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};
const rowCard: CSSProperties = { display: "flex", gap: 12, padding: 10, alignItems: "center" };
const thumb: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 12,
  overflow: "hidden",
  flex: "none",
  background: "var(--grad)",
  position: "relative",
};
const img: CSSProperties = { objectFit: "cover", width: "100%", height: "100%" };
