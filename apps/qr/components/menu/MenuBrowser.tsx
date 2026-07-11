"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@mms/ui";
import { AddButton } from "@/components/AddButton";
import { CartBar } from "@/components/CartBar";
import { GuestList } from "@/components/GuestList";
import { PickupSlotChip } from "@/components/PickupSlotChip";
import { BlurUpImage } from "./BlurUpImage";
import { DIETS, hasFreeFrom, passesDiets, type Diet } from "@/lib/menu/dietary";
import type { ModGroup } from "@/lib/menu/modifiers";
import { itemBadges } from "@/lib/menu/badges";
import { ItemSheet } from "./ItemSheet";
import { ArrivalBeat } from "./ArrivalBeat";
import { StartHereBand } from "./StartHereBand";

export type MenuItem = {
  id: string;
  name_en: string;
  name_my: string | null;
  description_en: string | null;
  base_price_cents: number;
  image_url: string | null;
  is_sold_out: boolean;
  tags: string[];
  allergens: string[];
  category: string;
  // R6b: modifier groups loaded eagerly with the item (most items have none) for the detail sheet's
  // instant preview. Advisory only — the server re-derives the charge on add.
  modifierGroups: ModGroup[];
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Menu browse layer (R6a). A client island the RSC page hands the server-fetched catalog: it owns the
 * search / category / dietary state and renders the sticky toolbar + grouped sections. Data stays
 * server-fetched (RLS, fast TTFB); only the interaction is client-side. The item rows keep the R5a
 * textured card + the AddButton morph; the item DETAIL sheet is R6b.
 */
export function MenuBrowser({
  items,
  mode,
  favoriteIds = [],
}: {
  items: MenuItem[];
  mode: string;
  /** J2: menu-item ids ranked by REAL paid-order counts (lib/menu/mostLoved.ts, server-computed,
   *  counts-only). Drives the "Start here" band + the data-backed "Table favorite" badge. Empty while
   *  order history is thin → the band falls back to `popular`-tagged items, badges to the manual tag. */
  favoriteIds?: string[];
}) {
  const [q, setQ] = useState("");
  const [diets, setDiets] = useState<Diet[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // R6b: the item whose detail sheet is open (null = closed). Radix restores focus to the trigger row on close.
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const toolbarRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Measured sticky-toolbar height — drives both the scroll-spy top inset and section scroll-margin so a
  // tab-click lands the heading just under the toolbar. Measured (not hard-coded) because the toolbar grows
  // when the rail/diet chips wrap or the disclaimer appears; falls back to 150 pre-measure / without RO.
  const [toolbarH, setToolbarH] = useState(150);

  // Category order as fetched (the server sorted by sort_order); first occurrence wins.
  const allCats = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  // J2 guided start: the data-backed favorite set (badges) + the "Start here" rail (top 6, in-stock,
  // rank order preserved). The rail claims table behavior ("what tables love") ONLY when counts back it —
  // and only with ≥3 crowned items, so a thin dataset can't render a lone-card "band". Otherwise it falls
  // back to the hand-set `popular` tag under honest "our picks" framing (dataBacked drives the copy).
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const startHere = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const loved = favoriteIds
      .map((id) => byId.get(id))
      .filter((i): i is MenuItem => !!i && !i.is_sold_out);
    const dataBacked = loved.length >= 3;
    const pool = dataBacked
      ? loved
      : items.filter((i) => !i.is_sold_out && i.tags.includes("popular"));
    // A rail needs at least 3 cards on EITHER path (sparse `popular` tagging could otherwise render a
    // lone-card "band" that reads as broken) — below that, no band at all.
    const rail = pool.slice(0, 6);
    return { items: rail.length >= 3 ? rail : [], dataBacked };
  }, [items, favoriteIds]);

  // Visible items = search match (EN/MY/description) ∩ dietary filters. Pure, recomputed on input.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!passesDiets(i, diets)) return false;
      if (!needle) return true;
      return (
        i.name_en.toLowerCase().includes(needle) ||
        (i.name_my?.toLowerCase().includes(needle) ?? false) ||
        (i.description_en?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [items, q, diets]);

  // Categories that still have a visible item (the rail + sections track the filtered set).
  const cats = useMemo(
    () => allCats.filter((c) => visible.some((i) => i.category === c)),
    [allCats, visible],
  );

  const freeFrom = hasFreeFrom(diets);
  const empty = visible.length === 0;

  // Measure the sticky toolbar so the scroll-spy inset + section scroll-margin track its real height
  // (it grows when chips wrap / the disclaimer shows). Falls back to the 150 seed if RO is unavailable.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setToolbarH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll-spy: mark the section nearest the top (just under the sticky toolbar) as the active tab.
  useEffect(() => {
    if (cats.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const onScreen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (onScreen) setActiveCat(onScreen.target.getAttribute("data-cat"));
      },
      // Top inset = measured toolbar height so a section counts as "active" once it clears the toolbar.
      { rootMargin: `-${Math.round(toolbarH)}px 0px -55% 0px`, threshold: 0 },
    );
    for (const c of cats) {
      const el = sectionRefs.current.get(c);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [cats, toolbarH]);

  // Keep the active category chip centered in the horizontal rail whenever it changes — whether from a
  // tab click OR the scroll-spy tracking the page scroll — so the selected tab is never off-screen or
  // stuck at an edge. Scrolls ONLY the rail (measured via rects) so it never nudges the page vertically.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeCat) return;
    const chip = rail.querySelector<HTMLElement>('[aria-current="true"]');
    if (!chip) return;
    const railRect = rail.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta = chipRect.left + chipRect.width / 2 - (railRect.left + railRect.width / 2);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left: rail.scrollLeft + delta, behavior: reduce ? "auto" : "smooth" });
  }, [activeCat]);

  // a11y: when filtering empties the list, pull focus to the recovery action — but NOT while the user is
  // actively typing in the search box (stealing focus would interrupt their query). Only the diet-chip /
  // post-type empty states move focus; the live region (role="status") announces the change either way.
  useEffect(() => {
    if (!empty) return;
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement && active.type === "search";
    if (!typing) clearBtnRef.current?.focus();
  }, [empty]);

  function jumpTo(cat: string) {
    setActiveCat(cat);
    const el = sectionRefs.current.get(cat);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function toggleDiet(d: Diet) {
    setDiets((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  function clearFilters() {
    setQ("");
    setDiets([]);
    // The Clear button unmounts as the list refills — keep focus in the toolbar (search) instead of body.
    searchRef.current?.focus();
  }

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 96 }}>
      {/* The persistent AppHeader now owns the notch clearance (it's sticky above this in-flow title), so
          this header must NOT add env(safe-area-inset-top) again — that double-counted the inset. */}
      <header style={{ padding: "44px 20px 4px" }}>
        <p className="eyebrow">
          {mode === "dinein" ? "Dine-in" : mode === "pickup" ? "Pickup" : "Scan & Go"}
        </p>
        <h1 style={{ fontSize: 34 }}>Menu</h1>
        {/* J2 arrival beat — the bilingual place-setting greeting; premieres once per session (J1's
            SurfaceMemory gates the stagger), lands settled on revisits. */}
        <ArrivalBeat mode={mode} />
        {mode === "dinein" && <GuestList />}
        {mode === "pickup" && <PickupSlotChip />}
      </header>

      <div className="menu-toolbar" ref={toolbarRef}>
        <div className="menu-search">
          <span aria-hidden>🔍</span>
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes, drinks…"
            aria-label="Search the menu"
          />
        </div>

        {cats.length > 1 && (
          // A scroll-spy JUMP nav (not a tab widget — the sections are all on one scroll, not switched
          // panels), so it's a <nav> with `aria-current` on the in-view category, not role=tablist.
          <nav className="menu-rail" aria-label="Menu categories" ref={railRef}>
            {cats.map((c) => {
              const on = activeCat === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-current={on ? "true" : undefined}
                  className={`menu-tab${on ? " menu-tab-on" : ""}`}
                  onClick={() => jumpTo(c)}
                >
                  {c}
                </button>
              );
            })}
          </nav>
        )}

        <div className="menu-diets" role="group" aria-label="Dietary filters">
          {DIETS.map((d) => {
            const on = diets.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                className={`diet-chip${on ? " diet-chip-on" : ""}`}
                onClick={() => toggleDiet(d.id)}
              >
                <span aria-hidden>{d.emoji}</span>
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Fail-safe disclaimer — shown only while a free-from chip is active (a guide, never a guarantee). */}
        {freeFrom && (
          <p
            role="note"
            style={{ margin: "8px 2px 0", fontSize: 12, color: "var(--t2)", lineHeight: 1.4 }}
          >
            <span aria-hidden>ⓘ </span>
            Allergen info is a guide — please tell our staff about any allergy.
          </p>
        )}
      </div>

      {/* J2 "Start here" — the guided opening for browse mode only: hidden the moment the diner is
          FINDING (search text or a diet filter active), when the band would be noise between them and
          their result. Tapping a card opens the same item sheet as a row. */}
      {!q.trim() && diets.length === 0 && (
        <div style={{ padding: "0 20px" }}>
          <StartHereBand
            items={startHere.items}
            dataBacked={startHere.dataBacked}
            onSelect={setSheetItem}
          />
        </div>
      )}

      {cats.map((c) => (
        <section
          key={c}
          data-cat={c}
          ref={(el) => {
            if (el) sectionRefs.current.set(c, el);
            else sectionRefs.current.delete(c);
          }}
          style={{ padding: "8px 20px", scrollMarginTop: Math.round(toolbarH) }}
        >
          <h2 style={{ fontSize: 18 }}>{c}</h2>
          <ul
            role="list"
            aria-label={`${c} items`}
            style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}
          >
            {visible
              .filter((i) => i.category === c)
              .map((i) => {
                const badges = itemBadges(i.tags, favSet.has(i.id));
                return (
                  <li
                    key={i.id}
                    className="card card-textured"
                    style={{
                      display: "flex",
                      gap: 13,
                      padding: 11,
                      opacity: i.is_sold_out ? 0.5 : 1,
                    }}
                  >
                    {/* Tap photo+text → open the detail sheet (customize). A real <button> so Radix can
                        restore focus here on close; the AddButton stays a SEPARATE control (no nested
                        interactives). Concise aria-label — the inner rich text isn't re-announced. */}
                    <button
                      type="button"
                      className="menu-row-open"
                      onClick={() => setSheetItem(i)}
                      aria-label={`${i.name_en}, ${dollars(i.base_price_cents)} — open to customize`}
                    >
                      <span
                        style={{
                          width: 88,
                          height: 88,
                          borderRadius: 14,
                          overflow: "hidden",
                          flex: "none",
                          background: "var(--grad)",
                          position: "relative",
                          display: "block",
                        }}
                      >
                        <BlurUpImage src={i.image_url} alt="" width={88} height={88} sizes="88px" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, display: "block" }}>
                          {i.name_en}
                          {i.is_sold_out && (
                            <span style={{ color: "var(--t3)", fontWeight: 400 }}> · Sold out</span>
                          )}
                        </span>
                        {i.name_my && (
                          <span
                            style={{
                              fontFamily: "var(--font-my)",
                              fontSize: 12,
                              color: "var(--t2)",
                              display: "block",
                            }}
                            lang="my"
                          >
                            {i.name_my}
                          </span>
                        )}
                        {badges.length > 0 && (
                          <span
                            style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}
                            aria-hidden
                          >
                            {badges.map((b) => (
                              <Badge key={b.label} tone={b.tone}>
                                {b.label}
                              </Badge>
                            ))}
                          </span>
                        )}
                        <span style={{ fontWeight: 800, marginTop: 6, display: "block" }}>
                          {dollars(i.base_price_cents)}
                        </span>
                      </span>
                    </button>
                    {/* Quick-add ([] modifiers) is only valid when nothing is REQUIRED — `priceItem` doesn't
                        enforce min_select, so a required-group item (e.g. curry style) must go through the
                        sheet where the choice is made. Optional-only / no-modifier items keep one-tap add. */}
                    {i.modifierGroups.some((g) => g.minSelect >= 1) ? (
                      <button
                        type="button"
                        className="menu-choose-btn"
                        data-soldout={i.is_sold_out || undefined}
                        onClick={() => setSheetItem(i)}
                        aria-label={
                          i.is_sold_out
                            ? `${i.name_en}, sold out — view details`
                            : `Choose options for ${i.name_en}`
                        }
                      >
                        {i.is_sold_out ? "Sold out" : "Choose"}
                      </button>
                    ) : (
                      <AddButton menuItemId={i.id} name={i.name_en} soldOut={i.is_sold_out} />
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {empty && (
        <div role="status" style={{ padding: "32px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            <span aria-hidden>🔎 </span>Nothing matches
          </p>
          <p style={{ color: "var(--t2)", marginBottom: 14 }}>
            {items.length
              ? "Try fewer filters or a different search."
              : "The menu catalog is empty."}
          </p>
          {(q || diets.length > 0) && (
            <button
              ref={clearBtnRef}
              type="button"
              onClick={clearFilters}
              style={{
                minHeight: 44,
                padding: "0 18px",
                borderRadius: "var(--r-full)",
                border: "1px solid var(--bd)",
                background: "var(--sf)",
                color: "var(--tx)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <CartBar />

      {/* Item detail sheet (R6b). One instance, fed the open item; an upsell tap swaps the open item. */}
      <ItemSheet
        item={sheetItem}
        allItems={items}
        diets={diets}
        open={!!sheetItem}
        onClose={() => setSheetItem(null)}
        onSelectItem={setSheetItem}
        tableFavorite={!!sheetItem && favSet.has(sheetItem.id)}
      />
    </main>
  );
}
