import Image from "next/image";
import { serviceClient } from "@mms/db/server";

// WORKING RSC menu — reads the shared menu (the delivery app's menu_items) server-side.
// Self-hosted images via next/image (no third-party hotlinking). Static data → fast TTFB.
export const revalidate = 300;

type MenuRow = {
  id: string; name: string; name_my: string | null; price: number;
  category: string; image_url: string | null; diet: string[] | null;
};

export default async function Menu({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode = "scango" } = await searchParams;
  const db = serviceClient();
  const { data } = await db
    .from("menu_items")
    .select("id,name,name_my,price,category,image_url,diet")
    .eq("available", true)
    .order("category");
  const items = (data ?? []) as MenuRow[];
  const cats = [...new Set(items.map((i) => i.category))];

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 96 }}>
      <header style={{ padding: "44px 20px 8px", position: "sticky", top: 0, background: "var(--pg)" }}>
        <p className="eyebrow">{mode === "dinein" ? "Dine-in" : mode === "pickup" ? "Pickup" : "Scan & Go"}</p>
        <h1 style={{ fontSize: 34 }}>Menu</h1>
      </header>
      {cats.map((c) => (
        <section key={c} style={{ padding: "8px 20px" }}>
          <h2 style={{ fontSize: 18 }}>{c}</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
            {items.filter((i) => i.category === c).map((i) => (
              <li key={i.id} className="card" style={{ display: "flex", gap: 13, padding: 11 }}>
                <div style={{ width: 88, height: 88, borderRadius: 14, overflow: "hidden", flex: "none", background: "var(--grad)", position: "relative" }}>
                  {i.image_url && (
                    <Image src={i.image_url} alt="" width={88} height={88} sizes="88px" style={{ objectFit: "cover", width: "100%", height: "100%" }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{i.name}</div>
                  {i.name_my && <div style={{ fontFamily: "var(--font-my)", fontSize: 12, color: "var(--t2)" }} lang="my">{i.name_my}</div>}
                  <div style={{ fontWeight: 800, marginTop: 6 }}>${i.price.toFixed(2)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!items.length && <p style={{ padding: 24, color: "var(--t2)" }}>No menu rows yet — apply the migration and seed <code>menu_items</code>.</p>}
    </main>
  );
}
