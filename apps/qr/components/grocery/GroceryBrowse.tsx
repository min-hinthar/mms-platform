"use client";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Button, Icon } from "@mms/ui";
import { getGroceryCatalog, type GroceryCatalogItem, type GroceryLine } from "@/lib/grocery";
import { saveCatalogCache } from "@/lib/grocery-catalog-cache";
import { useConnectionTruth, type ConnectionTruth } from "@/lib/useConnectionTruth";
import { stockedAisles } from "@/lib/grocery-aisles";
import { aisleSlugFromHash } from "@/lib/grocery-landing";
import { aisleFromHash, aisleHistoryOp, hashForAisle, popShowsBrowse } from "@/lib/grocery-view";
import { AisleFanNav } from "@/components/grocery/AisleFanNav";
import { AisleShelf } from "@/components/grocery/AisleShelf";
import { GroceryCard } from "@/components/grocery/GroceryCard";
import { GroceryItemSheet } from "@/components/grocery/GroceryItemSheet";
import { useHideOnScrollDown } from "@/lib/hooks/useHideOnScrollDown";

/**
 * W4b — the Browse half of the grocery market; Phase 1c made it a MARKET HOME instead of a wall.
 *
 *   · Home (`/grocery`): the EBT note → the sticky aisle rail (the phone's aisle nav) → one shelf of
 *     six per stocked aisle with "See all {n}" (AisleShelf) → the desktop fan-nav over the shelves.
 *     ~3,500px on a phone where "All aisles" used to stack ~404 cards (~52,000px).
 *   · Aisle (`/grocery#aisle-<slug>`): the same rail with that chip current → the aisle's full grid.
 *
 * The aisle is HISTORY, not component state, so the browser's Back button walks it
 * (lib/grocery-view.ts decides every write: home → aisle pushes, aisle → aisle replaces so Back
 * always lands on the market home, and leaving an aisle WE pushed walks `history.back()` so both the
 * in-page "All aisles" and the browser's Back play the same root back-drift). Scroll and focus are
 * restored by hand — Next sets `history.scrollRestoration = "manual"`.
 *
 * Cards are cart-AWARE (an in-cart item swaps its Add for the stepper) but never cart-AUTHORITATIVE:
 * every add/step rides the parent's scanAdd/setQty money path. memo'd with stable parent callbacks
 * so typing in the page-level search box does not re-render the market. It stays MOUNTED while the
 * Scan tab shows: its catalog read also feeds the offline scan-name cache.
 */

/** The failed-catalog copy, diagnosed rather than asserted (W10a) — rendered AND announced. */
function catalogFailureCopy(truth: ConnectionTruth): string {
  return truth === "you-offline"
    ? "You look offline — couldn’t load the aisles. Reconnect and try again."
    : truth === "we-down"
      ? "We’re having trouble on our end — couldn’t load the aisles. It’s not your connection; try again in a moment."
      : "Couldn’t load the aisles just now — try again.";
}

type Opener = { kind: "chip" | "see-all"; slug: string };
type PendingView =
  | { kind: "enter" }
  | { kind: "leave"; scrollY: number | null; opener: Opener | null }
  | { kind: "recovered" };

/** Write the aisle hash. `mmsAisle` marks an entry WE pushed (it survives a reload); a lateral
 *  replace keeps whatever the entry already carried. Next's `__NA` rides along so it bails. */
function writeHash(op: "push" | "replace", slug: string | null, marker?: boolean) {
  const { pathname, search } = window.location;
  const state: Record<string, unknown> = { ...(window.history.state ?? {}) };
  if (marker !== undefined) state.mmsAisle = marker;
  const url = `${pathname}${search}${hashForAisle(slug)}`;
  if (op === "push") window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
}

const pushedByUs = () =>
  Boolean((window.history.state as { mmsAisle?: unknown } | null)?.mmsAisle === true);

export const GroceryBrowse = memo(function GroceryBrowse({
  lines,
  canAdd,
  addingBarcode,
  busyLineId,
  onAdd,
  onStep,
  active,
  onAnnounce,
  onAislePop,
}: {
  lines: GroceryLine[];
  /** False while the session is still minting or the first basket read FAILED (adding while the
   *  server basket is invisible could double a qty the shopper can't see) — Adds render
   *  aria-disabled; the parent handler is the real enforcement. */
  canAdd: boolean;
  /** Barcode of the one in-flight browse/search add — only that card dims. */
  addingBarcode: string | null;
  /** lineId of the one in-flight stepper op — only that card's stepper dims. */
  busyLineId: string | null;
  onAdd: (item: GroceryCatalogItem) => void;
  onStep: (line: GroceryLine, nextQty: number) => void;
  /** Browse is the visible tab — a catalog failure is announced only then. */
  active: boolean;
  /** The page's ONE announcement channel (its toast). */
  onAnnounce: (message: string) => void;
  /** A popped aisle entry while Scan shows — the page switches to Browse (not persisted). */
  onAislePop: () => void;
}) {
  const [catalog, setCatalog] = useState<GroceryCatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // W10a — attribution for the failed card below: diagnosed on failure, never asserted. The old
  // copy said "Check your connection" for what was, in the live incident, OUR paused database.
  const { truth, diagnose } = useConnectionTruth();
  const [aisle, setAisle] = useState<string | null>(null);
  // W5d — the item the detail sheet is showing (null = closed). Lives INSIDE the memo'd market (the
  // catalog does too), so opening re-renders it once on a deliberate tap — not per keystroke.
  const [sheetItem, setSheetItem] = useState<GroceryCatalogItem | null>(null);
  // MED-1 (adversarial review): when a card's Add lands, its button unmounts and the stepper takes
  // its place — park keyboard/SR focus on the new "+" instead of dropping it to <body>. The ref
  // holds the barcode whose stepper should claim focus on mount (GroceryCard).
  const pendingFocus = useRef<string | null>(null);
  // W4f — the sticky mobile rail tucks away while scrolling DOWN and reappears on scroll-up.
  const railHidden = useHideOnScrollDown();

  // Latest-value refs for the long-lived listeners (written in an effect, read in callbacks).
  const activeRef = useRef(active);
  const onAnnounceRef = useRef(onAnnounce);
  const onAislePopRef = useRef(onAislePop);
  useEffect(() => {
    activeRef.current = active;
    onAnnounceRef.current = onAnnounce;
    onAislePopRef.current = onAislePop;
  });
  /** The aisle the screen shows, readable from any callback before the state commits. */
  const aisleRef = useRef<string | null>(null);
  const stockedRef = useRef<string[]>([]);
  // Has a catalog answered yet? Before it has, EVERY #aisle is unresolvable, so "unstocked" cannot
  // be told apart from "not loaded" — the pop handler must not replace a valid entry away (the load
  // path resolves the hash itself when the catalog lands).
  const catalogReadyRef = useRef(false);
  const homeScrollRef = useRef<number | null>(null);
  const openerRef = useRef<Opener | null>(null);
  const pendingViewRef = useRef<PendingView | null>(null);
  const retryRef = useRef(false);

  /** Put the screen on `to` (the history write, if any, already happened). */
  const applyRef = useRef<(to: string | null, opener: Opener | null) => void>(() => {});
  useEffect(() => {
    applyRef.current = (to, opener) => {
      const from = aisleRef.current;
      if (from === to) return;
      if (from === null) homeScrollRef.current = window.scrollY;
      if (to !== null) {
        if (opener) openerRef.current = opener;
        pendingViewRef.current = { kind: "enter" };
      } else {
        pendingViewRef.current = {
          kind: "leave",
          scrollY: homeScrollRef.current,
          opener: openerRef.current,
        };
        openerRef.current = null;
      }
      aisleRef.current = to;
      setAisle(to);
    };
  });

  /** A chip or "See all" — the history write first, then the view. */
  const go = (to: string | null, opener: Opener | null) => {
    const op = aisleHistoryOp({ from: aisleRef.current, to, pushedByUs: pushedByUs() });
    if (op === "none") return;
    if (op === "back") {
      // The home entry is right under ours: walk to it, so the in-page control and the browser's
      // Back look identical (same root back-drift). The popstate listener applies the view.
      window.history.back();
      return;
    }
    if (op === "push") writeHash("push", to, true);
    // A lateral replace keeps the entry's own marker; a replace to home is no longer ours.
    else writeHash("replace", to, to === null ? false : undefined);
    applyRef.current(to, opener);
  };
  const follow =
    (to: string | null, opener: Opener | null) => (e: MouseEvent<HTMLAnchorElement>) => {
      // A modified click keeps the browser's own meaning (new tab / window).
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      go(to, opener);
    };

  // ONE popstate listener: map the hash onto the view. Only `#aisle-*` hashes are ours.
  useEffect(() => {
    const onPop = () => {
      const raw = window.location.hash;
      const next = aisleFromHash(raw, stockedRef.current);
      // An `#aisle-*` we do not stock (a stale or hand-typed link) is replaced away — once there is a
      // catalog to ask; before that, the load path resolves it.
      if (next === null && aisleSlugFromHash(raw) !== null && catalogReadyRef.current)
        writeHash("replace", null);
      const before = aisleRef.current;
      if (popShowsBrowse({ tab: activeRef.current ? "browse" : "scan", before, after: next }))
        onAislePopRef.current();
      applyRef.current(next, null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // One catalog read per visit (a public, slow-moving ~400-row list). Failure renders an honest
  // Retry — never an empty market. `cancelled` guards the post-unmount setState.
  const [loadSeq, setLoadSeq] = useState(0); // bumped by Retry
  useEffect(() => {
    let cancelled = false;
    getGroceryCatalog()
      .then((items) => {
        if (cancelled) return;
        const slugs = stockedAisles(items).map((s) => s.aisle.slug);
        stockedRef.current = slugs;
        catalogReadyRef.current = true;
        // The hash is resolved against what is actually STOCKED, once there is a catalog to ask.
        const raw = window.location.hash;
        const fromHash = aisleFromHash(raw, slugs);
        if (fromHash === null && aisleSlugFromHash(raw) !== null) writeHash("replace", null);
        aisleRef.current = fromHash;
        if (retryRef.current) pendingViewRef.current = { kind: "recovered" };
        retryRef.current = false;
        setAisle(fromHash);
        setCatalog(items);
        setFailed(false);
        setRetrying(false);
        // W7b — stash the barcode→name/price map for OFFLINE scan feedback (display-only
        // estimates; the charge is always the server's replay-time derivation). A side effect of
        // the fetch we already made — never its own request.
        saveCatalogCache(
          items.map((i) => ({ barcode: i.barcode, name: i.name, priceCents: i.priceCents })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        retryRef.current = false;
        setFailed(true);
        setRetrying(false);
        // Announced through the page's ONE channel, and only while Browse is the visible tab —
        // the card is not a live region (G15). Focus stays on Retry (it never unmounts).
        void diagnose().then((t) => {
          if (!cancelled && activeRef.current) onAnnounceRef.current(catalogFailureCopy(t));
        });
      });
    return () => {
      cancelled = true;
    };
  }, [loadSeq, diagnose]);

  // Scroll + focus follow the view. Consumed once per pending change, after the DOM has it.
  useLayoutEffect(() => {
    const p = pendingViewRef.current;
    if (!p) return;
    pendingViewRef.current = null;
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    if (p.kind === "recovered") {
      q('[data-aisle-chip="all"]')?.focus({ preventScroll: true });
      return;
    }
    if (p.kind === "enter") {
      const slug = aisleRef.current;
      if (slug)
        q(`[data-aisle-chip="${slug}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
      q(".aisle-view")?.scrollIntoView({ block: "start", behavior: "instant" });
      q("#aisle-view-title")?.focus({ preventScroll: true });
      return;
    }
    window.scrollTo({ top: p.scrollY ?? 0, behavior: "instant" });
    const opener =
      p.opener?.kind === "see-all"
        ? q(`[data-see-all="${p.opener.slug}"]`)
        : p.opener
          ? q(`[data-aisle-chip="${p.opener.slug}"]`)
          : null;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (opener) opener.focus({ preventScroll: true });
    else if (lost) q('[data-aisle-chip="all"]')?.focus({ preventScroll: true });
  });

  const lineByBarcode = useMemo(() => {
    const m = new Map<string, GroceryLine>();
    for (const l of lines) m.set(l.barcode, l);
    return m;
  }, [lines]);

  // Aisles that actually stock something, in merchandising order, counts measured.
  const stocked = useMemo(() => (catalog ? stockedAisles(catalog) : []), [catalog]);
  const itemsBy = useMemo(() => {
    const m = new Map<string, GroceryCatalogItem[]>();
    for (const i of catalog ?? [])
      if (i.category) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return m;
  }, [catalog]);

  if (!catalog && failed) {
    return (
      // Deliberately NOT role="alert" (G15): the failure is announced through the page's toast, and
      // only while Browse is the visible tab. Retry stays MOUNTED (busy, never disabled) so focus
      // never drops to <body>; on success focus moves to the rail's "All aisles".
      <div className="card" style={{ padding: "var(--s4)", marginTop: "var(--s3)" }}>
        <p
          style={{
            margin: "0 0 var(--s3)",
            color: "var(--warn)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {catalogFailureCopy(truth)}
        </p>
        <Button
          variant="secondary"
          size="sm"
          busy={retrying}
          onClick={() => {
            retryRef.current = true;
            setRetrying(true);
            setLoadSeq((s) => s + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!catalog) {
    // Skeleton of the new geometry (aria-hidden; the tab already carries the loading context): the
    // EBT line, four rail pills, one shelf heading and 2.4 cards — so the swap does not jump.
    return (
      <div className="gb-skeleton" aria-hidden>
        <span className="mms-skeleton gb-skel-line" />
        <div className="gb-skel-rail">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="mms-skeleton gb-skel-pill" />
          ))}
        </div>
        <span className="mms-skeleton gb-skel-heading" />
        <div className="shelf-rail gb-skel-shelf">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card gcard">
              <div className="gcard-photo mms-skeleton" />
              <div className="gcard-body">
                <span className="mms-skeleton gb-skel-text" />
                <span className="mms-skeleton gb-skel-text gb-skel-text-short" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Honest empty market — live runs in exactly this state between the schema migration and the
  // price-confirmed catalog import (rows exist but carry no aisle), and a categorized-but-empty
  // filter result must never read as "we sell nothing".
  if (catalog.length === 0 || stocked.length === 0) {
    return (
      <p style={{ color: "var(--t3)", marginTop: 14 }}>
        The aisles are being stocked — search above, or scan the code on a package from the Scan
        tab.
      </p>
    );
  }

  const view = aisle ? stocked.find((s) => s.aisle.slug === aisle) : undefined;

  return (
    <>
      {/* Honest EBT/SNAP disclosure — one quiet line, INSIDE Browse where the cards' EBT tags it
          explains live (undated per the W4a rule). The Scan door's EBT subtotal line says the rest. */}
      <p className="grocery-ebt-note">
        <span className="grocery-ebt-note-tag" aria-hidden>
          EBT
        </span>
        EBT-eligible items are tagged — SNAP checkout coming; pay by card today.
      </p>

      {/* The aisle rail — NAVIGATION now (links into history), pinned under the header on a phone.
          The current view's chip carries aria-current and the lit cap. The opaque sticky bg lives on
          the <nav>; the trailing edge-fade mask lives on the inner scroller. */}
      <nav className="aisle-rail" aria-label="Aisles" data-hidden={railHidden || undefined}>
        <div className="aisle-rail-scroll">
          <a
            href="/grocery"
            className="aisle-tile"
            data-aisle-chip="all"
            aria-current={aisle === null ? "true" : undefined}
            onClick={follow(null, null)}
          >
            <Icon name="cat-grocery" size={18} strokeWidth={1.5} />
            <span className="aisle-tile-label">
              <span className="aisle-tile-en">All aisles</span>
              <span className="aisle-tile-my" lang="my">
                အားလုံး
              </span>
            </span>
          </a>
          {stocked.map(({ aisle: a }) => (
            <a
              key={a.slug}
              href={hashForAisle(a.slug)}
              className="aisle-tile"
              data-aisle-chip={a.slug}
              aria-current={aisle === a.slug ? "true" : undefined}
              onClick={follow(a.slug, { kind: "chip", slug: a.slug })}
            >
              <Icon name={a.icon} size={18} strokeWidth={1.5} />
              <span className="aisle-tile-label">
                <span className="aisle-tile-en">{a.en}</span>
                <span className="aisle-tile-my" lang="my">
                  {a.my}
                </span>
              </span>
            </a>
          ))}
        </div>
      </nav>

      {view ? (
        // The aisle view. `.mms-settle` (from 0.4, never 0) so the focused heading is never
        // invisible on entry (WCAG 2.4.7); keyed per aisle so a lateral move settles again.
        <section
          key={view.aisle.slug}
          className="aisle-view mms-settle"
          aria-labelledby="aisle-view-title"
        >
          <h2 id="aisle-view-title" className="aisle-heading" tabIndex={-1}>
            {view.aisle.en}
            <span className="aisle-heading-my" lang="my">
              {view.aisle.my}
            </span>
            <span className="aisle-heading-count">
              {view.count} {view.count === 1 ? "item" : "items"}
            </span>
          </h2>
          <ul role="list" className="gcard-grid" aria-labelledby="aisle-view-title">
            {(itemsBy.get(view.aisle.slug) ?? []).map((item) => (
              <GroceryCard
                key={item.barcode}
                item={item}
                aisle={view.aisle}
                line={lineByBarcode.get(item.barcode)}
                canAdd={canAdd}
                addingBarcode={addingBarcode}
                busyLineId={busyLineId}
                pendingFocusRef={pendingFocus}
                onOpen={setSheetItem}
                onAdd={onAdd}
                onStep={onStep}
                variant="grid"
              />
            ))}
          </ul>
        </section>
      ) : (
        <>
          {stocked.map(({ aisle: a }, i) => (
            <AisleShelf
              key={a.slug}
              aisle={a}
              items={itemsBy.get(a.slug) ?? []}
              index={i}
              lineByBarcode={lineByBarcode}
              canAdd={canAdd}
              addingBarcode={addingBarcode}
              busyLineId={busyLineId}
              pendingFocusRef={pendingFocus}
              onOpen={setSheetItem}
              onAdd={onAdd}
              onStep={onStep}
              onSeeAll={(slug, e) => follow(slug, { kind: "see-all", slug })(e)}
            />
          ))}
          {/* W4f — the desktop fan-out section nav, spying the shelves (unchanged). */}
          <AisleFanNav aisles={stocked.map((s) => s.aisle)} />
        </>
      )}

      {/* W5d — one shared detail sheet fed the tapped item (mirrors MenuBrowser). Its Add/step route
          through the SAME onAdd/onStep the cards use — one money path, no second add surface. */}
      <GroceryItemSheet
        item={sheetItem}
        line={(sheetItem && lineByBarcode.get(sheetItem.barcode)) || null}
        canAdd={canAdd}
        adding={!!sheetItem && addingBarcode === sheetItem.barcode}
        stepping={busyLineId !== null}
        open={sheetItem !== null}
        onClose={() => setSheetItem(null)}
        onAdd={onAdd}
        onStep={onStep}
      />
    </>
  );
});
