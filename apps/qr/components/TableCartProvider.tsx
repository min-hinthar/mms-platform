"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CartItem, CartTotals } from "@mms/db";
import { Icon } from "@mms/ui";
import { addItem as addItemAction, setQty as setQtyAction, getCartView } from "@/lib/cart";
import { setDisplayName } from "@/lib/members";
import { useTableSession } from "@/lib/useTableSession";
import {
  useCartRealtime,
  useGroupCart,
  type CartChange,
  type PresenceMember,
} from "@/lib/realtime";
import { PickupSlotSheet } from "./PickupSlotSheet";

const NAME_KEY = "mms.name";

type CartCtx = {
  cartId: string | null;
  loading: boolean;
  error: string | null;
  items: CartItem[];
  totals: CartTotals | null;
  count: number;
  /** Add an item to the cart. `modifierIds` (R6b item sheet) are modifier-OPTION ids only — the server
   *  (`priceItem`/`addItem`) re-derives every amount; the client never sends a price. Omitted ⇒ quick-add
   *  with no modifiers (the inline menu AddButton path). Resolves the fresh server-authoritative items on a
   *  successful add (so the caller's serialized write-queue can thread a deterministic snapshot to its next
   *  op), or `null` if the add was refused/recovered (the item sheet stays OPEN, keeping the diner's
   *  modifier choices). A non-empty array and `null` are still truthy/falsy, so `if (await add(...))` holds. */
  add: (
    menuItemId: string,
    modifierIds?: string[],
    notes?: string,
    qty?: number,
  ) => Promise<CartItem[] | null>;
  /** Set a cart line's quantity (server-authoritative `setQty`; `qty<=0` removes). Used by the menu's
   *  inline quick-qty stepper (R5c) to decrement/remove the viewer's own line without leaving the menu.
   *  Re-syncs from the returned view; a refused write (locked/closed) recovers like `add`. `announce` (the
   *  caller's outcome string, e.g. "Removed Tea Leaf Salad") is flashed through the single live region so
   *  the decrement is announced symmetrically with the "+"/add path (WCAG 4.1.3). */
  setItemQty: (cartItemId: string, qty: number, announce?: string) => Promise<CartItem[]>;
  refresh: () => Promise<void>;
  /** W9a: re-run the session mint IN PLACE (keeps the in-memory join code). The dine-in join-failure
   *  retry MUST use this rather than `window.location.reload()` — a reload arrives with the join code
   *  already stripped from the URL, so the mint is no longer join-only and provisions a phantom table. */
  revalidate: () => void;
  /** J5: route a one-off transactional announcement through the view's ONE polite live region (the
   *  same `flash` every cart op uses) — never mount a second aria-live region for a new feature. */
  announce: (msg: string) => void;
  /** Pickup mode only: the chosen slot (ISO instant) + a way to (re)open the picker. */
  pickupSlot: string | null;
  openSlotSheet: () => void;
  /** Group cart (dine-in, M3·P3.1). `isGroup` gates presence/invite to dine-in (honesty: solo
   *  modes never show live presence). `members` is the live guest list; `me`/`role`/`joinCode`
   *  drive the guest list + invite sheet; `setName` renames the diner's own seat. */
  isGroup: boolean;
  members: PresenceMember[];
  me: { seat: string; name: string } | null;
  role: "host" | "guest" | null;
  joinCode: string | null;
  /** K2: the registered table number (1–10) this dine-in session is seated at, or null (host-mint
   *  code / unregistered sticker / solo mode). Drives "Table 7" on the greeting + guest list + settle. */
  tableNumber: number | null;
  setName: (name: string) => Promise<void>;
  /** Pay-window lock (M3·P3.2-lock): a member is checking out → the cart is read-only for everyone
   *  else. `lockedByName` is who (resolved from presence; "You" if it's the viewer). */
  locked: boolean;
  lockedByName: string | null;
  /** Split-tender settlement freeze (M3·P3.3b): true while the table settles its shares → the whole cart
   *  is read-only (the server rejects add/setQty). Distinct from the pay-window `locked`; the menu controls
   *  gate on it too so a quick add/remove can't fire an optimistic confirmation the server will reject. */
  settling: boolean;
};

const Ctx = createContext<CartCtx | null>(null);

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within <TableCartProvider>");
  return c;
}

/**
 * One source of truth for the menu's cart interactions: establishes the table session/cart once
 * (not per item) and exposes the live, server-authoritative cart view (re-fetched after each
 * mutation — never client math). For pickup mode it owns the slot picker. For dine-in it also owns
 * the GROUP layer (M3·P3.1): the realtime presence guest list + the diner's role/join code, so a
 * second phone scanning the same table (or the host's invite code) appears live.
 *
 * `code` is the dine-in join key from the entry deep link (`/menu?mode=dinein&t=<sticker>` or
 * `&j=<invite>`); the provider threads it into the session mint so every phone converges on one cart.
 */
export function TableCartProvider({
  mode,
  code,
  joinOnly,
  door,
  table,
  resume,
  children,
}: {
  mode: string;
  code?: string;
  joinOnly?: boolean;
  door?: string;
  /** K2: the dine-in picker's `?table=` claim param (free text — parsed to a bounded int below). */
  table?: string;
  /** W5a: the entry came from a RESUME affordance (the home session card) — if the mint then
   *  CREATES a fresh session (the old one expired / was cleared by staff), say so instead of
   *  silently landing the diner in an empty cart that contradicts the card they tapped. */
  resume?: boolean;
  children: ReactNode;
}) {
  // Narrow the free-text `?door=` param to the analytics enum (K0) — an arbitrary query value never
  // reaches the typed slot; door is analytics-only (never authz), so an unknown one is simply dropped.
  const doorTag =
    door === "dinein" || door === "pickup" || door === "togo" || door === "grocery"
      ? door
      : undefined;
  // K2: parse the picker's `?table=` to a bounded 1–99 int (the server re-validates against qr_tables;
  // an out-of-range/garbage value is dropped, never sent). Only meaningful for dine-in.
  const parsedTable = table != null ? Number(table) : NaN;
  const tableNumber =
    mode === "dinein" && Number.isInteger(parsedTable) && parsedTable >= 1 && parsedTable <= 99
      ? parsedTable
      : undefined;
  const { session, loading, error, revalidate } = useTableSession(mode, {
    code,
    joinOnly,
    door: doorTag,
    tableNumber,
  });
  const cartId = session?.cartId ?? null;
  const isGroup = mode === "dinein";
  const isPickup = mode === "pickup";
  const [items, setItems] = useState<CartItem[]>([]);
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [pickupSlot, setPickupSlot] = useState<string | null>(null);
  const [locked, setLocked] = useState(false); // pay-window lock (P3.2-lock)
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [settling, setSettling] = useState(false); // split-tender settlement freeze (P3.3b) — read-only cart
  const [slotSheetOpen, setSlotSheetOpen] = useState(false);

  // The diner's own display name (presence). Default "Guest"; hydrate from localStorage AFTER mount
  // (not in the initializer) so SSR and first client render agree — no hydration mismatch. The read
  // is deferred into a microtask callback (localStorage is an external store) so it's the allowed
  // "setState in a callback when external state changes" pattern, not a synchronous effect body.
  const [name, setNameState] = useState("Guest");
  useEffect(() => {
    let active = true;
    void Promise.resolve(window.localStorage.getItem(NAME_KEY)).then((stored) => {
      if (active && stored) setNameState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  // Wire presence for DINE-IN ONLY (RED-TEAM #3 honesty): a non-empty sessionId subscribes the
  // private `table:{sessionId}` channel; for solo modes we pass "" so the hook no-ops (no channel,
  // no guest list). `me.seat` is the stable anon-auth uid → the presence key.
  const groupSessionId = isGroup ? (session?.sessionId ?? "") : "";
  const { members } = useGroupCart(groupSessionId, session?.accessToken ?? "", {
    seat: session?.seat ?? "",
    name,
  });
  // Latest members in a ref so the cart-change handler can map a peer's seat → name without the
  // subscription resubscribing every time presence updates (ref updated in an effect, not render).
  const membersRef = useRef<PresenceMember[]>([]);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const setName = useCallback(
    async (next: string) => {
      const trimmed = next.trim().slice(0, 40);
      if (!trimmed || trimmed === name) return;
      setNameState(trimmed); // optimistic — presence re-tracks the new name immediately
      window.localStorage.setItem(NAME_KEY, trimmed);
      if (session?.sessionId) {
        try {
          await setDisplayName(session.sessionId, trimmed);
        } catch {
          // Server update failed (offline / expired session). Presence still shows the local name;
          // the durable display_name just stays stale — non-fatal, no need to strand the user.
        }
      }
    },
    [name, session],
  );

  // Latest server-authoritative items in a ref (updated in an effect, not render) so an optimistic
  // write can look up a line's current qty for the signed count delta — and the AddButton decrement
  // queue can seed its first op — without a stale render closure.
  const itemsRef = useRef<CartItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // W9b — the settle announcement's baseline. `null` until the FIRST server view lands, then seeded
  // from it: arriving at an already-settling table is a situation, not an event, so it must not be
  // announced at mount. Seeding here (not in the effect) is what makes that exact: `applyView` runs
  // in the fetch callback, before React re-renders, so the first `settling` state and the ref are
  // written from the same view and the edge effect below sees no transition.
  const prevSettling = useRef<boolean | null>(null);

  // One place to fan a fresh server view into the six pieces of cart state — keeps addItem/setQty/
  // refresh in lockstep so a new field can never be applied in one path and forgotten in another.
  const applyView = useCallback((v: Awaited<ReturnType<typeof getCartView>>) => {
    setItems(v.items);
    setTotals(v.totals);
    setPickupSlot(v.pickupSlot);
    setLocked(v.locked);
    setLockedBy(v.lockedBy);
    setSettling(v.settling);
    if (prevSettling.current === null) prevSettling.current = v.settling;
  }, []);

  const refresh = useCallback(async () => {
    if (!cartId) return;
    try {
      applyView(await getCartView(cartId));
    } catch {
      // Cart no longer open (paid/closed) → assertCartMember 403. Swallow so a stale read after a
      // successful add can't surface as a false-negative "Couldn't add"; P1.3 redirects to a receipt.
    }
  }, [cartId, applyView]);

  // Initial load when the cart id resolves — setState lives in the `.then` callback (the allowed
  // pattern: sync React from an external system), with a cancel guard against an unmounted update.
  useEffect(() => {
    if (!cartId) return;
    let active = true;
    void getCartView(cartId)
      .then((v) => {
        if (!active) return;
        // Route the FIRST view through `applyView` too (it used to hand-copy the same six setters).
        // The duplicate was exactly the drift the helper's own comment warns about, and W9b needs one
        // place that also seeds the settle baseline.
        applyView(v);
        // W5e: no longer force-open the slot sheet at the menu. Pickup timing is now an explicit
        // ASAP↔scheduled choice at CHECKOUT (ASAP is a first-class default — a null slot fires
        // immediately at settlement), so a diner is never blocked behind "pick a time" before ordering.
        // The slot sheet stays available on demand via `openSlotSheet` (e.g. a rail affordance).
      })
      .catch(() => {
        // Cart paid/closed between session mint and first load — leave the view empty (no throw).
      });
    return () => {
      active = false;
    };
  }, [cartId, applyView]);

  // One polite live region for transactional feedback (RED-TEAM/QA). We announce a brief, STATIC
  // confirmation on success and a generic message on failure (WCAG 4.1.3 status messages) — but
  // never the rolling total itself (the CartBar/total deliberately aren't aria-live, so SR users
  // don't hear the amount re-read on every tap). Server errors are redacted in prod → generic text.
  const [notice, setNotice] = useState<string | null>(null);
  // Signed optimistic count delta for in-flight mutations (instant CartBar count in BOTH directions:
  // an add is +1, a stepper decrement/lower is −N). Reconciled to 0 as each write's returned view
  // re-derives the true count from `items`. The MONEY total stays server-derived — only the count is
  // optimistic (a wrong-for-a-moment subtotal on a money surface is worse than a beat's latency).
  const [pendingDelta, setPendingDelta] = useState(0);

  // All transactional feedback flows through ONE polite live region via `flash`, which keeps a SINGLE
  // clear-timer (cancels the prior one) so overlapping events — a guest joining, a peer's add, your own
  // add — replace deterministically instead of racing independent timers that could blank a fresh
  // notice early. Never the rolling total itself (the CartBar isn't aria-live — no amount re-read).
  const noticeTimer = useRef<number | null>(null);
  const flash = useCallback((msg: string, ms = 2200) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(msg);
    noticeTimer.current = window.setTimeout(() => setNotice(null), ms);
  }, []);
  // W5a — resume-intent honesty: the home card promised an existing table, but the mint CREATED a
  // fresh session (the old one expired, or staff cleared the table — the advisory card can't know).
  // Say so once, through the SAME single live region every notice uses (microtask-deferred, the
  // established no-sync-setState-in-effect pattern). Without this the diner taps "Table 5 · 3 items"
  // and silently lands in an empty cart — the opposite of the card's promise.
  const resumeNoticed = useRef(false);
  useEffect(() => {
    if (!resume || !session?.created || resumeNoticed.current) return;
    resumeNoticed.current = true;
    void Promise.resolve().then(() =>
      flash("That table session had ended — we’ve started a fresh one for you.", 4200),
    );
  }, [resume, session, flash]);
  // Cancel a pending clear-timer on unmount so it can't fire setState on an unmounted component
  // (same cancel-guard discipline as the load effects above).
  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Session-recovery messaging (bugfix: a silently-expired table session). When a cart op fails we
  // re-mint (revalidate) instead of stranding the diner behind a hopeless "try again". This effect
  // reads the OUTCOME of that re-mint by diffing the cartId: a NEW cart ⇒ the session had truly
  // expired and was swept (honest "timed out, fresh order"); the SAME cart ⇒ renewed/transient
  // (nudge a retry). Deferred (microtask) so it's not a synchronous setState in the effect body.
  const recoveringRef = useRef(false);
  const prevCartIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cartId) return;
    const prev = prevCartIdRef.current;
    prevCartIdRef.current = cartId;
    if (!recoveringRef.current) return;
    recoveringRef.current = false;
    const msg =
      prev && prev !== cartId
        ? "Your table session timed out — we started a fresh order."
        : "Reconnected to your table — please try that again.";
    void Promise.resolve().then(() => flash(msg, 3500));
  }, [cartId, flash]);

  // Announce a NEW guest joining (diff by seat so we don't announce the first sync — self + already-
  // present members — or a self re-appear after a blip). Deferred into a callback (localStorage/presence
  // are external stores) so it's not a synchronous setState in the effect body.
  const seenSeats = useRef<Set<string>>(new Set());
  const meSeat = session?.seat ?? "";
  useEffect(() => {
    const prev = seenSeats.current;
    seenSeats.current = new Set(members.map((m) => m.seat));
    if (prev.size === 0) return; // first sync — establish the baseline silently
    const joined = members.filter((m) => m.seat !== meSeat && !prev.has(m.seat));
    if (joined.length === 0) return;
    const msg =
      joined.length === 1
        ? `${joined[0]?.name ?? "A guest"} joined your table`
        : `${joined.length} guests joined your table`;
    void Promise.resolve().then(() => flash(msg, 2600));
  }, [members, meSeat, flash]);

  // J3 freshness backstop: re-fetch the server view whenever the tab returns to the foreground. Dine-in
  // has realtime, but a backgrounded phone drops sockets (thick-walled teahouse wifi), and solo modes have
  // no subscription at all — without this, the timeline strip / cart could narrate a STALE state as
  // current after the diner pockets their phone. refresh() swallows the post-payment 403, so this is safe
  // on every route that mounts the provider.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // Live group-cart sync (M3·P3.2): a peer's change on another phone → re-fetch the server-authoritative
  // view (keyed React state, never client math) + announce a peer's ADD honestly (by_seat is the adder
  // → a reliable "who" for INSERTs; qty/remove just refresh, since the event doesn't carry the actor).
  // Dine-in only (isGroup) — solo modes have no peers, so no subscription. The actor's own INSERT is
  // skipped (bySeat === my seat) so you're never told you added your own item.
  const handleCartChange = useCallback(
    (c: CartChange) => {
      void refresh();
      if (
        c.table === "qr_cart_items" &&
        c.eventType === "INSERT" &&
        c.bySeat &&
        c.bySeat !== session?.seat
      ) {
        const who = membersRef.current.find((m) => m.seat === c.bySeat)?.name ?? "A guest";
        flash(`${who} added ${c.itemName ?? "an item"}`, 2600);
      }
    },
    [refresh, session, flash],
  );
  useCartRealtime(cartId ?? "", session?.accessToken ?? "", isGroup, handleCartChange);

  const add = useCallback(
    async (
      menuItemId: string,
      modifierIds: string[] = [],
      notes?: string,
      qty: number = 1,
    ): Promise<CartItem[] | null> => {
      if (!cartId) return null;
      // Optimistic: bump the visible count + confirm on tap, so the cart bar responds immediately
      // instead of after the round-trip. The total stays server-authoritative (no client price math),
      // so it settles when the view returns — the count is the instant feedback. `qty` (W5c sheet
      // stepper) bumps the count by the whole pre-add quantity — one write, one flash.
      setPendingDelta((n) => n + qty);
      // Honest count for a multi-unit sheet add — an SR user hears how many units landed (4.1.3).
      flash(qty > 1 ? `Added ${qty} to your order` : "Added to your order", 2000);
      // Authoritative unit count BEFORE this add (from the ref, never a stale render closure) so we can
      // tell how many units ACTUALLY landed — a merge into a line near the 99 cap can fill fewer than
      // requested, and the optimistic "Added N" above would then overstate it (W5c pre-merge honesty).
      const beforeUnits = itemsRef.current.reduce((a, i) => a + i.qty, 0);
      try {
        // Modifier ids only (R6b sheet) — `addItem`→`priceItem` validates them against the item's groups
        // and re-derives the charge; a client-sent price is never trusted. ONE round-trip returns the view.
        // `notes` (W3b) is the kitchen note — free text, length-bounded server-side, never a price.
        const view = await addItemAction(cartId, menuItemId, modifierIds, notes, qty);
        applyView(view);
        // If the server capped the merge (landed < requested), correct the earlier optimistic announce so
        // the SR live region and the count agree with what actually landed. Only fires at the 99-cap edge.
        if (qty > 1) {
          const landed = view.items.reduce((a, i) => a + i.qty, 0) - beforeUnits;
          if (landed >= 0 && landed < qty)
            flash(
              landed === 0
                ? "That line is already at our 99 max"
                : `Added ${landed} — that line is now at our 99 max`,
              3000,
            );
        }
        // Return the fresh items so a caller's serialized write-queue threads THIS add's server truth into
        // its next op (a following "−" then trims a real, current line — no stale-read snap-back).
        return view.items;
      } catch {
        // The add failed — most often a silently-EXPIRED table session (the mint had handed back a
        // still-'active' but expired session that the server now 403s), or a refused write (cart locked,
        // a stale/invalid modifier selection). Recover by re-minting rather than stranding the diner; the
        // cartId-diff effect announces honestly whether the session was renewed or restarted. Return null
        // so the item sheet stays OPEN (keeps the diner's modifier choices) instead of a false success.
        recoveringRef.current = true;
        flash("Reconnecting to your table…", 2500);
        revalidate();
        return null;
      } finally {
        setPendingDelta((n) => n - qty);
      }
    },
    [cartId, applyView, flash, revalidate],
  );

  // Menu inline quick-qty (R5c): decrement/remove the viewer's OWN draft line from the menu (the "+" goes
  // through `add`, which merges/increments the same no-modifier line). Server-authoritative (`setQty`
  // re-derives nothing on the client; `qty<=0` removes), authz'd (canMutateLine own-draft-only). Mirrors
  // Checkout's `changeQty`: swallow a refused write (locked/closed) and re-sync from server truth via
  // refresh, with the same session-recovery path `add` uses for a silently-expired session.
  const setItemQty = useCallback(
    async (cartItemId: string, qty: number, announce?: string): Promise<CartItem[]> => {
      if (!cartId) return itemsRef.current;
      // Announce the outcome immediately (optimistic, like `add`'s "Added to your order") so SR users get
      // instant confirmation; the error path below replaces it with the recovery message if the write fails.
      if (announce) flash(announce, 2000);
      // Instant CartBar count: shift the signed optimistic delta by this line's change (new qty − current;
      // a remove is qty 0). Reconciled to 0 in `finally` once the returned view re-derives the true count.
      const line = itemsRef.current.find((i) => i.id === cartItemId);
      const delta = line ? Math.max(0, qty) - line.qty : 0;
      setPendingDelta((d) => d + delta);
      try {
        // ONE round-trip: setQty now returns the fresh server-authoritative view (like addItem), so we
        // apply it directly instead of a second getCartView refresh — the "cart actions feel delayed" fix.
        const view = await setQtyAction(cartItemId, qty);
        applyView(view);
        return view.items;
      } catch {
        // Re-sync from server truth (like Checkout's changeQty): a rejected remove — line already
        // gone/fired/locked, or a solo diner who removed it on another tab where realtime is off — must
        // snap the stepper back, not leave the stale line visible after the optimistic announce. Re-fetch
        // FIRST so the UI settles on truth, THEN kick the session-recovery path.
        let fresh = itemsRef.current;
        try {
          const v = await getCartView(cartId);
          applyView(v);
          fresh = v.items;
        } catch {
          // Cart paid/closed → the refetch 403s too; leave the last-known view (P1.3 redirects to a receipt).
        }
        recoveringRef.current = true;
        flash("Reconnecting to your table…", 2500);
        revalidate();
        return fresh;
      } finally {
        setPendingDelta((d) => d - delta);
      }
    },
    [cartId, applyView, flash, revalidate],
  );

  const openSlotSheet = useCallback(() => setSlotSheetOpen(true), []);
  const count = Math.max(0, items.reduce((a, i) => a + i.qty, 0) + pendingDelta);
  const me = session ? { seat: session.seat, name } : null;
  // Who holds the pay lock, for the "checking out" banner: "You" if it's the viewer, else the peer's
  // presence name (falls back to a neutral label until presence resolves the seat).
  const lockedByName = !locked
    ? null
    : lockedBy && lockedBy === session?.seat
      ? "You"
      : (members.find((m) => m.seat === lockedBy)?.name ?? "Someone");

  // Announce the pay-lock transition through the SINGLE live region (the lockbar banner is plain
  // visual). Diff via a ref so it fires on the edge, not every render; deferred (not a sync effect set).
  const prevLocked = useRef(false);
  useEffect(() => {
    if (locked === prevLocked.current) return;
    prevLocked.current = locked;
    const msg = !locked
      ? "The order’s unlocked — you can edit again"
      : lockedByName === "You"
        ? "You’re checking out — the order’s locked"
        : `${lockedByName ?? "Someone"} is checking out — the order’s locked`;
    void Promise.resolve().then(() => flash(msg, 2600));
  }, [locked, lockedByName, flash]);

  // W9b — the settlement freeze is the OTHER way this cart goes read-only, and it announced nothing:
  // a guest browsing the menu simply found every Add inert. Same single live region and the same edge
  // discipline as the lock above — but baselined off the first server view (see `prevSettling`), so
  // only a transition the diner actually lived through is announced.
  //
  // No `/cart` suppression: this provider wraps the /menu subtree ONLY (see AppHeader) — the checkout
  // never mounts it, so a pathname guard here would be dead code, not defense.
  useEffect(() => {
    const prev = prevSettling.current;
    if (prev === null || prev === settling) return;
    prevSettling.current = settling;
    const msg = settling
      ? "Your table is splitting the bill — the order’s locked while everyone pays"
      : "The split was called off — you can edit the order again";
    void Promise.resolve().then(() => flash(msg, 2600));
  }, [settling, flash]);

  return (
    <Ctx.Provider
      value={{
        cartId,
        loading,
        error,
        items,
        totals,
        count,
        add,
        setItemQty,
        refresh,
        revalidate,
        announce: flash,
        pickupSlot,
        openSlotSheet,
        isGroup,
        members,
        me,
        role: session?.role ?? null,
        joinCode: session?.joinCode ?? null,
        tableNumber: session?.tableNumber ?? null,
        setName,
        locked,
        lockedByName,
        settling,
      }}
    >
      {children}
      {/* Recovery affordance for SOLO modes (scan-&-go / pickup). If a session mint — or a re-mint
          after a failed cart op — fails, `cartId` is null and taps silently no-op; without this the
          diner is stranded behind an auto-clearing toast. Dine-in surfaces the same recovery in
          GuestList (group-aware copy); this fills the gap GuestList's `!isGroup → null` leaves. */}
      {error && !isGroup && (
        <p
          role="alert"
          style={{
            position: "fixed",
            // Pin BELOW the persistent AppHeader (which owns the notch inset) so the alert doesn't cover
            // the brand/rewards — header height + inset + the K7 lend ribbon (0 when not lent) + a small gap.
            top: "calc(var(--header-height) + env(safe-area-inset-top, 0px) + var(--lend-offset, 0px) + 8px)",
            left: 12,
            right: 12,
            margin: "0 auto",
            maxWidth: 420,
            zIndex: "var(--z-alert)" as CSSProperties["zIndex"],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "9px 13px",
            borderRadius: 11,
            background: "var(--warnb)",
            color: "var(--warn)",
            fontWeight: 700,
            fontSize: "var(--fs-sm)",
            // Token (not a literal): the Night `--sh-md` is near-black-heavy so this floating alert
            // keeps its lift on the dark page; a hardcoded light shadow vanished on Night (R2 audit).
            boxShadow: "var(--sh-md)",
          }}
        >
          <Icon
            name="alert"
            size={15}
            style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
          />
          Couldn’t reach your order.{" "}
          <button
            type="button"
            onClick={() => revalidate()}
            style={{
              minHeight: 44,
              padding: "0 4px",
              background: "none",
              border: "none",
              color: "var(--warn)",
              fontWeight: 800,
              fontSize: "var(--fs-sm)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </p>
      )}
      {isPickup && cartId && (
        <PickupSlotSheet
          open={slotSheetOpen}
          onOpenChange={setSlotSheetOpen}
          cartId={cartId}
          onChosen={(slot) => setPickupSlot(slot)} // slot is cart metadata — no items/totals refetch
        />
      )}
      <div
        role="status"
        aria-atomic="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 84,
          textAlign: "center",
          pointerEvents: "none",
          zIndex: "var(--z-toast)" as CSSProperties["zIndex"],
        }}
      >
        {notice && (
          <span
            style={{
              display: "inline-block",
              background: "var(--tx)",
              color: "var(--pg)",
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: "var(--fs-sm)",
              fontWeight: 700,
            }}
          >
            {notice}
          </span>
        )}
      </div>
    </Ctx.Provider>
  );
}
