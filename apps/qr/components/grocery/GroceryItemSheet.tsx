"use client";
import { useEffect, useRef, type RefObject } from "react";
import { Badge, Sheet } from "@mms/ui";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import { aisleBySlug, dollars, saleInfo, sizeLabel, unitPriceLabel } from "@/lib/grocery-aisles";
import type { GroceryCatalogItem, GroceryLine } from "@/lib/grocery";

/**
 * W5d — the grocery item detail sheet: the roomy twin of the (now-denser) browse card. A tap on a
 * card opens this; it shows the catalog facts a compact card can't (hero photo, bilingual name, aisle,
 * brand + pack size, the full price block with the honest "compare at" market reference + unit price,
 * and EBT eligibility as a fact), then adds through the SAME server-priced money path the card uses.
 *
 * Reuses the menu ItemSheet's shell choreography (the @mms/ui Sheet, the keyed-body remount, the
 * scroll-to-top + focus-on-swap) and its CSS vocabulary (.item-hero, .item-cta-bar, .item-add-btn) —
 * but the BODY forks: grocery has no modifier groups, no kitchen note, no dish allergen model, and its
 * add is scanAdd's 1-at-a-time increment (Add → the same stepper the card + basket rows use), not the
 * menu's pre-add qty multiply. So the sheet's Add/stepper are the card's controls at sheet scale,
 * routed through the parent's `onAdd`/`onStep` — one money path, never a second add surface.
 *
 * Money stays server-authoritative: every amount shown here is a DISPLAY echo (`saleInfo`/
 * `unitPriceLabel` are null-honest, display-only); the add re-prices by barcode on the server.
 */
export function GroceryItemSheet({
  item,
  line,
  canAdd,
  adding,
  stepping,
  open,
  onClose,
  onAdd,
  onStep,
}: {
  item: GroceryCatalogItem | null;
  /** The live cart line for this item (null = not in the cart). Drives Add vs stepper, reactively. */
  line: GroceryLine | null;
  /** False while the basket is invisible (minting / failed first read) — Add is aria-disabled. */
  canAdd: boolean;
  /** True while THIS item's browse-add is in flight. */
  adding: boolean;
  /** True while a stepper op is in flight (any line — the whole cart freezes one op at a time). */
  stepping: boolean;
  open: boolean;
  onClose: () => void;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
}) {
  // Detect a swap (item changes while the sheet stays open) in an EFFECT — move focus to the top of
  // the new content (WCAG 2.4.3). The initial open is left to Radix (focus-trap). Mirrors ItemSheet.
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevBarcodeRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = open ? (item?.barcode ?? null) : null;
    const prev = prevBarcodeRef.current;
    prevBarcodeRef.current = cur;
    if (prev != null && cur != null && prev !== cur)
      bodyRef.current?.focus({ preventScroll: true });
  }, [item?.barcode, open]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={item?.name ?? ""}>
      {item && (
        <GroceryItemSheetBody
          key={item.barcode}
          item={item}
          line={line}
          canAdd={canAdd}
          adding={adding}
          stepping={stepping}
          rootRef={bodyRef}
          onAdd={onAdd}
          onStep={onStep}
        />
      )}
    </Sheet>
  );
}

function GroceryItemSheetBody({
  item,
  line,
  canAdd,
  adding,
  stepping,
  rootRef,
  onAdd,
  onStep,
}: {
  item: GroceryCatalogItem;
  line: GroceryLine | null;
  canAdd: boolean;
  adding: boolean;
  stepping: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
}) {
  // On mount (open OR swap) reset the shared sheet scroll to the top so a swapped-in item starts at
  // its hero (reading rootRef in an EFFECT is allowed; the parent handles focus-on-swap).
  useEffect(() => {
    rootRef.current?.closest<HTMLElement>(".mms-sheet")?.scrollTo({ top: 0 });
  }, [rootRef]);

  // W5d — focus handoffs across the Add⇄stepper swap so a keyboard/SR shopper is never dropped to
  // <body> (WCAG 2.4.3). `pendingFocus`: tapping Add → the new "+" claims focus. `pendingAddFocus`:
  // removing the last unit (qty 1→0) inside the sheet → the re-mounted Add button claims focus (the
  // symmetric reverse; page.tsx skips its search-refocus while a sheet is open). Each armed only on a
  // real attempt; the target's callback ref claims it once, on mount.
  const pendingFocus = useRef(false);
  const pendingAddFocus = useRef(false);

  const aisle = item.category ? aisleBySlug.get(item.category) : undefined;
  const size = sizeLabel(item.sizeQty, item.sizeUnit);
  const unit = unitPriceLabel(item.priceCents, item.sizeQty, item.sizeUnit);
  const sale = saleInfo(item.priceCents, item.compareAtCents);
  const price = dollars(item.priceCents);
  const facts = [item.brand, size].filter(Boolean).join(" · ");

  return (
    <div className="item-sheet" ref={rootRef} tabIndex={-1} aria-label={item.name}>
      {item.nameMy && (
        <p className="item-sheet-my" lang="my">
          {item.nameMy}
        </p>
      )}

      <div className="item-hero" style={{ background: "var(--grad)" }}>
        {/* W9d — same STORED gate as the card (`is_featured_deal`), so the two surfaces cannot drift:
            an item that shouts on the grid must shout here and nowhere else. Decorative — the price
            block below states the discount in text. */}
        {sale && item.featuredDeal && (
          <span className="gcard-sale gsheet-sale" aria-hidden>
            Save {sale.pct}%
          </span>
        )}
        <BlurUpImage
          src={item.imageUrl}
          alt=""
          width={440}
          height={248}
          sizes="(max-width: 440px) 100vw, 440px"
          fallback={<PhotoPlaceholder icon={aisle?.icon ?? "cat-grocery"} variant="hero" />}
        />
      </div>

      {(aisle || facts) && (
        <div className="gsheet-facts">
          {aisle && <Badge tone="neutral">{aisle.en}</Badge>}
          {facts && <span className="gsheet-meta">{facts}</span>}
        </div>
      )}

      {/* Price block at sheet scale — the charged price is the hero; "Compare at" is the honest market
          reference (never our own former price), and the unit price sits on its own line for scanning. */}
      <div className="gsheet-price">
        {sale && (
          <span className="gcard-compare" aria-hidden>
            Compare at <s>{dollars(sale.compareAtCents)}</s>
          </span>
        )}
        <span className="gsheet-price-row">
          <b
            className={
              sale
                ? "gcard-price gcard-price-sale gsheet-price-num"
                : "gcard-price gsheet-price-num"
            }
          >
            {price}
          </b>
          {sale && (
            <span className="sr-only">
              , compare at {dollars(sale.compareAtCents)}, save {sale.pct}%
            </span>
          )}
        </span>
        {unit && <span className="gsheet-unit">{unit}</span>}
      </div>

      {/* EBT is a catalog ELIGIBILITY FACT, not a payment method — EBT/SNAP tender is 2027 (Forage/FNS),
          so the copy never promises "pay with EBT here". role=note keeps it out of the one live region. */}
      {item.ebt && (
        <p className="gsheet-ebt" role="note">
          <small className="gcard-ebt" aria-hidden>
            EBT
          </small>{" "}
          Eligible for EBT/SNAP — a qualifying grocery staple.
        </p>
      )}

      <div className="item-cta-bar">
        {line ? (
          // Already in the cart → the same stepper the card + basket rows use, at sheet scale. The
          // sheet stays OPEN so the shopper can keep adjusting (grocery is add-multiple), unlike the
          // dish sheet which closes on add. aria-disabled (not native disabled) keeps focus alive.
          <div
            className="grocery-stepper gsheet-stepper"
            role="group"
            aria-label={`${item.name} quantity`}
            data-busy={stepping || undefined}
          >
            <button
              type="button"
              className="grocery-step-btn"
              aria-label={line.qty <= 1 ? `Remove ${item.name}` : `One less ${item.name}`}
              aria-disabled={stepping}
              onClick={() => {
                if (stepping) return;
                // Removing the last unit swaps the stepper back to Add — arm the reverse handoff so
                // focus lands on that Add button (else Radix only re-homes to the sheet root).
                if (line.qty <= 1) pendingAddFocus.current = true;
                onStep(line, line.qty - 1);
              }}
            >
              <span aria-hidden>−</span>
            </button>
            <span className="gcard-qty gsheet-qty">
              <span className="sr-only">Quantity </span>
              {line.qty}
            </span>
            <button
              type="button"
              className="grocery-step-btn"
              aria-label={`One more ${item.name}`}
              aria-disabled={stepping || line.qty >= 99}
              // Claims focus when this stepper just replaced the sheet's Add button the shopper
              // activated (runs once, on mount) — mirrors the card's MED-1 handoff.
              ref={(el) => {
                if (el && pendingFocus.current) {
                  pendingFocus.current = false;
                  el.focus();
                }
              }}
              onClick={() => {
                if (stepping || line.qty >= 99) return;
                onStep(line, line.qty + 1);
              }}
            >
              <span aria-hidden>+</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="item-add-btn gsheet-add"
            aria-disabled={!canAdd || adding || undefined}
            aria-label={`Add ${item.name} to your basket, ${price}`}
            // Claims focus when Add re-mounts after a sheet-initiated remove-to-zero (the reverse handoff).
            ref={(el) => {
              if (el && pendingAddFocus.current) {
                pendingAddFocus.current = false;
                el.focus();
              }
            }}
            onClick={() => {
              if (!canAdd || adding) return;
              // Arm the focus handoff only on a real attempt — the "+" that mounts after this add
              // claims focus (so a refused add can't leave it armed to steal focus later).
              pendingFocus.current = true;
              onAdd(item);
            }}
          >
            <span>{adding ? "Adding…" : "Add to basket"}</span>
            <span className="item-add-btn-price">{price}</span>
          </button>
        )}
      </div>
    </div>
  );
}
