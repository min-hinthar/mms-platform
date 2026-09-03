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
import {
  cartFreeze,
  classifyRefusedWrite,
  refusalNeedsRemint,
  refusedWriteNotice,
  type FreezeInput,
} from "@/lib/cart-freeze";
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
  /** W21 (Codex P1 on #191) — resolves once every in-flight cart write (add / setItemQty) has
   *  settled. The checkout NAVIGATION awaits this: an optimistic add exposes the CartBar instantly,
   *  and racing it to /cart could mint a PaymentIntent that locks the cart BEFORE the add lands —
   *  refusing an item the toast just announced. Resolves immediately when nothing is in flight. */
  settled: () => Promise<void>;
  /** W9a: re-run the session mint IN PLACE (keeps the in-memory join code). The dine-in join-failure
   *  retry MUST use this rather than `window.location.reload()` — a reload arrives with the join code
   *  already stripped from the URL, so the mint is no longer join-only and provisions a phantom table. */
  revalidate: () => void;
  /** J5: route a one-off transactional announcement through the view's ONE polite live region (the
   *  same `flash` every cart op uses) — never mount a second aria-live region for a new feature.
   *
   *  `ms` (W22c) exists because the default 2200 was written for "Added Mohinga", and a caller can
   *  legitimately need longer: the menu-freshness sentence names dishes in two clauses and a price
   *  count, and a notice that leaves before it can be read is the same defect as no notice. Derive
   *  it (`freshnessDurationMs`) rather than picking a number per call site. */
  announce: (msg: string, ms?: number) => void;
  /** T14 — the sentence the provider last published for a REFUSED write, or null if none.
   *
   *  `announce` is a single slot: the last caller wins. So a consumer that announces its own outcome
   *  after `add` resolves null (`YourUsual`'s partial-add message) would otherwise overwrite the
   *  established cause with generic advice — and "try from the menu below" is dead advice under a
   *  freeze, which is the exact string this slice removed one layer down. Read it and carry it.
   *
   *  A FUNCTION, not a value: the caller reads it in the same tick the refusal was published, before
   *  React has re-rendered, so state would still hold the previous value. */
  lastRefusalNotice: () => string | null;
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
  // T14 — the VIEWER's own seat, from the same `assertCartMember` call that produced `lockedBy`, so
  // the comparison behind `cartFreeze` can never be defeated by a second read (the W9b rule that put
  // it on `getCartView` in the first place). `session.seat` is the same value on the happy path; this
  // is the one that survives a thin read.
  const [mySeat, setMySeat] = useState<string | null>(null);
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

  // T14 — the freeze the WRITE paths read. See the note in `applyView`, which is the only writer.
  const freezeRef = useRef<FreezeInput>({ locked: false, lockedBy: null, mySeat: null });
  /** The last sentence `explainCaught` published. A caller that announces its OWN outcome after a
   *  refused write (`YourUsual`'s partial-add message) must be able to keep the established cause
   *  instead of overwriting it — `flash` is a single slot, so the later call wins. Read through a
   *  ref because the caller reads it in the same tick the refusal was published. */
  const lastRefusalRef = useRef<string | null>(null);
  const settlingRef = useRef(false);

  // One place to fan a fresh server view into the six pieces of cart state — keeps addItem/setQty/
  // refresh in lockstep so a new field can never be applied in one path and forgotten in another.
  const applyView = useCallback((v: Awaited<ReturnType<typeof getCartView>>) => {
    setItems(v.items);
    setTotals(v.totals);
    setPickupSlot(v.pickupSlot);
    setLocked(v.locked);
    setLockedBy(v.lockedBy);
    setMySeat(v.mySeat);
    setSettling(v.settling);
    // T14 — the same three facts in a REF, because the write paths must read the CURRENT freeze
    // without taking it as a dependency: putting `locked` in `add`/`setItemQty`'s dep arrays would
    // re-create both callbacks on every lock flip and churn every consumer that memoizes on them.
    // Written HERE, from the same view, so the ref and the state can never disagree (`itemsRef`
    // exists for exactly this reason).
    freezeRef.current = { locked: v.locked, lockedBy: v.lockedBy, mySeat: v.mySeat };
    settlingRef.current = v.settling;
    // ⚠️ AND THE LINES, SYNCHRONOUSLY (Codex round 3 on #248). `itemsRef` is also written by an
    // effect below, which runs after the commit — so two rapid queued adds could both read the
    // PRE-first-add array as their baseline. `add`'s post-commit landing check compares this
    // baseline against a re-read, so the FIRST add's units then looked like evidence that the
    // SECOND one landed: a genuinely refused second tap reported as success with its refusal
    // suppressed. Writing here, from the view being applied, closes the window the effect leaves.
    itemsRef.current = v.items;
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
        // W9b review — but DO seed the settle baseline: it is only written by `applyView`, so a failed
        // first load left it null and the edge effect then swallowed the next genuine transition
        // (it returns on `prev === null`). `settling` is still its initial `false` here, which is the
        // honest baseline for a view we never got.
        if (active && prevSettling.current === null) prevSettling.current = false;
      });
    return () => {
      active = false;
    };
  }, [cartId, applyView]);

  // One polite live region for transactional feedback (RED-TEAM/QA). We announce a brief, STATIC
  // confirmation on success and a generic message on failure (WCAG 4.1.3 status messages) — but
  // never the rolling total itself (the CartBar/total deliberately aren't aria-live, so SR users
  // don't hear the amount re-read on every tap). Server errors are redacted in prod → generic text.
  const [notice, setNotice] = useState<{ text: string; my?: string } | null>(null);
  // Signed optimistic count delta for in-flight mutations (instant CartBar count in BOTH directions:
  // an add is +1, a stepper decrement/lower is −N). Reconciled to 0 as each write's returned view
  // re-derives the true count from `items`. The MONEY total stays server-derived — only the count is
  // optimistic (a wrong-for-a-moment subtotal on a money surface is worse than a beat's latency).
  const [pendingDelta, setPendingDelta] = useState(0);
  // W21 (Codex P1 on #191) — the in-flight write ledger behind `settled()`. Tracked at the context
  // boundary (the wrapped add/setItemQty below) so every consumer's write is counted; the loop in
  // settled() catches ops enqueued WHILE awaiting (a rapid add during the drain).
  const inflight = useRef(new Set<Promise<unknown>>());
  const track = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    inflight.current.add(p);
    // The tracked copy owns its rejection (setItemQty can throw); the CALLER still gets the
    // original promise with its error intact.
    void p.catch(() => {}).finally(() => inflight.current.delete(p));
    return p;
  }, []);
  const settled = useCallback(async () => {
    while (inflight.current.size > 0) {
      await Promise.allSettled([...inflight.current]);
    }
  }, []);

  // All transactional feedback flows through ONE polite live region via `flash`, which keeps a SINGLE
  // clear-timer (cancels the prior one) so overlapping events — a guest joining, a peer's add, your own
  // add — replace deterministically instead of racing independent timers that could blank a fresh
  // notice early. Never the rolling total itself (the CartBar isn't aria-live — no amount re-read).
  const noticeTimer = useRef<number | null>(null);
  const noticeExitTimer = useRef<number | null>(null);
  // W13 — the toast leaves as deliberately as it arrives (review MED): the display timer flips a
  // `leaving` phase (the .mms-toast-out settle), then a short exit timer unmounts. Both timers are
  // single-slot — a fresh flash cancels BOTH so overlapping notices still replace deterministically.
  const [noticeLeaving, setNoticeLeaving] = useState(false);
  // W13 — `my` is an optional Burmese segment rendered as its own lang="my" span (WCAG 3.1.2 —
  // correct SR pronunciation; the mixed-string alternative would read Burmese with EN rules).
  const flash = useCallback((msg: string, ms = 2200, my?: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    if (noticeExitTimer.current !== null) window.clearTimeout(noticeExitTimer.current);
    setNoticeLeaving(false);
    setNotice({ text: msg, my });
    noticeTimer.current = window.setTimeout(() => {
      setNoticeLeaving(true);
      // 200ms > the RM-collapsed exit; under reduced motion the node just lingers invisibly.
      noticeExitTimer.current = window.setTimeout(() => {
        setNotice(null);
        setNoticeLeaving(false);
      }, 200);
    }, ms);
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
  // T10 — no longer dine-in only. "Solo modes have no peers" was true of ADDS and false of the
  // LOCK: a pickup or scan-and-go diner with two tabs open, or one whose order a server is editing,
  // gets a `qr_carts` UPDATE that this subtree needs, because T14's pre-write gate below is only as
  // fresh as `locked`. The actor's own INSERT is still skipped (bySeat === my seat) so you are never
  // told you added your own item, and a solo cart simply has no peer INSERTs to announce.
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
  useCartRealtime(cartId ?? "", session?.accessToken ?? "", handleCartChange);

  /**
   * T14 — the ONE place a refused cart write is explained.
   *
   * ⚠️ THERE IS NO PRE-WRITE GATE, AND ITS REMOVAL IS THE FIX FOR THE ROUND-1 P1 THAT BOTH
   * REVIEWERS FOUND INDEPENDENTLY. The first draft refused a tap against the freeze this client
   * already held, "so a refusal costs no round trip". That freeze can be stale in the BLOCKING
   * direction and cannot heal itself: `assertCartMember` computes the lock as
   * `locked_at > now - CART_LOCK_TTL_MS` (`authz.ts`), so a lock expires by the PASSAGE OF TIME with
   * no row write — which means no Postgres-Changes event, which means `freezeRef` is never
   * corrected. A gate that then refuses the write removes the one thing that WOULD have corrected
   * it: the mutation whose returned view `applyView` folds in. A tab left open on /menu would go on
   * refusing edits the server accepts, naming a lock that expired minutes ago.
   *
   * So the server decides. Every write goes out; a refusal is explained afterwards, from a read.
   * The round trip the gate saved is the round trip the write was going to make anyway.
   *
   * `explainCaught` re-reads once, applies that view (so the sentence and the list beside it are the
   * same server truth), and re-mints ONLY on the arm where the re-read itself failed.
   */
  const explainCaught = useCallback(
    async (id: string): Promise<{ fresh: CartItem[] | null; notice: string }> => {
      let fresh: CartItem[] | null = null;
      let refusal;
      let holderIsViewer = false;
      try {
        const v = await getCartView(id);
        applyView(v);
        fresh = v.items;
        holderIsViewer =
          cartFreeze({ locked: v.locked, lockedBy: v.lockedBy, mySeat: v.mySeat }) === "self";
        refusal = classifyRefusedWrite({
          ok: true,
          freeze: { locked: v.locked, lockedBy: v.lockedBy, mySeat: v.mySeat },
          settling: v.settling,
        });
      } catch {
        // ⚠️ NOT "the session expired". `assertCartMember` throws `UNAVAILABLE()` for cart, session
        // and membership QUERY errors, and the Server Action can fail in transport — so a failed
        // re-read establishes only that we cannot see the cart. The re-mint still runs, because a
        // dead session is the one cause it can repair and this read did not rule it out; the COPY
        // says what we observed and what we are doing, never why.
        refusal = classifyRefusedWrite({ ok: false });
      }
      // ⚠️ THE NOTICE IS RETURNED, NOT PUBLISHED (Codex round 2 on #248). `addItem`/`setQty` commit
      // and only THEN return `getCartView`, so a trailing-read failure lands here with the write
      // already in the cart. Flashing from inside this helper announced "We couldn't confirm that"
      // over a change that had landed — and while `YourUsual` replaces the message with its own
      // success line, `AddButton` publishes nothing afterwards, so the false refusal was the last
      // thing the diner heard. The caller checks for a landing FIRST and speaks only if there was
      // none. The re-mint is not deferred: it is a recovery, not a statement, and only the arm that
      // could not read the cart at all takes it.
      if (refusalNeedsRemint(refusal)) {
        recoveringRef.current = true;
        revalidate();
      }
      return { fresh, notice: refusedWriteNotice(refusal, holderIsViewer) };
    },
    [applyView, revalidate],
  );

  /** Publish a refusal the caller has decided is real (no landing was detected), and remember it so
   *  a consumer announcing its own outcome afterwards can carry the cause instead of erasing it. */
  const publishRefusal = useCallback(
    (notice: string) => {
      lastRefusalRef.current = notice;
      flash(notice, 2600);
    },
    [flash],
  );

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
      flash(qty > 1 ? `Added ${qty} to your order` : "Added to your order", 2000, "ထည့်ပြီးပါပြီ");
      // Authoritative unit count BEFORE this add (from the ref, never a stale render closure) so we can
      // tell how many units ACTUALLY landed — a merge into a line near the 99 cap can fill fewer than
      // requested, and the optimistic "Added N" above would then overstate it (W5c pre-merge honesty).
      const beforeUnits = itemsRef.current.reduce((a, i) => a + i.qty, 0);
      // The pre-add lines, for the post-commit-read-failure check in the catch below.
      const itemsBefore = itemsRef.current;
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
        // ⚠️ THE CAUSE IS RE-ESTABLISHED, NEVER GUESSED (T14). This catch used to flash
        // "Reconnecting to your table…" and re-mint the session for EVERY throw — while its own
        // comment listed "a refused write (cart locked, a stale/invalid modifier selection)" among
        // the causes. A diner whose tablemate was checking out was therefore told their connection
        // had dropped and watched a session re-mint they did not need: the M116 fabricated-diagnosis
        // class, surviving here because Next redacts Server Action messages in production, so the
        // server's own "Order is locked while someone checks out" never reaches this browser.
        const { fresh, notice } = await explainCaught(cartId);
        // ⚠️ A THROW IS NOT PROOF THE WRITE DID NOT LAND (Codex P1 on #248). `addItem` commits the
        // line, calls `touchCart`, and only THEN returns `getCartView` — so its promise can reject
        // on that trailing read with the add already in the cart. Reporting failure there is a lie
        // the diner acts on: `YourUsual` announces "we couldn't add X" and a retry adds it twice.
        //
        // The re-read `explainCaught` just applied is the evidence. Count THIS item's units rather
        // than the basket's, so an unrelated peer add cannot fake a landing. A peer adding the SAME
        // dish in the same window is the one false positive left, and it errs toward reporting a
        // success we are unsure of instead of a duplicate charge — the safer direction.
        if (fresh) {
          const unitsFor = (rows: CartItem[]) =>
            rows.reduce((a, i) => a + (i.menuItemId === menuItemId ? i.qty : 0), 0);
          // Landed after all: say nothing. Announcing a refusal here is the false statement.
          if (unitsFor(fresh) > unitsFor(itemsBefore)) return fresh;
        }
        publishRefusal(notice);
        // Returns null so the item sheet stays OPEN (keeping the diner's modifier choices) instead
        // of reading as a false success.
        return null;
      } finally {
        setPendingDelta((n) => n - qty);
      }
    },
    [cartId, applyView, explainCaught, flash, publishRefusal],
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
        // gone/fired/locked, or a line the viewer does not own — must snap the stepper back, not leave
        // the stale line visible after the optimistic announce.
        //
        // T14 — this path already re-read FIRST; what it did not do was let that re-read decide. It
        // re-minted the session and said "Reconnecting" on every outcome, including the one where the
        // re-read had just succeeded and reported a locked cart. `explainCaught` keeps the re-read and
        // the snap-back, and attributes the refusal to what the re-read established.
        const { fresh, notice } = await explainCaught(cartId);
        // Same post-commit rule as `add`: `setQty` writes the row and only THEN returns the view, so
        // a trailing-read failure lands here with the qty already applied. The target is exact
        // (`setQty` is absolute, not a delta), so the re-read settles it: the line at `qty`, or gone
        // when the tap was a remove. Only a genuine non-landing is announced.
        if (fresh) {
          const line = fresh.find((i) => i.id === cartItemId);
          const landed = qty <= 0 ? line === undefined : line?.qty === qty;
          if (landed) return fresh;
        }
        publishRefusal(notice);
        return fresh ?? itemsRef.current;
      } finally {
        setPendingDelta((d) => d - delta);
      }
    },
    [cartId, applyView, explainCaught, flash, publishRefusal],
  );

  // W21 (Codex P1 on #191) — the context hands out TRACKED versions so `settled()` sees every
  // consumer's write; stable identities preserved (consumers key effects on these).
  const trackedAdd = useCallback(
    (...args: Parameters<typeof add>) => track(add(...args)),
    [add, track],
  );
  const trackedSetItemQty = useCallback(
    (...args: Parameters<typeof setItemQty>) => track(setItemQty(...args)),
    [setItemQty, track],
  );

  const openSlotSheet = useCallback(() => setSlotSheetOpen(true), []);
  const count = Math.max(0, items.reduce((a, i) => a + i.qty, 0) + pendingDelta);
  const me = session ? { seat: session.seat, name } : null;
  // Who holds the pay lock, for the "checking out" banner: "You" if it's the viewer, else the peer's
  // presence name (falls back to a neutral label until presence resolves the seat).
  // T14 — the viewer's seat comes from `getCartView` (the same `assertCartMember` call that produced
  // `lockedBy`) and falls back to the session's own copy only before the first view lands. W9b put
  // `mySeat` on that view precisely so this comparison cannot be defeated by a second read.
  const viewerSeat = mySeat ?? session?.seat ?? null;
  const lockedByName = !locked
    ? null
    : lockedBy && lockedBy === viewerSeat
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
        add: trackedAdd,
        setItemQty: trackedSetItemQty,
        settled,
        refresh,
        revalidate,
        announce: flash,
        lastRefusalNotice: () => lastRefusalRef.current,
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
          // W9e (J12) — compose the home-bar inset like CartBar directly beneath it already does; a
          // bare 84 collided with the pinned CTA on every notched iPhone at the app's single
          // highest-frequency moment (the add-confirmation toast).
          bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: "var(--z-toast)" as CSSProperties["zIndex"],
        }}
      >
        {notice && (
          // W13 — the toast springs in (.mms-toast; keyed so replacing one notice with another
          // replays the entrance). The MY segment is its own lang="my" span on the Padauk stack.
          <span
            key={notice.text}
            className={`mms-toast${noticeLeaving ? " mms-toast-out" : ""}`}
            style={{
              display: "inline-block",
              background: "var(--tx)",
              color: "var(--pg)",
              // W16e — 10/16 (was 8/14): the pill carries a bilingual line now, and stacked
              // Burmese needs the vertical room; marginInline keeps a long notice off the edges.
              padding: "10px 16px",
              marginInline: 16,
              borderRadius: 999,
              fontSize: "var(--fs-sm)",
              fontWeight: 700,
            }}
          >
            {notice.text}
            {notice.my && (
              <span lang="my" style={{ fontFamily: "var(--font-my)", fontWeight: 600 }}>
                {" · "}
                {notice.my}
              </span>
            )}
          </span>
        )}
      </div>
    </Ctx.Provider>
  );
}
