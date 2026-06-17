"use client";
import { useState } from "react";
import posthog from "posthog-js";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { scanAdd } from "@/lib/grocery";

// Grocery Scan & Go — scan shelf barcodes into a cart, then check out (reuses /cart + Stripe).
// In M2 the cartId comes from a server-issued grocery session; here a demo id is fine.
type Line = { name: string; price: number; ebt: boolean };

export default function Grocery() {
  const [cartId] = useState(() => crypto.randomUUID()); // TODO: server-issued grocery session/cart
  const [lines, setLines] = useState<Line[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  async function onScan(code: string) {
    const r = await scanAdd(cartId, code);
    if (r.ok) {
      setLines((l) => [...l, { name: r.name, price: r.unitPrice, ebt: r.ebt }]);
      setToast(`Added ${r.name}${r.ebt ? " · EBT-eligible" : ""}`);
      posthog.capture("grocery_item_scanned", {
        barcode: code,
        item_name: r.name,
        unit_price: r.unitPrice,
        ebt_eligible: r.ebt,
        cart_id: cartId,
        cart_size: lines.length + 1,
      });
    } else {
      setToast(r.reason === "weighed_item" ? "Weighed item — see staff" : `Not found: ${code}`);
    }
    setTimeout(() => setToast(null), 1800);
  }

  const total = lines.reduce((a, l) => a + l.price, 0);

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
            <b style={{ fontVariantNumeric: "tabular-nums" }}>${l.price.toFixed(2)}</b>
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
              total,
            })
          }
        >
          <span>Check out · {lines.length} items</span>
          <span>${total.toFixed(2)}</span>
        </a>
      )}
    </main>
  );
}
