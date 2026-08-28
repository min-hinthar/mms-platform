"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, DegradedStrip, Icon } from "@mms/ui";
import { AddButton } from "@/components/AddButton";
import { CartBar } from "@/components/CartBar";
import { GuestList } from "@/components/GuestList";
import { PickupSlotChip } from "@/components/PickupSlotChip";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { hasFreeFrom, passesDiets, type Diet } from "@/lib/menu/dietary";
import { buildStartHereRows } from "@/lib/menu/startHereRows";
import { DietPills, FreeFromDisclaimer } from "./DietPills";
import type { ModGroup } from "@/lib/menu/modifiers";
import { itemBadges } from "@/lib/menu/badges";
import { ItemSheet } from "./ItemSheet";
import { ArrivalBeat } from "./ArrivalBeat";
import { YourUsual } from "./YourUsual";
import type { UsualOutcome } from "@/lib/menu/your-usual";
import { MenuTimeline } from "@/components/TableTimeline";
import { StartHereBand } from "./StartHereBand";
import { TasteBand } from "./TasteBand";
import { FavoritesRail } from "./FavoritesRail";
import { useCart } from "@/components/TableCartProvider";
import { PullToRefresh, type RefreshReason } from "@/components/PullToRefresh";
import {
  catalogFreshness,
  freshnessDurationMs,
  freshnessSentence,
  type CatalogRow,
} from "@/lib/catalog-freshness";
import { toggleFavorite } from "@/lib/favorites";
import { reorderOrder } from "@/lib/reorder";
import { LEND_CHANGE_EVENT } from "@/lib/deviceIdentity";
import { PaperAmbient } from "@/components/PaperAmbient";
import type { WelcomeBack } from "@/lib/rewards";

export type MenuItem = {
  id: string;
  /** M135 — the join key to the owner's PayPal/Zettle POS export (lib/menu/posPopular.ts). Prod and
   *  the catalog snapshot agree on 97/97 distinct slugs; ids would rot when an item is recreated. */
  slug: string | null;
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
/** W22c — the comparable projection of the catalog: what the freshness diff is allowed to see.
 *  Deliberately tiny — no price is ever handed to a surface that could print a delta. */
function catalogRows(items: MenuItem[]): CatalogRow[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name_en,
    soldOut: !!i.is_sold_out,
    priceCents: i.base_price_cents,
  }));
}

export function MenuBrowser({
  items,
  mode,
  favorites = [],
  popularIds = [],
  heartedIds = [],
  welcome = null,
  usual,
  reorderId = null,
  catalogStale = false,
  catalogStamp = 0,
}: {
  items: MenuItem[];
  mode: string;
  /** M135: menu-item ids ordered by REAL units sold, from the owner's PayPal/Zettle till export
   *  (lib/menu/posPopular.ts), top `POS_BADGE_MAX` only. No rank travels with them (
   *  share a numeral, so a seal never orders what the data left tied). Drives the "Start here" band
   *  + the data-backed "Most ordered" badge. Empty when the POS export matches nothing → the band falls
   *  back to `popular`-tagged items, badges to the manual tag. */
  favorites?: { id: string }[];
  /** M131 — the FULL most-ordered order (all 76 matched dishes), most-sold first. A SELECTION
   *  preference for the guided rows and the taste suggestions; it never becomes copy, so it is
   *  deliberately broader than `favorites`, which backs the visible "Most ordered" claim. */
  popularIds?: string[];
  /** J5: the CALLER's own hearted item ids (qr_favorites, RLS-scoped, newest first) — drives the
   *  "Your favorites" rail + the sheet's heart state. Distinct from `favorites` (the crowd). */
  heartedIds?: string[];
  /** J5: recognition facts for the arrival greeting (upgraded name / paid-orders-this-month). */
  welcome?: WelcomeBack | null;
  /** W22e — the recognition outcome, decided server-side against today's catalog. `none` renders
   *  nothing, which is what a first-timer and every failure path both get. */
  usual: UsualOutcome;
  /** J5: a past order id to bring back as draft lines once the session's cart is ready (the
   *  /account "Order this again" path); validated + earner-gated server-side. */
  reorderId?: string | null;
  /** W10a: the catalog shown is the LAST-GOOD copy (the live read failed) — render the honest
   *  staleness strip. Prices are re-derived server-side at add time, so ordering stays safe. */
  catalogStale?: boolean;
  /** W22c — a `Date.now()` stamped at RSC render. Never shown; it is the only PROOF available that a
   *  `router.refresh()` actually produced a new server render, because `router.refresh()` returns
   *  void and cannot report failure. An unchanged stamp means we could not check, which is a
   *  different sentence from "nothing changed". */
  catalogStamp?: number;
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

  // J2 guided start → W22 twin rows: the data-backed favorite set (badges) + the "Start here"
  // rows. Row A claims table behavior ("what tables love") ONLY when counts back it (tie-aware
  // ranks carried in from the page; sold-out keeps its numeral off-screen), honest `popular`
  // fallback otherwise; row B is the category round-robin ("a little of everything" — a curation
  // rule, not a ranking, so no seals). All the honesty rules live in lib/menu/startHereRows.ts
  // where a test can watch them fail.
  const favSet = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const startHere = useMemo(
    () => buildStartHereRows(items, favorites, popularIds),
    [items, favorites, popularIds],
  );

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

  // ── W22c — the refresh baseline, and the two facts it does NOT conflate ────────────────────────
  // `baseline.rows` is what the diner was last TOLD about, so a second pull reports what changed
  // since the last sentence rather than since arrival. `atFire` is a different fact with a
  // different lifetime: the render stamp AS IT STOOD when this particular refresh was fired.
  //
  // ⚠️ THEY MUST NOT SHARE A STAMP. The first version proved "a server render landed" by comparing
  // the current stamp against `baseline.stamp` — but `baseline` only advances when THIS component
  // announces, while ANY `router.refresh()` on the route advances the props' stamp. There is one in
  // the root layout: `AnonAuthGate` refreshes on a fresh anonymous mint, i.e. on every cold QR scan,
  // which is the primary entry path. So a diner's first pull compared a stamp already bumped by the
  // auth gate against an arrival baseline, found them different, and reported `advanced` — even
  // when the pull's own fetch never landed at all. "Menu is up to date." asserted while nothing was
  // checked, deterministically, for every first-session diner. Comparing against the value observed
  // at FIRE time is the only honest test, and it stays honest for the next unrelated refresh
  // somebody adds.
  //
  // The callbacks close over the current props rather than mirroring them into a second ref, and
  // that is deliberate: `PullToRefresh` is a CHILD, so its effects run BEFORE this component's, and
  // a ref synced in an effect here would still be one render stale by the time the child called
  // back. Both refs are only read and written at event time, never during render.
  const baseline = useRef({ rows: catalogRows(items), stamp: catalogStamp });
  const atFire = useRef<number | null>(null);
  const onRefreshStart = useCallback(() => {
    atFire.current = catalogStamp;
  }, [catalogStamp]);
  const onRefreshSettled = useCallback(
    (reason: RefreshReason) => {
      const fired = atFire.current;
      atFire.current = null;
      if (fired == null) return; // a settle with no fire we recorded — say nothing rather than guess
      const now = { rows: catalogRows(items), stamp: catalogStamp };
      const outcome = catalogFreshness(baseline.current.rows, now.rows, {
        advanced: now.stamp !== fired,
        // ⚠️ A RENDER THAT LANDED IS NOT A READ THAT SUCCEEDED. `catalogStale` means this render
        // served the last-good cache because the live read failed — and it still advances the
        // stamp. Without this the DegradedStrip and a toast reading "Menu is up to date." appeared
        // on screen together. See `catalog-freshness.ts` for the second, worse consequence.
        trusted: !catalogStale,
      });
      // ⚠️ NEVER adopt a snapshot the module just refused to trust. Adopting it made the untrusted
      // rows the reference for the NEXT comparison, so a real 86 landing afterwards diffed against
      // a cache instead of against what the diner had actually been shown — reported once, or not
      // at all, and then silently lost. The module declines to speak from an unverified snapshot;
      // it must equally decline to remember one.
      if (outcome.state !== "unverified") baseline.current = now;
      // A pull or a button tap is a QUESTION and is always owed an answer. The wake re-read is not:
      // nobody asked, and `announce` is a single-slot VISIBLE toast that replaces whatever it lands
      // on — so an ambient "Menu is up to date." on every app switch would overwrite the "Added
      // Mohinga" confirmation of the thing the diner just tapped. Ambient speaks only with news.
      if (reason !== "asked" && outcome.state !== "changed") return;
      // Through the provider's ONE live region — this view mints no second one (QA-CHECKLIST §A).
      const sentence = freshnessSentence(outcome);
      announce(sentence, freshnessDurationMs(sentence));
    },
    [items, catalogStamp, catalogStale, announce],
  );
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
        // a grocery line is on the SHELF, not unavailable (scan it in the store); an UNREADABLE line
        // is one we could not check at all; only gone/sold-out lines are truly unavailable — never
        // collapse them.
        //
        // ⚠️ M119 (Codex round 2) — `unavailable` is an INCLUSION list on purpose. It used to be
        // "everything that isn't needs_choices or grocery", so the moment a new reason existed it
        // landed silently in "isn't available today" — which is exactly the fabricated diagnosis
        // `unreadable` was added to stop. An exclusion bucket makes every future reason default to
        // the strongest claim on the screen. Name what belongs here.
        const needsChoice = res.skipped.filter((k) => k.reason === "needs_choices");
        const grocery = res.skipped.filter((k) => k.reason === "grocery");
        const unreadable = res.skipped.filter((k) => k.reason === "unreadable");
        const unavailable = res.skipped.filter(
          (k) => k.reason === "gone" || k.reason === "sold_out",
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
        // Deliberately NOT "isn't available": we never got an answer about these dishes. Phrased so
        // the diner knows the dish may be perfectly orderable and where to go next — the menu is
        // already on screen, so this one names a real affordance (unlike the round-1 refusal copy).
        if (unreadable.length > 0)
          bits.push(
            unreadable.length === 1
              ? `couldn’t check ${unreadable[0]?.name ?? "1 dish"} just now — tap it on the menu`
              : `couldn’t check ${unreadable.length} dishes just now — tap them on the menu`,
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

  // a11y (Codex P2 on #194): turning OFF the last diet from the STICKY toolbar unmounts that pill
  // group under the pressed pill and focus falls to <body>. Park it on the menu heading (the
  // repo's focus-on-remove rule — same parking spot as the reorder-note dismiss). The body check
  // keeps this inert when the tap came from the taste band's copy (that pill stays mounted and
  // keeps focus), and preventScroll keeps a touch tap from yanking the page.
  const prevDietCount = useRef(0);
  useEffect(() => {
    const prev = prevDietCount.current;
    prevDietCount.current = diets.length;
    if (prev > 0 && diets.length === 0 && document.activeElement === document.body) {
      menuHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [diets]);

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
    // W22a — no isolation on purpose: the page ground lives on <html> (canvas), so the fixed
    // z:-1 PaperAmbient is visible without a stacking context that would trap fixed overlays.
    <main style={{ maxWidth: 440, margin: "0 auto", paddingBottom: 96 }}>
      <PaperAmbient />
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
        {/* W22c — the catalog is the one diner surface with neither a push channel nor a wake
            re-read, so an 86 landing mid-service never reaches a phone already sitting here. The
            control lives on the eyebrow row because it IS the mechanism (WCAG 2.5.1 — the pull is
            the shortcut); the transient pull indicator it also renders is viewport-fixed, so this
            spot in the flow only positions the button. Suppressed while an ItemSheet is open: the
            listeners are on `window`, the sheet is a portal, and Radix's scroll lock never stops
            propagation — so the pull would otherwise claim the sheet's own scroll. NOT suppressed
            while the catalog is stale: that says the LAST read failed, not the next one. */}
        <div className="menu-eyebrow-row">
          <p className="eyebrow">
            {mode === "dinein" ? "Dine-in" : mode === "pickup" ? "Pickup" : "To-go"}
          </p>
          <PullToRefresh
            onRefresh={onRefreshStart}
            onSettled={onRefreshSettled}
            disabled={!!sheetItem}
          />
        </div>
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
        {/* W22e — recognition sits directly under the greeting, before the mode chips: it is part
            of the arrival beat, not a promotion. Renders nothing below the threshold. */}
        <YourUsual outcome={usual} />
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
              rowA={startHere.rowA}
              rowB={startHere.rowB}
              dataBacked={startHere.dataBacked}
              onSelect={setSheetItem}
            />
          </div>
        ))}

      {/* W21 → W22 — "Explore your Burmese taste buds": craving pills → an honest "here's why"
          rail + Surprise-me, and now the HOME of the dietary pills (they filter this whole view,
          so the band must stay visible while a diet is active — the search gate alone hides it,
          since a typed query means the diner is FINDING, not exploring). */}
      {!q.trim() && (
        <div style={{ padding: "0 20px" }}>
          <TasteBand
            items={items}
            popularIds={popularIds}
            heartedIds={hearts}
            diets={diets}
            onSelect={setSheetItem}
          />
        </div>
      )}

      {/* M133 (owner: "Menu-toolbar should be positioned after taste-h before All-day breakfast so
          customers can view the start-here and taste-h contents first"). It is `position: sticky`,
          so moving it DOWN the document changes only where it starts: it still pins under the app
          header the moment the diner scrolls past the bands, and every section's `scrollMarginTop`
          is measured from its real height rather than its position, so the jump-nav still lands
          headings clear of it. When a search or a diet hides the bands above, the toolbar simply
          becomes the first thing under the header again — which is the right place for it exactly
          when the diner is FINDING rather than exploring. */}
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

        {/* M135 (owner: "taste-diet-cap should be moved back inside menu-toolbar") — the dietary
            caption and pills live HERE again, and UNCONDITIONALLY. W22 moved them into the taste
            band and left this toolbar mirroring them only while a search was typed or a diet was
            already lit; that made the one control which narrows the whole menu reachable only from
            a band the diner scrolls past, and the mirror existed precisely because that was already
            uncomfortable (Codex P1+P2 + review MED on #194 all pushed at the same seam). A filter
            belongs on the surface that persists — so it is one rail, on the sticky bar, always.

            The caption carries the VERB, because that is the whole difference between these pills
            and the craving pills in the band: cravings RECOMMEND, these FILTER. And an active
            free-from filter is never on screen without its safety disclaimer — a free-from claim
            from absent data is the one thing the dietary model refuses to make silently. */}
        <p id="taste-diet-cap" className="taste-caption">
          Dietary needs
          <span className="taste-caption-note">— filters the whole menu</span>
          {/* K15 — Claude-authored MY accent, pending the native check like every batch. */}
          <span lang="my" className="taste-caption-my">
            မီနူးတစ်ခုလုံး စစ်ထုတ်ပေးမယ်
          </span>
        </p>
        <DietPills diets={diets} onToggle={toggleDiet} labelledBy="taste-diet-cap" />
        {hasFreeFrom(diets) && <FreeFromDisclaimer />}
      </div>

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
          {/* W16e — Tailwind v4 preflight zeroes heading margins, so this sat 0px above the first
              card: explicit rhythm from the spacing grid. */}
          <h2 style={{ fontSize: "var(--fs-h3)", margin: "var(--s3) 0 var(--s2)" }}>{c}</h2>
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
                      gap: "var(--s3)", // W16e — was 13/11, off the spacing grid
                      padding: "var(--s3)",
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
                          borderRadius: "var(--r-sm)", // W16e — was a bare 14
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
                              marginTop: 2, // W16e — stacked-label breathing (parity with /account)
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
