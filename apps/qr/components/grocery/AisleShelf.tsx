"use client";
import type { MouseEvent, RefObject } from "react";
import { Icon } from "@mms/ui";
import { GroceryCard } from "@/components/grocery/GroceryCard";
import type { GroceryCatalogItem, GroceryLine } from "@/lib/grocery";
import { aislePreview, type Aisle } from "@/lib/grocery-aisles";
import { hashForAisle } from "@/lib/grocery-view";

/**
 * Phase 1c — one aisle's shelf on the market home: the heading, then the first six of the aisle in
 * the catalog's own order (`aislePreview`: name A→Z — no featured-first ranking while the featured
 * set is an unreviewed seed, G19), then "See all {n}" when there are more. Counts are measured from
 * the live catalog, never typed.
 *
 * On a phone the shelf is a horizontal snap rail (2 cards + a peek); from the tablet tier it is a
 * 3-across grid of two rows — a mouse has no sideways swipe (§18). `#aisle-sec-<slug>` keeps the
 * desktop fan-nav's scroll-spy anchors, and the section premieres ONCE per session (`.mms-stagger`,
 * zeroed on a revisit by SurfaceMemory).
 */
export function AisleShelf({
  aisle,
  items,
  index,
  lineByBarcode,
  canAdd,
  addingBarcode,
  busyLineId,
  pendingFocusRef,
  onOpen,
  onAdd,
  onStep,
  onSeeAll,
}: {
  aisle: Aisle;
  items: readonly GroceryCatalogItem[];
  /** Position among the shelves — the capped premiere stagger. */
  index: number;
  lineByBarcode: ReadonlyMap<string, GroceryLine>;
  canAdd: boolean;
  addingBarcode: string | null;
  busyLineId: string | null;
  pendingFocusRef: RefObject<string | null>;
  onOpen: (item: GroceryCatalogItem) => void;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
  onSeeAll: (slug: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { shown, total, more } = aislePreview(items);
  const headingId = `aisle-h-${aisle.slug}`;
  return (
    <section
      // W4f — the scroll-spy anchor + jump target for AisleFanNav; `.aisle-section` carries the
      // scroll-margin-top that lands a jump below the sticky AppHeader (not under it).
      id={`aisle-sec-${aisle.slug}`}
      data-aisle={aisle.slug}
      className="aisle-section mms-stagger"
      style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
      aria-labelledby={headingId}
    >
      <div className="aisle-shelf-head">
        <h2 id={headingId} className="aisle-heading">
          {aisle.en}
          <span className="aisle-heading-my" lang="my">
            {aisle.my}
          </span>
        </h2>
        {more ? (
          <a
            href={hashForAisle(aisle.slug)}
            className="aisle-shelf-all"
            data-see-all={aisle.slug}
            aria-label={`See all ${total} in ${aisle.en}`}
            onClick={(e) => onSeeAll(aisle.slug, e)}
          >
            See all {total}
            <Icon name="chevron" size={16} />
          </a>
        ) : (
          <span className="aisle-heading-count">
            {total} {total === 1 ? "item" : "items"}
          </span>
        )}
      </div>
      <ul role="list" className="shelf-rail" aria-labelledby={headingId}>
        {shown.map((item) => (
          <GroceryCard
            key={item.barcode}
            item={item}
            aisle={aisle}
            line={lineByBarcode.get(item.barcode)}
            canAdd={canAdd}
            addingBarcode={addingBarcode}
            busyLineId={busyLineId}
            pendingFocusRef={pendingFocusRef}
            onOpen={onOpen}
            onAdd={onAdd}
            onStep={onStep}
            variant="rail"
          />
        ))}
      </ul>
    </section>
  );
}
