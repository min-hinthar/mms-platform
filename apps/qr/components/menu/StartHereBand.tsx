"use client";
import type { MenuItem } from "./MenuBrowser";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * J2 — the "Start here" band (docs/JOURNEY_PLAN.md · guided start). First-timers face a wall of items;
 * this is the guided opening: a horizontal rail of the dishes tables actually love. Curation is REAL
 * data first (mostLoved.ts paid-order counts), honest fallback to the hand-set `popular` tag while
 * order history is thin — the caller decides; this component just renders what it's given and never
 * invents an ordering. Tapping a card opens the same item sheet as the menu row (one detail surface).
 *
 * a11y: a labelled region; the rail is a real list; each card one ≥44px button whose accessible name is
 * the dish + price (the photo is decorative — BlurUpImage gets alt="" here since the name is adjacent).
 * The rail scrolls horizontally by touch/wheel; every card is a tab stop, so keyboard users reach all
 * of them without a scroll affordance. Entrance rides `.mms-stagger` (once per session, RM-gated).
 */
export function StartHereBand({
  items,
  dataBacked,
  onSelect,
}: {
  items: MenuItem[];
  /** True only when real paid-order counts curated this rail (>=3 crowned items) — drives the honest
   *  sub-heading: observed table behavior vs our own picks. */
  dataBacked: boolean;
  onSelect: (i: MenuItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="start-here-h"
      className="mms-stagger"
      // 90ms after the arrival beat above so the first-visit cascade reads TOP-DOWN (greeting, then rail).
      style={{ padding: "10px 0 2px", animationDelay: "90ms" }}
    >
      <h2 id="start-here-h" className="start-here-h">
        Start here <span aria-hidden>✦</span>
        <span className="start-here-sub">
          {dataBacked ? "what tables love" : "our picks to start"}
        </span>
      </h2>
      <Rail as="ul" role="list" className="start-here-rail" aria-labelledby="start-here-h">
        {items.map((i, idx) => (
          <li key={i.id}>
            <button type="button" className="start-here-card" onClick={() => onSelect(i)}>
              {/* W20 — the rank seal, ONLY when real paid-order counts curated this rail: a numeral
                  this prominent is a claim, and the hand-set "our picks" fallback has no ranking to
                  claim. #1 wears the gold cap. The sr-only twin says it in words (the seal itself
                  is decorative — the visible numeral alone would read as a price or a quantity). */}
              {dataBacked && (
                <>
                  <span
                    className={`start-here-rank${idx === 0 ? " start-here-rank-top" : ""}`}
                    aria-hidden
                  >
                    {idx + 1}
                  </span>
                  <span className="sr-only">
                    {idx === 0 ? "Most loved at tables. " : `No. ${idx + 1} at tables. `}
                  </span>
                </>
              )}
              {/* W16e — NO truthiness gate on the slot: BlurUpImage already renders the designed
                  PhotoPlaceholder for a null src, and gating the whole <span> away made photo-less
                  dishes render as ragged short cards beside full ones (W13's "the slot always
                  renders" rule). */}
              <span className="start-here-photo" aria-hidden>
                <BlurUpImage
                  src={i.image_url}
                  alt=""
                  width={128}
                  height={88}
                  sizes="128px"
                  fallback={<PhotoPlaceholder category={i.category} />}
                />
              </span>
              <span className="start-here-name">{i.name_en}</span>
              {i.name_my && (
                <span lang="my" className="start-here-my">
                  {i.name_my}
                </span>
              )}
              <span className="start-here-price">{dollars(i.base_price_cents)}</span>
            </button>
          </li>
        ))}
      </Rail>
    </section>
  );
}
