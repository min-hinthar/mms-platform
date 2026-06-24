import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth, roleAtLeast } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { getStaffOrders } from "@/lib/refunds";
import { StaffOrdersBoard } from "@/components/staff/StaffOrdersBoard";

export const metadata = { title: "Orders — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Manager+ orders & refunds (S4.3b). Recent paid orders with a per-line refund (money-OUT) — the captured
 * counterpart to S2.3's open-cart void. Same verified-staff gate as the floor + a MANAGER role floor; a
 * refund itself re-confirms with a self-PIN step-up. Server snapshot (low volume; revalidated on refund).
 */
export default async function OrdersPage() {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  if (!roleAtLeast(auth.caller.role, "manager")) redirect("/staff");

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
  fontSize: 14,
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
  fontSize: 26,
};
const sub: CSSProperties = { color: "var(--t2)", fontSize: 14, margin: "var(--s2) 0 var(--s5)" };
