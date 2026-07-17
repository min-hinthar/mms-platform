"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@mms/ui";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import { getGroceryCatalog, type GroceryCatalogItem, type GroceryLine } from "@/lib/grocery";
import { AISLES, aisleBySlug, sizeLabel, unitPriceLabel } from "@/lib/grocery-aisles";

/**
 * W4b — the Browse half of the grocery market: aisle tiles over the full catalog, Weee!-anatomy
 * cards (photo/placeholder · bilingual name · brand + pack size · price + honest unit price · EBT
 * tag) with one-tap add. Cards are cart-AWARE (an in-cart item swaps its Add for the same stepper
 * the basket rows use) but never cart-AUTHORITATIVE: every add/step rides the parent's existing
 * scanAdd/setQty money path — browse is a different door into the same server-priced cart line.
 */
export function GroceryBrowse({
  lines,
  busy,
  onAdd,
  onStep,
}: {
  lines: GroceryLine[];
  /** True while any line op is in flight — steppers/adds early-return (parent's one-op discipline). */
  busy: boolean;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
}) {
  const [catalog, setCatalog] = useState<GroceryCatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [aisle, setAisle] = useState<string | null>(null);

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

  return (
    <>
      <nav className="aisle-rail" aria-label="Grocery aisles">
        <button
          type="button"
          className="aisle-tile"
          aria-pressed={aisle === null}
          onClick={() => setAisle(null)}
        >
          <Icon name="cat-grocery" size={22} strokeWidth={1.5} />
          <span className="aisle-tile-en">All aisles</span>
          <span className="aisle-tile-my">အားလုံး</span>
        </button>
        {stockedAisles.map((a) => (
          <button
            key={a.slug}
            type="button"
            className="aisle-tile"
            aria-pressed={aisle === a.slug}
            onClick={() => setAisle((cur) => (cur === a.slug ? null : a.slug))}
          >
            <Icon name={a.icon} size={22} strokeWidth={1.5} />
            <span className="aisle-tile-en">{a.en}</span>
            <span className="aisle-tile-my">{a.my}</span>
          </button>
        ))}
      </nav>

      {sections.map(({ aisle: a, items }) => (
        <section key={a!.slug} aria-labelledby={`aisle-h-${a!.slug}`}>
          <h2 id={`aisle-h-${a!.slug}`} className="aisle-heading">
            {a!.en} <span className="aisle-heading-my">{a!.my}</span>
            <span className="aisle-heading-count">{items.length}</span>
          </h2>
          <ul role="list" className="gcard-grid">
            {items.map((item) => {
              const line = lineByBarcode.get(item.barcode);
              const size = sizeLabel(item.sizeQty, item.sizeUnit);
              const unit = unitPriceLabel(item.priceCents, item.sizeQty, item.sizeUnit);
              const price = `$${(item.priceCents / 100).toFixed(2)}`;
              return (
                <li key={item.barcode} className="card card-textured gcard">
                  <div className="gcard-photo">
                    {item.imageUrl ? (
                      <BlurUpImage
                        src={item.imageUrl}
                        alt=""
                        width={160}
                        height={160}
                        sizes="(max-width: 440px) 45vw, 160px"
                        fallback={<PhotoPlaceholder icon={a!.icon} />}
                      />
                    ) : (
                      <PhotoPlaceholder icon={a!.icon} />
                    )}
                  </div>
                  <div className="gcard-body">
                    <span className="gcard-name">{item.name}</span>
                    {item.nameMy && <span className="gcard-name-my">{item.nameMy}</span>}
                    {(item.brand || size) && (
                      <span className="gcard-meta">
                        {[item.brand, size].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    <span className="gcard-price-row">
                      <b className="gcard-price">{price}</b>
                      {unit && <small className="gcard-unit">{unit}</small>}
                      {item.ebt && <small className="gcard-ebt">EBT</small>}
                    </span>
                  </div>
                  {line ? (
                    // In the cart → the same stepper anatomy/handlers as the basket rows (busy =
                    // aria-disabled + early-return, never `disabled` — keeps keyboard focus alive).
                    <span
                      className="grocery-stepper gcard-stepper"
                      role="group"
                      aria-label={`${item.name} quantity`}
                      data-busy={busy || undefined}
                    >
                      <button
                        type="button"
                        className="grocery-step-btn"
                        aria-label={line.qty <= 1 ? `Remove ${item.name}` : `One less ${item.name}`}
                        aria-disabled={busy}
                        onClick={() => onStep(line, line.qty - 1)}
                      >
                        <span aria-hidden>−</span>
                      </button>
                      <span className="gcard-qty">{line.qty}</span>
                      <button
                        type="button"
                        className="grocery-step-btn"
                        aria-label={`One more ${item.name}`}
                        aria-disabled={busy || line.qty >= 99}
                        onClick={() => onStep(line, line.qty + 1)}
                      >
                        <span aria-hidden>+</span>
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="gcard-add"
                      aria-label={`Add ${item.name} — ${price}`}
                      aria-disabled={busy}
                      onClick={() => onAdd(item)}
                    >
                      <span aria-hidden>+</span> Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
