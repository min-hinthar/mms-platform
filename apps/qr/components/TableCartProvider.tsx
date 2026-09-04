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
import { freezeRecheckDelayMs } from "@/lib/lock-ttl";
import { addShortfallNotice, classifyAddLanding } from "@/lib/add-landing";
import { peerDisplayName } from "@/lib/peer-name";
import {
  acceptView,
  issueRead,
  newViewSeq,
  readIsOurs,
  readReachedServer,
  type ReadOutcome,
  type ViewSeq,
} from "@/lib/view-seq";
import { recoveredWrite, unconfirmedWriteNotice, type WriteResult } from "@/lib/write-outcome";
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
   *  op), or the state that says why there is none.
   *
   *  ⚠️ THREE STATES, NOT A NULLABLE LIST (T26). The old `CartItem[] | null` made `if (await add(…))`
   *  read as "did it work", and it does not: `null` meant BOTH "refused" and "committed, view
   *  unreadable", so `YourUsual` retried committed adds and charged the dish twice. Ask the question
   *  you mean — `mayRetry`, `threadableView`, `mayClaimLanding` (lib/write-outcome.ts) — never
   *  truthiness. */
  add: (
    menuItemId: string,
    modifierIds?: string[],
    notes?: string,
    qty?: number,
  ) => Promise<WriteResult<CartItem[]>>;
  /** Set a cart line's quantity (server-authoritative `setQty`; `qty<=0` removes). Used by the menu's
   *  inline quick-qty stepper (R5c) to decrement/remove the viewer's own line without leaving the menu.
   *  Re-syncs from the returned view; a refused write (locked/closed) recovers like `add`. `announce` (the
   *  caller's outcome string, e.g. "Removed Tea Leaf Salad") is flashed through the single live region so
   *  the decrement is announced symmetrically with the "+"/add path (WCAG 4.1.3). */
  setItemQty: (
    cartItemId: string,
    qty: number,
    announce?: string,
  ) => Promise<WriteResult<CartItem[]>>;
  /** Re-read the cart. Resolves with the items it APPLIED, or `null` if the read failed or was
   *  overtaken — a caller in a promise chain must use this value, not its own `itemsRef`. */
  refresh: () => Promise<CartItem[] | null>;
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
  /** T20 — does the VIEWER hold the lock? Derived from seat ids (`lockedBy === viewerSeat`), never
   *  from `lockedByName`.
   *
   *  ⚠️ `lockedByName` IS PEER-SUPPLIED TEXT. It resolves through presence, and `setName` clamps only
   *  length while `cleanPresence` strips only control/format characters — so "You" is a name a
   *  tablemate can legitimately choose. Four call sites used to infer ownership by comparing against
   *  that string, which let a diner named "You" make a peer's lock read as the viewer's own: the
   *  banner said "You're checking out" to someone who was not, and simultaneously suppressed the
   *  real holder's name. The correct derivation already existed here; it was simply never exported. */
  lockedByYou: boolean;
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
  /**
   * T21(b) partial — a monotonic ticket so an OLDER read cannot overwrite a NEWER applied view.
   *
   * Five paths apply a view here and none of them cancels or supersedes another, so the LAST TO
   * RESOLVE won rather than the last to be issued. Realtime does no debouncing and fires one refresh
   * per row event, so a single multi-row change (a send-to-kitchen batch, a split opening N shares)
   * already fanned out N concurrent reads whose landing order is arbitrary; #249's scheduled re-read
   * adds one more, and its whole job is to observe a freeze — so a slow one resolving after a newer
   * read could put `locked: true` back over a cart the server had already released, and the surface
   * would stay frozen until the NEXT scheduled read a full TTL later. That is the interaction Codex
   * flagged on this diff, and it is why the ticket lands here rather than waiting for the full T21(b).
   *
   * ⚠️ A MUTATION'S RETURNED VIEW OUTRANKS THE READS IN FLIGHT WHEN IT LANDS — as a policy, not as
   * a proof. `addItem`/`setQty` commit and then call `getCartView` SEPARATELY, so a peer really can
   * change the cart in between and a read still in flight may hold newer rows (Codex round 2 killed
   * this docblock's original "same statement" claim, which was simply false). The tie goes to the
   * write because the errors are not symmetric: a refused-but-newer read costs a peer's change
   * arriving one event late — and that peer's write emits its own row event, so it self-heals —
   * while an applied-but-older read erases a line the diner just watched land, and they re-add it.
   * See `view-seq.ts` for the full argument. Only ticketed callers (the three plain reads — the
   * initial load, `refresh` and `explainCaught`'s diagnosis) can be refused, and a read is refused
   * only by a view that BEAT it to the screen, never by one that merely started later.
   */
  const viewSeqRef = useRef<ViewSeq>(newViewSeq());

  const freezeRef = useRef<FreezeInput>({ locked: false, lockedBy: null, mySeat: null });
  /** The last sentence `explainCaught` published. A caller that announces its OWN outcome after a
   *  refused write (`YourUsual`'s partial-add message) must be able to keep the established cause
   *  instead of overwriting it — `flash` is a single slot, so the later call wins. Read through a
   *  ref because the caller reads it in the same tick the refusal was published. */
  const lastRefusalRef = useRef<string | null>(null);
  const settlingRef = useRef(false);

  // One place to fan a fresh server view into the six pieces of cart state — keeps addItem/setQty/
  // refresh in lockstep so a new field can never be applied in one path and forgotten in another.
  // ⚠️ RETURNS WHETHER IT APPLIED (T26). A caller that is about to treat `itemsRef` as proof of its
  // OWN read needs to know it was not overtaken; `readView` is the only consumer that uses the
  // answer, and it converts it into a `ReadOutcome` so the two questions stay apart.
  const applyView = useCallback(
    (v: Awaited<ReturnType<typeof getCartView>>, seq?: number): boolean => {
      // No ticket = a mutation's own returned view (server-commit fresh): it wins and invalidates any
      // read still in flight. A ticket that is no longer current = a read another view has overtaken.
      if (!acceptView(viewSeqRef.current, seq)) return false;
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
      return true;
    },
    [],
  );

  /**
   * The one plain re-read, and it REPORTS whether it worked.
   *
   * ⚠️ The boolean is not decoration — it is what terminates the scheduled re-read below. A cart
   * that has been paid answers `cart_closed` from `assertCartMember` FOREVER (`mms_fulfill_order`
   * sets `status='paid'`, and the status check precedes every freeze axis), so a caller that retries
   * on the strength of "still frozen" would retry until the tab is closed. `false` means this read
   * taught us nothing about the freeze — not that the freeze is gone.
   */
  const readView = useCallback(async (): Promise<ReadOutcome> => {
    if (!cartId) return "failed";
    // Minted BEFORE the await: the ticket records the order reads were ISSUED in, which is the order
    // their answers describe. Comparing on resolve is what stops the slower of two from winning.
    const seq = issueRead(viewSeqRef.current);
    try {
      // ⚠️ THREE STATES, NOT TWO (T26, Codex round 4 on #250 — P1). This used to `return true` the
      // moment `getCartView` resolved, discarding whether `applyView` actually took it. A read that
      // came back but was OVERTAKEN leaves someone else's view on screen — and the view that won may
      // be a mutation's, which lands without a ticket and may have read its rows BEFORE our write
      // committed. The recovery path was handing that snapshot to a queued op as proof of its own
      // add. `readReachedServer` / `readIsOurs` (view-seq.ts) are the two questions, named apart.
      return applyView(await getCartView(cartId), seq) ? "applied" : "overtaken";
    } catch {
      // Cart no longer open (paid/closed) → assertCartMember 403. Swallow so a stale read after a
      // successful add can't surface as a false-negative "Couldn't add"; P1.3 redirects to a receipt.
      return "failed";
    }
  }, [cartId, applyView]);

  /**
   * The public re-read. Returns the items it APPLIED, or `null` when the read failed or was
   * overtaken (Codex round 3 on #251, P2).
   *
   * ⚠️ Returning void made this unusable by the one caller that needed it. `AddButton` awaits a
   * refresh and then reads its own `itemsRef` — a LOCAL ref synced in a passive effect, so inside a
   * promise chain it still holds the pre-write rows however well the refresh went. Two rapid
   * decrements from 3 therefore lost the second tap even when the recovery read had cleanly
   * observed 2. Provider state is not a channel a continuation can read; the value has to come back
   * out of the call.
   */
  const refresh = useCallback(async (): Promise<CartItem[] | null> => {
    const outcome = await readView();
    return readIsOurs(outcome) ? itemsRef.current : null;
  }, [readView]);

  // Initial load when the cart id resolves — setState lives in the `.then` callback (the allowed
  // pattern: sync React from an external system), with a cancel guard against an unmounted update.
  useEffect(() => {
    if (!cartId) return;
    let active = true;
    // TICKETED like every other read. `active` guards a DIFFERENT thing — an update after unmount —
    // and says nothing about whether a fresher view already landed: this effect re-runs on `cartId`,
    // and an add fired the moment the menu paints can commit its server-fresh view while this first
    // read is still in flight. Without a ticket that older read would then overwrite it.
    const seq = issueRead(viewSeqRef.current);
    void getCartView(cartId)
      .then((v) => {
        if (!active) return;
        // Route the FIRST view through `applyView` too (it used to hand-copy the same six setters).
        // The duplicate was exactly the drift the helper's own comment warns about, and W9b needs one
        // place that also seeds the settle baseline.
        applyView(v, seq);
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
  /**
   * Was the write that TRIGGERED this re-mint one we could not confirm? (Codex round 2 on #251, P1.)
   *
   * ⚠️ The same-cart recovery sentence below ends "please try that again", and `explainCaught` calls
   * `revalidate()` on exactly the arm where the cart could not be read — which is also the arm that
   * produces `unconfirmed`. So the sequence was: publish "we couldn't confirm that", re-mint, then
   * OVERWRITE it with an instruction to retry a write that may already have committed. The provider
   * spent this whole slice making sure nothing invites that retry, and then invited it itself, two
   * effects away, in the one live region.
   */
  const recoveryWriteUnconfirmedRef = useRef(false);
  const prevCartIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cartId) return;
    const prev = prevCartIdRef.current;
    prevCartIdRef.current = cartId;
    if (!recoveringRef.current) return;
    recoveringRef.current = false;
    const unconfirmed = recoveryWriteUnconfirmedRef.current;
    recoveryWriteUnconfirmedRef.current = false;
    // A NEW cart means the old one was swept: nothing the diner did to it survived, so there is
    // nothing to double-add and the honest sentence is the same either way.
    const msg =
      prev && prev !== cartId
        ? "Your table session timed out — we started a fresh order."
        : unconfirmed
          ? // SAME cart, and the write that sent us here may have landed on it. Point at the cart,
            // never at the retry: re-sending is the one action that can charge the dish twice.
            "Reconnected to your table — check your order below."
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

  /**
   * T20 — the one thing that lets a stale freeze heal on /menu.
   *
   * ⚠️ BOTH FREEZE AXES EXPIRE BY ARITHMETIC, NOT BY A WRITE. `assertCartMember` computes `locked`
   * as `locked_at > now - CART_LOCK_TTL_MS` and `settling` the same way against `SETTLE_TTL_MS`, so
   * when either lapses NO ROW CHANGES — no Postgres-Changes event, nothing for `useCartRealtime` to
   * deliver, and a cached `true` that no subscription can ever clear.
   *
   * That would merely be untidy if the frozen surface could ask again. It cannot: `AddButton` and
   * `ItemSheet` put the freeze on NATIVE `disabled`, so their controls leave the tab order and can
   * emit no request at all — the inertness is what preserves the inertness. And the lock also hides
   * both routes off the page (`TableTimeline`'s `quiet` drops the two /cart links; `AppHeader` hides
   * its cart link on /menu; `CartBar` renders nothing at count 0), so a diner whose tablemate
   * abandoned a checkout could sit on a permanently dead menu until they reloaded.
   *
   * The visibility listener above covers a BACKGROUNDED tab; this covers the one that stays open.
   * It is a single scheduled re-read, not a poll: `freezeRecheckDelayMs` returns null unless a
   * freeze is actually held, and the delay is the longest held axis.
   *
   * ⚠️ THE CHAIN TERMINATES ON A FAILED READ, AND THAT IS THE WHOLE DESIGN (blind adversarial pass
   * on this diff, CRITICAL). Re-arming on "still frozen" alone does not terminate: once the table
   * pays, `mms_fulfill_order` sets `qr_carts.status='paid'`, `assertCartMember` throws `cart_closed`
   * BEFORE it computes either freeze axis, and `readView` swallows it — so `locked` can never fall
   * and an abandoned tab would fire a Server Action every five minutes for as long as it is open.
   * The same shape covers a persistent 503, a dead session and an offline tab.
   *
   * So the re-arm asks a different question: did this read TEACH US ANYTHING? Only a read that came
   * back can have moved the freeze, and only then is a further wait justified — a cart still frozen
   * on a fresh, successful read is a lock that was RE-ACQUIRED, which is a new observation and earns
   * a new window. A read that failed leaves the surface exactly where it was BEFORE this change:
   * stale until the next realtime event or foreground. That is the honest floor, and it is bounded.
   */
  useEffect(() => {
    const delay = freezeRecheckDelayMs({ locked, settling });
    if (delay === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => {
        void readView().then((read) => {
          // `cancelled` is checked AFTER the await too: the effect can be torn down while the read
          // is in flight (an unmount, or the axes flipping), and a chain that re-armed from a
          // resolved promise would outlive its own cleanup.
          //
          // ⚠️ `readReachedServer`, NOT `readIsOurs` (T26). This asks whether the cart is reachable,
          // and an OVERTAKEN read proves that just as well as an applied one — the freeze axes on
          // screen came from the view that beat it. Narrowing this to `applied` would kill the chain
          // whenever a concurrent read or mutation won the race, on a cart that is still frozen and
          // whose axes therefore do not re-run this effect: the permanent dead menu T20 exists to
          // fix, straight back. The two questions are named apart in view-seq.ts for this line.
          if (!cancelled && readReachedServer(read)) arm();
        });
      }, delay);
    };
    arm();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locked, settling, readView]);

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
   *
   * The re-read is TICKETED like the other two, so a view issued after it still wins the render. The
   * sentence is unaffected: `refusal`, `holderIsViewer` and `fresh` are all read off `v` directly, and
   * they describe why THIS write was refused — a fact about the moment it was diagnosed, which a
   * later view does not revise. Being overtaken can only mean the list beside the sentence is newer
   * than the sentence, never older.
   */
  const explainCaught = useCallback(
    async (
      id: string,
    ): Promise<{ fresh: CartItem[] | null; viewIsCurrent: boolean; notice: string }> => {
      let fresh: CartItem[] | null = null;
      // ⚠️ Did the re-read WIN the screen? (Codex round 3 on #251, P1.) `applyView` answers, and
      // discarding that answer let an OVERTAKEN snapshot be threaded into the next queued write —
      // rows that may predate the view that beat it. `readView` already makes exactly this
      // distinction (`readIsOurs`); this helper is the second ticketed read and had not adopted it.
      let viewIsCurrent = false;
      let refusal;
      let holderIsViewer = false;
      const seq = issueRead(viewSeqRef.current);
      try {
        const v = await getCartView(id);
        viewIsCurrent = applyView(v, seq);
        // `fresh` is kept even when overtaken: it is what we OBSERVED, and the refusal it classifies
        // is a fact about that moment. Only its use as a threadable list is gated, one layer out.
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
      return { fresh, viewIsCurrent, notice: refusedWriteNotice(refusal, holderIsViewer) };
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

  /**
   * Retract the optimistic claim when the write cannot be confirmed (Codex round 1 on #251, P2).
   *
   * ⚠️ EVERY `unconfirmed` RETURN MUST COME THROUGH HERE. `add` and `setItemQty` both flash their
   * outcome OPTIMISTICALLY on tap — "Added to your order", "Removed Tea Leaf Salad" — so publishing
   * nothing on this state is not neutrality: it leaves standing a claim `mayClaimLanding` explicitly
   * forbids. `AddButton` and `ItemSheet` never speak after the provider, so for them the optimistic
   * sentence was the only one the diner ever heard. A predicate that bars a claim is worth nothing
   * if the claim is already on screen and the code merely declines to retract it.
   *
   * NOT `publishRefusal`: this deliberately does not touch `lastRefusalRef`, which means "a refusal
   * the caller decided is real" and is carried into `YourUsual`'s copy. An unconfirmed write has not
   * been refused, and lending it a refusal's sentence is the fabricated-diagnosis class again.
   */
  const publishUnconfirmed = useCallback(() => {
    // Latch BEFORE the flash: `explainCaught` has already fired `revalidate()` on the arm that could
    // not read the cart, so the recovery effect may run at any point after this and must find the
    // flag set. Cleared by that effect, so a later ordinary re-mint still says "try that again".
    recoveryWriteUnconfirmedRef.current = true;
    flash(unconfirmedWriteNotice(), 3000);
  }, [flash]);

  /**
   * Correct the optimistic announce when the server took FEWER units than were asked for.
   *
   * ⚠️ ONE DEFINITION, TWO PATHS (T26 + Codex round 5 on #250, P2). This used to live inline on the
   * success path only, so the arm where the mutation's own view failed and a re-read recovered it
   * skipped the correction entirely: adding five to a line at 98 commits one unit, the first view
   * read fails, the re-read applies quantity 99 — and "Added 5 to your order" stood as the final
   * word in the live region. Both paths hold the same evidence (a committed write plus a view we
   * can attribute), so they must speak the same sentence; the "name it ONCE" rule applied to copy.
   *
   * ⚠️ ONLY `partial` SPEAKS (Codex round 2, P2). A zero delta does NOT establish the 99 cap:
   * `insertOrIncLine`'s sibling query does not filter `comped`, while `mms_cart_item_inc_qty`
   * excludes comped rows and still answers success — so an add that matched a comped sibling is a
   * successful no-op, and "That line is already at our 99 max" would name a cap that is not the
   * cause. Growth is the only thing proving the write moved this line, so only a short GROWTH is
   * diagnosed. That no-op is a real defect in its own right, filed as T25 rather than described
   * wrongly here.
   *
   * ⚠️ NOT GATED ON `qty > 1` (blind adversarial pass on #250). It used to be, which left the most
   * ordinary way to hit the cap uncorrected: a single "+" on a line already at 99 announced "Added
   * to your order" and nothing ever took it back. `partial` cannot occur for a request of one — a
   * single unit either lands or does not — so the only sentence this adds for a quick-add is true.
   *
   * ⚠️ AND IT IS NOT CALLED FROM THE RECOVERY PATH, deliberately. There, attribution does not hold:
   * see the note at that call site.
   */
  const announceShortfall = useCallback(
    (before: CartItem[], after: CartItem[], menuItemId: string, requested: number) => {
      const { outcome } = classifyAddLanding({ before, after, menuItemId, requested });
      const correction = addShortfallNotice(outcome);
      if (correction) flash(correction, 3000);
    },
    [flash],
  );

  const add = useCallback(
    async (
      menuItemId: string,
      modifierIds: string[] = [],
      notes?: string,
      qty: number = 1,
    ): Promise<WriteResult<CartItem[]>> => {
      // No cart to write to: nothing left, so a retry is the right offer. No view exists to thread.
      if (!cartId) return { state: "refused", view: null };
      // Optimistic: bump the visible count + confirm on tap, so the cart bar responds immediately
      // instead of after the round-trip. The total stays server-authoritative (no client price math),
      // so it settles when the view returns — the count is the instant feedback. `qty` (W5c sheet
      // stepper) bumps the count by the whole pre-add quantity — one write, one flash.
      setPendingDelta((n) => n + qty);
      // Honest count for a multi-unit sheet add — an SR user hears how many units landed (4.1.3).
      flash(qty > 1 ? `Added ${qty} to your order` : "Added to your order", 2000, "ထည့်ပြီးပါပြီ");
      // The pre-add lines (from the ref, never a stale render closure). BOTH the success path and the
      // recovery path below compare against this one snapshot through `classifyAddLanding`, so they
      // cannot disagree about how many units landed — the "name it ONCE" rule applied to a count.
      const itemsBefore = itemsRef.current;
      try {
        // Modifier ids only (R6b sheet) — `addItem`→`priceItem` validates them against the item's groups
        // and re-derives the charge; a client-sent price is never trusted. ONE round-trip returns the view.
        // `notes` (W3b) is the kitchen note — free text, length-bounded server-side, never a price.
        const view = await addItemAction(cartId, menuItemId, modifierIds, notes, qty);
        // ⚠️ `null` MEANS THE WRITE LANDED AND THE VIEW COULD NOT BE READ — never that the tap
        // failed (see `viewAfterWrite` in cart.ts). No refusal is published and the optimistic
        // announce stands, because the add succeeded.
        if (!view) {
          // ⚠️ AWAIT the re-read, and never hand back the PRE-WRITE snapshot as though it were fresh
          // (Codex round 2, P1). `AddButton` threads this return value into its next queued op
          // (`const source = threaded ?? itemsRef.current`), so a stale list makes a following "−"
          // look for a line that is not in it, skip silently, and leave the server holding an item
          // the screen does not show. A successful re-read writes `itemsRef` synchronously inside
          // `applyView`, so after this await the snapshot is genuinely current.
          //
          // ⚠️ AND `readIsOurs`, NOT "it came back" (T26). An OVERTAKEN read leaves a view on screen
          // that may predate this add, so `itemsRef` is not evidence of it.
          //
          // The write COMMITTED — `viewAfterWrite` only returns null after the row landed — so this
          // is `applied` when we can see it and `unconfirmed` when we cannot. It is never `refused`,
          // and that distinction is the whole of T26: the old `null` here meant "no fresh list" but
          // read to `YourUsual` as "did not go through", and its retry re-added a committed dish.
          const reread = await readView();
          if (!readIsOurs(reread)) {
            publishUnconfirmed();
            return { state: "unconfirmed" };
          }
          // The re-read is ours, so correct the optimistic announce against it exactly as the
          // success path does — a cap reached on a write whose first view failed is still a cap.
          announceShortfall(itemsBefore, itemsRef.current, menuItemId, qty);
          return { state: "applied", view: itemsRef.current };
        }
        applyView(view);
        // If the server capped the merge, correct the earlier optimistic announce so the SR live
        // region and the count agree with what actually landed.
        //
        // ⚠️ PER DISH, NOT PER BASKET (T21(c)). This used to subtract basket-wide totals, which any
        // concurrent peer write skews: a tablemate removing one unit of THEIR line made `landed`
        // come out one short and fired "Added 4 — that line is now at our 99 max" about a dish
        // sitting at 6 of 99. That needs no near-cap line to reach, so it was likelier than the cap
        // it claimed. `none` is spoken HERE and only here: the mutation returned a view, so a zero
        // is proof of the cap rather than a write we could not confirm.
        //
        // ⚠️ NOT GATED ON `qty > 1` (blind adversarial pass). It used to be, which left the most
        // ordinary way to hit the cap uncorrected: a single "+" on a line already at 99 announced
        // "Added to your order" and nothing ever took it back. `partial` cannot occur for a request
        // of one — a single unit either lands or does not — so the only sentence this adds for a
        // quick-add is the true one.
        announceShortfall(itemsBefore, view.items, menuItemId, qty);
        // ⚠️ ONLY `partial` SPEAKS (Codex round 2, P2). A zero delta does NOT establish the 99 cap:
        // `insertOrIncLine`'s sibling query does not filter `comped`, while `mms_cart_item_inc_qty`
        // excludes comped rows and still answers success — so an add that matched a comped sibling
        // is a successful no-op, and "That line is already at our 99 max" would name a cap that is
        // not the cause. Growth is the only thing proving the write moved this line, so only a short
        // GROWTH is diagnosed. The comped-sibling no-op is a real defect in its own right, filed as
        // T25 rather than described wrongly here.
        // Return the fresh items so a caller's serialized write-queue threads THIS add's server truth into
        // its next op (a following "−" then trims a real, current line — no stale-read snap-back).
        return { state: "applied", view: view.items };
      } catch {
        // ⚠️ THE CAUSE IS RE-ESTABLISHED, NEVER GUESSED (T14). This catch used to flash
        // "Reconnecting to your table…" and re-mint the session for EVERY throw — while its own
        // comment listed "a refused write (cart locked, a stale/invalid modifier selection)" among
        // the causes. A diner whose tablemate was checking out was therefore told their connection
        // had dropped and watched a session re-mint they did not need: the M116 fabricated-diagnosis
        // class, surviving here because Next redacts Server Action messages in production, so the
        // server's own "Order is locked while someone checks out" never reaches this browser.
        const { fresh, viewIsCurrent, notice } = await explainCaught(cartId);
        // ⚠️ A THROW IS NOT PROOF THE WRITE DID NOT LAND (Codex P1 on #248). `addItem` commits the
        // line, calls `touchCart`, and only THEN returns `getCartView` — so its promise can reject
        // on that trailing read with the add already in the cart. Reporting failure there is a lie
        // the diner acts on: `YourUsual` announces "we couldn't add X" and a retry adds it twice.
        //
        // The re-read `explainCaught` just applied is the evidence. Count THIS item's units rather
        // than the basket's, so an unrelated peer add cannot fake a landing. A peer adding the SAME
        // dish in the same window is the one false positive left, and it errs toward reporting a
        // success we are unsure of instead of a duplicate charge — the safer direction.
        //
        // ⚠️ THE RECOVERY PATH NEVER SPEAKS A SHORTFALL, WHICH IS WHERE AN EARLIER DRAFT WENT WRONG
        // (blind adversarial pass on #250). `classifyAddLanding` attributes growth to the single line
        // that moved, and on the SUCCESS path that line must be ours — the write returned a view, so
        // our line grew, and a peer growing too would make two. Here we do NOT know our write landed,
        // so the one line that grew may be a tablemate's: announcing "Added 2 — that line is now at
        // our 99 max" off it would credit the diner with a landing that never happened AND assert a
        // cap on a dish nowhere near one. Both halves fabricated, in the one live region. That is why
        // `announceShortfall` is NOT called here and IS called on the null-view arm above, which has
        // the same standing as the success path: a committed write plus a view we can attribute.
        //
        // ⚠️ THREE STATES, AND `unknown` IS NOT A REFUSAL (T26, Codex rounds 3-4 on #250 — P1).
        // `recoveredWrite` reads the two observations this path actually has: whether the re-read
        // gave us a cart we can trust, and whether THIS dish grew in it. `unknown` — a successful
        // read whose delta is unattributable because a peer touched the same dish — used to fall
        // straight to the refusal below, so a write that may well have landed was reported as
        // refused and `YourUsual` re-added it. `fresh === null` (the re-read failed) is the same
        // shape one layer out. Neither is evidence of a refusal; both are evidence of ignorance.
        const outcome = fresh
          ? classifyAddLanding({ before: itemsBefore, after: fresh, menuItemId, requested: qty })
              .outcome
          : null;
        const result = recoveredWrite({
          reread: fresh,
          // `full`/`partial` = this dish grew, so the write landed. `none` = the cart was read and
          // this dish did not move, which IS evidence of a refusal. `unknown` = unattributable.
          landed: outcome === null ? null : outcome === "unknown" ? null : outcome !== "none",
          viewIsCurrent,
        });
        // Only a state that establishes a refusal may publish one — an `unconfirmed` write has not
        // been refused, and saying so is the fabricated-diagnosis class this slice's ancestors
        // (M116, T14) exist to remove. The caller is told "unconfirmed" and decides for itself.
        if (result.state === "refused") publishRefusal(notice);
        // The optimistic "Added to your order" is still on screen; retract it rather than let an
        // outcome that may not claim a landing stand as one.
        else if (result.state === "unconfirmed") publishUnconfirmed();
        // ⚠️ Read by AddButton and YourUsual, NOT by ItemSheet: W20 made the sheet close on tap
        // (`void add(...)` then `onClose()`, ItemSheet.tsx:225-226) so adding feels instant, and it
        // never awaits this. The older comment here claimed the sheet stays open "keeping the diner's
        // modifier choices", which stopped being true then — and it is the only caller that can pass
        // qty > 1, so a reader reasoning from it would mis-model the whole partial-fill path above.
        return result;
      } finally {
        setPendingDelta((n) => n - qty);
      }
    },
    [
      cartId,
      applyView,
      readView,
      explainCaught,
      flash,
      publishRefusal,
      publishUnconfirmed,
      announceShortfall,
    ],
  );

  // Menu inline quick-qty (R5c): decrement/remove the viewer's OWN draft line from the menu (the "+" goes
  // through `add`, which merges/increments the same no-modifier line). Server-authoritative (`setQty`
  // re-derives nothing on the client; `qty<=0` removes), authz'd (canMutateLine own-draft-only). Mirrors
  // Checkout's `changeQty`: swallow a refused write (locked/closed) and re-sync from server truth via
  // refresh, with the same session-recovery path `add` uses for a silently-expired session.
  const setItemQty = useCallback(
    async (
      cartItemId: string,
      qty: number,
      announce?: string,
    ): Promise<WriteResult<CartItem[]>> => {
      // ⚠️ THE RETURN TYPE IS THE FIX (T26, Codex round 3-4 on #250 — P1). This was
      // `Promise<CartItem[]>`, so the "written, unreadable" state had nowhere to go and the function
      // returned `itemsRef.current` — the PRE-write quantity — as though it were the result. Two
      // rapid decrements from 3 then set 2 twice instead of 2 then 1, because `AddButton` threads
      // this value into its next queued op. A signature that cannot express an outcome guarantees
      // the outcome is misreported; widening it is not a refactor, it is the defect.
      if (!cartId) return { state: "refused", view: null };
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
        // Same contract as `add`: null is "written, unreadable". The stepper keeps its optimistic
        // position rather than snapping back over a change the server accepted.
        if (!view) {
          // ⚠️ AWAIT it (Codex round 2, P1). `AddButton` threads this list into the next queued op,
          // so returning the PRE-write quantity makes two rapid decrements from 3 set 2 twice
          // instead of 2 then 1 — and one tap visually snaps back until an unawaited re-read lands.
          // A successful re-read writes `itemsRef` synchronously inside `applyView`.
          //
          // ⚠️ AND `readIsOurs`, NOT "it came back" (T26). An overtaken read leaves a view on screen
          // that may predate this write. The row COMMITTED either way — `viewAfterWrite` only
          // returns null after it landed — so the two states here are `applied` and `unconfirmed`.
          const reread = await readView();
          if (readIsOurs(reread)) return { state: "applied", view: itemsRef.current };
          // The optimistic `announce` ("Removed Tea Leaf Salad") is still on screen — retract it.
          publishUnconfirmed();
          return { state: "unconfirmed" };
        }
        applyView(view);
        return { state: "applied", view: view.items };
      } catch {
        // Re-sync from server truth (like Checkout's changeQty): a rejected remove — line already
        // gone/fired/locked, or a line the viewer does not own — must snap the stepper back, not leave
        // the stale line visible after the optimistic announce.
        //
        // T14 — this path already re-read FIRST; what it did not do was let that re-read decide. It
        // re-minted the session and said "Reconnecting" on every outcome, including the one where the
        // re-read had just succeeded and reported a locked cart. `explainCaught` keeps the re-read and
        // the snap-back, and attributes the refusal to what the re-read established.
        const { fresh, viewIsCurrent, notice } = await explainCaught(cartId);
        // Same post-commit rule as `add`: `setQty` writes the row and only THEN returns the view, so
        // a trailing-read failure lands here with the qty already applied. The target is exact
        // (`setQty` is absolute, not a delta), so the re-read settles it: the line at `qty`, or gone
        // when the tap was a remove. Only a genuine non-landing is announced.
        //
        // ⚠️ `setQty` IS ABSOLUTE, NOT A DELTA, so the re-read settles it exactly: the line sits at
        // `qty`, or is gone when the tap was a remove. That is a stronger attribution than `add`'s
        // — no peer write can forge it — so there is no `unknown` arm on a successful read here,
        // and `landed` is never null when `fresh` is non-null.
        const line = fresh?.find((i) => i.id === cartItemId);
        const result = recoveredWrite({
          reread: fresh,
          landed: fresh === null ? null : qty <= 0 ? line === undefined : line?.qty === qty,
          viewIsCurrent,
        });
        if (result.state === "refused") publishRefusal(notice);
        else if (result.state === "unconfirmed") publishUnconfirmed();
        return result;
      } finally {
        setPendingDelta((d) => d - delta);
      }
    },
    [cartId, applyView, readView, explainCaught, flash, publishRefusal, publishUnconfirmed],
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
  const lockedByYou = !!locked && !!lockedBy && lockedBy === viewerSeat;
  // ⚠️ THE PEER BRANCH GOES THROUGH `peerDisplayName`, AND THAT IS THE OTHER HALF OF THE IMPOSTOR
  // FIX. `lockedByYou` settled who the app BELIEVES holds the lock; this settles what the sentence
  // SAYS. Without it a tablemate named "You" still produced "You is checking out — the order's
  // locked for a moment" on the banner and in the live region: ungrammatical, and it still opens
  // with the word the attack is built on. Named once here so the banner and the announcer below
  // cannot disagree.
  const lockedByName = !locked
    ? null
    : lockedByYou
      ? "You"
      : peerDisplayName(members.find((m) => m.seat === lockedBy)?.name);

  // Announce the pay-lock transition through the SINGLE live region (the lockbar banner is plain
  // visual). Diff via a ref so it fires on the edge, not every render; deferred (not a sync effect set).
  const prevLocked = useRef(false);
  useEffect(() => {
    if (locked === prevLocked.current) return;
    prevLocked.current = locked;
    const msg = !locked
      ? "The order’s unlocked — you can edit again"
      : lockedByYou
        ? "You’re checking out — the order’s locked"
        : `${lockedByName ?? "Someone"} is checking out — the order’s locked`;
    void Promise.resolve().then(() => flash(msg, 2600));
  }, [locked, lockedByName, lockedByYou, flash]);

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
        lockedByYou,
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
