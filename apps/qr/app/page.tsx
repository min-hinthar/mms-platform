import { ModeCard } from "@/components/ModeCard";
import { JoinTable } from "@/components/JoinTable";
import { HomeHero } from "@/components/HomeHero";

// Entry / mode picker. A scanned table QR deep-links to /menu?mode=dinein&t=<token>; the host's
// invite code deep-links with &j=<code>. Guests without a sticker can also join via <JoinTable/>.
const MODES = [
  ["dinein", "🪑", "Dine-in", "Grab a table, invite friends, order together"],
  ["scango", "🥡", "Scan & Go", "Order and pay now, we bring it out"],
  ["pickup", "🛍️", "Pickup", "Order ahead, pick a time, skip the line"],
] as const;

export default function Entry() {
  return (
    <main
      style={{
        padding: "60px 24px",
        maxWidth: 440,
        margin: "0 auto",
        // Establish a stacking context so the `.home-bg` negative-z layer paints WITHIN main (above body's
        // opaque bg), not escaping to the root context below it — the MenuPageAmbient occlusion gotcha.
        isolation: "isolate",
      }}
    >
      {/* Masked dot-texture backdrop — decorative, fixed, scoped behind main's content (no blur, mobile-safe). */}
      <div className="home-bg" aria-hidden />
      <HomeHero />
      <nav aria-label="Order type" style={{ marginTop: 22, display: "grid", gap: 13 }}>
        {MODES.map(([m, e, n, d], i) => (
          <ModeCard
            key={m}
            mode={m}
            href={`/menu?mode=${m}`}
            emoji={e}
            name={n}
            description={d}
            index={i}
          />
        ))}
      </nav>
      <JoinTable />
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--bd)" }}>
        <ModeCard
          mode="grocery"
          href="/grocery"
          emoji="🛒"
          name="Grocery Scan & Go"
          description="Scan barcodes, pay, walk out"
          index={4}
        />
      </div>
    </main>
  );
}
