import { ModeCard } from "@/components/ModeCard";

// Entry / mode picker. A scanned table QR can deep-link to /menu?mode=dinein&table=12.
const MODES = [
  ["dinein", "🪑", "Dine-in", "Grab a table, invite friends, order together"],
  ["scango", "🥡", "Scan & Go", "Order and pay now, we bring it out"],
  ["pickup", "🛍️", "Pickup", "Order ahead, pick a time, skip the line"],
] as const;

export default function Entry() {
  return (
    <main style={{ padding: "60px 24px", maxWidth: 440, margin: "0 auto" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 50 }} aria-hidden>
          ☕
        </div>
        <p className="eyebrow">Mandalay Morning Star</p>
        <h1 style={{ fontSize: 30, margin: "6px 0 2px" }}>Good morning</h1>
        <p style={{ color: "var(--t2)", margin: 0 }}>How would you like to order?</p>
      </div>
      <nav aria-label="Order type" style={{ marginTop: 22, display: "grid", gap: 13 }}>
        {MODES.map(([m, e, n, d]) => (
          <ModeCard key={m} mode={m} href={`/menu?mode=${m}`} emoji={e} name={n} description={d} />
        ))}
      </nav>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--bd)" }}>
        <ModeCard
          mode="grocery"
          href="/grocery"
          emoji="🛒"
          name="Grocery Scan & Go"
          description="Scan barcodes, pay, walk out"
        />
      </div>
    </main>
  );
}
