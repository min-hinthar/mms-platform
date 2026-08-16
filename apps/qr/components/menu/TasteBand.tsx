"use client";
import { useEffect, useMemo, useState } from "react";
import type { MenuItem } from "./MenuBrowser";
import { CRAVINGS, recommendByTaste, surpriseMe, type CravingId } from "@/lib/menu/taste";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The device's saved cravings — the "personalizable" half: picks persist and are editable any time. */
const TASTE_KEY = "mms.taste";

/**
 * W21 (owner: "a personalizble/customizable recommendations section for first time customers or
 * wants something new for anyone") — the taste picker: craving chips → a recommendation rail, plus
 * a "Surprise me" for the something-new mood. HONEST by construction: every card SAYS why it's
 * here (the literal category/tag rule it matched — lib/menu/taste.ts), and surprise picks are
 * framed as "how about…", never as a data-backed match. Picks persist per-device (localStorage)
 * so a returning diner's cravings are pre-set — and one tap away from different.
 *
 * a11y: chips are true toggles (aria-pressed) in a labelled group; the rail reuses the start-here
 * card vocabulary (real list, one ≥44px button per card, decorative photo). No live region — the
 * menu view keeps its one (the cart provider's), and the row is plain content in reading order.
 */
export function TasteBand({
  items,
  heartedIds,
  onSelect,
}: {
  items: MenuItem[];
  /** The diner's own hearts — "Surprise me" never offers what they already love. */
  heartedIds: ReadonlySet<string>;
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

  const inStock = useMemo(() => items.filter((i) => !i.is_sold_out), [items]);
  const recs = useMemo(() => recommendByTaste(inStock, picks), [inStock, picks]);
  // The surprise row, when asked for, replaces the craving matches until the next pick.
  const showing: { item: MenuItem; why: string }[] =
    surprise.length > 0
      ? surprise.map((item) => ({ item, why: "How about this?" }))
      : recs.map(({ item, matched }) => ({
          item,
          why: matched.map((c) => `${c.emoji} ${c.en}`).join(" · "),
        }));

  return (
    <section aria-labelledby="taste-h" style={{ padding: "10px 0 2px" }}>
      <h2 id="taste-h" className="start-here-h">
        Find your dish <span aria-hidden>✦</span>
        <span className="start-here-sub">pick a craving — or let us surprise you</span>
      </h2>
      <div role="group" aria-label="Pick your cravings" className="taste-chips">
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
              <span aria-hidden>{c.emoji} </span>
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
          onClick={() => setSurprise(surpriseMe(inStock, heartedIds))}
        >
          <span aria-hidden>✨ </span>
          Surprise me
          <span lang="my" className="taste-chip-my">
            အံ့ဩစရာလေး
          </span>
        </button>
      </div>
      {showing.length > 0 && (
        <Rail as="ul" role="list" className="start-here-rail" aria-labelledby="taste-h">
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
                {/* The honesty line — the literal rule this card matched (or the surprise frame). */}
                <span className="taste-why">{why}</span>
              </button>
            </li>
          ))}
        </Rail>
      )}
      {showing.length === 0 && picks.length > 0 && (
        // An honest empty answer beats a filler recommendation the picks don't back.
        <p style={{ margin: "4px 0 8px", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          Nothing matches all of that right now — try fewer cravings.
        </p>
      )}
    </section>
  );
}
