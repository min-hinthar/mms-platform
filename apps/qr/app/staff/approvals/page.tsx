import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { listPendingApprovals, listRefundsNeeded } from "@/lib/approvals";
import { listApprovers } from "@/lib/voids";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { ApprovalsBoard } from "@/components/staff/ApprovalsBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Approvals — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The manager approvals queue (S2.4) — the deferred sibling of the inline manager-PIN void/comp. Same
 * verified-staff gate as the floor/KDS, plus a MANAGER+ role floor (a server is bounced to the floor):
 * resolving a loss request is a manager decision. The queue is the server-rendered snapshot, kept live by
 * a poll (the audit table is owner-read RLS, so it's not on the realtime publication — see ApprovalsBoard).
 */
export default async function ApprovalsPage() {
  const caller = await requireStaffPage("manager");
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  // (The list reads below throw 503 on an unreadable queue — the staff error boundary catches it.)
  if (!caller) return <StaffOutageShell what="approvals" />;

  const [pending, approvers, refunds] = await Promise.all([
    listPendingApprovals(),
    listApprovers(),
    listRefundsNeeded(),
  ]);

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Approvals
          </p>
          <h1 style={h1}>
            Pending requests <RoleBadge role={caller.role} />
          </h1>
        </div>
        <Link href="/staff" style={backLink}>
          ← Floor
        </Link>
      </header>

      {refunds.length > 0 && (
        <section aria-label="Refunds needed" style={refundsStrip}>
          <p style={refundsHead}>
            <strong>
              {refunds.length} refund{refunds.length === 1 ? "" : "s"} needed
            </strong>{" "}
            — money was taken (or a card hold abandoned) with no order behind it. Refund in Stripe,
            then mark it resolved there.
          </p>
          <ul role="list" style={refundsList}>
            {refunds.map((r) => (
              <li key={r.id} style={refundsRow}>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {r.amountCents != null
                    ? `$${(r.amountCents / 100).toFixed(2)}`
                    : "amount unknown"}
                </span>{" "}
                · {r.reason.replaceAll("_", " ")} ·{" "}
                <code style={{ fontSize: "var(--fs-xs)", overflowWrap: "anywhere" }}>{r.paymentIntent}</code>
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
  border: "1px solid var(--danger, #b3261e)",
  borderRadius: 12,
  padding: "var(--s3) var(--s4)",
  marginBottom: "var(--s4)",
  background: "color-mix(in oklab, var(--danger, #b3261e) 6%, var(--surface))",
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
  padding: "var(--s5) var(--s4) var(--s8)",
};
const header: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s5)",
  flexWrap: "wrap",
};
const h1: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h1)",
  display: "flex",
  alignItems: "center",
  gap: "var(--s3)",
};
const backLink: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--ac-strong)",
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
};
