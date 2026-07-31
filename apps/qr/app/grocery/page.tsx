"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useJourneyRouter } from "@/components/nav/TransitionNav"; // J1 journey grammar
import posthog from "posthog-js";
import { Icon, NumberFlow } from "@mms/ui";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { BlurUpImage } from "@/components/menu/BlurUpImage";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import {
  scanAdd,
  searchGroceryItems,
  getGroceryLines,
  type GroceryCatalogItem,
  type GroceryHit,
  type GroceryLine,
} from "@/lib/grocery";
import { GroceryBrowse } from "@/components/grocery/GroceryBrowse";
import { GroceryBasketSheet } from "@/components/grocery/GroceryBasketSheet";
import { saleInfo, sizeLabel } from "@/lib/grocery-aisles";
import { isTerminal, type CartUnavailable } from "@/lib/cart-unavailable";
import { setQty } from "@/lib/cart";
import { useTableSession } from "@/lib/useTableSession";

// The grocery market (W4b) — TWO doors over ONE catalog + ONE cart: Browse (aisle tiles, bilingual
// Weee!-anatomy cards, one-tap add) and Scan (camera on shelf barcodes), with the shared name-search
// fallback above both. K5's discipline is unchanged: the basket renders the CART's truth — hydrated
// from the server on mount and on tab re-focus, reconciled from every add's own returned view — so a
// refresh can never hide items the cart will charge. Every path (scan / search / browse card) adds
// through the same server-priced scanAdd; steppers ride the existing setQty. No new money surface.

export default function Grocery() {
  const router = useRouter(); // prefetch only — the checkout push rides the journey grammar
  const journey = useJourneyRouter(); // J1: grocery→cart is a FORWARD cut
  // W9d — `revalidate` was returned by the hook all along and discarded here; it's the re-mint the
  // terminal-basket recovery below rides (TableCartProvider already uses it for exactly this).
  const {
    session,
    error: sessionError,
    revalidate,
  } = useTableSession("scango", { door: "grocery" });
  const cartId = session?.cartId;

  const [lines, setLines] = useState<GroceryLine[]>([]);
  const [hydrated, setHydrated] = useState(false); // first server read landed → empty state is TRUE
  const [syncFailed, setSyncFailed] = useState(false); // a read failed → honest Retry, not a fake "checking…"
  // W9d — the basket is FINISHED (paid / cancelled / session expired): a terminal answer from the
  // server, not a failed read. Gates the "Start a fresh basket" recovery — which re-mints, and a
  // re-mint against a merely-unreadable cart would find-or-create a NEW cart and silently abandon
  // the shopper's real lines. Only `isTerminal` reasons ever land here.
  const [cartGone, setCartGone] = useState<CartUnavailable | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const addedRef = useRef(0); // success count for analytics cart_size — stable across the memoized adder
  const [busyLine, setBusyLine] = useState<string | null>(null); // one in-flight stepper op at a time

  // K5 — reads land out of order on flaky mobile radios (a visibilitychange sync issued on a waking
  // radio can resolve AFTER a scan that was issued later — the stale snapshot would make the just-
  // scanned item invisibly vanish, and the re-scan doubles the server qty: the exact bug this page
  // exists to fix). Every server read takes a ticket at ISSUE time; a response applies only if no
  // later-issued read has already applied.
  const reqSeq = useRef(0);
  const appliedSeq = useRef(0);
  const applyLines = useCallback((seq: number, ls: GroceryLine[]) => {
    if (seq <= appliedSeq.current) return;
    appliedSeq.current = seq;
    setLines(ls);
  }, []);
  // Set true in the effect BODY (not the initializer): StrictMode's simulated remount keeps the
  // same ref, so an initializer-only `true` would stay false after the dev-mode unmount+remount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GroceryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false); // a failed search ≠ an empty one — say so
  const searchRef = useRef<HTMLInputElement>(null);

  // W4b — the Browse|Scan tab. Browse is the default door (discovery-first; the camera permission
  // ask waits until the shopper actually chooses Scan). The choice sticks for the visit via
  // sessionStorage, read AFTER mount (an initializer read would diverge from the SSR'd markup).
  const [tab, setTab] = useState<"browse" | "scan">("browse");
  useEffect(() => {
    // Microtask defer (the TableCartProvider pattern) — the restore setState lands async, so the
    // effect body itself schedules no render.
    void Promise.resolve(window.sessionStorage.getItem("mms-grocery-tab")).then((stored) => {
      if (stored === "scan") setTab("scan");
    });
  }, []);
  const pickTab = useCallback((t: "browse" | "scan") => {
    setTab(t);
    try {
      window.sessionStorage.setItem("mms-grocery-tab", t);
    } catch {
      /* deliberate: storage full/blocked only loses tab persistence, never function */
    }
  }, []);
  const browseTabRef = useRef<HTMLButtonElement>(null);
  const scanTabRef = useRef<HTMLButtonElement>(null);
  // The basket sheet's close-restore target (see onCloseAutoFocus) — Radix can't restore here
  // itself because the Sheet primitive renders no Dialog.Trigger.
  const basketBtnRef = useRef<HTMLButtonElement>(null);
  // One in-flight browse add at a time (the stepper's one-op discipline, extended to the Add
  // buttons — a scan can stay rapid-fire, but a double-tapped card must not double-add).
  const [addingBarcode, setAddingBarcode] = useState<string | null>(null);

  // W9d — the basket review sheet (the Browse door's window onto the lines). Derived-closed while
  // the terminal banner owns the story (`open` && !cartGone at the render site, no effect): a basket
  // that just finished must not keep a modal review of nothing on top of the recovery copy.
  const [basketOpen, setBasketOpen] = useState(false);

  // ONE toast timer, cancelled before each re-arm — scanning is rapid-fire, so racing independent timers
  // could blank a fresh notice (incl. an error like "Weighed item — see staff") ~100 ms after it appears.
  // Mirrors TableCartProvider's flash discipline (the grocery page predated it).
  const toastTimer = useRef<number | null>(null);
  const flash = useCallback((msg: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Warm /cart so tapping "Check out" navigates without a cold server round-trip (matches CartBar).
  useEffect(() => {
    if (cartId) router.prefetch(`/cart?cart=${encodeURIComponent(cartId)}`);
  }, [cartId, router]);

  // W9d — the ONE place a terminal answer (paid / cancelled / session expired) lands, so its four
  // consequences can't drift apart across the three paths that can discover it (sync, add, stepper
  // reconcile) — the pre-merge review caught each drifting in a different way:
  //  · seq-guarded like every other server response: a slow read from the OLD cart resolving after
  //    a recovery re-mint must not resurrect the banner over a working fresh basket;
  //  · the list empties (an authoritative answer, not a misread — the never-`[]`-on-failure rule
  //    protects against reads that FAILED, and this one succeeded);
  //  · the basket sheet's own state resets — the render gate alone force-closes Radix without
  //    firing onOpenChange, so a stale `basketOpen: true` would pop an empty modal, uninvited,
  //    the moment the shopper taps "Start a fresh basket";
  //  · the toast (the page's one live region) announces the transition — the banner is deliberately
  //    NOT a live region, so without this the sync/refocus path emptied the basket in silence.
  const markCartGone = useCallback(
    (seq: number, reason: CartUnavailable) => {
      if (seq <= appliedSeq.current) return; // stale — a fresher view already applied
      applyLines(seq, []);
      setHydrated(true);
      setSyncFailed(false);
      setCartGone(reason);
      setBasketOpen(false);
      // Direction-neutral copy — the recovery banner sits at the top of the page, the toast at the
      // bottom; "below"/"above" would point one of them the wrong way.
      flash(
        reason === "paid"
          ? "This basket’s already paid for — start a fresh one to keep shopping."
          : reason === "cancelled"
            ? "This basket was closed — start a fresh one to keep shopping."
            : "Your market session ended — start a fresh basket to keep shopping.",
      );
    },
    [applyLines, flash],
  );

  // K5 — hydrate from the CART (the truth) on session-ready and on tab re-focus (the J3 freshness
  // pattern): a refresh or a backgrounded phone never hides items the cart will charge. A failure
  // AFTER first hydration is a deliberate read-only swallow (keep the last-known list; the next
  // scan/focus re-syncs); BEFORE it, `syncFailed` surfaces an honest Retry instead of a perpetual
  // "checking…" with nothing in flight. Callable from the Retry button, hence the useCallback.
  const syncNow = useCallback(() => {
    if (!cartId) return;
    const seq = ++reqSeq.current; // ticket at issue time — see applyLines
    getGroceryLines(cartId)
      .then((r) => {
        if (!mountedRef.current) return;
        if (r.ok) {
          applyLines(seq, r.lines);
          setHydrated(true);
          setSyncFailed(false);
          setCartGone(null);
          return;
        }
        // W9d — a refusal WITH a reason. Terminal (paid/cancelled/expired) → the shared,
        // seq-guarded transition (see markCartGone).
        if (isTerminal(r.reason)) {
          markCartGone(seq, r.reason);
          return;
        }
        // Transient (locked-race / settling / unreadable) → the same honest Retry as a network
        // failure. The last-known lines stay on screen; the strip below says they may be stale.
        setSyncFailed(true);
      })
      .catch(() => {
        if (mountedRef.current) setSyncFailed(true); // transport failure — same Retry strip
      });
  }, [cartId, applyLines, markCartGone]);
  useEffect(() => {
    if (!cartId) return;
    syncNow();
    const onVis = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cartId, syncNow]);

  // K5 — stepper on the CART LINE (setQty is the same guarded money path the menu uses; qty 0
  // removes). Optimistic flip, then reconcile from a fresh server read; a refused write (locked/
  // settling/raced) snaps back to truth via the reconcile — and if the reconcile ALSO fails after
  // a failed write (radio down), the pre-flip snapshot restores: the optimistic view must never
  // outlive a write the server refused (UI 2 / server 3 → checkout charges 3).
  const stepQty = useCallback(
    async (line: GroceryLine, nextQty: number) => {
      if (!cartId || busyLine || nextQty > 99) return;
      setBusyLine(line.lineId);
      const snapshot = lines; // pre-flip truth for the double-failure rollback
      const appliedAtFlip = appliedSeq.current; // rollback only if nothing fresher landed meanwhile
      setLines((cur) =>
        nextQty <= 0
          ? cur.filter((l) => l.lineId !== line.lineId)
          : cur.map((l) => (l.lineId === line.lineId ? { ...l, qty: nextQty } : l)),
      );
      // A removed row unmounts under the finger/focus — park focus on the stable search input
      // (the addHit pattern) so keyboard/SR diners aren't dropped to <body>. BUT not while the W5d
      // detail sheet is open: its Radix FocusScope owns focus and swaps the sheet's stepper→Add in
      // place, so yanking focus to the (inert, background) search input would fight the trap.
      if (nextQty <= 0 && !document.querySelector(".mms-sheet")) searchRef.current?.focus();
      flash(nextQty <= 0 ? `Removed ${line.name}` : `${line.name} × ${nextQty}`);
      let wrote = false;
      try {
        await setQty(line.lineId, nextQty);
        wrote = true;
      } catch {
        flash("Couldn’t update that — try again.");
      }
      const seq = ++reqSeq.current; // reconcile ticket — see applyLines
      try {
        const r = await getGroceryLines(cartId);
        if (r.ok) {
          applyLines(seq, r.lines);
          setCartGone(null); // an alive-cart answer clears the banner on every path (see add)
        } else if (isTerminal(r.reason)) {
          // The write's failure had a terminal cause — the basket is finished; the shared
          // transition also overwrites the "try again" flash above with the honest reason.
          markCartGone(seq, r.reason);
        } else if (!wrote && appliedSeq.current === appliedAtFlip) {
          setLines(snapshot); // transient refusal after a refused write — same rollback as the catch
        }
      } catch {
        // Reconcile failed. A refused write + optimistic view is a lie about money — roll back to
        // the snapshot (unless a fresher view already applied). A SUCCESSFUL write keeps the
        // optimistic view; the next scan/focus re-syncs. Deliberate read-only swallow.
        if (!wrote && appliedSeq.current === appliedAtFlip) setLines(snapshot);
      }
      setBusyLine(null);
    },
    [cartId, busyLine, lines, flash, applyLines, markCartGone],
  );

  // The ONE add path — a scan and a tapped search hit both go through here. Memoized on cartId so the
  // scanner effect (keyed on `onScan`) doesn't tear down + restart the camera on every re-render.
  const add = useCallback(
    async (barcode: string, via: "scan" | "search" | "browse") => {
      if (!cartId) {
        // The market renders before the basket exists (W4b) — a scan/tap here must SAY why nothing
        // happened, never silently no-op (adversarial HIGH-1).
        flash(
          sessionError
            ? "Basket unavailable — use Retry above, then add again."
            : "Still starting your basket — try again in a moment.",
        );
        return;
      }
      const seq = ++reqSeq.current; // ticket at issue time — the response carries a server view
      let r;
      try {
        r = await scanAdd(cartId, barcode);
      } catch {
        flash("Couldn’t add that — check your connection and try again.");
        return;
      }
      if (r.ok) {
        addedRef.current += 1;
        // The scan's OWN response carries the fresh server view (one round trip, the addItem
        // pattern) — the list is cart truth, not a parallel client ledger. `lines: null` = the
        // post-write read failed: keep the current list (a failed read is never an empty basket);
        // the next scan/focus re-syncs.
        if (r.lines) {
          applyLines(seq, r.lines);
          setHydrated(true);
          setSyncFailed(false);
        }
        // A server answer proving the cart ALIVE clears the terminal banner on every path, not just
        // syncNow's — otherwise a successful add would repopulate the list under a banner still
        // asserting the basket is finished (pre-merge review; symmetric with the ok arms below).
        setCartGone(null);
        flash(`Added ${r.name}${r.ebt ? " · EBT-eligible" : ""}`);
        posthog.capture("grocery_item_scanned", {
          barcode,
          item_name: r.name,
          unit_price_cents: r.unitPriceCents,
          ebt_eligible: r.ebt,
          cart_id: cartId,
          cart_size: addedRef.current,
          via,
        });
      } else if (r.reason === "weighed_item") {
        flash("Weighed item — see staff");
      } else if (r.reason === "unavailable") {
        flash("Out of stock right now");
      } else if (r.reason === "unknown_barcode") {
        flash(`Not found: ${barcode} — try searching by name`);
      } else if (isTerminal(r.reason)) {
        // W9d — the add failed because the BASKET is finished, not because of the radio: the
        // shared, seq-guarded transition (list empties · banner · sheet reset · toast).
        // ⚠️ The ISSUE-time ticket (`seq`, taken before the round trip), never a fresh
        // `++reqSeq.current`: a response-time ticket is always > appliedSeq, which turns the guard
        // into a tautology — a slow scanAdd against an ABANDONED cart resolving after the shopper
        // recovered onto a fresh basket would blank the fresh list and resurrect the dead banner
        // over it (pre-merge review HIGH; the guard exists for exactly that response).
        markCartGone(seq, r.reason);
      } else if (r.reason === "locked") {
        flash("Hang on — this basket’s being checked out.");
      } else if (r.reason === "settling") {
        flash("Hang on — this basket’s being settled.");
      } else {
        // `unreadable` — we couldn't establish why. Same honest transient copy as a thrown error;
        // NEVER the fresh-basket offer (a re-mint against a merely-unreadable cart abandons lines).
        flash("Couldn’t add that — check your connection and try again.");
      }
    },
    [cartId, sessionError, flash, applyLines, markCartGone],
  );

  const onScan = useCallback((code: string) => void add(code, "scan"), [add]);

  // W4b — a browse card's one-tap add: the same authorized scanAdd path, serialized so a double-tap
  // can't double-add (the card swaps to a stepper as soon as the returned cart view lands). When the
  // first basket read FAILED, adds are refused with the why — an add against an invisible basket
  // could double a qty the shopper can't see (adversarial MED-5).
  const addFromBrowse = useCallback(
    async (item: GroceryCatalogItem) => {
      if (addingBarcode || busyLine) return;
      // A finished basket refuses locally — same rationale as the scan door unmounting the camera:
      // don't round-trip ~400 live Add buttons just to be refused terminal on every tap.
      if (cartGone) {
        flash("This basket is finished — use “Start a fresh basket” to keep shopping.");
        return;
      }
      if (cartId && syncFailed && !hydrated) {
        // Direction-neutral (pre-merge review): the truth strip's Retry renders BELOW the browse
        // grid, so "above" pointed the wrong way from every card.
        flash("Couldn’t check your basket — tap Retry, then add again.");
        return;
      }
      setAddingBarcode(item.barcode);
      try {
        await add(item.barcode, "browse");
      } finally {
        setAddingBarcode(null);
      }
    },
    [add, addingBarcode, busyLine, cartId, cartGone, syncFailed, hydrated, flash],
  );

  // Debounced name search. All setState lives in the async timeout callback — never synchronously in
  // the effect body (cascading-render lint). A query under 2 chars clears results without a round-trip;
  // otherwise we fetch 220 ms after the last keystroke.
  useEffect(() => {
    const q = query.trim();
    let active = true;
    const t = window.setTimeout(() => {
      if (!active) return;
      if (q.length < 2) {
        setHits(null);
        setSearchFailed(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      searchGroceryItems(q)
        .then((res) => {
          if (!active) return;
          setHits(res);
          setSearchFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setHits([]);
          setSearchFailed(true); // distinguish a lookup failure from a genuine zero-result search
        })
        .finally(() => active && setSearching(false));
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [query]);

  // Search-hit add — same serialization as the browse cards (adversarial MED-3: an unguarded
  // double-tap on a result row was two server adds). Pre-basket, `add` flashes the honest notice
  // and the results STAY (clearing them would read as success).
  async function addHit(h: GroceryHit) {
    if (!cartId) {
      void add(h.barcode, "search");
      return;
    }
    if (addingBarcode || busyLine) return;
    // A finished basket refuses locally — the browse cards' rule, applied to hits too.
    if (cartGone) {
      flash("This basket is finished — use “Start a fresh basket” to keep shopping.");
      return;
    }
    // Same invisible-basket refusal as the browse cards (pre-merge review) — an add against a
    // basket whose truth failed to load could double a qty the shopper can't see. Direction-neutral
    // copy: the truth strip's Retry renders below the results list.
    if (syncFailed && !hydrated) {
      flash("Couldn’t check your basket — tap Retry, then add again.");
      return;
    }
    setAddingBarcode(h.barcode);
    try {
      await add(h.barcode, "search");
    } finally {
      setAddingBarcode(null);
    }
    setQuery("");
    setHits(null);
    // Tapping a hit unmounts the result button that held focus — return focus to the search input
    // (the natural place to keep going) so a keyboard / screen-reader diner isn't dropped to <body>.
    searchRef.current?.focus();
  }

  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  const totalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0);
  // W9d — ONE checkout path for the CTA pill and the basket sheet's button (same capture, same
  // journey cut) so the sheet can never drift into a second, differently-instrumented exit.
  const checkout = useCallback(() => {
    if (!cartId) return;
    posthog.capture("grocery_checkout_clicked", {
      cart_id: cartId,
      item_count: itemCount,
      unique_item_count: lines.length,
      total_cents: totalCents,
    });
    journey.push(`/cart?cart=${encodeURIComponent(cartId)}`);
  }, [cartId, itemCount, lines.length, totalCents, journey]);
  // Display-only, like totalCents — the EBT flags rode in on the server's own cart view.
  const ebtCents = lines.reduce((a, l) => a + (l.ebt ? l.unitPriceCents * l.qty : 0), 0);
  // W4e — real basket savings vs the market compare-at. Routed through the SAME `saleInfo` floor the
  // cards/hits use (≥1%), so the aggregate can never advertise a saving from a sub-1% gap that shows
  // no on-card sale anywhere (the DB CHECK only enforces `>`, not a minimum gap). Display only.
  const savedCents = lines.reduce((a, l) => {
    const s = saleInfo(l.unitPriceCents, l.compareAtCents);
    return a + (s ? s.saveCents * l.qty : 0);
  }, 0);

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: 20, paddingBottom: 120 }}>
      {/* W4g — editorial masthead: display-serif title + one quiet subline. The EBT disclaimer
          moved off the top (it lived here as a text-wall) — the honest "SNAP coming; pay by card
          today" copy still rides the per-item EBT chips and the Scan-door EBT-eligible line. */}
      <header className="grocery-head">
        {/* SR reads just "Grocery"; the bilingual flourish is decorative. */}
        <p className="eyebrow">
          Grocery{" "}
          <span aria-hidden>
            · <span lang="my">စျေး</span>
          </span>
        </p>
        <h1 className="grocery-title">Shop the market</h1>
        <p className="grocery-sub">Browse the aisles or scan shelf barcodes as you shop.</p>
      </header>

      {/* W4b — the session gates the BASKET, not the MARKET: the catalog is a public read, so the
          aisles render immediately while the scango session mints (or even if it fails) — only
          adding needs the cart, and every add path already refuses without one. */}
      {sessionError ? (
        <div className="card" role="alert" style={{ padding: 16, marginTop: 4 }}>
          <p style={{ margin: "0 0 12px", color: "var(--warn)", fontWeight: 600 }}>
            Couldn’t start your grocery basket — you can browse, but adding needs a connection.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="grocery-retry">
            Retry
          </button>
        </div>
      ) : !cartId ? (
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "4px 0 0" }}>
          Starting your basket…
        </p>
      ) : null}
      {/* W9d — the basket is FINISHED (a terminal server answer, not a failed read): say which, and
          offer the one recovery that fits — a fresh basket via the hook's re-mint. NOT a live region
          (the toast already announced the transition; one status region per view, G15). The offer
          only ever renders for `isTerminal` reasons — a merely-unreadable basket gets Retry instead,
          because a re-mint against a cart we simply couldn't read abandons the shopper's real lines
          on a cart they can no longer see. */}
      {cartGone && (
        <div className="card" style={{ padding: 16, marginTop: 4 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>
            {cartGone === "paid"
              ? "This basket’s been paid for"
              : cartGone === "cancelled"
                ? "This basket was closed"
                : "Your market session ended"}
          </p>
          <p style={{ margin: "0 0 12px", color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
            {cartGone === "paid"
              ? "It’s all set — nothing here is lost. Start a fresh basket to keep shopping."
              : "Start a fresh basket to keep shopping."}
          </p>
          <button
            type="button"
            className="grocery-retry"
            onClick={() => {
              setCartGone(null);
              setHydrated(false); // back to the honest "Checking your basket…" while the mint runs
              revalidate(); // clears the session → the mint effect re-POSTs /api/session
            }}
          >
            Start a fresh basket
          </button>
        </div>
      )}
      {/* Browse | Scan — a manual-activation tablist (arrow keys move focus between the two
          tabs; Enter/Space activates). The active state lives ON the tab button (bg + text on
          one element — never a separately-positioned indicator). */}
      <div className="grocery-toolbar">
        <div className="grocery-tabs" role="tablist" aria-label="Shop by">
          <button
            ref={browseTabRef}
            type="button"
            role="tab"
            id="grocery-tab-browse"
            aria-selected={tab === "browse"}
            aria-controls="grocery-panel-browse"
            tabIndex={tab === "browse" ? 0 : -1}
            className="grocery-tab"
            onClick={() => pickTab("browse")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") scanTabRef.current?.focus();
            }}
          >
            <Icon name="cat-grocery" size={18} />
            Browse
          </button>
          <button
            ref={scanTabRef}
            type="button"
            role="tab"
            id="grocery-tab-scan"
            aria-selected={tab === "scan"}
            aria-controls="grocery-panel-scan"
            tabIndex={tab === "scan" ? 0 : -1}
            className="grocery-tab"
            onClick={() => pickTab("scan")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") browseTabRef.current?.focus();
            }}
          >
            <Icon name="cart" size={18} />
            Scan
          </button>
        </div>

        <div className="grocery-search" role="search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search grocery items by name"
            placeholder="Search in English or မြန်မာ…"
            maxLength={40}
          />
        </div>
      </div>

      {/* Honest EBT/SNAP disclosure — demoted from the old top-of-page text-wall to one quiet line
          under the toolbar (undated per the W4a rule; the per-item EBT chips + the Scan-door
          EBT-eligible subtotal carry the detail). */}
      <p className="grocery-ebt-note">
        <span className="grocery-ebt-note-tag" aria-hidden>
          EBT
        </span>
        EBT-eligible items are tagged — SNAP checkout coming; pay by card today.
      </p>

      {hits !== null && (
        <ul role="list" aria-label="Search results" className="grocery-results">
          {searching && hits.length === 0 ? (
            <li className="grocery-hint">Searching…</li>
          ) : searchFailed ? (
            <li className="grocery-hint">Search unavailable — please try again.</li>
          ) : hits.length === 0 ? (
            <li className="grocery-hint">No matches — try fewer letters.</li>
          ) : (
            hits.map((h) => (
              <li key={h.barcode}>
                <button
                  type="button"
                  className="grocery-result"
                  aria-disabled={addingBarcode !== null || busyLine !== null}
                  onClick={() => void addHit(h)}
                  style={addingBarcode === h.barcode ? { opacity: 0.55 } : undefined}
                >
                  <span style={{ minWidth: 0 }}>
                    {h.name}{" "}
                    {h.ebt && <small style={{ color: "var(--ok)", fontWeight: 700 }}>EBT</small>}
                    <small style={{ display: "block", color: "var(--t3)", fontWeight: 500 }}>
                      {/* Burmese name carries lang="my" so a screen reader picks the right voice;
                          the roman meta (brand · size) is appended outside the tag. */}
                      {h.nameMy && <span lang="my">{h.nameMy}</span>}
                      {h.nameMy && (h.brand || h.sizeQty) ? " · " : ""}
                      {[h.brand, sizeLabel(h.sizeQty, h.sizeUnit)].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      flexShrink: 0,
                    }}
                  >
                    <b style={{ fontVariantNumeric: "tabular-nums" }}>
                      ${(h.unitPriceCents / 100).toFixed(2)}
                    </b>
                    {(() => {
                      const s = saleInfo(h.unitPriceCents, h.compareAtCents);
                      if (!s) return null;
                      // Visible "Compare at" (market-comparison framing, not a bare struck number)
                      // + an sr-only companion so the sale reaches screen readers too. W9d: the
                      // "−N%" shout is GONE here — search hits are the QUIET surface, like the
                      // cards' inline strike (the loud percentage now belongs only to featured
                      // deals, and `mms_grocery_search` doesn't carry the flag; 313 of 396 SKUs
                      // carry a genuine discount, so ~79% of results would otherwise shout — the
                      // wallpaper this slice removed).
                      return (
                        <>
                          <small aria-hidden style={{ color: "var(--ac-strong)", fontWeight: 700 }}>
                            Compare at{" "}
                            <s style={{ color: "var(--t3)", fontWeight: 500 }}>
                              ${(s.compareAtCents / 100).toFixed(2)}
                            </s>
                          </small>
                          <span className="sr-only">
                            {" "}
                            compare at ${(s.compareAtCents / 100).toFixed(2)}
                          </span>
                        </>
                      );
                    })()}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {/* Browse panel stays mounted while hidden (keeps the fetched catalog + scroll/filter
              state); the Scan panel fully unmounts so the camera is RELEASED the moment the
              shopper leaves it. */}
      <div
        id="grocery-panel-browse"
        role="tabpanel"
        aria-labelledby="grocery-tab-browse"
        hidden={tab !== "browse"}
      >
        {/* Stable callback identities + memo'd child: typing in the search box above no longer
            re-renders the ~400-card grid (adversarial MED-2). */}
        <GroceryBrowse
          lines={lines}
          canAdd={!!cartId && !cartGone && (hydrated || !syncFailed)}
          addingBarcode={addingBarcode}
          busyLineId={busyLine}
          onAdd={addFromBrowse}
          onStep={stepQty}
        />
      </div>
      {/* The tabpanel stays mounted so the Scan tab's aria-controls never dangles (L3); the
          SCANNER inside still unmounts, releasing the camera the moment the shopper leaves. */}
      <div
        id="grocery-panel-scan"
        role="tabpanel"
        aria-labelledby="grocery-tab-scan"
        hidden={tab !== "scan"}
      >
        {/* Don't open the camera until the basket exists — a scan without a cart only flashes an
            error. Gate on cartId with an inline note (pre-merge review). */}
        {tab === "scan" &&
          (cartId && !cartGone ? (
            <BarcodeScanner onScan={onScan} />
          ) : (
            <p style={{ color: "var(--t3)", marginTop: 12 }}>
              {cartGone
                ? // W9d — don't hold the camera open against a finished basket: every scan would
                  // round-trip just to be refused. The banner above carries the recovery.
                  "This basket is finished — start a fresh one above to keep scanning."
                : sessionError
                  ? "Basket unavailable — use Retry above, then scan."
                  : "Starting your basket… scanning opens in a moment."}
            </p>
          ))}
      </div>

      {/* K5 truth strip — OUTSIDE the tabs, because it must be visible from BOTH doors: on a failed
          read, an invisible server basket isn't just a display lie — a Browse re-add of an
          "invisible" item would increment the server qty (the exact doubling bug K5 exists to
          prevent). W9d: it now ALSO renders post-hydration — the old gate (`!hydrated &&
          !lines.length`) made the strip structurally unreachable once anything was on screen, so a
          refused re-sync (visibilitychange after the table locked, an expiring token) failed in
          silence and the shopper kept shopping against a stale list. With lines on screen the copy
          says stale, not missing. Suppressed while the terminal banner owns the story. */}
      {cartId && !cartGone && (syncFailed || (!hydrated && !lines.length)) && (
        <p style={{ color: "var(--t3)", marginTop: 14 }}>
          {syncFailed ? (
            // role="status" (polite), not "alert": it's paired with a Retry and must not
            // double-assert with the Browse catalog-failure alert when both reads fail at once
            // (one live region per view — pre-merge review).
            <span
              role="status"
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
            >
              {lines.length > 0
                ? "Couldn’t refresh your basket — what’s shown may be out of date."
                : "Couldn’t check your basket."}
              <button
                type="button"
                onClick={() => {
                  setSyncFailed(false);
                  syncNow();
                }}
                className="grocery-retry"
              >
                Retry
              </button>
            </span>
          ) : (
            "Checking your basket…"
          )}
        </p>
      )}

      {/* J6 — the GIANT running total: scan-and-go's one number, big enough to read at arm's length
          while the other hand scans. Its arm's-length purpose only holds on the SCAN door (where the
          basket list lives); on Browse the fixed checkout CTA's rolling total carries it, so the big
          figure doesn't sit buried under the whole aisle grid. Display only; NOT a live region. */}
      {tab === "scan" && lines.length > 0 && (
        <div className="grocery-total mms-rise" aria-hidden>
          <span className="grocery-total-label">Running total</span>
          <span className="grocery-total-figure">
            <NumberFlow value={totalCents / 100} format={{ style: "currency", currency: "USD" }} />
          </span>
        </div>
      )}
      {/* W4e — real savings vs the market compare-at (honest: only genuinely-discounted lines
          contribute). Part of the basket summary → shown on the Scan door with the total. */}
      {tab === "scan" && savedCents > 0 && (
        // Not aria-hidden — honest static text a screen-reader shopper should hear (unlike the
        // animated total, whose amount the CTA already carries). Not a live region.
        <p className="grocery-saved">
          You’re saving ${(savedCents / 100).toFixed(2)} vs. typical market prices
        </p>
      )}
      {/* W4a — the EBT-eligible subtotal: informational + undated-honest (FNS authorization is
          federally gated — never promise a date). Basket summary → shown on the Scan door. */}
      {tab === "scan" && ebtCents > 0 && (
        <p className="grocery-ebt-line">
          <span className="grocery-ebt-tag" aria-hidden>
            EBT
          </span>
          ${(ebtCents / 100).toFixed(2)} of your basket is EBT-eligible — SNAP checkout coming; pay
          by card today.
        </p>
      )}

      {/* Scanned lines (the Scan door's basket view; Browse shows the same truth on its cards) —
          NOT a live region: the toast (role="status") announces each add, so one live region per
          view (a second `aria-live` here would double-announce). */}
      <ul
        role="list"
        hidden={tab !== "scan"}
        style={{ listStyle: "none", padding: 0, marginTop: 16, display: "grid", gap: 8 }}
      >
        {lines.map((l) => (
          // Product-grade row (K5): photo · name · EBT · unit math · stepper · line total. Keyed by
          // CART-LINE id; `.mms-rise` (dynamic-mount variant) + `.card-textured` are RM/token-safe.
          <li key={l.lineId} className="card card-textured mms-rise grocery-scanned-row">
            {l.imageUrl && (
              <span className="grocery-thumb" aria-hidden>
                <BlurUpImage
                  src={l.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  sizes="56px"
                  fallback={<PhotoPlaceholder category="grocery" />}
                />
              </span>
            )}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: 700 }}>{l.name}</span>{" "}
              {l.ebt && <small style={{ color: "var(--ok)", fontWeight: 700 }}>EBT</small>}
              <small style={{ display: "block", color: "var(--t3)", marginTop: 2 }}>
                {l.qty} × ${(l.unitPriceCents / 100).toFixed(2)}
              </small>
            </span>
            {/* Busy = aria-disabled + handler early-return, NOT disabled — a disabled control
                drops from the tab order, stranding keyboard/SR focus on <body> every ±1 tap. */}
            <span
              className="grocery-stepper"
              role="group"
              aria-label={`${l.name} quantity`}
              data-busy={busyLine === l.lineId || undefined}
            >
              <button
                type="button"
                className="grocery-step-btn"
                aria-label={l.qty <= 1 ? `Remove ${l.name}` : `One less ${l.name}`}
                aria-disabled={busyLine !== null}
                onClick={() => void stepQty(l, l.qty - 1)}
              >
                <span aria-hidden>−</span>
              </button>
              <span style={{ minWidth: 18, textAlign: "center", fontWeight: 800 }}>{l.qty}</span>
              <button
                type="button"
                className="grocery-step-btn"
                aria-label={`One more ${l.name}`}
                aria-disabled={busyLine !== null || l.qty >= 99}
                onClick={() => void stepQty(l, l.qty + 1)}
              >
                <span aria-hidden>+</span>
              </button>
            </span>
            <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              ${((l.unitPriceCents * l.qty) / 100).toFixed(2)}
            </b>
          </li>
        ))}
        {!lines.length && cartId && hydrated && !cartGone && (
          <li style={{ color: "var(--t3)" }}>Nothing scanned yet.</li>
        )}
      </ul>

      {/* ALWAYS-mounted live region (adversarial MED-6): several SR/browser pairs skip a region
          born WITH its text — the container persists, only the text swaps; visibility hides the
          empty pill without removing it from the accessibility tree's region registry.
          The explicit aria-live is NOT the usual role="status" redundancy (QA §A): it's what keeps
          this region OUT of Radix's modal aria-hidden sweep — the aria-hidden lib exempts only
          `[aria-live]` nodes, so without the attribute a terminal answer landing while the basket
          sheet is open would flash into a hidden node and re-enter the tree "born with" its text
          (the exact class MED-6 fixed). Deliberate; keep it. */}
      <div
        role="status"
        aria-live="polite"
        className="grocery-toast"
        style={toast ? undefined : { visibility: "hidden" }}
      >
        {toast}
      </div>

      {lines.length > 0 && cartId && (
        // W9d — the pinned bar: basket-review trigger + checkout CTA. The Browse door (the DEFAULT)
        // had no basket view at all — the CTA's rolling figure was the only evidence anything was in
        // the cart, and the only way to see the items was to switch tabs or walk into checkout.
        <div className="grocery-cta-bar">
          <button
            type="button"
            ref={basketBtnRef}
            className="grocery-basket-btn"
            aria-haspopup="dialog"
            aria-label={`Review basket — ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            onClick={() => setBasketOpen(true)}
          >
            <Icon name="cart" size={20} />
            <span aria-hidden>{itemCount}</span>
          </button>
          {/* A real <button> (Enter AND Space), matching CartBar — the prior <a> only activated on
              Enter. The aria-label carries the count + total on focus; the rolling NumberFlow figure
              is presentation only (not announced per scan). */}
          <button
            type="button"
            className="grocery-cta"
            aria-label={`Check out — ${itemCount} ${itemCount === 1 ? "item" : "items"}, total $${(
              totalCents / 100
            ).toFixed(2)}`}
            onClick={checkout}
          >
            <span>
              Check out · {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="grocery-cta-total">
              <NumberFlow
                value={totalCents / 100}
                format={{ style: "currency", currency: "USD" }}
              />
            </span>
          </button>
        </div>
      )}

      {/* W9d — the basket review sheet: a thin modal window onto the SAME lines/onStep/totals (never
          a second basket surface). Rendered whenever a cart exists so an in-flight remove that
          empties the basket shows the sheet's own empty state instead of vanishing mid-gesture. */}
      {cartId && (
        <GroceryBasketSheet
          open={basketOpen && !cartGone}
          onClose={() => setBasketOpen(false)}
          lines={lines}
          busyLineId={busyLine}
          savedCents={savedCents}
          ebtCents={ebtCents}
          totalCents={totalCents}
          itemCount={itemCount}
          onStep={stepQty}
          onCheckout={checkout}
          onCloseAutoFocus={(e) => {
            // ALWAYS redirect the restore — there is no working default here. Radix's modal
            // content unconditionally preventDefaults its own close event and focuses
            // `triggerRef.current`, but our Sheet never renders a Dialog.Trigger, so that ref is
            // null and EVERY close would land focus on <body> (verified mechanically against the
            // installed @radix-ui/react-dialog — the FocusScope fallback is skipped once the
            // event is defaultPrevented). Park on the basket button while it exists; on the
            // stable search input once the last row was removed and the CTA bar unmounted
            // (the page's remove-row pattern, WCAG 2.4.3).
            e.preventDefault();
            if (lines.length === 0) searchRef.current?.focus();
            else basketBtnRef.current?.focus();
          }}
        />
      )}
    </main>
  );
}
