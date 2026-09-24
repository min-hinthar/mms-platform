"use client";
import type { RefObject } from "react";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import type { GroceryCatalogItem, GroceryLine } from "@/lib/grocery";
import { dollars, saleInfo, sizeLabel, unitPriceLabel, type Aisle } from "@/lib/grocery-aisles";

/**
 * One market card (W4b/W5d/W9d), extracted verbatim from GroceryBrowse's inlined `<li>` in Phase 1c
 * so a shelf rail and the aisle grid draw the SAME card. Behaviour-identical, pinned by
 * GroceryBrowse.test.tsx against the inlined card BEFORE the extraction: the accessible-name
 * composition byte-for-byte, the W9d sale gate, the FAB ↔ stepper swap and the MED-1 focus handoff.
 * The only differences: no per-card entrance stagger (each SHELF premieres once instead — ten
 * animated elements, not up to 404), and `variant` picks the image `sizes` hint for the slot.
 *
 * Cart-AWARE (an in-cart item swaps its Add for the stepper) but never cart-AUTHORITATIVE: every
 * add/step rides the parent's existing scanAdd/setQty money path.
 */
export function GroceryCard({
  item,
  aisle,
  line,
  canAdd,
  addingBarcode,
  busyLineId,
  pendingFocusRef,
  onOpen,
  onAdd,
  onStep,
  variant,
}: {
  item: GroceryCatalogItem;
  aisle: Aisle;
  line: GroceryLine | undefined;
  canAdd: boolean;
  addingBarcode: string | null;
  busyLineId: string | null;
  /** MED-1 — the barcode whose stepper should claim focus on mount (owned by the parent grid). */
  pendingFocusRef: RefObject<string | null>;
  onOpen: (item: GroceryCatalogItem) => void;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
  /** A shelf rail shows ~2.4 cards across a phone; the aisle grid is 2 · 3 · 4 across by tier. */
  variant: "rail" | "grid";
}) {
  const size = sizeLabel(item.sizeQty, item.sizeUnit);
  const unit = unitPriceLabel(item.priceCents, item.sizeQty, item.sizeUnit);
  const price = dollars(item.priceCents);
  const sale = saleInfo(item.priceCents, item.compareAtCents);
  // R1 — the hint follows the card's real width at each tier so the photo is never served soft.
  const sizes =
    variant === "rail"
      ? "(max-width: 47.99em) 40vw, (max-width: 63.99em) 228px, 192px"
      : "(max-width: 47.99em) 45vw, (max-width: 63.99em) 228px, 192px";
  return (
    <li className="card card-textured gcard">
      {/* W5d — the whole card opens the detail sheet. ONE button wraps photo + body; the quick-add
          FAB / stepper is a SIBLING below (never nested — no button-in-button), and floats over the
          photo corner via CSS. A button collapses its subtree for the a11y name, so the glanceable
          scan facts a sighted shopper sees (price, sale, EBT, unit price) are folded into the
          accessible NAME — else an SR user scanning the market for sales/EBT staples would have to
          open every sheet (W4e/W4a glanceability holds for SR too). MY name stays visual (EN carries
          the name here, mirroring the menu row) to avoid an English SR mispronouncing the Burmese. */}
      <button
        type="button"
        className="gcard-open"
        aria-label={
          [
            item.name,
            [item.brand, size].filter(Boolean).join(" · ") || null,
            price,
            // W9d — the SR name follows the same gate as the visible pill below. It was ungated, so
            // a screen-reader user heard "on sale, save 30%" on 77% of the market while the pill was
            // (nominally) selective. Tightening only the pixels would have widened that divergence
            // instead of closing it.
            sale
              ? item.featuredDeal
                ? `featured deal, compare at ${dollars(sale.compareAtCents)}, save ${sale.pct}%`
                : `compare at ${dollars(sale.compareAtCents)}`
              : null,
            unit,
            item.ebt ? "EBT eligible" : null,
          ]
            .filter(Boolean)
            .join(", ") + " — view details"
        }
        onClick={() => onOpen(item)}
      >
        <span className="gcard-photo">
          {/* W9d — the loud pill is a STORED decision (`is_featured_deal`), not a threshold. The old
              `pct >= 15` gate passed 306 of 396 SKUs — 77% of the market — because our
              wholesale-vs-retail basis marks nearly everything down; the catalog's discounts cluster
              at 25–35%, so no cut point thins it. A badge on three quarters of the shelf is
              wallpaper, and wallpaper on a price claim teaches shoppers to ignore the one place we
              say "this is genuinely a good buy". The quiet inline "Compare at" strike below is
              untouched and still shows on every real discount — that is the honest surface. */}
          {sale && item.featuredDeal && (
            <span className="gcard-sale" aria-hidden>
              Save {sale.pct}%
            </span>
          )}
          {item.imageUrl ? (
            <BlurUpImage
              src={item.imageUrl}
              alt=""
              width={160}
              height={160}
              sizes={sizes}
              fallback={<PhotoPlaceholder icon={aisle.icon} variant="hero" />}
            />
          ) : (
            <PhotoPlaceholder icon={aisle.icon} variant="hero" />
          )}
        </span>
        <span className="gcard-body">
          <span className="gcard-name">{item.name}</span>
          {item.nameMy && (
            <span className="gcard-name-my" lang="my">
              {item.nameMy}
            </span>
          )}
          {(item.brand || size) && (
            <span className="gcard-meta">{[item.brand, size].filter(Boolean).join(" · ")}</span>
          )}
          <span className="gcard-foot">
            {/* VISIBLE "Compare at $X" caption (market-comparison framing on the sighted surface — a
                bare struck number reads as our own former price, which we never claim). */}
            {sale && (
              <span className="gcard-compare" aria-hidden>
                Compare at <s>{dollars(sale.compareAtCents)}</s>
              </span>
            )}
            {/* aria-hidden: all of this (price, sale, EBT) is announced via the open button's
                accessible name above — inside a button the subtree is not separately reachable, so
                exposing it here would be dead markup. Kept purely visual for sighted shoppers. */}
            <span className="gcard-price-row" aria-hidden>
              <b className={sale ? "gcard-price gcard-price-sale" : "gcard-price"}>{price}</b>
              {item.ebt && <small className="gcard-ebt">EBT</small>}
            </span>
            {/* W5d (G17): unit price on its OWN line under the price — deterministic, never
                wrap-shuffled inline. Null-honest: renders nothing when size is unknown. */}
            {unit && <span className="gcard-unit">{unit}</span>}
          </span>
        </span>
      </button>
      {line ? (
        // In the cart → the same stepper anatomy/handlers as the basket rows (per-CARD busy =
        // aria-disabled + parent early-return, never `disabled` — keeps keyboard focus alive and
        // doesn't dim every other card during one op).
        <span
          className="grocery-stepper gcard-stepper gcard-action"
          role="group"
          aria-label={`${item.name} quantity`}
          data-busy={busyLineId === line.lineId || undefined}
        >
          <button
            type="button"
            className="grocery-step-btn"
            aria-label={line.qty <= 1 ? `Remove ${item.name}` : `One less ${item.name}`}
            aria-disabled={busyLineId !== null}
            onClick={() => onStep(line, line.qty - 1)}
          >
            <span aria-hidden>−</span>
          </button>
          <span className="gcard-qty">{line.qty}</span>
          <button
            type="button"
            className="grocery-step-btn"
            aria-label={`One more ${item.name}`}
            aria-disabled={busyLineId !== null || line.qty >= 99}
            // Claims focus when this stepper just replaced the Add button the shopper activated
            // (MED-1) — the callback ref runs exactly once, on mount.
            ref={(el) => {
              if (el && pendingFocusRef.current === item.barcode) {
                pendingFocusRef.current = null;
                el.focus();
              }
            }}
            onClick={() => onStep(line, line.qty + 1)}
          >
            <span aria-hidden>+</span>
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="gcard-fab gcard-action"
          aria-label={`Add ${item.name} to basket — ${price}`}
          aria-disabled={!canAdd || addingBarcode !== null}
          data-busy={addingBarcode === item.barcode || undefined}
          onClick={() => {
            // Arm the focus handoff ONLY when this add will actually be attempted (same gate the
            // parent enforces) — else a refused tap leaves the barcode armed and a LATER legit cart
            // of that item would steal focus (WCAG 3.2.1).
            if (canAdd && addingBarcode === null && busyLineId === null)
              pendingFocusRef.current = item.barcode;
            onAdd(item);
          }}
        >
          <span aria-hidden>+</span>
        </button>
      )}
    </li>
  );
}
