"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@mms/ui";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import { getGroceryCatalog, type GroceryCatalogItem, type GroceryLine } from "@/lib/grocery";
import {
  AISLES,
  aisleBySlug,
  dollars,
  saleInfo,
  sizeLabel,
  unitPriceLabel,
} from "@/lib/grocery-aisles";
import { AisleFanNav } from "@/components/grocery/AisleFanNav";
import { GroceryItemSheet } from "@/components/grocery/GroceryItemSheet";
import { useHideOnScrollDown } from "@/lib/hooks/useHideOnScrollDown";

/**
 * W4b — the Browse half of the grocery market: aisle tiles over the full catalog, Weee!-anatomy
 * cards (photo/placeholder · bilingual name · brand + pack size · price + honest unit price · EBT
 * tag) with one-tap add. Cards are cart-AWARE (an in-cart item swaps its Add for the same stepper
 * the basket rows use) but never cart-AUTHORITATIVE: every add/step rides the parent's existing
 * scanAdd/setQty money path — browse is a different door into the same server-priced cart line.
 *
 * memo'd with stable parent callbacks so typing in the page-level search box (or the toast's
 * mount/unmount) doesn't re-render the ~400-card grid — only cart/busy changes do.
 */
export const GroceryBrowse = memo(function GroceryBrowse({
  lines,
  canAdd,
  addingBarcode,
  busyLineId,
  onAdd,
  onStep,
}: {
  lines: GroceryLine[];
  /** False while the session is still minting or the first basket read FAILED (adding while the
   *  server basket is invisible could double a qty the shopper can't see) — Adds render
   *  aria-disabled; the parent handler is the real enforcement. */
  canAdd: boolean;
  /** Barcode of the one in-flight browse/search add — only that card dims. */
  addingBarcode: string | null;
  /** lineId of the one in-flight stepper op — only that card's stepper dims. */
  busyLineId: string | null;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
}) {
  const [catalog, setCatalog] = useState<GroceryCatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [aisle, setAisle] = useState<string | null>(null);
  // W5d — the item the detail sheet is showing (null = closed). Lives INSIDE the memo'd grid (the
  // catalog does too), so opening re-renders this grid once on a deliberate tap — not per keystroke
  // (the parent's search box can't reach in; the memo still guards typing). Mirrors MenuBrowser.
  const [sheetItem, setSheetItem] = useState<GroceryCatalogItem | null>(null);
  // MED-1 (adversarial review): when a card's Add lands, its button unmounts and the stepper takes
  // its place — park keyboard/SR focus on the new "+" instead of dropping it to <body>. The ref
  // holds the barcode whose stepper should claim focus on mount.
  const pendingFocus = useRef<string | null>(null);
  // W4f — the sticky mobile filter rail tucks away while scrolling DOWN (full-screen grid) and
  // reappears on scroll-up, so it never permanently eats ~20% of a phone screen. Desktop ignores it
  // (the rail is static there). Reduced-motion keeps it visible.
  const railHidden = useHideOnScrollDown();

  // One catalog read per visit (a public, slow-moving ~400-row list). Failure renders an honest
  // Retry — never an empty market. `cancelled` guards the post-unmount setState.
  const [loadSeq, setLoadSeq] = useState(0); // bumped by Retry (which also clears `failed`)
  useEffect(() => {
    let cancelled = false;
    getGroceryCatalog()
      .then((items) => {
        if (!cancelled) setCatalog(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSeq]);

  const lineByBarcode = useMemo(() => {
    const m = new Map<string, GroceryLine>();
    for (const l of lines) m.set(l.barcode, l);
    return m;
  }, [lines]);

  // Aisles that actually stock something, in merchandising order (an empty aisle tile is a dead end).
  const stockedAisles = useMemo(() => {
    if (!catalog) return [];
    const present = new Set(catalog.map((i) => i.category));
    return AISLES.filter((a) => present.has(a.slug));
  }, [catalog]);

  const sections = useMemo(() => {
    if (!catalog) return [];
    const wanted = aisle ? [aisle] : stockedAisles.map((a) => a.slug);
    return wanted
      .map((slug) => ({
        aisle: aisleBySlug.get(slug),
        items: catalog.filter((i) => i.category === slug),
      }))
      .filter((s) => s.aisle && s.items.length > 0);
  }, [catalog, aisle, stockedAisles]);

  if (failed) {
    return (
      <div className="card" role="alert" style={{ padding: 16, marginTop: 12 }}>
        <p style={{ margin: "0 0 12px", color: "var(--warn)", fontWeight: 600 }}>
          Couldn’t load the aisles. Check your connection and try again.
        </p>
        <button
          type="button"
          className="gb-retry"
          onClick={() => {
            setFailed(false);
            setLoadSeq((s) => s + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!catalog) {
    // Skeleton mirrors the card grid so the swap doesn't jump (aria-hidden; the tab already
    // carries the loading context).
    return (
      <div className="gcard-grid" aria-hidden style={{ marginTop: 12 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card gcard">
            <div className="gcard-photo mms-skeleton" />
            <div className="gcard-body">
              <span
                className="mms-skeleton"
                style={{ height: 14, width: "85%", borderRadius: 6 }}
              />
              <span
                className="mms-skeleton"
                style={{ height: 12, width: "60%", borderRadius: 6 }}
              />
              <span
                className="mms-skeleton"
                style={{ height: 16, width: "40%", borderRadius: 6 }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Honest empty market — live runs in exactly this state between the schema migration and the
  // price-confirmed catalog import (rows exist but carry no aisle), and a categorized-but-empty
  // filter result must never read as "we sell nothing".
  if (catalog.length === 0 || stockedAisles.length === 0) {
    return (
      <p style={{ color: "var(--t3)", marginTop: 14 }}>
        The aisles are being stocked — search above, or scan a shelf barcode from the Scan tab.
      </p>
    );
  }

  return (
    <>
      {/* Filter rail — pins under the header on scroll on MOBILE (the category nav there, since the
          vertical fan-nav is desktop-only). The opaque sticky bg lives on the <nav>; the trailing
          edge-fade mask lives on the inner scroller so it never eats the sticky background. */}
      <nav className="aisle-rail" aria-label="Grocery aisles" data-hidden={railHidden || undefined}>
        <div className="aisle-rail-scroll">
          <button
            type="button"
            className="aisle-tile"
            aria-pressed={aisle === null}
            onClick={() => setAisle(null)}
          >
            <Icon name="cat-grocery" size={18} strokeWidth={1.5} />
            <span className="aisle-tile-label">
              <span className="aisle-tile-en">All aisles</span>
              <span className="aisle-tile-my" lang="my">
                အားလုံး
              </span>
            </span>
          </button>
          {stockedAisles.map((a) => (
            <button
              key={a.slug}
              type="button"
              className="aisle-tile"
              aria-pressed={aisle === a.slug}
              onClick={() => setAisle((cur) => (cur === a.slug ? null : a.slug))}
            >
              <Icon name={a.icon} size={18} strokeWidth={1.5} />
              <span className="aisle-tile-label">
                <span className="aisle-tile-en">{a.en}</span>
                <span className="aisle-tile-my" lang="my">
                  {a.my}
                </span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      {sections.map(({ aisle: a, items }) => (
        <section
          key={a!.slug}
          // W4f — the scroll-spy anchor + jump target for AisleFanNav; `.aisle-section` carries the
          // scroll-margin-top that lands a jump below the sticky AppHeader (not under it).
          id={`aisle-sec-${a!.slug}`}
          data-aisle={a!.slug}
          // `.aisle-section` carries the scroll-margin-top so a fan-nav jump (desktop) lands the
          // heading below the sticky header. No gutter reserve needed: the fan is desktop-only now
          // and floats in the wide gutter beside the centred column, never over a card.
          className="aisle-section"
          aria-labelledby={`aisle-h-${a!.slug}`}
        >
          <h2 id={`aisle-h-${a!.slug}`} className="aisle-heading">
            {a!.en}{" "}
            <span className="aisle-heading-my" lang="my">
              {a!.my}
            </span>
            <span className="aisle-heading-count">{items.length}</span>
          </h2>
          <ul role="list" className="gcard-grid">
            {items.map((item, i) => {
              const line = lineByBarcode.get(item.barcode);
              const size = sizeLabel(item.sizeQty, item.sizeUnit);
              const unit = unitPriceLabel(item.priceCents, item.sizeQty, item.sizeUnit);
              const price = dollars(item.priceCents);
              const sale = saleInfo(item.priceCents, item.compareAtCents);
              return (
                <li
                  key={item.barcode}
                  className="card card-textured gcard mms-stagger"
                  // Capped entrance cascade — the first rows stagger, the rest arrive together
                  // (don't delay off-screen cards). RM off-switch rides `.mms-stagger`.
                  style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}
                >
                  {/* W5d — the whole card opens the detail sheet. ONE button wraps photo + body; the
                      quick-add FAB / stepper is a SIBLING below (never nested — no button-in-button),
                      and floats over the photo corner via CSS. A button collapses its subtree for the
                      a11y name, so the glanceable scan facts a sighted shopper sees (price, sale, EBT,
                      unit price) are folded into the accessible NAME — else an SR user scanning the
                      ~400-SKU grid for sales/EBT staples would have to open every sheet (W4e/W4a
                      glanceability holds for SR too). MY name stays visual (EN carries the name here,
                      mirroring the menu row) to avoid an English SR mispronouncing the Burmese. */}
                  <button
                    type="button"
                    className="gcard-open"
                    aria-label={[
                      item.name,
                      [item.brand, size].filter(Boolean).join(" · ") || null,
                      price,
                      sale ? `on sale, compare at ${dollars(sale.compareAtCents)}, save ${sale.pct}%` : null,
                      unit,
                      item.ebt ? "EBT eligible" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") + " — view details"}
                    onClick={() => setSheetItem(item)}
                  >
                    <span className="gcard-photo">
                      {/* Loud "Save %" pill only for a meaningful markdown (≥15%) so the market doesn't
                          read as a wall of uniform bargains; the honest inline "Compare at" strike
                          below still shows on every real sale. */}
                      {sale && sale.pct >= 15 && (
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
                          sizes="(max-width: 440px) 45vw, 160px"
                          fallback={<PhotoPlaceholder icon={a!.icon} variant="hero" />}
                        />
                      ) : (
                        <PhotoPlaceholder icon={a!.icon} variant="hero" />
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
                        <span className="gcard-meta">
                          {[item.brand, size].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className="gcard-foot">
                        {/* VISIBLE "Compare at $X" caption (market-comparison framing on the sighted
                            surface — a bare struck number reads as our own former price, which we
                            never claim). */}
                        {sale && (
                          <span className="gcard-compare" aria-hidden>
                            Compare at <s>{dollars(sale.compareAtCents)}</s>
                          </span>
                        )}
                        {/* aria-hidden: all of this (price, sale, EBT) is announced via the open
                            button's accessible name above — inside a button the subtree is not
                            separately reachable, so exposing it here would be dead markup. Kept purely
                            visual for sighted shoppers. */}
                        <span className="gcard-price-row" aria-hidden>
                          <b className={sale ? "gcard-price gcard-price-sale" : "gcard-price"}>
                            {price}
                          </b>
                          {item.ebt && <small className="gcard-ebt">EBT</small>}
                        </span>
                        {/* W5d (G17): unit price on its OWN line under the price — deterministic, never
                            wrap-shuffled inline. Null-honest: renders nothing when size is unknown. */}
                        {unit && <span className="gcard-unit">{unit}</span>}
                      </span>
                    </span>
                  </button>
                  {line ? (
                    // In the cart → the same stepper anatomy/handlers as the basket rows (per-CARD
                    // busy = aria-disabled + parent early-return, never `disabled` — keeps keyboard
                    // focus alive and doesn't dim the other 394 cards during one op).
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
                        // Claims focus when this stepper just replaced the Add button the shopper
                        // activated (MED-1) — the callback ref runs exactly once, on mount.
                        ref={(el) => {
                          if (el && pendingFocus.current === item.barcode) {
                            pendingFocus.current = null;
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
                        // Arm the focus handoff ONLY when this add will actually be attempted
                        // (same gate the parent enforces) — else a refused tap leaves the barcode
                        // armed and a LATER legit cart of that item would steal focus (WCAG 3.2.1).
                        if (canAdd && addingBarcode === null && busyLineId === null)
                          pendingFocus.current = item.barcode;
                        onAdd(item);
                      }}
                    >
                      <span aria-hidden>+</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* W4f — right-edge fan-out section nav over the rendered aisles. Self-hides when the filter
          narrows to a single aisle (nothing to jump between). Its own state re-renders only itself,
          never the memo'd card grid. */}
      <AisleFanNav aisles={sections.map((s) => s.aisle!)} />

      {/* W5d — one shared detail sheet fed the tapped item (mirrors MenuBrowser). Its Add/step route
          through the SAME onAdd/onStep the cards use — one money path, no second add surface. Fed the
          live cart line so its CTA is Add-vs-stepper reactive; busy flags mirror the card's. */}
      <GroceryItemSheet
        item={sheetItem}
        line={(sheetItem && lineByBarcode.get(sheetItem.barcode)) || null}
        canAdd={canAdd}
        adding={!!sheetItem && addingBarcode === sheetItem.barcode}
        stepping={busyLineId !== null}
        open={sheetItem !== null}
        onClose={() => setSheetItem(null)}
        onAdd={onAdd}
        onStep={onStep}
      />
    </>
  );
});
