"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, CartTotals } from "@mms/db";
import { addItem as addItemAction, getCartView } from "@/lib/cart";
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
  add: (menuItemId: string) => Promise<void>;
  refresh: () => Promise<void>;
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
  setName: (name: string) => Promise<void>;
  /** Pay-window lock (M3·P3.2-lock): a member is checking out → the cart is read-only for everyone
   *  else. `lockedByName` is who (resolved from presence; "You" if it's the viewer). */
  locked: boolean;
  lockedByName: string | null;
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
  children,
}: {
  mode: string;
  code?: string;
  joinOnly?: boolean;
  children: ReactNode;
}) {
  const { session, loading, error, revalidate } = useTableSession(mode, { code, joinOnly });
  const cartId = session?.cartId ?? null;
  const isGroup = mode === "dinein";
  const isPickup = mode === "pickup";
  const [items, setItems] = useState<CartItem[]>([]);
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [pickupSlot, setPickupSlot] = useState<string | null>(null);
  const [locked, setLocked] = useState(false); // pay-window lock (P3.2-lock)
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [slotSheetOpen, setSlotSheetOpen] = useState(false);
  const autoOpened = useRef(false); // only auto-prompt for a slot once per mount

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

  const refresh = useCallback(async () => {
    if (!cartId) return;
    try {
      const v = await getCartView(cartId);
      setItems(v.items);
      setTotals(v.totals);
      setPickupSlot(v.pickupSlot);
      setLocked(v.locked);
      setLockedBy(v.lockedBy);
    } catch {
      // Cart no longer open (paid/closed) → assertCartMember 403. Swallow so a stale read after a
      // successful add can't surface as a false-negative "Couldn't add"; P1.3 redirects to a receipt.
    }
  }, [cartId]);

  // Initial load when the cart id resolves — setState lives in the `.then` callback (the allowed
  // pattern: sync React from an external system), with a cancel guard against an unmounted update.
  useEffect(() => {
    if (!cartId) return;
    let active = true;
    void getCartView(cartId)
      .then((v) => {
        if (!active) return;
        setItems(v.items);
        setTotals(v.totals);
        setPickupSlot(v.pickupSlot);
        setLocked(v.locked);
        setLockedBy(v.lockedBy);
        // Pickup with no slot yet → prompt once (the diner schedules before ordering, per v7.2).
        if (isPickup && !v.pickupSlot && !autoOpened.current) {
          autoOpened.current = true;
          setSlotSheetOpen(true);
        }
      })
      .catch(() => {
        // Cart paid/closed between session mint and first load — leave the view empty (no throw).
      });
    return () => {
      active = false;
    };
  }, [cartId, isPickup]);

  // One polite live region for transactional feedback (RED-TEAM/QA). We announce a brief, STATIC
  // confirmation on success and a generic message on failure (WCAG 4.1.3 status messages) — but
  // never the rolling total itself (the CartBar/total deliberately aren't aria-live, so SR users
  // don't hear the amount re-read on every tap). Server errors are redacted in prod → generic text.
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAdds, setPendingAdds] = useState(0); // optimistic in-flight adds (instant count bump)

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
    async (menuItemId: string) => {
      if (!cartId) return;
      // Optimistic: bump the visible count + confirm on tap, so the cart bar responds immediately
      // instead of after the round-trip. The total stays server-authoritative (no client price math),
      // so it settles when the view returns — the count is the instant feedback.
      setPendingAdds((n) => n + 1);
      flash("Added to your order", 2000);
      try {
        const view = await addItemAction(cartId, menuItemId, []); // ONE round-trip — returns the view
        setItems(view.items);
        setTotals(view.totals);
        setPickupSlot(view.pickupSlot);
      } catch {
        // The add failed — most often a silently-EXPIRED table session (the mint had handed back a
        // still-'active' but expired session that the server now 403s). Recover by re-minting rather
        // than stranding the diner behind a "try again" that can never succeed; the cartId-diff effect
        // above announces honestly whether the session was renewed or restarted. Works for a transient
        // network blip too (re-mint returns the same cart → "reconnected, try again"). No rethrow:
        // AddButton already swallows, and recovery is the handled outcome.
        recoveringRef.current = true;
        flash("Reconnecting to your table…", 2500);
        revalidate();
      } finally {
        setPendingAdds((n) => n - 1);
      }
    },
    [cartId, flash, revalidate],
  );

  const openSlotSheet = useCallback(() => setSlotSheetOpen(true), []);
  const count = items.reduce((a, i) => a + i.qty, 0) + pendingAdds;
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
        refresh,
        pickupSlot,
        openSlotSheet,
        isGroup,
        members,
        me,
        role: session?.role ?? null,
        joinCode: session?.joinCode ?? null,
        setName,
        locked,
        lockedByName,
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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            margin: "10px 16px 0",
            padding: "9px 13px",
            borderRadius: 11,
            background: "var(--warnb)",
            color: "var(--warn)",
            fontWeight: 700,
            fontSize: 12.5,
          }}
        >
          <span aria-hidden>⚠️</span> Couldn’t reach your order.{" "}
          <button
            type="button"
            onClick={() => revalidate()}
            style={{
              minHeight: 44,
              padding: "0 4px",
              background: "none",
              border: "none",
              color: "var(--ac)",
              fontWeight: 800,
              fontSize: 13,
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
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 84,
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 50,
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
              fontSize: 13,
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
