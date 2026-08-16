"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@mms/ui";
import type { MenuItem } from "./MenuBrowser";
import { CRAVINGS, recommendByTaste, surpriseMe, type CravingId } from "@/lib/menu/taste";
import { DIETS, hasFreeFrom, passesDiets, type Diet } from "@/lib/menu/dietary";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The device's saved cravings — the "personalizable" half: picks persist and are editable any time. */
const TASTE_KEY = "mms.taste";

/**
 * W21 → W22 — "Explore your Burmese taste buds" (owner: the taste section "should be like the
 * allergen pills bar … incorporating some allergens pills into it"). One section now owns BOTH
 * vocabularies as matching single-line pill rails: the craving pills (recommenders — light one and
 * a rail of honest "here's why" cards appears) and the dietary pills (filters — the toolbar bar
 * they replace; they narrow the WHOLE menu below, and the caption says exactly that). The
 * recommendation pool respects the active diets, so a vegan pill can never sit lit beside a
 * shrimp recommendation.
 *
 * HONEST by construction (unchanged): every card SAYS why it's here (the literal rule it matched),
 * surprise picks are framed as "how about…", and the fail-safe free-from disclaimer travels with
 * the pills it belongs to.
 *
 * a11y: pills are true toggles (aria-pressed) in labelled groups; the rail reuses the start-here
 * card vocabulary. No live region — the menu view keeps its one (the cart provider's).
 */
export function TasteBand({
  items,
  heartedIds,
  diets,
  onToggleDiet,
  onSelect,
}: {
  items: MenuItem[];
  /** The diner's own hearts — "Surprise me" never offers what they already love. */
  heartedIds: ReadonlySet<string>;
  /** The menu-wide dietary filters — state lives in MenuBrowser (they filter the sections below). */
  diets: Diet[];
  onToggleDiet: (d: Diet) => void;
  onSelect: (i: MenuItem) => void;
}) {
  const [picks, setPicks] = useState<CravingId[]>([]);
  const [surprise, setSurprise] = useState<MenuItem[]>([]);

  // Hydrate the saved cravings AFTER mount (the repo's microtask pattern — SSR and the first client
  // render agree; setState only in the async callback). A corrupt entry just starts fresh.
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => localStorage.getItem(TASTE_KEY))
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const arr: unknown = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const valid = arr.filter((x): x is CravingId => CRAVINGS.some((c) => c.id === x));
            if (valid.length > 0) setPicks(valid);
          }
        } catch {
          /* deliberate: corrupt storage only loses saved picks, never function */
        }
      })
      .catch(() => {
        /* private mode — the picker just starts empty */
      });
    return () => {
      active = false;
    };
  }, []);

  function toggle(id: CravingId) {
    setSurprise([]); // a deliberate craving replaces the surprise row
    setPicks((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try {
        localStorage.setItem(TASTE_KEY, JSON.stringify(next));
      } catch {
        /* private mode — picks still work for this visit */
      }
      return next;
    });
  }

  // W22 — the recommendation pool honors the active diets: these pills filter the whole menu, and
  // a rail this section itself offers must clear the same bar (a lit vegan pill beside a shrimp
  // card would be the exact dishonesty the fail-safe rule exists to prevent).
  const pool = useMemo(
    () => items.filter((i) => !i.is_sold_out && passesDiets(i, diets)),
    [items, diets],
  );
  const recs = useMemo(() => recommendByTaste(pool, picks), [pool, picks]);
  // The surprise row, when asked for, replaces the craving matches until the next pick.
  // W21 review — re-derived BY ID against the live pool each render: the tapped snapshot could go
  // stale across a refresh (a card still offering a since-sold-out dish at its old price), and a
  // diet toggled after the tap must drop non-passing picks the same way.
  const liveSurprise = useMemo(() => {
    if (surprise.length === 0) return [];
    const byId = new Map(pool.map((i) => [i.id, i]));
    return surprise.map((s) => byId.get(s.id)).filter((i): i is MenuItem => !!i);
  }, [surprise, pool]);
  const showing: { item: MenuItem; why: string }[] =
    liveSurprise.length > 0
      ? liveSurprise.map((item) => ({ item, why: "How about this?" }))
      : recs.map(({ item, matched }) => ({
          item,
          why: matched.map((c) => `${c.emoji} ${c.en}`).join(" · "),
        }));

  const freeFrom = hasFreeFrom(diets);

  return (
    <section aria-labelledby="taste-h" style={{ padding: "10px 0 2px" }}>
      <h2 id="taste-h" className="start-here-h">
        Explore your Burmese taste buds <span aria-hidden>✦</span>
        <span className="start-here-sub">pick a craving — or let us surprise you</span>
      </h2>
      <Rail role="group" aria-label="Pick your cravings" className="taste-rail">
        {CRAVINGS.map((c) => {
          const on = picks.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              className={`taste-chip${on ? " taste-chip-on" : ""}`}
              onClick={() => toggle(c.id)}
            >
              <span aria-hidden className="taste-emoji">
                {c.emoji}
              </span>
              {c.en}
              {/* K15 — Claude-authored MY accents, pending the native check like every batch. */}
              <span lang="my" className="taste-chip-my">
                {c.my}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="taste-chip taste-chip-surprise"
          onClick={() => setSurprise(surpriseMe(pool, heartedIds))}
        >
          <span aria-hidden className="taste-emoji">
            ✨
          </span>
          Surprise me
          <span lang="my" className="taste-chip-my">
            အံ့ဩစရာလေး
          </span>
        </button>
      </Rail>
      {/* W22 — the dietary pills (the old toolbar bar, absorbed): same pill vocabulary, DIFFERENT
          verb — these filter the whole menu, and the caption owns saying so before any pill is lit. */}
      <p id="taste-diet-cap" className="taste-caption">
        Dietary needs
        <span className="taste-caption-note">— filters the whole menu</span>
        {/* K15 — Claude-authored MY accent, pending the native check like every batch. */}
        <span lang="my" className="taste-caption-my">
          မီနူးတစ်ခုလုံး စစ်ထုတ်ပေးမယ်
        </span>
      </p>
      <Rail role="group" aria-labelledby="taste-diet-cap" className="taste-rail">
        {DIETS.map((d) => {
          const on = diets.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              className={`taste-chip${on ? " taste-chip-on" : ""}`}
              onClick={() => onToggleDiet(d.id)}
            >
              <span aria-hidden className="taste-emoji">
                {d.emoji}
              </span>
              {d.label}
              <span lang="my" className="taste-chip-my">
                {d.my}
              </span>
            </button>
          );
        })}
      </Rail>
      {/* Fail-safe disclaimer — travels with the pills: a guide, never a guarantee. */}
      {freeFrom && (
        <p
          role="note"
          style={{
            margin: "8px 2px 0",
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            lineHeight: 1.4,
          }}
        >
          <Icon
            name="info"
            size={13}
            style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
          />
          Allergen info is a guide — please tell our staff about any allergy.
        </p>
      )}
      {showing.length > 0 && (
        <Rail
          as="ul"
          role="list"
          className={`start-here-rail mms-rise${showing.length > 3 ? " start-here-rail-wall" : ""}`}
          aria-labelledby="taste-h"
        >
          {showing.map(({ item: i, why }) => (
            <li key={i.id}>
              <button type="button" className="start-here-card" onClick={() => onSelect(i)}>
                <span className="start-here-photo" aria-hidden>
                  <BlurUpImage
                    src={i.image_url}
                    alt=""
                    width={160}
                    height={110}
                    sizes="160px"
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
                {/* The honesty line — the literal rule this dish matched (or the surprise frame). */}
                <span className="taste-why">{why}</span>
              </button>
            </li>
          ))}
        </Rail>
      )}
      {showing.length === 0 && (picks.length > 0 || surprise.length > 0) && (
        // An honest empty answer beats a filler recommendation the picks don't back. Review MED:
        // matching is OR, so "fewer cravings" could only shrink the answer — DIFFERENT is the
        // advice that can actually help (and with diets active, loosening those is the other lever).
        <p style={{ margin: "4px 0 8px", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          {diets.length > 0
            ? "Nothing matches those right now — try different cravings, or ease a dietary filter."
            : "Nothing matches those right now — try different cravings."}
        </p>
      )}
    </section>
  );
}
