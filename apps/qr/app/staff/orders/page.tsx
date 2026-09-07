import { type CSSProperties } from "react";
import { requireStaffPage } from "@/lib/staff";
import { getStaffOrders } from "@/lib/refunds";
import { StaffOrdersBoard } from "@/components/staff/StaffOrdersBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { Chrome } from "@/components/staff/Chrome";
import { StaffBar } from "@/components/staff/StaffBar";
import { staffHasPin } from "@/lib/staff-pin";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Orders — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Manager+ orders & refunds (S4.3b). Recent paid orders with a per-line refund (money-OUT) — the captured
 * counterpart to S2.3's open-cart void. Same verified-staff gate as the floor + a MANAGER role floor; a
 * refund itself re-confirms with a self-PIN step-up. Server snapshot (low volume; revalidated on refund).
 *
 * P2 — the page chrome speaks the device language and mounts the switch in its own top row. The
 * BOARD's copy below is still English this slice (OPEN-ITEMS P2c); only its two list names are
 * localized, so the switch here is not a promise the board keeps yet.
 */
export default async function OrdersPage() {
  const caller = await requireStaffPage("manager");
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  // (getStaffOrders below throws 503 on an unreadable list — the staff error boundary catches it.)
  if (!caller) return <StaffOutageShell what="what.orders" />;
  const hasPin = await staffHasPin(caller.staffId);

  // Next request-memoizes `cookies()`, so this costs one read even though the layout read it too.
  const lang = await readStaffLang();
  const orders = await getStaffOrders();

  return (
    <main className="staff-main" style={wrap}>
      <StaffBar lang={lang} title="floor.orders.title" lock={hasPin} />
      <p style={sub}>
        <Chrome lang={lang} k="floor.orders.sub" echo="stack" />
      </p>
      <StaffOrdersBoard initial={orders} />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
};
const sub: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "var(--s2) 0 var(--s5)",
};
