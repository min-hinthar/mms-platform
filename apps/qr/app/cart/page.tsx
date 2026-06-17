// STUB — cart + checkout. Renders the SERVER-AUTHORITATIVE totals from getCartTotals()
// (never client math), the SB-1524 service-charge disclosure, per-person split (group),
// promo input (server-validated via applyPromo), then mounts the Stripe Payment Element
// against /api/stripe/create-intent. See lib/cart.ts + the Stripe routes.
import { getCartTotals } from "@/lib/cart";

export default async function Cart({ searchParams }: { searchParams: Promise<{ cart?: string }> }) {
  const { cart } = await searchParams;
  const totals = cart ? await getCartTotals(cart) : null;
  return (
    <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
      <h1>Your order</h1>
      {totals ? (
        <dl style={{ marginTop: 12 }}>
          <Row k="Subtotal" v={totals.subtotal} />
          {totals.discount > 0 && <Row k="Promo" v={-totals.discount} />}
          <Row k="Service charge (5%)" v={totals.serviceCharge} />
          <Row k="Sales tax" v={totals.tax} />
          <Row k="Total" v={totals.total} strong />
        </dl>
      ) : (
        <p style={{ color: "var(--t2)" }}>
          Pass <code>?cart=&lt;id&gt;</code>; M1 wires the Payment Element here.
        </p>
      )}
      <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 12 }}>
        A 5% service charge supports fair kitchen wages and is shared with the team (CA SB-1524).
        Card fees are in menu prices; we never surcharge debit.
      </p>
    </main>
  );
}
function Row({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 0",
        fontWeight: strong ? 800 : 400,
      }}
    >
      <dt>{k}</dt>
      <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>${v.toFixed(2)}</dd>
    </div>
  );
}
