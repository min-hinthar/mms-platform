"use client";
import { Icon } from "@mms/ui";
import { modePriceCents } from "@/lib/mode-price";
import type { MenuItem } from "./MenuBrowser";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * J5 — "Your favorites" (docs/JOURNEY_PLAN.md · recognition): the return-visit opening. Same rail
 * vocabulary as J2's StartHereBand (one visual system, one card size, the same item sheet on tap) but
 * curated by the diner's OWN hearts — the strongest honest signal there is. The caller decides
 * precedence (favorites replace the start-here band once any exist: a returning diner needs their own
 * shortlist, not our guidance) and passes only hearted items that are on TODAY's menu.
 *
 * a11y mirrors StartHereBand: labelled region, real list, one ≥44px button per card named
 * dish + price; photos decorative. Entrance rides `.mms-stagger` (once per session, RM-gated).
 */
export function FavoritesRail({
  items,
  lineMode,
  onSelect,
}: {
  items: MenuItem[];
  /** W16a — the session-mode price factor key: dine-in ×1.15, to-go ×1.05 (lib/mode-price). */
  lineMode: "dinein" | "togo";
  onSelect: (i: MenuItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="favorites-h"
      className="mms-stagger"
      // 90ms after the arrival beat, same slot as the start-here band it replaces (top-down cascade).
      style={{ padding: "10px 0 2px", animationDelay: "90ms" }}
    >
      <h2 id="favorites-h" className="start-here-h">
        Your favorites{" "}
        <Icon
          name="favorite"
          size={16}
          fill="currentColor"
          style={{ display: "inline", verticalAlign: "-2px" }}
        />
        <span className="start-here-sub">one tap back to the good stuff</span>
      </h2>
      <Rail as="ul" role="list" className="start-here-rail" aria-labelledby="favorites-h">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className="start-here-card" onClick={() => onSelect(i)}>
              {i.image_url && (
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
              )}
              <span className="start-here-name">{i.name_en}</span>
              {i.name_my && (
                <span className="start-here-my" lang="my">
                  {i.name_my}
                </span>
              )}
              <span className="start-here-price">{dollars(modePriceCents(i.base_price_cents, lineMode))}</span>
            </button>
          </li>
        ))}
      </Rail>
    </section>
  );
}
