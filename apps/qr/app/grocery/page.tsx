"use client";
import { useState } from "react";
import posthog from "posthog-js";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { scanAdd } from "@/lib/grocery";

// Grocery Scan & Go — scan shelf barcodes into a cart, then check out (reuses /cart + Stripe).
// NOTE (M1·P1.1): `scanAdd` is now membership-authorized, so it needs a REAL server-issued grocery
// session/cart (ROADMAP M2·P2.3). Until that lands, the demo's client cart id is rejected by the
// authz guard by design — we surface that honestly instead of crashing.
type Line = { name: string; priceCents: number; ebt: boolean };

export default function Grocery() {
  const [cartId] = useState(() => crypto.randomUUID()); // TODO(M2·P2.3): server-issued grocery session/cart
  const [lines, setLines] = useState<Line[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  async function onScan(code: string) {
    let r;
    try {
      r = await scanAdd(cartId, code);
    } catch {
      // No real grocery session yet (M2·P2.3) → the authz guard rejects the demo cart id.
      setToast("Scan & Go opens with grocery sessions (M2)");
      setTimeout(() => setToast(null), 1800);
      return;
    }
    if (r.ok) {
      setLines((l) => [...l, { name: r.name, priceCents: r.unitPriceCents, ebt: r.ebt }]);
      setToast(`Added ${r.name}${r.ebt ? " · EBT-eligible" : ""}`);
      posthog.capture("grocery_item_scanned", {
        barcode: code,
        item_name: r.name,
        unit_price_cents: r.unitPriceCents,
        ebt_eligible: r.ebt,
        cart_id: cartId,
        cart_size: lines.length + 1,
      });
    } else {
      setToast(r.reason === "weighed_item" ? "Weighed item — see staff" : `Not found: ${code}`);
    }
    setTimeout(() => setToast(null), 1800);
  }

  const totalCents = lines.reduce((a, l) => a + l.priceCents, 0);

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: 20, paddingBottom: 120 }}>
      <p className="eyebrow">Grocery</p>
      <h1 style={{ fontSize: 30 }}>Scan &amp; Go</h1>
      <p style={{ color: "var(--t2)", marginTop: 0 }}>
        Point at a barcode to add it. EBT-eligible items are tagged (SNAP checkout arrives 2027).
      </p>
      <BarcodeScanner onScan={onScan} />
      <ul
        aria-live="polite"
        style={{ listStyle: "none", padding: 0, marginTop: 16, display: "grid", gap: 8 }}
      >
        {lines.map((l, i) => (
          <li
            key={i}
            className="card"
            style={{ display: "flex", justifyContent: "space-between", padding: "10px 13px" }}
          >
            <span>
              {l.name} {l.ebt && <small style={{ color: "var(--ok)", fontWeight: 700 }}>EBT</small>}
            </span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>${(l.priceCents / 100).toFixed(2)}</b>
          </li>
        ))}
        {!lines.length && <li style={{ color: "var(--t3)" }}>Nothing scanned yet.</li>}
      </ul>
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 90,
            transform: "translateX(-50%)",
            background: "var(--tx)",
            color: "var(--pg)",
            padding: "10px 16px",
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          {toast}
        </div>
      )}
      {lines.length > 0 && (
        <a
          href={`/cart?cart=${cartId}`}
          className="card"
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 16,
            maxWidth: 416,
            margin: "0 auto",
            background: "var(--ac)",
            color: "var(--oa)",
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            textDecoration: "none",
            fontWeight: 800,
          }}
          onClick={() =>
            posthog.capture("grocery_checkout_clicked", {
              cart_id: cartId,
              item_count: lines.length,
              total_cents: totalCents,
            })
          }
        >
          <span>Check out · {lines.length} items</span>
          <span>${(totalCents / 100).toFixed(2)}</span>
        </a>
      )}
    </main>
  );
}
