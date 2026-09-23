import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, EmptyState, Icon, PageMasthead } from "@mms/ui";
import { KitDemos } from "./KitDemos";

/**
 * Phase 0 — /kit, the primitives reference. Every `@mms/ui` interaction primitive in every variant,
 * on the real tokens, so a design change is reviewed on ONE page in light and Night (the theme
 * follows the OS, like every page) instead of hunted across twenty screens. It is the review surface
 * for visual PRs: open it on the Vercel preview, flip the OS theme.
 *
 * Never on the production host: a guest who wanders here gets the 404. `VERCEL_ENV` is `preview` on
 * PR deployments (where this page earns its keep) and unset locally.
 */
export const metadata: Metadata = {
  title: "Kit",
  robots: { index: false, follow: false },
};

export default function KitPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <main className="page-col" style={{ padding: "var(--s6) var(--s5) var(--s15)" }}>
      <PageMasthead
        kicker="Design system"
        kickerMark
        title="The kit"
        titleMy="ဒီဇိုင်း စနစ်"
        lede="Every shared primitive, on the live tokens. Flip your system theme to review Night."
      />

      <KitSection title="Buttons" note="One primary per section. 44px is the floor at every size.">
        <KitDemos part="buttons" />
      </KitSection>

      <KitSection title="Toast" note="One placement, one live region, an optional undo.">
        <KitDemos part="toast" />
      </KitSection>

      <KitSection title="Field" note="Label, control, one note line — the hint or the error.">
        <KitDemos part="field" />
      </KitSection>

      <KitSection title="Badges" note="Semantic tones carry the AA mapping.">
        <div style={row}>
          <Badge tone="accent">Most ordered</Badge>
          <Badge tone="gold">✦ 5 Stars</Badge>
          <Badge tone="jade">Vegan</Badge>
          <Badge tone="ok">Paid</Badge>
          <Badge tone="warn">Needs a manager</Badge>
          <Badge tone="neutral" bordered>
            Table 5
          </Badge>
        </div>
      </KitSection>

      <KitSection title="Empty states" note="Card inside a named region; page when it IS the page.">
        <div style={{ display: "grid", gap: "var(--s4)" }}>
          <EmptyState title="All clear" subtitle="New tickets land here the moment they're sent." />
          <EmptyState
            tone="error"
            title="Couldn't load the queue"
            subtitle="It's on us, not your connection."
          />
          <EmptyState
            layout="page"
            titleAs="h3"
            icon={<Icon name="receipt" size={28} />}
            title="Your order is empty"
            subtitle="Pick how you're ordering and your dishes will show up here."
            action={<KitDemos part="empty-action" />}
          />
        </div>
      </KitSection>

      <KitSection title="Type" note="The scale, the weights, the tracking — tokens, never numbers.">
        <div style={{ display: "grid", gap: "var(--s2)" }}>
          {(
            [
              ["--fs-display", "Mingalaba"],
              ["--fs-h1", "Which table are you at?"],
              ["--fs-h2", "Your order"],
              ["--fs-h3", "Style"],
              ["--fs-body", "Rice vermicelli with pork and a soft egg."],
              ["--fs-lead", "A card's supporting line."],
              ["--fs-label", "Control label"],
              ["--fs-sm", "Meta · 2 min ago"],
              ["--fs-caption", "Chip caption"],
              ["--fs-xs", "EYEBROW"],
            ] as const
          ).map(([token, sample]) => (
            <div key={token} style={typeRow}>
              <code style={code}>{token}</code>
              <span
                style={{
                  fontSize: `var(${token})`,
                  fontFamily:
                    token.startsWith("--fs-h") || token === "--fs-display"
                      ? "var(--font-display)"
                      : undefined,
                  fontWeight: "var(--fw-semibold)",
                  lineHeight: "var(--lh-snug)",
                }}
              >
                {sample}
              </span>
            </div>
          ))}
        </div>
      </KitSection>
    </main>
  );
}

function KitSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: "var(--s10)" }} aria-labelledby={`kit-${title}`}>
      <h2 id={`kit-${title}`} style={{ fontSize: "var(--fs-h2)", margin: 0 }}>
        {title}
      </h2>
      <p
        style={{ margin: "var(--s1) 0 var(--s4)", color: "var(--t2)", fontSize: "var(--fs-label)" }}
      >
        {note}
      </p>
      {children}
    </section>
  );
}

const row = { display: "flex", flexWrap: "wrap", gap: "var(--s2)" } as const;
const typeRow = {
  display: "grid",
  gridTemplateColumns: "7.5rem 1fr",
  alignItems: "baseline",
  gap: "var(--s3)",
} as const;
const code = { fontSize: "var(--fs-caption)", color: "var(--t3)" } as const;
