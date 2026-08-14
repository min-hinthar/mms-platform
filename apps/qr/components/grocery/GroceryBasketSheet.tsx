"use client";
import { useRef } from "react";
import { NumberFlow, Sheet } from "@mms/ui";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import type { GroceryLine } from "@/lib/grocery";

/**
 * W9d — the basket review sheet: the Browse door finally shows what's in the basket. The Scan door
 * always listed the lines inline, but Browse (the DEFAULT door) had only the CTA's rolling figure —
 * a shopper had to either switch tabs or walk blind into checkout to see their own items.
 *
 * Deliberately a THIN window onto the page's existing state, not a second basket surface: the rows
 * are the same `lines` array, the steppers route through the same `onStep` (setQty + one-op
 * `busyLineId` lock + reconcile), and the totals are the page's own display-only reductions. The
 * Scan door's inline `<ul>` stays `hidden`-gated exactly as before — these rows never co-render
 * with it (the sheet is a modal layer), so accessible names aren't duplicated and the one-op lock
 * has a single owner. No live region in here: the page toast announces every step result (G15 —
 * one status region per view).
 */
export function GroceryBasketSheet({
  open,
  onClose,
  lines,
  busyLineId,
  savedCents,
  ebtCents,
  totalCents,
  itemCount,
  onStep,
  onCheckout,
  onCloseAutoFocus,
}: {
  open: boolean;
  onClose: () => void;
  lines: GroceryLine[];
  /** The page's one-op stepper lock — non-null freezes every stepper here too. */
  busyLineId: string | null;
  /** Display-only page reductions (W4e savings · W4a EBT subtotal · the CTA's figure). */
  savedCents: number;
  ebtCents: number;
  totalCents: number;
  itemCount: number;
  onStep: (line: GroceryLine, nextQty: number) => void;
  onCheckout: () => void;
  /** Forwarded to the Sheet — the page redirects Radix's close-restore when this sheet's own
   *  trigger (the CTA bar) has unmounted (zero lines / terminal basket). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  // Removing a row unmounts the "−" that held focus, and the page's search-input parking is
  // (correctly) skipped while a sheet owns focus — so park it on the sheet body instead of letting
  // Radix drop it wherever the trap catches it (WCAG 2.4.3, the GroceryItemSheet pattern).
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Your basket"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="gbasket" ref={bodyRef} tabIndex={-1}>
        {lines.length === 0 ? (
          // Reachable: the last row can be removed right here. The page CTA bar (this sheet's own
          // trigger) unmounts at zero lines, so closing returns the shopper to the plain market.
          <p className="gbasket-empty">Your basket is empty — close this to keep shopping.</p>
        ) : (
          <>
            <ul role="list" aria-label="Basket items" className="gbasket-list">
              {lines.map((l) => (
                <li key={l.lineId} className="card grocery-scanned-row">
                  {/* W13 — the slot ALWAYS renders: a missing photo falls to the designed placeholder. */}
                  <span className="grocery-thumb" aria-hidden>
                    <BlurUpImage
                      src={l.imageUrl}
                      alt=""
                      width={56}
                      height={56}
                      sizes="56px"
                      fallback={<PhotoPlaceholder category="grocery" />}
                    />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 700 }}>{l.name}</span>{" "}
                    {l.ebt && <small style={{ color: "var(--ok)", fontWeight: 700 }}>EBT</small>}
                    <small style={{ display: "block", color: "var(--t3)", marginTop: 2 }}>
                      {l.qty} × ${(l.unitPriceCents / 100).toFixed(2)}
                    </small>
                  </span>
                  {/* aria-disabled + early-return (never native disabled) — the busy control must
                      not drop from the tab order mid-op (the scan-door stepper rule). */}
                  <span
                    className="grocery-stepper"
                    role="group"
                    aria-label={`${l.name} quantity`}
                    data-busy={busyLineId === l.lineId || undefined}
                  >
                    <button
                      type="button"
                      className="grocery-step-btn"
                      aria-label={l.qty <= 1 ? `Remove ${l.name}` : `One less ${l.name}`}
                      aria-disabled={busyLineId !== null}
                      onClick={() => {
                        if (busyLineId !== null) return;
                        // The row (and this button) unmounts on remove — park focus first.
                        if (l.qty <= 1) bodyRef.current?.focus({ preventScroll: true });
                        onStep(l, l.qty - 1);
                      }}
                    >
                      <span aria-hidden>−</span>
                    </button>
                    <span className="gbasket-qty">{l.qty}</span>
                    <button
                      type="button"
                      className="grocery-step-btn"
                      aria-label={`One more ${l.name}`}
                      aria-disabled={busyLineId !== null || l.qty >= 99}
                      onClick={() => {
                        if (busyLineId !== null || l.qty >= 99) return;
                        onStep(l, l.qty + 1);
                      }}
                    >
                      <span aria-hidden>+</span>
                    </button>
                  </span>
                  <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    ${((l.unitPriceCents * l.qty) / 100).toFixed(2)}
                  </b>
                </li>
              ))}
            </ul>

            {/* The same honest summary the Scan door shows — savings only from genuinely-discounted
                lines (saleInfo-floored upstream), EBT undated (FNS is federally gated). */}
            {savedCents > 0 && (
              <p className="grocery-saved">
                You’re saving ${(savedCents / 100).toFixed(2)} vs. typical market prices
              </p>
            )}
            {ebtCents > 0 && (
              <p className="grocery-ebt-line">
                <span className="grocery-ebt-tag" aria-hidden>
                  EBT
                </span>
                ${(ebtCents / 100).toFixed(2)} of your basket is EBT-eligible — SNAP checkout
                coming; pay by card today.
              </p>
            )}

            <div className="item-cta-bar">
              <button
                type="button"
                className="item-add-btn"
                aria-label={`Check out — ${itemCount} ${itemCount === 1 ? "item" : "items"}, total $${(
                  totalCents / 100
                ).toFixed(2)}`}
                onClick={onCheckout}
              >
                <span>
                  Check out · {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
                {/* The CTA bar's rolling figure, mirrored — presentation only (the label above
                    carries the amount for SR). */}
                <span className="item-add-btn-price" aria-hidden>
                  <NumberFlow
                    value={totalCents / 100}
                    format={{ style: "currency", currency: "USD" }}
                  />
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
