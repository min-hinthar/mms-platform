"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useJourneyRouter } from "@/components/nav/TransitionNav"; // J1 journey grammar
import posthog from "posthog-js";
import { NumberFlow } from "@mms/ui";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import {
  scanAdd,
  searchGroceryItems,
  getGroceryLines,
  type GroceryHit,
  type GroceryLine,
} from "@/lib/grocery";
import { setQty } from "@/lib/cart";
import { useTableSession } from "@/lib/useTableSession";

// Grocery Scan & Go — scan shelf barcodes (or search by name) into a cart, then check out (reuses
// /cart + Stripe). K5 (Journey II): the list renders the CART's truth — hydrated from the server on
// mount and on tab re-focus, reconciled from every scan's own returned view — fixing the live
// money-display bug where a refresh showed "Nothing scanned yet" while the server cart still held
// (and would charge) the items. Product-grade rows: photo, EBT tag, qty steppers on CART-LINE ids
// (the existing setQty path — no new money surface), line totals.

export default function Grocery() {
  const router = useRouter(); // prefetch only — the checkout push rides the journey grammar
  const journey = useJourneyRouter(); // J1: grocery→cart is a FORWARD cut
  const { session, error: sessionError } = useTableSession("scango", { door: "grocery" });
  const cartId = session?.cartId;

  const [lines, setLines] = useState<GroceryLine[]>([]);
  const [hydrated, setHydrated] = useState(false); // first server read landed → empty state is TRUE
  const [toast, setToast] = useState<string | null>(null);
  const addedRef = useRef(0); // success count for analytics cart_size — stable across the memoized adder
  const [busyLine, setBusyLine] = useState<string | null>(null); // one in-flight stepper op at a time

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GroceryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false); // a failed search ≠ an empty one — say so
  const searchRef = useRef<HTMLInputElement>(null);

  // ONE toast timer, cancelled before each re-arm — scanning is rapid-fire, so racing independent timers
  // could blank a fresh notice (incl. an error like "Weighed item — see staff") ~100 ms after it appears.
  // Mirrors TableCartProvider's flash discipline (the grocery page predated it).
  const toastTimer = useRef<number | null>(null);
  const flash = useCallback((msg: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Warm /cart so tapping "Check out" navigates without a cold server round-trip (matches CartBar).
  useEffect(() => {
    if (cartId) router.prefetch(`/cart?cart=${encodeURIComponent(cartId)}`);
  }, [cartId, router]);

  // K5 — hydrate from the CART (the truth) on session-ready and on tab re-focus (the J3 freshness
  // pattern): a refresh or a backgrounded phone never hides items the cart will charge. Deliberate
  // read-only swallow: a transient failure keeps the last-known list; the next scan/focus re-syncs.
  useEffect(() => {
    if (!cartId) return;
    let active = true;
    const sync = () =>
      void getGroceryLines(cartId)
        .then((ls) => {
          if (!active) return;
          setLines(ls);
          setHydrated(true);
        })
        .catch(() => {});
    sync();
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cartId]);

  // K5 — stepper on the CART LINE (setQty is the same guarded money path the menu uses; qty 0
  // removes). Optimistic flip, then reconcile from a fresh server read; a refused write (locked/
  // settling/raced) snaps back to truth the same way.
  const stepQty = useCallback(
    async (line: GroceryLine, nextQty: number) => {
      if (!cartId || busyLine) return;
      setBusyLine(line.lineId);
      setLines((cur) =>
        nextQty <= 0
          ? cur.filter((l) => l.lineId !== line.lineId)
          : cur.map((l) => (l.lineId === line.lineId ? { ...l, qty: nextQty } : l)),
      );
      flash(nextQty <= 0 ? `Removed ${line.name}` : `${line.name} × ${nextQty}`);
      try {
        await setQty(line.lineId, nextQty);
      } catch {
        flash("Couldn’t update that — try again.");
      } finally {
        try {
          setLines(await getGroceryLines(cartId));
        } catch {
          /* keep optimistic view; next scan/focus re-syncs */
        }
        setBusyLine(null);
      }
    },
    [cartId, busyLine, flash],
  );

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
        // The scan's OWN response carries the fresh server view (one round trip, the addItem
        // pattern) — the list is cart truth, not a parallel client ledger.
        setLines(r.lines);
        setHydrated(true);
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

  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  const totalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0);

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

      {/* J6 — the GIANT running total: scan-and-go's one number, big enough to read at arm's length
          while the other hand scans. Presentation of the same client-side sum the checkout CTA
          carries (display only — the charge is re-derived server-side at checkout, as everywhere);
          NOT a live region (the toast announces each add; the CTA's label carries the total for AT). */}
      {lines.length > 0 && (
        <div className="grocery-total mms-rise" aria-hidden>
          <span className="grocery-total-label">Running total</span>
          <span className="grocery-total-figure">
            <NumberFlow value={totalCents / 100} format={{ style: "currency", currency: "USD" }} />
          </span>
        </div>
      )}

      {/* Scanned lines — NOT a live region: the toast (role="status") announces each add, so one
          live region per view (a second `aria-live` here would double-announce). */}
      <ul
        role="list"
        style={{ listStyle: "none", padding: 0, marginTop: 16, display: "grid", gap: 8 }}
      >
        {lines.map((l) => (
          // Product-grade row (K5): photo · name · EBT · unit math · stepper · line total. Keyed by
          // CART-LINE id; `.mms-rise` (dynamic-mount variant) + `.card-textured` are RM/token-safe.
          <li key={l.lineId} className="card card-textured mms-rise" style={scannedLineStyle}>
            {l.imageUrl && (
              <span className="grocery-thumb" aria-hidden>
                <BlurUpImage src={l.imageUrl} alt="" width={56} height={56} sizes="56px" />
              </span>
            )}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: 700 }}>{l.name}</span>{" "}
              {l.ebt && <small style={{ color: "var(--ok)", fontWeight: 700 }}>EBT</small>}
              <small style={{ display: "block", color: "var(--t3)", marginTop: 2 }}>
                {l.qty} × ${(l.unitPriceCents / 100).toFixed(2)}
              </small>
            </span>
            <span className="grocery-stepper" role="group" aria-label={`${l.name} quantity`}>
              <button
                type="button"
                className="grocery-step-btn"
                aria-label={l.qty <= 1 ? `Remove ${l.name}` : `One less ${l.name}`}
                disabled={busyLine !== null}
                onClick={() => void stepQty(l, l.qty - 1)}
              >
                <span aria-hidden>−</span>
              </button>
              <span style={{ minWidth: 18, textAlign: "center", fontWeight: 800 }}>{l.qty}</span>
              <button
                type="button"
                className="grocery-step-btn"
                aria-label={`One more ${l.name}`}
                disabled={busyLine !== null || l.qty >= 99}
                onClick={() => void stepQty(l, l.qty + 1)}
              >
                <span aria-hidden>+</span>
              </button>
            </span>
            <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              ${((l.unitPriceCents * l.qty) / 100).toFixed(2)}
            </b>
          </li>
        ))}
        {!lines.length && cartId && (
          <li style={{ color: "var(--t3)" }}>
            {hydrated ? "Nothing scanned yet." : "Checking your basket…"}
          </li>
        )}
      </ul>

      {toast && (
        <div role="status" style={toastStyle}>
          {toast}
        </div>
      )}

      {lines.length > 0 && cartId && (
        // A real <button> (Enter AND Space), matching CartBar — the prior <a> only activated on Enter. The
        // aria-label carries the count + total on focus; the rolling NumberFlow figure is presentation only
        // (not announced per scan).
        <button
          type="button"
          className="card"
          style={checkoutCta}
          aria-label={`Check out — ${itemCount} ${itemCount === 1 ? "item" : "items"}, total $${(
            totalCents / 100
          ).toFixed(2)}`}
          onClick={() => {
            posthog.capture("grocery_checkout_clicked", {
              cart_id: cartId,
              item_count: itemCount,
              unique_item_count: lines.length,
              total_cents: totalCents,
            });
            journey.push(`/cart?cart=${encodeURIComponent(cartId)}`);
          }}
        >
          <span>
            Check out · {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            <NumberFlow value={totalCents / 100} format={{ style: "currency", currency: "USD" }} />
          </span>
        </button>
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
const scannedLineStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 13px",
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
  zIndex: "var(--z-toast)" as CSSProperties["zIndex"],
};
const checkoutCta: CSSProperties = {
  position: "fixed",
  left: 12,
  right: 12,
  // clear the iOS home-bar inset (position, not padding) so the CTA isn't hidden behind it
  bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
  maxWidth: 416,
  margin: "0 auto",
  background: "var(--ac)",
  color: "var(--oa)",
  padding: "14px 18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  border: "none",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};
