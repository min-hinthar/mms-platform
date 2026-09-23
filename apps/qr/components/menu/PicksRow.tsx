"use client";
import { useMemo, useState } from "react";
import type { MenuItem } from "./MenuBrowser";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";
import { passesDiets, type Diet } from "@/lib/menu/dietary";
import { refillSurprise, surpriseMe, TASTE_ROW_MAX } from "@/lib/menu/taste";
import { picksLenses, type PicksLens } from "@/lib/menu/picks";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Phase 1a — ONE row of picks, under the toolbar, with three lenses on the menu's own selection
 * pills: the diner's favorites (once they have any), the most-ordered dishes, and a Surprise draw.
 *
 * It replaces three stacked bands (Start here's two auto-scrolling rows, their pause control, and
 * the "Explore your Burmese taste buds" panel) that together pushed the search and categories
 * ~1,170px down the page. The owner reversed M133 for this (2026-09-23: "Toolbar first"). What was
 * worth keeping from each is kept: the POS-backed "Most ordered" set (M135 — a SET, never a rank),
 * the favorites' precedence for a returning diner (J5), and the surprise draw's honesty rules
 * (`lib/menu/taste.ts` — prefers the most ordered, never a dish already hearted, never sold out).
 *
 * Static, not a marquee: a row that moves on its own owed a pause button and clipped whichever card
 * sat at the edge. The Rail snaps to card starts and fades its edges, so nothing reads as cut off.
 *
 * a11y: a labelled region; the lens pills are toggles (`aria-pressed`) in a named group; the
 * Surprise pill describes its own outcome (`aria-describedby`), announced by the tap that changed it
 * — no second live region on the menu (QA §A). Every card is one ≥44px button that opens the sheet.
 */
export function PicksRow({
  items,
  favorites,
  popular,
  dataBacked,
  popularIds,
  heartedIds,
  diets,
  onSelect,
}: {
  /** The whole catalog — the surprise pool. */
  items: MenuItem[];
  /** Hearted dishes on today's menu, newest first (J5). */
  favorites: MenuItem[];
  /** The most-ordered set, in sales order (M135). */
  popular: MenuItem[];
  /** True only when the POS export curated `popular` — decides the honest label. */
  dataBacked: boolean;
  popularIds: string[];
  heartedIds: ReadonlySet<string>;
  /** The toolbar's dietary filters: every lens clears the same bar the menu below does. */
  diets: Diet[];
  onSelect: (i: MenuItem) => void;
}) {
  const pool = useMemo(
    () => items.filter((i) => !i.is_sold_out && passesDiets(i, diets)),
    [items, diets],
  );
  const fits = (list: MenuItem[]) => list.filter((i) => !i.is_sold_out && passesDiets(i, diets));

  const lenses = picksLenses({
    favorites: fits(favorites).length,
    popular: fits(popular).length,
    pool: pool.length,
  });
  const [chosen, setChosen] = useState<PicksLens | null>(null);
  const [drawn, setDrawn] = useState<MenuItem[]>([]);
  // The chosen lens survives only while it still has something to show; otherwise the first one
  // that does (favorites → most ordered → surprise) — never a stuck empty lens after a filter.
  const lens: PicksLens | null = chosen && lenses.includes(chosen) ? chosen : (lenses[0] ?? null);

  const surprise = useMemo(() => {
    if (drawn.length === 0) return [];
    const byId = new Map(pool.map((i) => [i.id, i]));
    const alive = drawn.map((s) => byId.get(s.id)).filter((i): i is MenuItem => !!i);
    return refillSurprise(alive, pool, heartedIds, popularIds);
  }, [drawn, pool, heartedIds, popularIds]);

  if (!lens) return null;

  const shown =
    lens === "favorites" ? fits(favorites) : lens === "popular" ? fits(popular) : surprise;

  const draw = () => {
    setChosen("surprise");
    setDrawn(surpriseMe(pool, heartedIds, TASTE_ROW_MAX, popularIds));
  };

  const outcome =
    lens !== "surprise" || drawn.length === 0
      ? "Picks a few dishes for you, never one you have already hearted."
      : surprise.length > 0
        ? `We picked ${surprise.length} ${surprise.length === 1 ? "dish" : "dishes"} for you. Tap again to shuffle.`
        : "Nothing new to surprise you with right now.";

  const label = (l: PicksLens) =>
    l === "favorites"
      ? "Your favorites"
      : l === "popular"
        ? dataBacked
          ? "Most ordered"
          : "Our picks"
        : lens === "surprise" && drawn.length > 0
          ? "Shuffle"
          : "Surprise me";

  return (
    <section aria-label="Start here" className="picks">
      <div role="group" aria-label="Show" className="picks-lenses">
        {lenses.map((l) => {
          const on = lens === l;
          return (
            <button
              key={l}
              type="button"
              className={`menu-tab${on ? " menu-tab-on" : ""}`}
              aria-pressed={on}
              aria-describedby={l === "surprise" ? "picks-outcome" : undefined}
              onClick={l === "surprise" ? draw : () => setChosen(l)}
            >
              {l === "surprise" && <span aria-hidden>✦ </span>}
              {label(l)}
            </button>
          );
        })}
      </div>
      <span id="picks-outcome" className="sr-only">
        {outcome}
      </span>

      {shown.length > 0 ? (
        <Rail
          as="ul"
          role="list"
          className="start-here-rail picks-rail"
          aria-label={`${lens === "surprise" ? "Picked for you" : label(lens)} — ${shown.length} ${shown.length === 1 ? "dish" : "dishes"}`}
        >
          {shown.map((i, n) => (
            <li key={`${lens}-${i.id}`} style={{ ["--i" as string]: n }}>
              <button type="button" className="start-here-card" onClick={() => onSelect(i)}>
                <span className="start-here-photo" aria-hidden>
                  <BlurUpImage
                    src={i.image_url}
                    alt=""
                    width={160}
                    height={120}
                    sizes="166px"
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
      ) : (
        <p className="picks-empty">
          {lens === "surprise" && drawn.length === 0
            ? "Tap Surprise me and we’ll pick a few dishes."
            : outcome}
        </p>
      )}
    </section>
  );
}
