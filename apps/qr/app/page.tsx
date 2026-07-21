import { ModeCard } from "@/components/ModeCard";
import { TogoDoor } from "@/components/TogoDoor";
import { JoinTable } from "@/components/JoinTable";
import { HomeHero } from "@/components/HomeHero";
import { HomeResumeCard } from "@/components/HomeResumeCard";
import { HomeSessionCard } from "@/components/HomeSessionCard";

// Entry — the house's three doors (K1, Journey II): Dine-in · To-go · Grocery. The internal mode
// values (dinein|scango|pickup — a DB CHECK) do NOT migrate; presentation moves, plumbing stays.
// To-go is one door with Now/Schedule decided inside it (see TogoDoor). Grocery is a first-class
// peer door (no longer a separated afterthought). The `door` param rides to the menu → session mint
// (K0) so the three-door IA stays funnel-able even where two doors share an internal mode. A scanned
// table sticker still deep-links straight past this to /menu?mode=dinein&t=<token>.
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
      {/* When a live order exists, lead with a way back to its tracker (client-gated; renders nothing otherwise). */}
      <HomeResumeCard />
      {/* W5a — live PRE-payment state (an open table, a basket in progress): the session-level
          resume the order card can't see. Renders nothing when there's nothing to resume. */}
      <HomeSessionCard />
      <nav
        aria-label="Order type"
        style={{ marginTop: "var(--s6)", display: "grid", gap: "var(--s3)" }}
      >
        {/* Indices continue HomeHero's stagger wave (40/100/160 → wordmark 90 → doors 210/280/350ms). */}
        <ModeCard
          mode="dinein"
          door="dinein"
          href="/dine-in"
          emoji="🪑"
          name="Dine-in"
          my="ဆိုင်တွင်စားရန်"
          description="Pick your table, invite friends, order together"
          index={3}
        />
        <TogoDoor index={4} />
        <ModeCard
          mode="grocery"
          door="grocery"
          href="/grocery"
          emoji="🛒"
          name="Grocery"
          my="ကုန်စုံဝယ်ရန်"
          description="Scan barcodes, pay, walk out"
          index={5}
        />
      </nav>
      <JoinTable />
    </main>
  );
}
