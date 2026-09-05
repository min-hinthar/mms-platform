import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getStaffOrders } from "@/lib/refunds";
import { StaffOrdersBoard } from "@/components/staff/StaffOrdersBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Orders — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Manager+ orders & refunds (S4.3b). Recent paid orders with a per-line refund (money-OUT) — the captured
 * counterpart to S2.3's open-cart void. Same verified-staff gate as the floor + a MANAGER role floor; a
 * refund itself re-confirms with a self-PIN step-up. Server snapshot (low volume; revalidated on refund).
 */
export default async function OrdersPage() {
  const caller = await requireStaffPage("manager");
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  // (getStaffOrders below throws 503 on an unreadable list — the staff error boundary catches it.)
  if (!caller) return <StaffOutageShell what="what.orders" />;

  const orders = await getStaffOrders();

  return (
    <main style={wrap}>
      <Link href="/staff" style={back}>
        <span aria-hidden>←</span> Floor
      </Link>
      <h1 style={h1}>Orders & refunds</h1>
      <p style={sub}>
        Recent paid orders. Refunding a line returns its price + tax to the card and is logged with
        your name.
      </p>
      <StaffOrdersBoard initial={orders} />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "var(--s5) var(--s4) var(--s8)",
};
const back: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--ac-strong)",
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
};
const h1: CSSProperties = {
  margin: "var(--s3) 0 0",
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h1)",
};
const sub: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "var(--s2) 0 var(--s5)",
};
