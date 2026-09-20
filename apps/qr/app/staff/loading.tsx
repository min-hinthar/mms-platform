import { Skeleton } from "@mms/ui";
import { Chrome } from "@/components/staff/Chrome";
import { ts } from "@/lib/i18n/staff";
import { readStaffLang } from "@/lib/staff-lang-server";

/**
 * Instant skeleton for the counter's one screen (A4·2) — the page's OWN geometry (counter-9), so
 * the hydrated screen lands where the skeleton stood instead of shifting under a thumb: the staff
 * bar (a circle, the title, the trailing circles), the column at the page's width, the greeting
 * line, then the three zones in the order the page lays them out — a heading with its sub-line
 * over the three arms, a heading over the card grid, a heading over the bag grid. Every gap is the
 * class the live page wears (`.staff-bar` · `.staff-col` · `.staff-zone`) or a `--s*` token.
 *
 * Async for one cheap read: `readStaffLang()` is the memoized cookie (no DB), so the one announced
 * line comes through `<Chrome>` in the console's tongue rather than an English literal.
 */
export default async function StaffLoading() {
  const lang = await readStaffLang();
  return (
    <main className="staff-main">
      <span className="sr-only">
        <Chrome lang={lang} k="shell.loading" vars={{ what: ts(lang, "what.floor") }} />
      </span>
      <div aria-hidden>
        <div className="staff-bar">
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={180} height={30} radius={8} />
          <div className="staff-bar-tail">
            <Skeleton width={44} height={44} radius={999} />
            <Skeleton width={44} height={44} radius={999} />
          </div>
        </div>
        <div className="staff-col" style={{ maxWidth: 1080 }}>
          <Skeleton width={220} height={22} radius={6} style={{ margin: "0 0 var(--s4)" }} />
          {/* 1 · START — heading, sub-line, the three arms */}
          <div className="staff-zone">
            <Skeleton width={150} height={22} radius={6} />
            <Skeleton width={260} height={14} radius={6} />
            <div style={{ display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={132} height={48} radius="var(--r-sm)" />
              ))}
            </div>
          </div>
          {/* 2 · TABLES & COUNTER ORDERS */}
          <div className="staff-zone">
            <Skeleton width={230} height={22} radius={6} />
            <div style={cardGrid}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={118} radius="var(--r-card)" />
              ))}
            </div>
          </div>
          {/* 3 · TO-GO BAGS */}
          <div className="staff-zone">
            <Skeleton width={170} height={22} radius={6} />
            <div style={bagGrid}>
              {[0, 1].map((i) => (
                <Skeleton key={i} height={150} radius="var(--r-card)" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const cardGrid = {
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
} as const;
const bagGrid = {
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
} as const;
