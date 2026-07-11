"use client";
import type { MenuItem } from "./MenuBrowser";
import { BlurUpImage } from "./BlurUpImage";

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
        <span className="start-here-sub">{dataBacked ? "what tables love" : "our picks to start"}</span>
      </h2>
      <ul role="list" className="start-here-rail" aria-labelledby="start-here-h">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className="start-here-card" onClick={() => onSelect(i)}>
              {i.image_url && (
                <span className="start-here-photo" aria-hidden>
                  <BlurUpImage src={i.image_url} alt="" width={128} height={88} sizes="128px" />
                </span>
              )}
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
      </ul>
    </section>
  );
}
