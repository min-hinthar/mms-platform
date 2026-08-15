"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, DegradedStrip, Icon } from "@mms/ui";
import { AddButton } from "@/components/AddButton";
import { CartBar } from "@/components/CartBar";
import { GuestList } from "@/components/GuestList";
import { PickupSlotChip } from "@/components/PickupSlotChip";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { DIETS, hasFreeFrom, passesDiets, type Diet } from "@/lib/menu/dietary";
import type { ModGroup } from "@/lib/menu/modifiers";
import { itemBadges } from "@/lib/menu/badges";
import { ItemSheet } from "./ItemSheet";
import { ArrivalBeat } from "./ArrivalBeat";
import { MenuTimeline } from "@/components/TableTimeline";
import { StartHereBand } from "./StartHereBand";
import { FavoritesRail } from "./FavoritesRail";
import { useCart } from "@/components/TableCartProvider";
import { toggleFavorite } from "@/lib/favorites";
import { reorderOrder } from "@/lib/reorder";
import { LEND_CHANGE_EVENT } from "@/lib/deviceIdentity";
import type { WelcomeBack } from "@/lib/rewards";

export type MenuItem = {
  id: string;
  name_en: string;
  name_my: string | null;
  description_en: string | null;
  /** W5c: bilingual description for the item sheet (nullable — EN renders alone until authored). */
  description_my: string | null;
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
  heartedIds = [],
  welcome = null,
  reorderId = null,
  catalogStale = false,
}: {
  items: MenuItem[];
  mode: string;
  /** J2: menu-item ids ranked by REAL paid-order counts (lib/menu/mostLoved.ts, server-computed,
   *  counts-only). Drives the "Start here" band + the data-backed "Table favorite" badge. Empty while
   *  order history is thin → the band falls back to `popular`-tagged items, badges to the manual tag. */
  favoriteIds?: string[];
  /** J5: the CALLER's own hearted item ids (qr_favorites, RLS-scoped, newest first) — drives the
   *  "Your favorites" rail + the sheet's heart state. Distinct from `favoriteIds` (the crowd). */
  heartedIds?: string[];
  /** J5: recognition facts for the arrival greeting (upgraded name / paid-orders-this-month). */
  welcome?: WelcomeBack | null;
  /** J5: a past order id to bring back as draft lines once the session's cart is ready (the
   *  /account "Order this again" path); validated + earner-gated server-side. */
  reorderId?: string | null;
  /** W10a: the catalog shown is the LAST-GOOD copy (the live read failed) — render the honest
   *  staleness strip. Prices are re-derived server-side at add time, so ordering stays safe. */
  catalogStale?: boolean;
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

  // J5 — the diner's own hearts: optimistic local set over the server-fetched ids. A toggle flips the
  // heart instantly and reverts if the RLS-scoped write fails (toggleFavorite returns null) — the
  // heart is decorative state, so an optimistic miss can never cost money or strand a screen.
  const [hearts, setHearts] = useState<Set<string>>(() => new Set(heartedIds));
  const toggleHeart = (id: string) => {
    setHearts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    void toggleFavorite(id).then((res) => {
      if (res === null)
        // Write failed → revert to the pre-tap state (flip back whatever we just flipped).
        setHearts((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
    });
  };
  // "Your favorites" rail: the diner's hearted items that are on TODAY's menu and in stock, in their
  // heart order (newest first — un-persisted same-session hearts float to the front). Capped at 8.
  const favRail = useMemo(() => {
    const pos = new Map(heartedIds.map((id, i) => [id, i]));
    return items
      .filter((i) => hearts.has(i.id) && !i.is_sold_out)
      .sort((a, b) => (pos.get(a.id) ?? -1) - (pos.get(b.id) ?? -1))
      .slice(0, 8);
  }, [items, hearts, heartedIds]);

  // J5 — reorder-on-arrival (the /account "Order this again" path): once the session's cart exists,
  // run the earner-gated server reorder EXACTLY once, strip the param (so refresh/back can't double-
  // run it), announce the honest outcome through the provider's ONE live region, and re-sync the cart.
  const { cartId, announce, refresh } = useCart();
  const reorderRan = useRef(false);
  const [reorderNote, setReorderNote] = useState<string | null>(null);
  const menuHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!reorderId || !cartId || reorderRan.current) return;
    reorderRan.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has("reorder")) {
      url.searchParams.delete("reorder");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    reorderOrder({ cartId, orderId: reorderId })
      .then((res) => {
        if (!res.ok) {
          setReorderNote(res.error);
          announce(res.error);
          return;
        }
        // Per-reason honesty: a dish that NEEDS choices is on today's menu (say "tap to choose");
        // a grocery line is on the SHELF, not unavailable (scan it in the store); only
        // gone/sold-out lines are truly unavailable — never collapse the three.
        const needsChoice = res.skipped.filter((k) => k.reason === "needs_choices");
        const grocery = res.skipped.filter((k) => k.reason === "grocery");
        const unavailable = res.skipped.filter(
          (k) => k.reason !== "needs_choices" && k.reason !== "grocery",
        );
        const bits: string[] = [];
        if (res.added > 0)
          bits.push(
            res.added === 1
              ? "Brought back 1 dish from your order"
              : `Brought back ${res.added} dishes from your order`,
          );
        // W9c — a dropped kitchen note goes FIRST among the caveats and names every dish. The item
        // sheet promises "add any allergy in the note below and the kitchen will see it"; if that note
        // could not come back, silence is the one outcome here that can actually hurt someone. Phrased
        // as an instruction, not a status, because the diner has to re-add it themselves.
        if (res.notesDropped.length > 0)
          bits.push(
            res.notesDropped.length === 1
              ? `your note for ${res.notesDropped[0] ?? "1 dish"} didn’t come back — tap it to add it again`
              : `notes for ${res.notesDropped.join(", ")} didn’t come back — tap each to add them again`,
          );
        if (res.quantitiesReset) bits.push("quantities start at one");
        // M3 review MED-1 — `optionsReset` now means "came back DIFFERENT than last time": a
        // legacy line returns as the base dish, an id-carrying line may return with only its
        // SURVIVING options. "without its options" was true only for the first case — the copy
        // must cover both without overclaiming either.
        if (res.optionsReset.length > 0)
          bits.push(
            res.optionsReset.length === 1
              ? `${res.optionsReset[0]} came back with different options than last time — tap it to check`
              : `${res.optionsReset.length} came back with different options — tap each to check`,
          );
        if (needsChoice.length > 0)
          bits.push(
            needsChoice.length === 1
              ? `${needsChoice[0]?.name ?? "1 dish"} needs a choice — tap it on the menu`
              : `${needsChoice.length} dishes need choices — tap them on the menu`,
          );
        if (grocery.length > 0)
          bits.push(
            grocery.length === 1
              ? `${grocery[0]?.name ?? "1 item"} is a shelf item — scan it in the store`
              : `${grocery.length} shelf items — scan them in the store`,
          );
        if (unavailable.length > 0)
          bits.push(
            unavailable.length === 1
              ? `${unavailable[0]?.name ?? "1 item"} isn’t available today`
              : `${unavailable.length} items aren’t available today`,
          );
        if (res.capped) bits.push("only the first 30 lines were brought back");
        const msg = bits.length > 0 ? bits.join(" · ") : "Nothing to bring back from that order.";
        setReorderNote(msg);
        announce(msg);
        if (res.added > 0) void refresh();
      })
      .catch(() => {
        const m = "Couldn’t reorder just now — the menu’s all yours.";
        setReorderNote(m);
        announce(m);
      });
  }, [reorderId, cartId, announce, refresh]);

  // Visible items = search match (EN/MY/description) ∩ dietary filters. Pure, recomputed on input.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!passesDiets(i, diets)) return false;
      if (!needle) return true;
      return (
        i.name_en.toLowerCase().includes(needle) ||
        (i.name_my?.toLowerCase().includes(needle) ?? false) ||
        (i.description_en?.toLowerCase().includes(needle) ?? false) ||
        // W5c: MY speakers get the same ingredient-level search EN speakers already had.
        (i.description_my?.toLowerCase().includes(needle) ?? false)
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

  // Measure the sticky toolbar so the scroll-spy inset + section scroll-margin track its real height (it grows
  // when chips wrap / the disclaimer shows) PLUS the K7 lend ribbon's height (`--lend-offset`, 0 when not
  // lent) — while the phone is lent, the toolbar pins below the ribbon, so a jump must clear both. Re-measures
  // on the toolbar resize AND on a lend-mode toggle. Falls back to the 150 seed if RO is unavailable.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const lendOffset = () => {
      const n = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--lend-offset"),
      );
      return Number.isFinite(n) ? n : 0;
    };
    const measure = () => setToolbarH(el.getBoundingClientRect().height + lendOffset());
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener(LEND_CHANGE_EVENT, measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener(LEND_CHANGE_EVENT, measure);
    };
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
        {/* W10a — the last-good catalog is on screen because the live read failed. Honest, quiet,
            and NOT a live region (server-rendered into the initial view — nothing to announce).
            Ordering stays safe: every add re-derives price/tax server-side at write time. */}
        {catalogStale && (
          <DegradedStrip live={false} style={{ marginBottom: 12 }}>
            We’re having a little trouble on our end — this is the menu from a few minutes ago.
            Prices are confirmed when you add a dish.
          </DegradedStrip>
        )}
        <p className="eyebrow">
          {mode === "dinein" ? "Dine-in" : mode === "pickup" ? "Pickup" : "To-go"}
        </p>
        <h1
          ref={menuHeadingRef}
          tabIndex={-1}
          style={{ fontSize: "var(--fs-display)", outline: "none" }}
        >
          Menu
        </h1>
        {/* J2 arrival beat — the bilingual place-setting greeting; premieres once per session (J1's
            SurfaceMemory gates the stagger), lands settled on revisits. */}
        <ArrivalBeat mode={mode} welcome={welcome} />
        {mode === "dinein" && <GuestList />}
        {mode === "pickup" && <PickupSlotChip />}
        {/* J3: the wait, narrated from real kitchen taps — renders only once something is with the
            kitchen (fired/cooking/served), i.e. exactly when a mid-meal diner is back here waiting. */}
        <MenuTimeline />
        {/* J5 — the reorder outcome, in plain words (also announced through the provider's ONE live
            region above; this line is the visible, dismissible face of the same message). */}
        {reorderNote && (
          <p className="reorder-note mms-rise">
            <span style={{ flex: 1 }}>{reorderNote}</span>
            <button
              type="button"
              className="reorder-note-x"
              aria-label="Dismiss"
              onClick={() => {
                // The focused dismiss button unmounts with the note — park focus on the heading so a
                // keyboard/SR user keeps their place (the repo's focus-on-remove rule, WCAG 2.4.3).
                setReorderNote(null);
                menuHeadingRef.current?.focus({ preventScroll: true });
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </p>
        )}
      </header>

      <div className="menu-toolbar" ref={toolbarRef}>
        <div className="menu-search">
          <Icon name="search" size={18} />
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
      </div>

      {/* J2 "Start here" — the guided opening for browse mode only: hidden the moment the diner is
          FINDING (search text or a diet filter active), when the band would be noise between them and
          their result. Tapping a card opens the same item sheet as a row. */}
      {/* J5 precedence: once the diner HAS favorites, their own shortlist replaces our guidance —
          the start-here band is a first-timer's opening, not a permanent fixture. */}
      {!q.trim() &&
        diets.length === 0 &&
        (favRail.length > 0 ? (
          <div style={{ padding: "0 20px" }}>
            <FavoritesRail items={favRail} onSelect={setSheetItem} />
          </div>
        ) : (
          <div style={{ padding: "0 20px" }}>
            <StartHereBand
              items={startHere.items}
              dataBacked={startHere.dataBacked}
              onSelect={setSheetItem}
            />
          </div>
        ))}

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
          <h2 style={{ fontSize: "var(--fs-h3)" }}>{c}</h2>
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
                        <BlurUpImage
                          src={i.image_url}
                          alt=""
                          width={88}
                          height={88}
                          sizes="88px"
                          fallback={<PhotoPlaceholder category={i.category} />}
                        />
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
                              fontSize: "var(--fs-sm)",
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
          <p
            style={{
              fontSize: "var(--fs-h2)",
              fontWeight: 700,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Icon name="search" size={22} />
            Nothing matches
          </p>
          <p style={{ color: "var(--t2)", marginBottom: 14 }}>
            {/* W10a — a truly empty catalog can only be a deliberate owner state now (a failed read
                never reaches this branch — the page serves last-good or the outage state). */}
            {items.length
              ? "Try fewer filters or a different search."
              : "The kitchen is updating the menu — check back shortly."}
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
        hearted={!!sheetItem && hearts.has(sheetItem.id)}
        onToggleHeart={toggleHeart}
      />
    </main>
  );
}
