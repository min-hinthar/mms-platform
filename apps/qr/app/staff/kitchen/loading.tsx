import { Skeleton } from "@mms/ui";
import { Chrome } from "@/components/staff/Chrome";
import { ts } from "@/lib/i18n/staff";
import { readStaffLang } from "@/lib/staff-lang-server";

/** Instant skeleton for the KDS — full-bleed Night board: header strip then the ticket grid (matches
 *  the W3 kds-root geometry so the swap to live tickets doesn't jump). The one announced line is the
 *  dictionary's (counter-9), like the counter's skeleton beside it. */
export default async function ConsoleLoading() {
  const lang = await readStaffLang();
  return (
    <main>
      <div className="kds-root dark">
        <span className="sr-only">
          <Chrome lang={lang} k="shell.loading" vars={{ what: ts(lang, "what.kitchen") }} />
        </span>
        <div aria-hidden>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              paddingBottom: 8,
              borderBottom: "1px solid var(--bd)",
              marginBottom: 12,
            }}
          >
            <Skeleton width={110} height={26} radius={8} />
            <Skeleton width={220} height={40} radius={10} />
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
              <Skeleton width={64} height={44} radius={999} />
              <Skeleton width={64} height={44} radius={999} />
              <Skeleton width={120} height={44} radius={999} />
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={240} radius={12} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
