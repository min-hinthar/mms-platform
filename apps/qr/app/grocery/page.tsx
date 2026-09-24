"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TransitionLink, useJourneyRouter } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { PaperAmbient } from "@/components/PaperAmbient";
import { useCtaDock } from "@/lib/hooks/useCtaDock";
import posthog from "posthog-js";
import { Card, Icon, NumberFlow, Toast } from "@mms/ui";
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
import { ScanStage } from "@/components/grocery/ScanStage";
import { ScanResult } from "@/components/grocery/ScanResult";
import { groceryLanding, parseDoor, type GroceryDoor } from "@/lib/grocery-landing";
import { slotAfter, type ScanOutcome, type ScanSlot } from "@/lib/scan-notice";
import { t as kioskT } from "@/lib/kiosk/strings";
import { saleInfo, sizeLabel } from "@/lib/grocery-aisles";
import { isTerminal, type CartUnavailable } from "@/lib/cart-unavailable";
import { menuHref } from "@/lib/menu-href";
import { failureCopy, useConnectionTruth } from "@/lib/useConnectionTruth";
import {
  drainCart,
  drainSummary,
  enqueueScan,
  flushCart,
  pendingFor,
  storageWorks,
  type QueuedScan,
} from "@/lib/grocery-queue";
import { lookupCachedItem } from "@/lib/grocery-catalog-cache";
import { classifyScan } from "@/lib/scan-gate";
import { haptic } from "@/lib/haptics";
import { setQty } from "@/lib/cart";
import { useTableSession } from "@/lib/useTableSession";
import { usePublishCart } from "@/components/ActiveOrderProvider";

// The grocery market (W4b) — TWO doors over ONE catalog + ONE cart: Browse (aisle tiles, bilingual
// Weee!-anatomy cards, one-tap add) and Scan (camera on shelf barcodes), with the shared name-search
// fallback above both. K5's discipline is unchanged: the basket renders the CART's truth — hydrated
// from the server on mount and on tab re-focus, reconciled from every add's own returned view — so a
// refresh can never hide items the cart will charge. Every path (scan / search / browse card) adds
// through the same server-priced scanAdd; steppers ride the existing setQty. No new money surface.

export default function Grocery() {
  const router = useRouter(); // prefetch only — the checkout push rides the journey grammar
  const journey = useJourneyRouter(); // J1: grocery→cart is a FORWARD cut
  // W10a — the connection-truth diagnosis behind every failure toast: "check your connection" is
  // only ever said when navigator.onLine is actually false; a paused DB says "it's on us".
  const { truth, diagnose } = useConnectionTruth();
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
  // M186 — what this basket has already been CHARGED for, read by the scan classifier. REFS, not
  // deps: `add` is memoized so `onScan` keeps a stable identity, and the scanner effect is keyed on
  // it — a fresh identity per basket change would tear down and restart the camera on every scan.
  // `billedRef` is this session's own record and the ONLY source that survives a failed post-write
  // read (`scanAdd` answers `lines: null`), which is exactly when the server view cannot prove it.
  const linesRef = useRef<GroceryLine[]>(lines);
  const pendingRef = useRef<QueuedScan[]>([]);
  const billedRef = useRef<Set<string>>(new Set());
  // The barcode the chip under the viewfinder is about. Set on every scan that lands OR is refused
  // as a repeat, so the "Add another" path is on screen BEFORE the shopper presents a second copy.
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null); // one in-flight stepper op at a time
  // Phase 1c — the Scan door's result bar (chip or notice), written at EVERY outcome in `add()`
  // through the pure `slotAfter` (lib/scan-notice.ts): a miss persists where the eye is, and a
  // repeat after a miss brings the chip — and "Add another" — back.
  const [slot, setSlot] = useState<ScanSlot>(null);
  const slotSeq = useRef(0);
  const noteOutcome = useCallback(
    (outcome: ScanOutcome, via: "scan" | "rescan" | "search" | "browse", barcode: string) => {
      const key = ++slotSeq.current; // taken OUTSIDE the updater (StrictMode re-runs updaters)
      setSlot((prev) => slotAfter(prev, { outcome, via, barcode, key }));
    },
    [],
  );
  // `grocery_scan_miss` fires once per barcode per page life — the 1.5s re-announce cannot inflate
  // it. It harvests the real shelf codes shoppers try (C6: the catalog's codes are synthetic).
  const missedRef = useRef<Set<string>>(new Set());

  // K5 — reads land out of order on flaky mobile radios (a visibilitychange sync issued on a waking
  // radio can resolve AFTER a scan that was issued later — the stale snapshot would make the just-
  // scanned item invisibly vanish, and the re-scan doubles the server qty: the exact bug this page
  // exists to fix). Every server read takes a ticket at ISSUE time; a response applies only if no
  // later-issued read has already applied.
  const reqSeq = useRef(0);
  const appliedSeq = useRef(0);
  // Codex round 4 on #300 — the header's "Your basket · N" counts only what a server read APPLIED
  // (the stepper's optimistic `setLines` never passes through here, so a refused edit is never
  // published as fact); the effect below publishes it, with the mode /grocery's URL does not carry.
  const [confirmedQty, setConfirmedQty] = useState<number | null>(null);
  const applyLines = useCallback((seq: number, ls: GroceryLine[]) => {
    if (seq <= appliedSeq.current) return;
    appliedSeq.current = seq;
    setLines(ls);
    setConfirmedQty(ls.reduce((n, l) => n + l.qty, 0));
  }, []);
  // The CURRENT cart, readable from any async continuation (the mountedRef pattern — written only
  // in its own effect, read in callbacks). The seq tickets only ORDER responses; they cannot prove
  // a response belongs to THIS cart — an in-flight op from the abandoned cart could resolve after
  // recovery, take a fresh-looking ticket (stepQty allocates its reconcile ticket AFTER its write
  // await), and paint the dead cart's truth or fire its side effects over the fresh basket (Codex).
  // Every async continuation below re-checks `cartIdRef.current === cartId` (its own closure)
  // before touching state or firing a toast/analytics event.
  const cartIdRef = useRef(cartId);
  useEffect(() => {
    cartIdRef.current = cartId;
  }, [cartId]);
  const publishCart = usePublishCart();
  useEffect(() => {
    if (cartId) publishCart(cartId, confirmedQty, "scango");
  }, [cartId, confirmedQty, publishCart]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
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

  // W4b — the Browse|Scan tab. Browse is the DEFAULT door (lib/grocery-landing.ts says why and what
  // switching it would owe); the camera ask waits until the shopper chooses Scan. Phase 1c — the
  // landing ladder: `?tab=scan|browse` (an in-store link) → the visit's stored tap → an `#aisle-*`
  // hash → the default.
  //  · `?tab` is read by the SERVER render too (`app/layout.tsx` is force-dynamic, so SSR and the
  //    first client render agree — the AccountUpgrade precedent), so a `?tab=scan` visitor sees the
  //    Scan door from the first frame. Captured ONCE: the strip below must not re-derive it.
  //  · the stored tap and the hash are read in the post-mount microtask. The only flip that can
  //    happen after mount is browse → scan, so the camera never starts on a door about to flip away.
  //  · only taps and `?tab` write storage; the default never does.
  const searchParams = useSearchParams();
  const [tabParam] = useState(() => searchParams.get("tab"));
  const [tab, setTab] = useState<GroceryDoor>(
    () => groceryLanding({ tabParam, stored: null, aisleHash: null }).door,
  );
  const persistTab = useCallback((door: GroceryDoor) => {
    try {
      window.sessionStorage.setItem("mms-grocery-tab", door);
    } catch {
      /* deliberate: storage full/blocked only loses tab persistence, never function */
    }
  }, []);
  useEffect(() => {
    // Microtask defer (the TableCartProvider pattern) — the restore setState lands async, so the
    // effect body itself schedules no render.
    void Promise.resolve().then(() => {
      let stored: string | null = null;
      try {
        stored = window.sessionStorage.getItem("mms-grocery-tab");
      } catch {
        /* deliberate: an unreadable store is simply no stored tap */
      }
      const landing = groceryLanding({ tabParam, stored, aisleHash: window.location.hash });
      if (landing.door === "scan") setTab("scan");
      if (landing.reason === "link" && parseDoor(tabParam)) {
        // The link becomes the visit's choice, and leaves the URL — so a later Browse tap survives
        // a reload instead of being overruled by the stale `?tab`. `history.state` passes through so
        // Next's patched history bails (the Checkout precedent).
        persistTab(landing.door);
        const url = new URL(window.location.href);
        url.searchParams.delete("tab");
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      posthog.capture("grocery_landing", { door: landing.door, reason: landing.reason });
    });
  }, [tabParam, persistTab]);
  const pickTab = useCallback(
    (door: GroceryDoor) => {
      setTab(door);
      persistTab(door);
    },
    [persistTab],
  );
  const browseTabRef = useRef<HTMLButtonElement>(null);
  const scanTabRef = useRef<HTMLButtonElement>(null);
  // The basket sheet's close-restore target (see onCloseAutoFocus) — Radix can't restore here
  // itself because the Sheet primitive renders no Dialog.Trigger.
  const basketBtnRef = useRef<HTMLButtonElement>(null);
  // Phase 1c (k) — the Scan panel unmounts its stage for a FINISHED basket (W9d). If focus was inside
  // it, it lands on the banner's "Start a fresh basket" instead of falling to <body>.
  const scanPanelRef = useRef<HTMLDivElement>(null);
  const freshBtnRef = useRef<HTMLButtonElement>(null);
  const freshFocusRef = useRef(false);
  // M126 (Codex #238 P1) — the grocery dock publishes its height too. Without this the ambient's
  // pause coin sits UNDER this bar on a coarse pointer: same lower-left band, same --z-toolbar,
  // and this rule is later in globals.css, so it paints over the coin AND swallows its taps —
  // removing the only way to stop the drift on the grocery flow (WCAG 2.2.2).
  const ctaBarRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!cartGone || !freshFocusRef.current) return;
    freshFocusRef.current = false;
    freshBtnRef.current?.focus();
  }, [cartGone]);

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
  // The seq-guarded ALIVE transition — markCartGone's mirror, and the guard cuts both ways (Codex
  // P1 on the pre-merge round): a read issued while the cart was still open but resolving AFTER a
  // fresher response proved it terminal must not clear the banner it lost the race to — the shopper
  // would be left with an empty list, no banner, and no recovery until the next sync rediscovered
  // it. An ok answer applies its lines and clears the terminal/failure state together, or not at all.
  const markCartAlive = useCallback(
    (seq: number, lines: GroceryLine[]) => {
      if (seq <= appliedSeq.current) return; // stale — it lost the race; a fresher answer stands
      applyLines(seq, lines);
      setHydrated(true);
      setSyncFailed(false);
      setCartGone(null);
    },
    [applyLines],
  );

  const markCartGone = useCallback(
    (seq: number, reason: CartUnavailable) => {
      if (seq <= appliedSeq.current) return; // stale — a fresher view already applied
      if (scanPanelRef.current?.contains(document.activeElement)) freshFocusRef.current = true;
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
        if (!mountedRef.current || cartIdRef.current !== cartId) return; // not this cart's page anymore
        if (r.ok) {
          markCartAlive(seq, r.lines);
          return;
        }
        // W9d — a refusal WITH a reason. Terminal (paid/cancelled/expired) → the shared,
        // seq-guarded transition (see markCartGone).
        if (isTerminal(r.reason)) {
          markCartGone(seq, r.reason);
          return;
        }
        // Transient (locked-race / settling / unreadable) → the same honest Retry as a network
        // failure — but only if nothing FRESHER already applied: a stale refresh failing after a
        // newer response landed must not warn "may be out of date" about a basket that isn't
        // (Codex). The last-known lines stay on screen either way.
        if (seq > appliedSeq.current) setSyncFailed(true);
      })
      .catch(() => {
        // Transport failure — same Retry strip, same freshness + cart guards as above.
        if (mountedRef.current && cartIdRef.current === cartId && seq > appliedSeq.current)
          setSyncFailed(true);
      });
  }, [cartId, markCartAlive, markCartGone]);
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
      // M186 — removing a line is the shopper saying they don't want it, so its barcode is a new
      // item again. `lines` stays the primary source, so a rolled-back removal is covered by the
      // line reappearing there.
      if (nextQty <= 0) billedRef.current.delete(line.barcode);
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
      // The reconcile ticket is allocated AFTER the write await — so the recovery handler's
      // ticket fast-forward cannot void it. If the shopper swapped carts while the write was in
      // flight, stop here: reconciling the ABANDONED cart with a post-swap ticket would paint its
      // lines (or its terminal banner) over the fresh basket (Codex). Nothing to roll back — the
      // swap already emptied/replaced the list.
      if (cartIdRef.current !== cartId) {
        setBusyLine(null);
        return;
      }
      const seq = ++reqSeq.current; // reconcile ticket — see applyLines
      try {
        const r = await getGroceryLines(cartId);
        if (r.ok) {
          markCartAlive(seq, r.lines); // seq-guarded both ways — see the helper
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
    [cartId, busyLine, lines, flash, markCartAlive, markCartGone],
  );

  // W7b — the offline scan queue's page state: what's WAITING to sync for this cart. Queued scans
  // are never cart lines and never join the running total (the server may refuse them at replay);
  // they render as their own visibly-distinct pending strip below.
  const [pendingScans, setPendingScans] = useState<QueuedScan[]>([]);
  const syncPending = useCallback(() => {
    const next = cartId ? pendingFor(cartId) : [];
    pendingRef.current = next; // read by the scan classifier — a queued scan is already charged for
    setPendingScans(next);
  }, [cartId]);
  useEffect(() => {
    // setState via a scheduled callback, not synchronously in the effect (react-hooks rule).
    const id = setTimeout(syncPending, 0);
    return () => clearTimeout(id);
  }, [syncPending]);

  // Queue a scan made with no radio: entry = {scanId, cartId, barcode, queuedAt} — NEVER a price
  // (replay re-derives server-side; the cached name/price below is a labeled estimate). `scanId`
  // is the attempt's identity minted by add() — the SAME id the live attempt carried (or would
  // have), so a lost-response live add and its queued retry dedupe to one write (review HIGH).
  const queueOffline = useCallback(
    (barcode: string, scanId: string, via: "scan" | "rescan" | "search" | "browse") => {
      if (!cartId) return false;
      if (!storageWorks()) {
        flash("You look offline — scanning needs a connection on this device.");
        return true; // handled (honestly): private-mode storage can't hold a queue
      }
      const next = enqueueScan(cartId, barcode, scanId);
      if (next === null) {
        flash("Too many scans waiting — reconnect to sync before adding more.");
        return true;
      }
      const cached = lookupCachedItem(barcode);
      flash(
        cached
          ? `Saved ${cached.name} ≈$${(cached.priceCents / 100).toFixed(2)} — adds when you’re back online.`
          : "Saved — adds when you’re back online.",
      );
      syncPending();
      setLastScanned(barcode); // the chip's "Add another" is the offline second copy too
      noteOutcome("queued", via, barcode);
      return true;
    },
    [cartId, flash, syncPending, noteOutcome],
  );

  // The ONE add path — a scan and a tapped search hit both go through here. Memoized on cartId so the
  // scanner effect (keyed on `onScan`) doesn't tear down + restart the camera on every re-render.
  const add = useCallback(
    async (barcode: string, via: "scan" | "rescan" | "search" | "browse") => {
      // M186 — a CAMERA scan of a barcode this basket already pays for is NEVER charged again. The
      // decode stream cannot tell a jar resting in frame from a second identical jar, so every
      // purely temporal rule gets one direction wrong (see `lib/scan-gate.ts`); the basket can tell,
      // and it is never a guess. A second copy is the chip's "Add another" — `via: "rescan"`, a
      // deliberate tap, which is also why Browse and search taps skip this entirely.
      if (via === "scan") {
        const verdict = classifyScan(
          {
            lines: linesRef.current,
            queued: pendingRef.current.map((q) => q.barcode),
            billed: [...billedRef.current],
          },
          barcode,
        );
        if (verdict.kind === "repeat") {
          // Never silent: the toast says what happened and the chip below the viewfinder carries
          // the one-tap path. A refusal the shopper can't see is a wrong number on the receipt.
          setLastScanned(barcode);
          noteOutcome("repeat", via, barcode);
          flash(
            verdict.where === "basket"
              ? `${verdict.name} is already in your basket (×${verdict.qty}) — tap “Add another” for a second.`
              : verdict.where === "queued"
                ? "Already saved — it adds when you’re back online. Tap “Add another” for a second."
                : "Already added — your list is out of date. Tap “Add another” for a second.",
          );
          return;
        }
      }
      // W7b — ONE identity per physical scan, minted at the top: the live attempt SENDS it and any
      // queued retry REUSES it, so the server's scan-event ledger dedupes a lost-response live add
      // against its own replay (review HIGH: a fresh id minted at enqueue time crosses idempotency
      // keys — the committed-but-unanswered live write and the retry would both land).
      const scanId = crypto.randomUUID();
      // A dead radio queues instead of failing: the ONLY state licensed to promise a later
      // sync is device-offline (navigator.onLine false). A backend outage (we-down) keeps the
      // honest refusal — scan verdicts (unknown/weighed/terminal) can only come from the server,
      // and a queued scan later refused is a lie about money.
      if (typeof navigator !== "undefined" && !navigator.onLine && cartId) {
        queueOffline(barcode, scanId, via);
        return;
      }
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
        r = await scanAdd(cartId, barcode, scanId);
      } catch {
        if (cartIdRef.current === cartId) {
          // W7b — the request RACED the radio dying: same license as the pre-flight (offline is
          // the only state that may promise a later sync), so the scan queues instead of dropping.
          // The SAME scanId the live attempt carried — if that write actually committed and only
          // the response was lost, the replay conflicts on the ledger and no-ops (review HIGH).
          if (
            typeof navigator !== "undefined" &&
            !navigator.onLine &&
            queueOffline(barcode, scanId, via)
          )
            return;
          // ONE toast, immediately, using the truth we already hold (the module-cached verdict, so
          // the second failure in an outage is already attributed). The probe runs fire-and-forget
          // to warm that cache — deliberately NOT awaited: a re-flash after the 1800ms toast timer
          // would announce twice for one failure and pop a toast seconds after the tap.
          noteOutcome("transport", via, barcode); // leaves the bar as it was — the toast speaks
          flash(failureCopy(truth, "add that"));
          void diagnose();
        }
        return;
      }
      // An abandoned cart's response fires NOTHING — not the toast, not the counter, not the
      // analytics event, not a state transition. The seq guard alone couldn't stop these side
      // effects (they aren't ticketed), so a pre-recovery scan resolving late would flash a false
      // "Added" and corrupt the fresh cart's cart_size right after its reset (Codex). Note the
      // SAME-cart stale-view case stays fully live: a later sync applying first only makes
      // markCartAlive skip the view — the add really happened, so its toast/analytics still run.
      if (cartIdRef.current !== cartId) return;
      // Phase 1c — every refusal goes through the ONE slot rule: a catalog miss plants a notice
      // (camera paths only), a basket reason leaves the bar as it was (lib/scan-notice.ts).
      if (!r.ok) noteOutcome(r.reason, via, barcode);
      if (r.ok) {
        // W13 — deliberately POST-verdict (unlike the menu's optimistic buzz): a scan's outcome
        // (unknown barcode / unavailable / weighed) only the server can give — buzzing "added"
        // on a scan that comes back "not found" would be a physical lie.
        haptic("add");
        addedRef.current += 1;
        // M186 — this session's own record that the basket is now paying for this barcode. It is
        // the only one left when `r.lines` is null (the post-write read failed), and that is
        // precisely when a second sighting would otherwise bill again.
        billedRef.current.add(barcode);
        setLastScanned(barcode);
        noteOutcome("ok", via, barcode);
        // The scan's OWN response carries the fresh server view (one round trip, the addItem
        // pattern) — the list is cart truth, not a parallel client ledger. `lines: null` = the
        // post-write read failed: keep the current list (a failed read is never an empty basket);
        // the next scan/focus re-syncs.
        // The alive answer clears the terminal banner too — but only through the seq guard: a slow
        // add issued pre-payment must not clear a banner a fresher read has since proven true
        // (Codex P1 — the guard cuts both ways). `lines: null` = the post-write read failed: no
        // view to apply and no ordering ticket to trust, so no state transition either — the next
        // sync settles it.
        if (r.lines) markCartAlive(seq, r.lines);
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
      } else if (
        r.reason === "weighed_item" ||
        r.reason === "unavailable" ||
        r.reason === "unknown_barcode"
      ) {
        // Phase 1c — a catalog miss persists in the stage's result bar (a camera miss only — see
        // the `noteOutcome` above the chain); the toast says the same words once, as the view's
        // announcement. The weighed / unavailable wording is the kiosk's shipped copy, named once.
        if (r.reason === "unknown_barcode") {
          flash("Barcode not on file — search by name.");
          if (!missedRef.current.has(barcode)) {
            missedRef.current.add(barcode);
            posthog.capture("grocery_scan_miss", { barcode });
          }
        } else {
          flash(kioskT("en", r.reason === "weighed_item" ? "scanWeighed" : "scanUnavailable"));
        }
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
        // W10a — one toast from the truth we hold; the probe warms the cache for the next failure
        // (see the transport catch above for why this is not awaited).
        flash(failureCopy(truth, "add that"));
        void diagnose();
      }
    },
    [cartId, sessionError, flash, markCartAlive, markCartGone, diagnose, queueOffline, noteOutcome],
  );

  // W7b — the reconnect drain: strictly serialized FIFO through the SAME discipline as a live add
  // (issue-time seq tickets + the cartIdRef era check), so a replay response can never paint a dead
  // cart's truth over a fresh basket. Verdicts ride scanAdd's existing union: delivered/rejected
  // dequeue, a TERMINAL cart flushes its whole queue (drainCart's rule), transport keeps + retries
  // on the next online event / tick.
  const drainingRef = useRef(false);
  const drainNow = useCallback(async () => {
    const forCart = cartId;
    if (!forCart || drainingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (pendingFor(forCart).length === 0) return;
    drainingRef.current = true;
    try {
      let delivered = 0;
      const outcomes = await drainCart(forCart, async (entry) => {
        if (cartIdRef.current !== entry.cartId) return null; // era changed mid-drain — retry later
        const seq = ++reqSeq.current;
        const r = await scanAdd(entry.cartId, entry.barcode, entry.scanId);
        if (cartIdRef.current !== entry.cartId) return r.ok ? { ok: true } : null;
        if (r.ok) {
          delivered += 1;
          if (r.lines) markCartAlive(seq, r.lines);
          return { ok: true };
        }
        // Narrow the catalog reasons away so isTerminal sees the CartUnavailable half of the union.
        const reason = r.reason;
        if (
          reason !== "unknown_barcode" &&
          reason !== "unavailable" &&
          reason !== "weighed_item" &&
          isTerminal(reason)
        )
          markCartGone(seq, reason);
        return { ok: false, reason };
      });
      // ONE composed toast — flash() is single-slot, so per-outcome flashes in this same
      // continuation clobber each other and a rejection vanished behind the success line
      // (review MED). drainSummary is the pure, unit-pinned sequencing rule.
      const summary = drainSummary(
        delivered,
        outcomes.filter((o) => o.verdict === "rejected").map((o) => o.entry.barcode),
      );
      if (summary) flash(summary);
    } finally {
      drainingRef.current = false;
      syncPending();
    }
  }, [cartId, flash, markCartAlive, markCartGone, syncPending]);

  useEffect(() => {
    const onOnline = () => void drainNow();
    window.addEventListener("online", onOnline);
    // A slow tick as the backstop (a `locked` refusal clears without an online transition).
    const id = setInterval(() => void drainNow(), 45_000);
    const kick = setTimeout(() => void drainNow(), 0); // catch a queue left from a previous visit
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(id);
      clearTimeout(kick);
    };
  }, [drainNow]);

  const onScan = useCallback((code: string) => void add(code, "scan"), [add]);

  // M186 — the ONE deliberate way to buy a second of something the basket already holds. `rescan`
  // skips the repeat classification (that is the whole point: the shopper chose it) and otherwise
  // travels the same authorized scanAdd path, so the server's "a repeat barcode deliberately
  // counts" is reached by a tap instead of by a timing guess. Serialized like the browse adder so
  // a double-tap can't buy two.
  const addAnother = useCallback(async () => {
    if (!lastScanned || addingBarcode || busyLine) return;
    setAddingBarcode(lastScanned);
    try {
      await add(lastScanned, "rescan");
    } finally {
      setAddingBarcode(null);
    }
  }, [lastScanned, addingBarcode, busyLine, add]);

  // Named ONCE from the basket (falling back to the cached catalog while the line is still in
  // flight) — never a copy of what the scan returned, so the chip can never drift from the list
  // beside it or from what the shopper is actually being charged.
  //
  // ⚠️ The chip renders ONLY while the barcode is still accounted for — a line, or a scan waiting in
  // the offline queue. Keeping it up after the shopper REMOVES the line would have it say "in your
  // basket" about something the basket no longer holds (and `billedRef` has already dropped, so a
  // re-scan correctly charges again): the chip would be the only thing on screen disagreeing with
  // the list under it.
  const lastScannedLine = lastScanned ? lines.find((l) => l.barcode === lastScanned) : undefined;
  const lastScannedQueued = lastScanned
    ? pendingScans.some((q) => q.barcode === lastScanned)
    : false;
  const lastScannedName =
    lastScannedLine?.name ??
    (lastScanned ? lookupCachedItem(lastScanned)?.name : undefined) ??
    null;
  const showRescanChip = Boolean(lastScanned) && (Boolean(lastScannedLine) || lastScannedQueued);

  // Phase 1c — "Search by name" from any stage panel or the unknown-barcode notice: the one field,
  // centred (instant under reduced motion), focused without a second scroll.
  const focusSearch = useCallback(() => {
    const el = searchRef.current;
    if (!el) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "instant" : "smooth" });
    el.focus({ preventScroll: true });
  }, []);
  // Dismiss clears the bar and hands focus back to the stage box (the ✕ that held it unmounts).
  const dismissSlot = useCallback(() => {
    setSlot(null);
    document.getElementById("scan-stage")?.focus();
  }, []);

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
  useCtaDock(ctaBarRef, lines.length > 0 && Boolean(cartId));
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
    // W22a — the paper ambient behind the aisle (no isolation: the page ground lives on <html>,
    // so the fixed z:-1 layer is visible without trapping the toast (.ui-toast-region) under the sheet).
    <main className="page-col" style={{ padding: 20, paddingBottom: 120 }}>
      <PaperAmbient />
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
        {/* W20 (owner: "To-go and groceries should also have leave options") — the named exit the
            menu's arrival beat carries, on the market's masthead: leaving is a navigation (the
            per-device scango session rejoins this same open basket), never a basket mutation.
            R1 — the SAME tile the menu's arrival beat uses (`.arrival-exit-link`: title + promise),
            not a 44px pill dropped into a running sentence: that inline link stretched its line box
            to 67px and stranded "your" after the dash at 375/390/430 (three reviewers, one finding).
            One exit vocabulary on both doors. */}
        <div style={{ marginTop: 10, maxWidth: 260 }}>
          <TransitionLink href={menuHref(null)} className="arrival-exit-link">
            <span className="arrival-exit-title">
              Back to the start
              <span aria-hidden className="nav-arrow nav-arrow-fwd">
                →
              </span>
            </span>
            <span className="arrival-exit-note">your basket stays saved on this device</span>
          </TransitionLink>
        </div>
      </header>

      {/* W4b — the session gates the BASKET, not the MARKET: the catalog is a public read, so the
          aisles render immediately while the scango session mints (or even if it fails) — only
          adding needs the cart, and every add path already refuses without one. */}
      {sessionError ? (
        <div className="card" role="alert" style={{ padding: 16, marginTop: 4 }}>
          <p style={{ margin: "0 0 12px", color: "var(--warn)", fontWeight: "var(--fw-semibold)" }}>
            Couldn’t start your grocery basket — this one’s usually on our end, and adding needs it
            working. Browsing may be spotty too.
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
          <p style={{ margin: "0 0 4px", fontWeight: "var(--fw-bold)" }}>
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
            ref={freshBtnRef}
            type="button"
            className="grocery-retry"
            onClick={() => {
              // This very button unmounts on the next render (the banner is gated on cartGone) —
              // park focus on the always-mounted search input FIRST, and let the toast (the one
              // live region) say the re-mint is underway; "Starting your basket…" below is
              // deliberately not live (Codex P2, WCAG 2.4.3).
              searchRef.current?.focus();
              flash("Starting a fresh basket…");
              // Switching carts: VOID every outstanding ticket (fast-forward appliedSeq past them)
              // and zero the per-cart analytics counter. The seq guard alone only ORDERS responses
              // — it can't tell a late response from the ABANDONED cart apart from a fresh one, so
              // if the new cart's first read failed, an old-cart response could paint the dead
              // cart's lines (or its banner) over a page whose checkout targets the new cart
              // (Codex). This handler is the ONLY place the page swaps carts mid-life, and no new
              // ticket can issue while cartId is null (every issuer early-returns), so the new
              // cart's own reads all ticket AFTER this line. (In a handler, not an effect — the
              // React Compiler forbids mutating these refs from effect bodies.)
              appliedSeq.current = reqSeq.current;
              addedRef.current = 0;
              // M186 — the abandoned basket's charges are not this one's: a barcode the dead cart
              // paid for must scan cleanly into the fresh one.
              billedRef.current = new Set();
              setLastScanned(null);
              setSlot(null); // Phase 1c — the dead basket's result bar goes with it
              // W7b — the dead basket's queued scans die with it: replaying them into the fresh
              // cart would charge it for the abandoned basket's scans (the queue's terminal rule).
              if (cartId) flushCart(cartId);
              pendingRef.current = []; // the classifier must not count the dead basket's queue
              setPendingScans([]);
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
            <Icon name="scan" size={18} />
            Scan
          </button>
        </div>

        <div className="grocery-search" role="search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            id="grocery-search"
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
                    {h.ebt && (
                      <small style={{ color: "var(--ok)", fontWeight: "var(--fw-bold)" }}>
                        EBT
                      </small>
                    )}
                    <small
                      style={{
                        display: "block",
                        color: "var(--t3)",
                        fontWeight: "var(--fw-medium)",
                      }}
                    >
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
                          <small
                            aria-hidden
                            style={{ color: "var(--ac-strong)", fontWeight: "var(--fw-bold)" }}
                          >
                            Compare at{" "}
                            <s style={{ color: "var(--t3)", fontWeight: "var(--fw-medium)" }}>
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
        ref={scanPanelRef}
      >
        {/* Phase 1c — the stage owns every camera state (primer · live · recovery) and renders
            BEFORE the basket exists: sightings are held (`decodeHold`) until it does, then the item
            in frame adds once. It never renders against a finished or unavailable basket (W9d:
            no camera held open against a basket that cannot take a scan) — those two keep today's
            lines, as compact paper notes. Switching to Browse unmounts it, releasing the camera. */}
        {tab === "scan" &&
          (!cartGone && !sessionError ? (
            <ScanStage
              onScan={onScan}
              cartReady={Boolean(cartId)}
              sheetOpen={basketOpen && !cartGone}
              onSearch={focusSearch}
              result={
                slot?.kind === "notice" ? (
                  <ScanResult
                    key={slot.key}
                    slot={slot}
                    chip={null}
                    onSearch={focusSearch}
                    onDismiss={dismissSlot}
                  />
                ) : slot?.kind === "chip" && showRescanChip && lastScanned ? (
                  // M186 — the second-copy path, where the eye is, from the moment the FIRST scan
                  // lands. Named from the basket (see lastScannedName), never from the response.
                  <ScanResult
                    key={slot.key}
                    slot={slot}
                    chip={{
                      name: lastScannedName ?? lastScanned,
                      meta: lastScannedLine
                        ? `In your basket ×${lastScannedLine.qty}`
                        : "Waiting to sync",
                      busy: addingBarcode === lastScanned || !!busyLine,
                      onAddAnother: () => void addAnother(),
                    }}
                    onSearch={focusSearch}
                    onDismiss={dismissSlot}
                  />
                ) : null
              }
            />
          ) : (
            <Card as="p" className="scan-paper-note">
              {cartGone
                ? // W9d — don't hold the camera open against a finished basket: every scan would
                  // round-trip just to be refused. The banner above carries the recovery.
                  "This basket is finished — start a fresh one above to keep scanning."
                : "Basket unavailable — use Retry above, then scan."}
            </Card>
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
      {/* W7b — the offline queue's pending strip: queued scans are VISIBLY apart from the basket
          (the list + total render the CART's server truth; the server may still refuse these at
          replay). role="note", deliberately not live — the toast announced each save, and this
          view's one live region stays the toast (QA §A). Estimates come from the cached catalog
          map and say so. */}
      {cartId && !cartGone && pendingScans.length > 0 && (
        <p
          role="note"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
            color: "var(--t2)",
          }}
        >
          <Icon name="offline" size={14} />
          <span>
            {pendingScans.length} {pendingScans.length === 1 ? "scan" : "scans"} waiting for a
            connection —{" "}
            {pendingScans
              .slice(0, 3)
              .map((p) => lookupCachedItem(p.barcode)?.name ?? p.barcode)
              .join(", ")}
            {pendingScans.length > 3 ? "…" : ""}. They’ll add when you’re back online; prices
            confirm then.
          </span>
        </p>
      )}
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
            {/* W13 — the slot ALWAYS renders: a missing photo falls to the designed placeholder. */}
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
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: "var(--fw-bold)" }}>{l.name}</span>{" "}
              {l.ebt && (
                <small style={{ color: "var(--ok)", fontWeight: "var(--fw-bold)" }}>EBT</small>
              )}
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
              <span style={{ minWidth: 18, textAlign: "center", fontWeight: "var(--fw-heavy)" }}>
                {l.qty}
              </span>
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

      {/* Phase 0 — the ONE diner toast (`@mms/ui` Toast). The primitive carries this surface's own
          hard-won rules: the region is ALWAYS mounted (adversarial MED-6 — several SR/browser pairs
          skip a region born with its text) and carries an explicit aria-live, which is what keeps it
          OUT of Radix's modal aria-hidden sweep while the basket sheet is open. It docks on the
          published band height (`--cta-dock-h`, written by useCtaDock below). */}
      <Toast message={toast ? { key: toast, text: toast } : null} />

      {lines.length > 0 && cartId && (
        // W9d — the pinned bar: basket-review trigger + checkout CTA. The Browse door (the DEFAULT)
        // had no basket view at all — the CTA's rolling figure was the only evidence anything was in
        // the cart, and the only way to see the items was to switch tabs or walk into checkout.
        <div className="grocery-cta-bar" ref={ctaBarRef}>
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
            // Override the Sheet's default opener-restore (W9e): the default is fine while the
            // trigger lives, but THIS sheet's trigger (the CTA bar) can unmount while it is open
            // — removing the last row, or a terminal force-close — and a restore to a dead node
            // silently no-ops to <body>. Park on the basket button while it exists; on the
            // stable search input otherwise (the page's remove-row pattern, WCAG 2.4.3).
            e.preventDefault();
            if (lines.length === 0) searchRef.current?.focus();
            else basketBtnRef.current?.focus();
          }}
        />
      )}
    </main>
  );
}
