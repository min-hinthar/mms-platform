import Image from "next/image";
import { publicClient } from "@mms/db/server";
import { TableCartProvider } from "@/components/TableCartProvider";
import { AddButton } from "@/components/AddButton";
import { CartBar } from "@/components/CartBar";
import { GuestList } from "@/components/GuestList";
import { PickupSlotChip } from "@/components/PickupSlotChip";

// RSC menu — reads the catalog (`menu_items`) server-side with the ANON/publishable key (gated by
// public-read RLS, least privilege — no service-role on a public render): uuid id, base_price_cents
// (cents), name_en/name_my, category via menu_categories. Images via next/image. Cached → fast TTFB.
export const revalidate = 300;

export default async function Menu({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; t?: string; j?: string }>;
}) {
  // `t` = a scanned table-sticker token (may provision a new table); `j` = the host's invite code
  // (join-only — a wrong code must NOT mint a phantom table). Both are the dine-in session key
  // (M3·P3.1) — every phone with the same code converges on one shared cart.
  const { mode = "scango", t, j } = await searchParams;
  const code = t ?? j;
  const joinOnly = !t && !!j;
  const db = publicClient();
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
    <TableCartProvider mode={mode} code={code} joinOnly={joinOnly}>
      <main style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 96 }}>
        <header
          style={{
            padding: "calc(44px + env(safe-area-inset-top, 0px)) 20px 8px",
            position: "sticky",
            top: 0,
            background: "var(--pg)",
          }}
        >
          <p className="eyebrow">
            {mode === "dinein" ? "Dine-in" : mode === "pickup" ? "Pickup" : "Scan & Go"}
          </p>
          <h1 style={{ fontSize: 34 }}>Menu</h1>
          {mode === "dinein" && <GuestList />}
          {mode === "pickup" && <PickupSlotChip />}
        </header>
        {cats.map((c) => (
          <section key={c} style={{ padding: "8px 20px" }}>
            <h2 style={{ fontSize: 18 }}>{c}</h2>
            <ul
              role="list"
              aria-label={`${c} items`}
              style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}
            >
              {items
                .filter((i) => (i.menu_categories?.name ?? "Menu") === c)
                .map((i) => (
                  <li
                    key={i.id}
                    // card-textured = printed-matter depth (masked dot-grid) behind the row; NOT
                    // card-interactive — the row isn't clickable until R6's item sheet.
                    className="card card-textured"
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
                    <AddButton menuItemId={i.id} name={i.name_en} soldOut={i.is_sold_out} />
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
        <CartBar />
      </main>
    </TableCartProvider>
  );
}
