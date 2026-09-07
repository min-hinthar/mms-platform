import { type CSSProperties } from "react";
import { requireStaffPage } from "@/lib/staff";
import { listPendingApprovals, listRefundsNeeded, resolveRefundNeeded } from "@/lib/approvals";
import { listApprovers } from "@/lib/voids";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { ApprovalsBoard } from "@/components/staff/ApprovalsBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { Chrome } from "@/components/staff/Chrome";
import { StaffBar } from "@/components/staff/StaffBar";
import { staffHasPin } from "@/lib/staff-pin";
import { al, sx } from "@/lib/staff-labels";
import { ts } from "@/lib/i18n/staff";
import { plural } from "@/lib/i18n/fill";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Approvals — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The manager approvals queue (S2.4) — the deferred sibling of the inline manager-PIN void/comp. Same
 * verified-staff gate as the floor/KDS, plus a MANAGER+ role floor (a server is bounced to the floor):
 * resolving a loss request is a manager decision. The queue is the server-rendered snapshot, kept live by
 * a poll (the audit table is owner-read RLS, so it's not on the realtime publication — see ApprovalsBoard).
 *
 * P2 — the page speaks the device language. The switch is mounted HERE, in the page's own header,
 * rather than by the layout: `check-staff-lang.mjs` rule 4 deliberately refuses to follow the
 * `StaffOutageShell` import as evidence, because the shell only exists while the ordering system is
 * unreachable and the question the rule asks is whether a manager can change the language on the
 * page they are actually looking at.
 */
export default async function ApprovalsPage() {
  const caller = await requireStaffPage("manager");
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  // (The list reads below throw 503 on an unreadable queue — the staff error boundary catches it.)
  if (!caller) return <StaffOutageShell what="what.approvals" />;
  const hasPin = await staffHasPin(caller.staffId);

  // Next request-memoizes `cookies()`, so this costs one read even though the shell above reads it too.
  const lang = await readStaffLang();
  const [pending, approvers, refunds] = await Promise.all([
    listPendingApprovals(),
    listApprovers(),
    listRefundsNeeded(),
  ]);

  return (
    <main className="staff-main" style={wrap}>
      <StaffBar
        lang={lang}
        title="table.appr.title"
        after={<RoleBadge role={caller.role} />}
        lock={hasPin}
      />

      {refunds.length > 0 && (
        <section aria-label={sx(lang, "table.appr.a11y.refunds")} style={refundsStrip}>
          <p style={refundsHead}>
            <strong>
              <Chrome
                lang={lang}
                k={plural(refunds.length, "table.appr.refunds.one", "table.appr.refunds.many")}
                vars={{ n: refunds.length }}
                echo="inline"
              />
            </strong>{" "}
            <Chrome
              lang={lang}
              k="table.appr.refundsHint"
              vars={{ x: ts(lang, "table.appr.stripe") }}
              echo="stack"
            />
          </p>
          <ul role="list" aria-label={sx(lang, "table.appr.a11y.refundsList")} style={refundsList}>
            {refunds.map((r) => (
              <li key={r.id} style={refundsRow}>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {r.amountCents != null ? (
                    `$${(r.amountCents / 100).toFixed(2)}`
                  ) : (
                    <Chrome lang={lang} k="table.appr.amountUnknown" />
                  )}
                </span>{" "}
                {/* ⚠️ `r.reason` is the RAW `qr_refunds_needed.reason` column with its underscores
                    swapped for spaces — a database status key printed to a manager, which is the
                    OPEN-ITEMS P2g shape (a raw key where a label belongs). It is NOT localized here
                    on purpose: guessing a Burmese word per undeclared code would invent a label,
                    and the fix is a `what.*`-style key map over the column's real domain. Filed. */}
                · {r.reason.replaceAll("_", " ")} ·{" "}
                <code style={{ fontSize: "var(--fs-xs)", overflowWrap: "anywhere" }}>
                  {r.paymentIntent}
                </code>
                <form
                  action={async () => {
                    "use server";
                    await resolveRefundNeeded(r.id);
                  }}
                  style={{ display: "inline-block", marginLeft: 8 }}
                >
                  {/* Every row shows the same two words, so the visible label alone names nothing —
                      the name carries the payment intent, which is what the manager matches against
                      the processor.

                      ⚠️ THIS COMMENT USED TO SAY 2.5.3 "holds by construction (guard rule 3c)", and
                      that was FALSE under `lang="my"`: rule 3c compares the KEY on the attribute
                      with a key in the children, and is structurally blind to what `<Chrome>`
                      EMITS — which with an echo is two visible strings, while `al()` composed its
                      name from one. The button showed `ခွင့်ပြု` and `Approve` and announced only
                      the Burmese half. What holds it now is `al()` taking the same `echo` this
                      button renders and composing through `chromeVisible()`, plus rule 3c comparing
                      the two echoes, plus a test that mounts the control and reads its text. */}
                  <button
                    type="submit"
                    style={resolveBtn}
                    aria-label={
                      al(lang, {
                        kind: "verb",
                        echo: "stack",
                        verb: "table.appr.verb.markRefunded",
                        subject: r.paymentIntent,
                      }).aria
                    }
                  >
                    <Chrome lang={lang} k="table.appr.verb.markRefunded" echo="stack" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ApprovalsBoard initial={pending} approvers={approvers} />
    </main>
  );
}

const refundsStrip: CSSProperties = {
  // The staff boards' existing warn pair — theme-aware, per the tokens-never-hex rule (the first draft
  // referenced a --danger token that does not exist, resolving to one hardcoded red in both themes).
  border: "1px solid var(--warn)",
  borderRadius: 12,
  padding: "var(--s3) var(--s4)",
  marginBottom: "var(--s4)",
  background: "var(--warnb)",
};
const resolveBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: 10,
  border: "1px solid var(--warn)",
  background: "transparent",
  color: "var(--warn)",
  fontWeight: 700,
  cursor: "pointer",
};
const refundsHead: CSSProperties = { margin: 0, marginBottom: 8 };
const refundsList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 6,
};
const refundsRow: CSSProperties = { fontSize: "var(--fs-sm)" };

const wrap: CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
};
// The language control and the way out share the header's trailing corner. Wrapping so a Burmese
// switch plus the back link never squeeze the title on a narrow tablet.
