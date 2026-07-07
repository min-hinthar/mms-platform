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
        // Spacing from the token grid (--s*), not off-grid magic numbers (rubric #4).
        padding: "var(--s15) var(--s6)",
        maxWidth: "var(--w-content)",
        margin: "0 auto",
        // Establish a stacking context so the `.home-bg` negative-z layer paints WITHIN main (above body's
        // opaque bg), not escaping to the root context below it — the MenuPageAmbient occlusion gotcha.
        isolation: "isolate",
      }}
    >
      {/* Masked dot-texture backdrop — decorative, fixed, scoped behind main's content (no blur, mobile-safe). */}
      <div className="home-bg" aria-hidden />
      <HomeHero />
      <nav
        aria-label="Order type"
        style={{ marginTop: "var(--s6)", display: "grid", gap: "var(--s3)" }}
      >
        {MODES.map(([m, e, n, d], i) => (
          <ModeCard
            key={m}
            mode={m}
            href={`/menu?mode=${m}`}
            emoji={e}
            name={n}
            description={d}
            // Offset past HomeHero's header lines (40/100/160ms) so the whole page reads as ONE stagger wave.
            index={i + 3}
          />
        ))}
      </nav>
      <JoinTable />
      <div
        style={{
          marginTop: "var(--s5)",
          paddingTop: "var(--s4)",
          borderTop: "1px solid var(--bd)",
        }}
      >
        <ModeCard
          mode="grocery"
          href="/grocery"
          emoji="🛒"
          name="Grocery Scan & Go"
          description="Scan barcodes, pay, walk out"
          // Tail of the single stagger wave: header 40/100/160 → mode cards 210/280/350 → grocery 420ms.
          index={6}
        />
      </div>
    </main>
  );
}
