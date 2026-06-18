import Image from "next/image";
import { serviceClient } from "@mms/db/server";

// WORKING RSC menu — reads the shared, delivery-owned catalog (`menu_items`) server-side:
// uuid id, base_price_cents (money in cents), name_en/name_my, category via menu_categories.
// Self-hosted images via next/image (no third-party hotlinking). Cached → fast TTFB.
export const revalidate = 300;

export default async function Menu({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode = "scango" } = await searchParams;
  const db = serviceClient();
  const { data } = await db
    .from("menu_items")
    .select(
      "id,name_en,name_my,base_price_cents,image_url,is_sold_out,menu_categories(name,sort_order)",
    )
    .eq("is_active", true)
    .order("name_en");
  // Typed via @mms/db generated types: the category_id FK is to-one, so `menu_categories` is a
  // single object (or null) — no cast needed.
  const items = data ?? [];

  // Group by category, ordered by the delivery menu's sort_order.
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
    <main style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 96 }}>
      <header
        style={{ padding: "44px 20px 8px", position: "sticky", top: 0, background: "var(--pg)" }}
      >
        <p className="eyebrow">
          {mode === "dinein" ? "Dine-in" : mode === "pickup" ? "Pickup" : "Scan & Go"}
        </p>
        <h1 style={{ fontSize: 34 }}>Menu</h1>
      </header>
      {cats.map((c) => (
        <section key={c} style={{ padding: "8px 20px" }}>
          <h2 style={{ fontSize: 18 }}>{c}</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
            {items
              .filter((i) => (i.menu_categories?.name ?? "Menu") === c)
              .map((i) => (
                <li
                  key={i.id}
                  className="card"
                  style={{
                    display: "flex",
                    gap: 13,
                    padding: 11,
                    opacity: i.is_sold_out ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 14,
                      overflow: "hidden",
                      flex: "none",
                      background: "var(--grad)",
                      position: "relative",
                    }}
                  >
                    {i.image_url && (
                      <Image
                        src={i.image_url}
                        alt=""
                        width={88}
                        height={88}
                        sizes="88px"
                        style={{ objectFit: "cover", width: "100%", height: "100%" }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
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
                    <div style={{ fontWeight: 800, marginTop: 6 }}>
                      ${(i.base_price_cents / 100).toFixed(2)}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {!items.length && (
        <p style={{ padding: 24, color: "var(--t2)" }}>
          No menu rows yet — the shared <code>menu_items</code> catalog is empty.
        </p>
      )}
    </main>
  );
}
