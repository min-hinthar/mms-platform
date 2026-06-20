"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import posthog from "posthog-js";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { scanAdd, searchGroceryItems, type GroceryHit } from "@/lib/grocery";
import { useTableSession } from "@/lib/useTableSession";

// Grocery Scan & Go — scan shelf barcodes (or search by name) into a cart, then check out (reuses
// /cart + Stripe). The cart is now a REAL server-issued Scan & Go session (M2·P2.3): the same
// anon-auth session + member-authorized cart the dine-in/pickup flows use, so `scanAdd` is
// authorized like every other mutation — no more client-minted id the authz guard rejects.
type Line = { name: string; priceCents: number; ebt: boolean };

export default function Grocery() {
  const { session, error: sessionError } = useTableSession("scango");
  const cartId = session?.cartId;

  const [lines, setLines] = useState<Line[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const addedRef = useRef(0); // success count for analytics cart_size — stable across the memoized adder

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GroceryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false); // a failed search ≠ an empty one — say so
  const searchRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // The ONE add path — a scan and a tapped search hit both go through here. Memoized on cartId so the
  // scanner effect (keyed on `onScan`) doesn't tear down + restart the camera on every re-render.
  const add = useCallback(
    async (barcode: string, via: "scan" | "search") => {
      if (!cartId) return;
      let r;
      try {
        r = await scanAdd(cartId, barcode);
      } catch {
        flash("Couldn’t add that — check your connection and try again.");
        return;
      }
      if (r.ok) {
        addedRef.current += 1;
        setLines((l) => [...l, { name: r.name, priceCents: r.unitPriceCents, ebt: r.ebt }]);
        flash(`Added ${r.name}${r.ebt ? " · EBT-eligible" : ""}`);
        posthog.capture("grocery_item_scanned", {
          barcode,
          item_name: r.name,
          unit_price_cents: r.unitPriceCents,
          ebt_eligible: r.ebt,
          cart_id: cartId,
          cart_size: addedRef.current,
          via,
        });
      } else if (r.reason === "weighed_item") {
        flash("Weighed item — see staff");
      } else if (r.reason === "unavailable") {
        flash("Out of stock right now");
      } else {
        flash(`Not found: ${barcode} — try searching by name`);
      }
    },
    [cartId, flash],
  );

  const onScan = useCallback((code: string) => void add(code, "scan"), [add]);

  // Debounced name search. All setState lives in the async timeout callback — never synchronously in
  // the effect body (cascading-render lint). A query under 2 chars clears results without a round-trip;
  // otherwise we fetch 220 ms after the last keystroke.
  useEffect(() => {
    const q = query.trim();
    let active = true;
    const t = window.setTimeout(() => {
      if (!active) return;
      if (q.length < 2) {
        setHits(null);
        setSearchFailed(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      searchGroceryItems(q)
        .then((res) => {
          if (!active) return;
          setHits(res);
          setSearchFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setHits([]);
          setSearchFailed(true); // distinguish a lookup failure from a genuine zero-result search
        })
        .finally(() => active && setSearching(false));
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [query]);

  async function addHit(h: GroceryHit) {
    await add(h.barcode, "search");
    setQuery("");
    setHits(null);
    // Tapping a hit unmounts the result button that held focus — return focus to the search input
    // (the natural place to keep going) so a keyboard / screen-reader diner isn't dropped to <body>.
    searchRef.current?.focus();
  }

  const totalCents = lines.reduce((a, l) => a + l.priceCents, 0);

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: 20, paddingBottom: 120 }}>
      <p className="eyebrow">Grocery</p>
      <h1 style={{ fontSize: 30 }}>Scan &amp; Go</h1>
      <p style={{ color: "var(--t2)", marginTop: 0 }}>
        Point at a barcode to add it. EBT-eligible items are tagged (SNAP checkout arrives 2027).
      </p>

      {sessionError ? (
        <div className="card" role="alert" style={{ padding: 16 }}>
          <p style={{ margin: "0 0 12px", color: "var(--warn)", fontWeight: 600 }}>
            Couldn’t start Scan &amp; Go. Check your connection and try again.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={retryBtn}>
            Retry
          </button>
        </div>
      ) : !cartId ? (
        <p style={{ color: "var(--t2)", fontSize: 14 }}>Starting Scan &amp; Go…</p>
      ) : (
        <>
          <BarcodeScanner onScan={onScan} />

          <div className="card" role="search" style={searchWrap}>
            <span aria-hidden="true">🔍</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search grocery items by name"
              placeholder="Can’t scan it? Search by name…"
              style={searchInput}
            />
          </div>

          {hits !== null && (
            <ul role="list" aria-label="Search results" style={resultList}>
              {searching && hits.length === 0 ? (
                <li style={hintRow}>Searching…</li>
              ) : searchFailed ? (
                <li style={hintRow}>Search unavailable — please try again.</li>
              ) : hits.length === 0 ? (
                <li style={hintRow}>No matches — try fewer letters.</li>
              ) : (
                hits.map((h) => (
                  <li key={h.barcode}>
                    <button type="button" onClick={() => addHit(h)} style={resultBtn}>
                      <span>
                        {h.name}{" "}
                        {h.ebt && (
                          <small style={{ color: "var(--ok)", fontWeight: 700 }}>EBT</small>
                        )}
                      </span>
                      <b style={{ fontVariantNumeric: "tabular-nums" }}>
                        ${(h.unitPriceCents / 100).toFixed(2)}
                      </b>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}

      {/* Scanned lines — NOT a live region: the toast (role="status") announces each add, so one
          live region per view (a second `aria-live` here would double-announce). */}
      <ul
        role="list"
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
        {!lines.length && cartId && <li style={{ color: "var(--t3)" }}>Nothing scanned yet.</li>}
      </ul>

      {toast && (
        <div role="status" style={toastStyle}>
          {toast}
        </div>
      )}

      {lines.length > 0 && cartId && (
        <a
          href={`/cart?cart=${cartId}`}
          className="card"
          style={checkoutCta}
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

const searchWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 13px",
  marginTop: 12,
};
const searchInput: CSSProperties = {
  border: "none",
  background: "none",
  outline: "none",
  flex: 1,
  minHeight: 22,
  color: "var(--tx)",
  fontFamily: "inherit",
  fontSize: 15,
};
const resultList: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "8px 0 0",
  display: "grid",
  gap: 6,
};
const hintRow: CSSProperties = {
  listStyle: "none",
  color: "var(--t3)",
  fontSize: 14,
  padding: "4px 2px",
};
const resultBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 13px",
  background: "var(--cd)",
  border: "1px solid var(--bd)",
  borderRadius: 12,
  color: "var(--tx)",
  fontWeight: 600,
  fontSize: 15,
  textAlign: "left",
  cursor: "pointer",
};
const retryBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 999,
  border: "1.5px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontWeight: 700,
  cursor: "pointer",
};
const toastStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 90,
  transform: "translateX(-50%)",
  background: "var(--tx)",
  color: "var(--pg)",
  padding: "10px 16px",
  borderRadius: 999,
  fontWeight: 700,
  zIndex: 10,
};
const checkoutCta: CSSProperties = {
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
};
