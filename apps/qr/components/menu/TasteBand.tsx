"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MenuItem } from "./MenuBrowser";
import { surpriseMe, refillSurprise, TASTE_ROW_MAX } from "@/lib/menu/taste";
import { passesDiets, type Diet } from "@/lib/menu/dietary";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * W21 → W22 → M135 → M137 — "Explore your Burmese taste buds", rebuilt around ONE feature.
 *
 * Owner: "make surprise your taste buds the one and only main feature for explore your burmese
 * taste buds section so let's reimagine it."
 *
 * WHAT WENT, AND WHY IT WAS RIGHT TO GO. The section used to carry eight craving pills (🍜 noodles,
 * 🌶 heat, 🧁 sweet …) beside the surprise chip, and W22 briefly parked the dietary pills here too.
 * Three pill vocabularies on one band, two of which asked the diner to already know what they
 * wanted — which is the opposite of what a section for first-timers is for. The cravings also
 * competed with the thing that actually helps someone who cannot read the menu yet: a single tap
 * that answers. Surprise is now the whole feature, and the section is shaped like one invitation
 * instead of a shelf of controls.
 *
 * HONEST by construction, unchanged where it counts: the draw prefers the most-ordered dishes
 * (M135's POS units) but every card still says "How about this?" and never a claim; the pool
 * respects the dietary filters the toolbar owns, so a lit vegan filter can never sit above a shrimp
 * card; and an empty answer stays empty rather than being padded, because WHICH kind of empty it is
 * is information the diner needs.
 *
 * a11y: the invitation and the stood-down line are DIFFERENT elements, so the first tap unmounts
 * the very button that was activated and focus would fall to `<body>` — the repo's focus-on-remove
 * rule, and the same one `DietFilterButton` cites for its ✕. So the tap MOVES focus to "Shuffle
 * again", which is the control's continuation, and that button is described by an sr-only line
 * naming the outcome — so a screen-reader user hears what the tap produced without a second live
 * region (the menu view keeps its one, the cart provider's). The results rail is labelled by its
 * own count.
 */
export function TasteBand({
  items,
  popularIds = [],
  heartedIds,
  diets,
  onSelect,
}: {
  items: MenuItem[];
  /** M135 — the POS sales order, most-sold first. A selection preference for what gets OFFERED;
   *  it never becomes copy, and an empty list restores a plain uniform shuffle. */
  popularIds?: string[];
  /** The diner's own hearts — the surprise draw never offers what they already love. */
  heartedIds: ReadonlySet<string>;
  /** The menu-wide dietary filters — OWNED by MenuBrowser's toolbar. Read-only here: this pool must
   *  clear the same bar the rest of the menu does. */
  diets: Diet[];
  onSelect: (i: MenuItem) => void;
}) {
  const [surprise, setSurprise] = useState<MenuItem[]>([]);
  // Whether Surprise was ASKED — distinct from whether it returned anything (Codex round 3 on
  // #194): an exhausted pool answers [] at tap time, and length checks alone read that as "never
  // requested", so the tap looks like it silently did nothing. The flag routes it to an honest
  // empty state instead.
  const [asked, setAsked] = useState(false);
  // Focus continuity across the invite → "again" swap. Set only on the tap that CAUSES the swap, so
  // a later shuffle (focus already on the button) never re-grabs, and a re-render never does.
  const againRef = useRef<HTMLButtonElement>(null);
  const wantFocusRef = useRef(false);

  const pool = useMemo(
    () => items.filter((i) => !i.is_sold_out && passesDiets(i, diets)),
    [items, diets],
  );

  // Re-derived BY ID against the live pool every render (W21 review): the tapped snapshot goes stale
  // across a catalog refresh (a card still offering a since-sold-out dish at its old price), and a
  // diet switched on after the tap must drop the picks that no longer qualify. `refillSurprise`
  // (lib/menu/taste.ts) then tops a PARTIAL row back up while leaving an EMPTY one empty — the two
  // are different facts and its docblock carries why.
  const picked = useMemo(() => {
    if (surprise.length === 0) return [];
    const byId = new Map(pool.map((i) => [i.id, i]));
    const alive = surprise.map((s) => byId.get(s.id)).filter((i): i is MenuItem => !!i);
    return refillSurprise(alive, pool, heartedIds, popularIds);
  }, [surprise, pool, heartedIds, popularIds]);

  /**
   * The one sentence BOTH surfaces read — the visible empty line and the sr-only description of the
   * button focus lands on. Named once so the two can never drift (the repo's "name it ONCE" rule).
   *
   * Each case names its OWN truth. Drawn-then-nothing-survived used to read "Those picks don't fit
   * your dietary filters", which was wrong twice over: `pool` also drops SOLD-OUT dishes, so a dish
   * selling out between the tap and the render emptied the row with no filter involved at all — and
   * the sentence rendered verbatim with ZERO filters lit, advising a lever the diner had never
   * pulled. The cause is genuinely unknowable from here (sold out, delisted by a catalog refresh, or
   * a filter switched on after the tap all look identical), and W17's rule is that guessing is worse
   * than saying so — so it states the fact and the remedy, and attributes nothing.
   */
  const outcome =
    picked.length > 0
      ? `We picked ${picked.length} ${picked.length === 1 ? "dish" : "dishes"} for you.`
      : surprise.length > 0
        ? "Those picks aren’t available any more — shuffle again."
        : pool.length > 0
          ? "Nothing new to surprise you with — your favorites already cover everything that fits."
          : diets.length > 0
            ? "Nothing to surprise you with under those filters — ease one, or browse the menu below."
            : "Nothing in stock to surprise you with right now.";

  const draw = () => {
    wantFocusRef.current = !asked;
    setAsked(true);
    setSurprise(surpriseMe(pool, heartedIds, TASTE_ROW_MAX, popularIds));
  };

  useEffect(() => {
    if (!asked || !wantFocusRef.current) return;
    wantFocusRef.current = false;
    // preventScroll — a touch tap must not yank the page away from the row that just appeared.
    againRef.current?.focus({ preventScroll: true });
  }, [asked]);

  return (
    <section aria-labelledby="taste-h" className="taste-band">
      <h2 id="taste-h" className="start-here-h">
        Explore your Burmese taste buds <span aria-hidden>✦</span>
        <span className="start-here-sub">one tap, a few dishes, no menu-reading required</span>
      </h2>

      {!asked ? (
        /* THE INVITATION — the section's whole first state. It is a real panel on the shipped paper
           surface rather than a chip in a rail, because it is now the only thing here: a control
           that has to carry a section cannot look like one option among eight. */
        <div className="card card-textured taste-invite mms-rise">
          <span aria-hidden className="taste-invite-glyph">
            ✨
          </span>
          <p className="taste-invite-title">
            Surprise your taste buds
            <span lang="my" className="taste-invite-my">
              အံ့ဩစရာလေး
            </span>
          </p>
          {/* No claim in this copy on purpose. The draw PREFERS the most-ordered dishes, but it tops
              up from the rest when it must, so "what people order most" would be true of the
              algorithm and not of every card. The cards say "How about this?" and mean it. */}
          <p className="taste-invite-line">
            Not sure where to start? Tap once and we’ll pick a few.
          </p>
          <button
            type="button"
            className="taste-invite-btn"
            aria-describedby="taste-surprise-hint"
            onClick={draw}
          >
            Surprise me
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </button>
          <span id="taste-surprise-hint" className="sr-only">
            Picks a few dishes for you at random, and never one you have already hearted.
          </span>
        </div>
      ) : (
        /* AFTER THE TAP — the invitation stands down to a single line so the dishes get the room.
           The control keeps its place in the reading order directly above the row it produces. */
        <p className="taste-again">
          <span className="taste-again-label">
            <span aria-hidden>✨</span> Here’s what we picked
          </span>
          <button
            ref={againRef}
            type="button"
            className="taste-again-btn"
            aria-describedby="taste-outcome"
            onClick={draw}
          >
            Shuffle again
          </button>
          {/* The outcome in words, for the focus this tap just moved here. Not a live region — it
              is a DESCRIPTION of the control focus lands on, so it is announced by the move itself
              and never re-announced on an unrelated re-render. */}
          <span id="taste-outcome" className="sr-only">
            {outcome}
          </span>
        </p>
      )}

      {picked.length > 0 && (
        <Rail
          as="ul"
          role="list"
          className="start-here-rail mms-rise taste-rail-row"
          aria-label={`${picked.length} ${picked.length === 1 ? "dish" : "dishes"} we picked for you`}
        >
          {picked.map((i, n) => (
            /* `--i` drives the per-card cascade (globals.css). A PRESENTATION ordinal only: it never
               reaches copy and never implies a ranking, which is why it can be the array position
               rather than anything the data has to back. */
            <li key={i.id} style={{ ["--i" as string]: n }}>
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
                <span className="taste-why">How about this?</span>
              </button>
            </li>
          ))}
        </Rail>
      )}

      {asked && picked.length === 0 && <p className="taste-empty">{outcome}</p>}
    </section>
  );
}
