import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getStaffFeedback } from "@/lib/feedback";
import { Card, Icon } from "@mms/ui";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";
import { plural, tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";

export const metadata = { title: "Feedback — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Manager+ feedback triage (M4 P4.3) — the staff side of the UNGATED review loop. Diners rate every order
 * (ungated; the public-review link is offered to all on /track); here a manager sees recent feedback with
 * LOW ratings (≤3) surfaced for recovery. Same verified-staff gate as the floor/approvals + a MANAGER role
 * floor. Read-only (owner-read RLS backs the table); a server snapshot — low volume, no live poll needed.
 */
export default async function FeedbackPage() {
  const caller = await requireStaffPage("manager");
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.feedback" />;

  const lang = await readStaffLang();
  const rows = await getStaffFeedback();
  const lowCount = rows.filter((r) => r.rating <= 3).length;

  return (
    <main style={wrap}>
      <div style={topRow}>
        <Link href="/staff" style={back}>
          {/* The arrow is part of the label and lives INSIDE the dictionary value (`floor.back`), so
              a Burmese console gets "← ခန်းမ" rather than an English word behind a glyph. The
              visible text is an adequate accessible name on its own — no aria-label to keep in sync. */}
          <Chrome lang={lang} k="floor.back" />
        </Link>
        <StaffLangSwitch lang={lang} />
      </div>
      <h1 style={h1}>
        <Chrome lang={lang} k="floor.fb.title" echo="stack" />
      </h1>
      <p style={sub}>
        {rows.length === 0 ? (
          <Chrome lang={lang} k="floor.fb.empty" echo="stack" />
        ) : lowCount > 0 ? (
          <Chrome
            lang={lang}
            k={plural(lowCount, "floor.fb.low.one", "floor.fb.low.many")}
            vars={{ n: lowCount }}
            echo="stack"
          />
        ) : (
          <Chrome lang={lang} k="floor.fb.allGood" echo="stack" />
        )}
      </p>

      {rows.length > 0 && (
        <ul
          role="list"
          // QA §A: a `role="list"` with `list-style: none` needs a name. It has no visible label of
          // its own, so the name is aria-only — `sx()`, never `al()`.
          aria-label={sx(lang, "floor.fb.a11y.list")}
          style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 10 }}
        >
          {rows.map((r) => {
            const low = r.rating <= 3;
            return (
              <Card
                as="li"
                key={r.id}
                style={{ ...rowCard, borderColor: low ? "var(--warn)" : "var(--bd)" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    role="img"
                    // Two runtime counts, so this is `tf` and not `sx` — `sx()` takes no vars. Both
                    // ride count slots, so a Burmese console announces "ကြယ် ၅ ထဲမှ ၄ ကြယ်".
                    aria-label={tf(lang, "floor.fb.a11y.stars", { n: r.rating, total: 5 })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                      color: low ? "var(--warn)" : "var(--ac)",
                    }}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <Icon
                        key={i}
                        name="star"
                        size={15}
                        fill={i < r.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </span>
                  {/* A badge, not a control — echo={false}: two scripts cannot legibly stack in a chip. */}
                  {low && (
                    <span style={followChip}>
                      <Chrome lang={lang} k="floor.fb.followUp" />
                    </span>
                  )}
                  <span
                    style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--t3)" }}
                  >
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {r.comment && (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: "var(--fs-sm)",
                      color: "var(--tx)",
                      lineHeight: 1.5,
                    }}
                  >
                    “{r.comment}”
                  </p>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </main>
  );
}

const wrap: CSSProperties = { padding: 24, maxWidth: 560, margin: "0 auto" };
// The back link and the language control share one row, so the control costs no vertical space on a
// surface whose card list is what a manager actually scans.
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};
const back: CSSProperties = {
  color: "var(--ac)",
  fontWeight: 700,
  display: "inline-block",
  padding: "12px 0",
};
const h1: CSSProperties = {
  fontSize: "var(--fs-h1)",
  fontWeight: 900,
  margin: "4px 0 2px",
  color: "var(--tx)",
};
const sub: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
// Surface comes from `.card` via <Card>; this is layout only (borderColor is overridden per-row).
const rowCard: CSSProperties = {
  padding: "12px 14px",
};
const followChip: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  color: "var(--warn)",
  border: "1px solid var(--warn)",
  borderRadius: 999,
  padding: "2px 8px",
};
