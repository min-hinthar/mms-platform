"use client";
import {
  createContext,
  useCallback,
  useMemo,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CartItem, CartTotals } from "@mms/db";
import { Icon, Toast } from "@mms/ui";
import { addItemOutcome, setQty as setQtyAction, getCartView } from "@/lib/cart";
import { settleRereadDelayMs } from "@/lib/live-pass";
import { normalizePickupSlot } from "@/lib/pickup-slot";
import { bounded, DRAIN_TIMED_OUT_NOTICE, type DrainOutcome } from "@/lib/write-ledger";
import {
  cartFreeze,
  classifyRefusedWrite,
  isServerRefusal,
  namedRefusalHolds,
  namedRefusedWriteNotice,
  refusalNeedsRemint,
  refusedWriteClause,
  refusedWriteNotice,
  serverNamedRefusal,
  type FreezeInput,
  type PublishableRefusal,
  type RefusedWrite,
} from "@/lib/cart-freeze";
import { orderChangeNotice, orderChanges } from "@/lib/order-changes";
import {
  heldKeys,
  newOwnHolds,
  openHold,
  releaseHolds,
  releaseOwnHold,
  settleHold,
} from "@/lib/own-write-hold";
import { orderUnitCount } from "@/lib/cart-bar-state";
import { freshnessDurationMs } from "@/lib/catalog-freshness";
import { freezeRecheckDelayMs } from "@/lib/lock-ttl";
import { addShortfallNotice, classifyAddLanding } from "@/lib/add-landing";
import { peerDisplayName } from "@/lib/peer-name";
import { acceptView, issueRead, newViewSeq, readReachedServer, type ViewSeq } from "@/lib/view-seq";
import {
  namedUnconfirmedWriteNotice,
  recoveredWrite,
  unconfirmedWriteNotice,
  type WriteResult,
} from "@/lib/write-outcome";
import { admitNotice, purgesDeferred, type NoticeKind, type SlotNotice } from "@/lib/notice-slot";
import type { CartClaim } from "@/lib/add-feedback";
import {
  explainedByRefusal,
  explanationHolds,
  freezeBannerSuppressed,
  type ExplainedFreeze,
} from "@/lib/live-region";
import { useCoalescedRefresh } from "@/lib/echo-refresh";
import { setDisplayName } from "@/lib/members";
import type { SendNudge } from "@/lib/send-nudge-state";
import type { SessionRefusal } from "@/lib/session-refusal";
import { useTableSession } from "@/lib/useTableSession";
import { counterPayOutcome } from "@/lib/counter-pay";
import {
  afterFailedRead,
  CLOSED_ORDER_CLAUSE,
  endComplete,
  endedNewsKey,
  endedWriteNotice,
  endPollDelayMs,
  focusOrphaned,
  heldEndUpgrade,
  mintNotice,
  settleEdgeNotice,
  tableEnded,
  type CartOutcome,
  type TableEnd,
} from "@/lib/session-truth";
import { surfaceOpen } from "@/lib/surfaces";
import { t } from "@/lib/i18n";
import { useEndPoll } from "@/lib/end-poll";
import {
  useCartRealtime,
  useGroupCart,
  type CartChange,
  type PresenceMember,
} from "@/lib/realtime";

const NAME_KEY = "mms.name";

/**
 * T42 — `add`'s outcome, with a refusal's CLAUSE bound to the write that established it.
 *
 * The clause used to live in a provider-global latch (`lastRefusalRef`, read through the context's
 * `lastRefusalClause()`), and nothing serializes writes: `track` is a ledger, and each `AddButton`
 * has only its own queue. So between write A resolving and `YourUsual`'s continuation reading the
 * latch there was a microtask boundary in which an overlapping write B published ITS cause — and
 * dish A was announced with B's diagnosis (A refused under a split, B under a peer's lock).
 * Clearing the latch at write entry (T31) bounded how long a cause lived; it never bound a cause to
 * a write. Carrying it IN the result does, and retires the latch.
 *
 * `clause` is the fragment `refusedWriteClause` names (T32 — a lowercase, period-free piece a
 * caller composes into its own sentence), or null when the refusal established no cause: the
 * no-cart exit, which reads nothing.
 */
export type AddResult =
  | Exclude<WriteResult<CartItem[]>, { state: "refused" }>
  | (Extract<WriteResult<CartItem[]>, { state: "refused" }> & { clause: string | null });

type CartCtx = {
  cartId: string | null;
  /** The door this provider was mounted for (dinein | pickup | scango) — the session's own, so the
   *  wayfinding store can bind the published cart to it (Codex round 2 on 3b, #312). */
  mode: string;
  loading: boolean;
  error: string | null;
  /** J16 — the failed mint's machine word (`SESSION_REFUSALS`), or null. GuestList's recovery
   *  switches on THIS (`joinFailureArm`); `error` is the sentence it shows, never what it parses. */
  errorReason: SessionRefusal | null;
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
   *  truthiness.
   *
   *  Phase 1c — `opts`, and who speaks the CLAIM. Omitted, the provider speaks the visible
   *  "Added to your order" on call, byte-for-byte what it always has (`YourUsual` relies on it).
   *  `claim` replaces that sentence (`ItemSheet` passes the named, visible `sheetAddClaim`); `null`
   *  means the CALLER already spoke at the tap (`AddButton` says "Mohinga added" quietly before its
   *  queued write even starts). `name` is the dish the corrections name if the write does not land
   *  ("Mohinga didn’t go through — …"), so a correction arriving after a sheet has closed, or with
   *  several rows in flight, still says WHICH dish. Amounts are never claimed.
   *
   *  T42 — a `refused` result carries its own `clause` (see `AddResult`): a consumer announcing
   *  its own outcome afterwards composes from THAT, never from shared provider state. */
  add: (
    menuItemId: string,
    modifierIds?: string[],
    notes?: string,
    qty?: number,
    opts?: { claim?: CartClaim | null; name?: string },
  ) => Promise<AddResult>;
  /** Set a cart line's quantity (server-authoritative `setQty`; `qty<=0` removes). Used by the menu's
   *  inline quick-qty stepper (R5c) to decrement/remove the viewer's own line without leaving the menu.
   *  Re-syncs from the returned view; a refused write (locked/closed) recovers like `add`. `announce` (the
   *  caller's outcome string, e.g. "Removed Tea Leaf Salad") is flashed through the single live region as
   *  a CLAIM when the op starts. Phase 1c: the menu stepper no longer passes it — it speaks its claim
   *  itself, quietly, at the TAP (`stepClaim`), so a queued "−" is not heard a round trip late. */
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
  /** Codex round 1 on #313 (P1) — the drain a NAVIGATION awaits: `settled()` under `DRAIN_MAX_MS`,
   *  answering how it ended. A `"timed-out"` drain has already spoken (`DRAIN_TIMED_OUT_NOTICE`,
   *  through this view's one live region) and the caller must NOT leave: a write past the deadline is
   *  slow, not dead, and /cart's first read or its create-intent lock would miss or refuse it. Lent to
   *  the root layout's Order tab (`CartPublisher` → `registerDrain`) and used by CartBar. */
  drain: () => Promise<DrainOutcome>;
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
   *  it (`freshnessDurationMs`) rather than picking a number per call site.
   *
   *  Phase 1c — the slot is no longer last-caller-wins; `lib/notice-slot.ts` arbitrates it. `my` is
   *  the Burmese half (its own `lang="my"` span). `opts.kind` says what the sentence IS — a `claim`
   *  (the diner's own change, said for them), a `correction` (a retraction or diagnosis), or `news`
   *  (the default: everything else) — and `opts.quiet` marks a claim that is SPOKEN BUT NOT DRAWN,
   *  for a change already visible where the diner acted. A claim waits behind a correction still in
   *  its window, a quiet line waits behind visible text, and news always shows. `opts.still` (F31 ·
   *  blind pass on #355) is asked when a line that WAITED comes to be said: a claim true when it was
   *  made may not be by then ("Nothing matches" over a search the diner has since corrected), and a
   *  waiting line it denies is dropped, never said. */
  announce: (
    msg: string,
    ms?: number,
    my?: string,
    opts?: { quiet?: boolean; kind?: NoticeKind; still?: () => boolean },
  ) => void;
  /** Pickup mode only: the chosen slot (ISO instant), READ from the server view. Phase 3b · D10 —
   *  this context carries no opener and mounts no picker: the When write has ONE owner,
   *  `PickupWhenChoice` on /cart (token-gated, serialized, drained before create-intent). The menu's
   *  greeting is a STATEMENT of this value, never a second writer of it. */
  pickupSlot: string | null;
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
  /** PD1 — a guest's "Let {host} know" stamp standing on the cart (the view's `sendNudge`), or
   *  null. The host's order bar reads "Someone's waiting" while it stands (lib/cart-bar-state). */
  sendNudge: SendNudge | null;
  /** PD10 — the latest applied view's DATABASE clock (`getCartView.dbNow`, ISO), or null before the
   *  first view: the menu's kitchen strip reads every stage against it (`lib/kitchen-track.ts` via
   *  `lib/live-pass`), never this phone's clock. */
  dbNow: string | null;
  /** Session truth — the table's order ENDED (paid, cleared by staff, merged away, timed out), as a
   *  member-gated read established after a failed read (`counterPayOutcome`), or null. Dine-in only:
   *  while it stands the menu shows ONE card that names the cause (`TableEndedCard`), every order
   *  control is inert, and nothing re-mints until `startNewOrder`. A solo order re-mints instead. */
  ended: TableEnd | null;
  /** The cart `ended` ENDED — set exactly while `ended` is. Not `cartId`: the live id is null through
   *  "Start a new order"'s mint and after a mint that fails, while the card (and a paid end's
   *  "Track your order", `endTrackHref`) stays up (the blind pass on #361). */
  endedCartId: string | null;
  /** The diner's "Start a new order" is minting (the card holds its button busy). */
  restarting: boolean;
  /** Start a new order after the table ended: one re-mint by the accepted code under J15
   *  (`dineinMintEntry`) — the same table when it is still seated (a paid table), a bare new order
   *  when it is not. Never by the sticker in the page's props (M172). */
  startNewOrder: () => void;
  /** Lifecycle audit (out-of-stock 0) — dishes an add on THIS phone was refused as sold out, keyed
   *  by menu item id, valued with the SERVER's clock at the refusal (ms). The menu weighs each mark
   *  against its catalog render and the cart view (`lib/dish-sold-out.ts`), so the card flips to
   *  "Sold out" at once and a fresher catalog saying it is back puts it back. */
  soldOutMarks: ReadonlyMap<string, number>;
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
  const { session, loading, error, errorReason, revalidate } = useTableSession(mode, {
    code,
    joinOnly,
    door: doorTag,
    tableNumber,
  });
  const cartId = session?.cartId ?? null;
  const isGroup = mode === "dinein";
  const [items, setItems] = useState<CartItem[]>([]);
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [pickupSlot, setPickupSlot] = useState<string | null>(null);
  // PD1 — a guest's "Let {host} know" stamp, read from every applied view (advisory; cleared by the
  // fire). The order bar's line 2 reads it on the HOST's /menu.
  const [sendNudge, setSendNudge] = useState<SendNudge | null>(null);
  // PD10 — the applied view's DB clock: what the kitchen strip's stages are read against.
  const [dbNow, setDbNow] = useState<string | null>(null);
  // Lifecycle audit (out-of-stock 0) — the dishes an add on this phone was refused as sold out.
  const [soldOutMarks, setSoldOutMarks] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [locked, setLocked] = useState(false); // pay-window lock (P3.2-lock)
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  // T14 — the VIEWER's own seat, from the same `assertCartMember` call that produced `lockedBy`, so
  // the comparison behind `cartFreeze` can never be defeated by a second read (the W9b rule that put
  // it on `getCartView` in the first place). `session.seat` is the same value on the happy path; this
  // is the one that survives a thin read.
  const [mySeat, setMySeat] = useState<string | null>(null);
  const [settling, setSettling] = useState(false); // split-tender settlement freeze (P3.3b) — read-only cart
  // Session truth — the end a failed read was explained as, KEYED BY THE CART it ended (a new cart
  // from "Start a new order" is not ended; `endedNow` below). The ref is the same fact for the write
  // paths and the read guard, written with it (the `freezeRef` pattern).
  const [ended, setEnded] = useState<{ cartId: string; end: TableEnd } | null>(null);
  const endedRef = useRef<{ cartId: string; end: TableEnd } | null>(null);
  // A failed PASSIVE read (focus, an echo, the freeze re-check, the first load) — a fact, explained
  // by the effect below (`askWhy`), which `readView` cannot call directly: it is declared above the
  // one live region the explanation speaks through.
  const [failedRead, setFailedRead] = useState<{ cartId: string; n: number } | null>(null);
  const [restarting, setRestarting] = useState(false);
  // J18 (session truth, finding 6) — the solo recovery banner's retry: GuestList's W9a shape, DERIVED
  // (no effect): `loading` is true for exactly the re-mint's round trip, and the tick keeps the first
  // mount's ordinary loading from drawing a banner nobody asked for.
  const [soloRetryTick, setSoloRetryTick] = useState(0);
  // 3c-ii (D30) — the table number the latest CONFIRMED view carried, or null until one has. A
  // table bound at Send (`bindTable` → `touchCart`) reaches every phone through its `qr_carts`
  // watch, and the view names it; the context reads this over the mint's own number so the
  // eyebrow, the guest list and the invite sheet flip without a remount. Written only from a view
  // that CARRIES a number — a thin read must never un-name a live table — and KEYED BY THE CART it
  // named (Codex r1 on #314, P2): a recovery `revalidate()` mints a fresh unbound session with a
  // new cart while this provider stays mounted, and an unkeyed number would label the new session,
  // its guest list and its invite code as the old table until a later bind.
  const [viewTable, setViewTable] = useState<{ cartId: string; n: number } | null>(null);
  // The cart the next applied view belongs to — a ref, so `applyView` keeps its empty deps. Moved
  // IN THE COMMIT (`useLayoutEffect`, Codex round 4 on #314, P2): React flushes a commit's passive
  // effects in a LATER scheduler task whenever the commit overran the frame budget, so a `useEffect`
  // ref was still the OLD cart for the microtask checkpoint in between — and an old cart's read
  // resolving right there passed the per-cart check and landed on the new cart's rows (LEARNINGS #236).
  const cartIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    cartIdRef.current = cartId;
  }, [cartId]);
  // Session truth (the blind pass on #361) — and NULLED on unmount: `holdEnd` and `settleFate` act
  // only on an answer about `cartIdRef.current`, so a poll or diagnosis answer that lands after the
  // provider is gone (a navigation away mid-ask) can never speak or set state on an unmounted tree.
  useEffect(
    () => () => {
      cartIdRef.current = null;
    },
    [],
  );

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

  /**
   * Lifecycle audit (out-of-stock 2 · diner-live-status 3 · edit-notes 7) — the lines and dishes
   * THIS phone has a write on, so the view diff below never reads a diner's own tap back to them
   * ("Mohinga is now 2" right after their "+"). #362 (blind pass 3): a hold ends only once a view
   * whose READ STARTED after the write settled has been diffed with it held (`lib/own-write-hold.ts`)
   * — never on a timer, which a slow re-read, or a failed one followed by the realtime echo, outran.
   * `holdPending` returns the SETTLE: call it the moment the write answers, before any recovery read
   * is issued, so that read can be the one that ends it. Idempotent. `ownView` ends the hold once
   * the write's OWN returned view has been applied (blind pass 9): /menu issues no read after a
   * write that answered with a view, so without it the hold swallowed the next outside change.
   */
  const ownLinesRef = useRef(newOwnHolds());
  const ownDishesRef = useRef(newOwnHolds());
  const holdPending = useCallback(
    (which: "line" | "dish", key: string): { settle: () => void; ownView: () => void } => {
      const holds = which === "line" ? ownLinesRef.current : ownDishesRef.current;
      const hold = openHold(holds, key, Date.now());
      return {
        settle: () => settleHold(hold, viewSeqRef.current.issued),
        ownView: () => releaseOwnHold(holds, hold),
      };
    },
    [],
  );
  /** The view diff — assigned below, once `flash` exists; `applyView` calls it for every view it
   *  accepts, with the previous confirmed lines. `diffCartRef` is the cart the baseline belongs to:
   *  the first view of a cart (arrival, a re-mint) is a situation, never news. */
  const viewDiffRef = useRef<((prev: CartItem[], next: CartItem[], mySeat: string) => void) | null>(
    null,
  );
  const diffCartRef = useRef<string | null>(null);

  // W9b — the settle announcement's baseline. `null` until the FIRST server view lands, then seeded
  // from it: arriving at an already-settling table is a situation, not an event, so it must not be
  // announced at mount. Seeding here (not in the effect) is what makes that exact: `applyView` runs
  // in the fetch callback, before React re-renders, so the first `settling` state and the ref are
  // written from the same view and the edge effect below sees no transition.
  const prevSettling = useRef<boolean | null>(null);
  // The lock announcement's baseline (see the lock edge effect below). Declared HERE, beside the
  // settle baseline, because a table that ENDED retires both silently (`holdEnd`): its last freeze
  // is moot, and "The order's unlocked — you can edit again" over a closed table would be a lie.
  const prevLocked = useRef(false);

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
  // T42 — there is no refusal LATCH any more. The clause a consumer composes with rides `add`'s own
  // result (`AddResult`), so it cannot be read off a different write's publish; the T31 entry clear
  // (`forgetRefusal`) that bounded the latch's lifetime went with it.
  /** T33 — the freeze axis the last published refusal EXPLAINED, or null.
   *
   *  The single live region is last-writer-wins, and the lock/settle banners defer into it through a
   *  microtask — so they land AFTER `publishRefusal` and after any sentence a consumer composed from
   *  its clause. Measured against HEAD, the region ended up holding "Someone is checking out — the
   *  order's locked" where the diner needed "That didn't go through — …", which names the verdict
   *  and, through `YourUsual`, the dish. Same fact, strictly less information, spoken second.
   *
   *  This is what lets the banner know it would be REDUNDANT rather than merely later. The rule
   *  itself lives in `lib/live-region.ts`; this ref is only the fact it reads.
   *
   *  ⚠️ ITS BOUND IS THE FACT, NOT THE WRITE — and a draft got that wrong in BOTH directions. It is
   *  SET only by `publishRefusal`, and only for a freeze the screen actually shows (the currency gate
   *  there: a recovery read that LOST the screen latched a freeze the rendered state never carried,
   *  so no release edge could retire it and the next genuine lock was announced to nobody). It is
   *  ENDED at the release edges below, so "locked" cannot silence a banner about a lock the diner was
   *  never told about. A per-write clear was tried and its mutant SURVIVED once the gate was in place
   *  — genuinely subsumed, because the invariant is true at the source. */
  const explainedFreezeRef = useRef<ExplainedFreeze>(null);
  const settlingRef = useRef(false);

  // What a ticketed read established, and the rows it accepted — as a UNION, so `items` is
  // non-null exactly when the read won the screen and no caller can thread rows from one that
  // did not (Codex round 5 on #251, P1).
  type ReadResult =
    | { outcome: "applied"; items: CartItem[] }
    | { outcome: "overtaken" | "failed"; items: null };

  // One place to fan a fresh server view into the six pieces of cart state — keeps addItem/setQty/
  // refresh in lockstep so a new field can never be applied in one path and forgotten in another.
  // ⚠️ RETURNS WHETHER IT APPLIED (T26). A caller that is about to treat `itemsRef` as proof of its
  // OWN read needs to know it was not overtaken; `readView` is the only consumer that uses the
  // answer, and it converts it into a `ReadOutcome` so the two questions stay apart.
  const applyView = useCallback(
    (
      v: Awaited<ReturnType<typeof getCartView>>,
      seq?: number,
      forCart?: string | null,
    ): boolean => {
      // THE CART IT WAS READ FOR (Codex r2 on #314, P2): a `revalidate()` re-mint swaps the cart while
      // a read for the old one is still out, and the ticket alone cannot tell — the old answer lands
      // on the new cart's state with the old table, rows and totals. Every caller names the cart it
      // asked for; a view for a cart that is no longer this provider's is refused outright.
      if (forCart !== undefined && forCart !== cartIdRef.current) return false;
      // Session truth (Codex round 2 on #361) — a HELD cart takes no view at all. `holdEnd` retired
      // its freeze silently, but a read (or a mutation's own view) already in flight when the end was
      // held still resolves afterwards, and applying it put `locked`/`settling` back — the settle
      // edge then announced the register over a card that says the bill is paid. Refused HERE, not by
      // advancing the ticket in `holdEnd`: a mutation's view carries no ticket and would outrank it.
      if (endedRef.current !== null && endedRef.current.cartId === cartIdRef.current) return false;
      // No ticket = a mutation's own returned view (server-commit fresh): it wins and invalidates any
      // read still in flight. A ticket that is no longer current = a read another view has overtaken.
      if (!acceptView(viewSeqRef.current, seq)) return false;
      setItems(v.items);
      setTotals(v.totals);
      // Phase 3b · D10 (blind pass, critical 1) — the ONE W19 reading: an ASAP snap (`pickup_slot` set
      // for capacity, `fire_at` null) is NO slot. Checkout and app/cart already read the pair through
      // `normalizePickupSlot`; reading the raw column here made the menu greeting say "Scheduled for
      // <time>" for a time the diner never chose while /cart said ASAP for the same cart.
      setPickupSlot(normalizePickupSlot(v.pickupSlot, v.fireAt));
      setSendNudge(v.sendNudge);
      setDbNow(v.dbNow ?? null);
      setLocked(v.locked);
      setLockedBy(v.lockedBy);
      setMySeat(v.mySeat);
      setSettling(v.settling);
      // 3c-ii (D30) — the table number rides every applied view (the realtime echo included), and
      // a null one never un-names a table a view already named.
      if (v.tableNumber != null && cartIdRef.current != null)
        setViewTable({ cartId: cartIdRef.current, n: v.tableNumber });
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
      // Lifecycle audit — what someone ELSE changed, said once (lib/order-changes.ts). Asked BEFORE
      // the ref moves on: `itemsRef` is the last view the screen accepted, i.e. the baseline.
      const diffCart = cartIdRef.current;
      if (diffCartRef.current === diffCart)
        viewDiffRef.current?.(itemsRef.current, v.items, v.mySeat);
      else diffCartRef.current = diffCart;
      // #362 — and only THEN may a hold end: this view was diffed with every held key excluded, so if
      // its read started after a write settled, the baseline now includes that write.
      releaseHolds(ownLinesRef.current, seq, viewSeqRef.current.issued, Date.now());
      releaseHolds(ownDishesRef.current, seq, viewSeqRef.current.issued, Date.now());
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
  const readView = useCallback(async (): Promise<ReadResult> => {
    // ⚠️ IT RETURNS THE ROWS IT ACCEPTED, NOT JUST A VERDICT (Codex round 5 on #251, P1). Every
    // caller used to read `itemsRef.current` AFTER awaiting this — and the await is a microtask
    // boundary. A concurrently resolving mutation runs its UNTICKETED `applyView` in that gap and
    // replaces the ref, so the caller threaded rows that did not come from the read it had just
    // classified as its own. `AddButton` then computes an absolute `setQty` from them.
    //
    // The ticket makes the ACCEPTANCE decision race-free; it cannot make a later read of shared
    // mutable state race-free. Carry the value out instead of going back for it.
    if (!cartId) return { outcome: "failed", items: null };
    // Session truth — a cart already explained as ENDED answers `cart_closed` forever; reading it
    // again teaches nothing and costs a round trip per echo, focus and re-check.
    if (endedRef.current?.cartId === cartId) return { outcome: "failed", items: null };
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
      const v = await getCartView(cartId);
      const applied = applyView(v, seq, cartId);
      // ⚠️ The union makes "rows exist exactly when the read won" a COMPILER-CHECKED fact rather
      // than a comment — the first draft of this fix stated it in prose and `tsc` immediately found
      // the call site that would have trusted it. Encoding the invariant is the whole lesson of
      // this slice, applied to the fix for it.
      return applied
        ? { outcome: "applied", items: v.items }
        : { outcome: "overtaken", items: null };
    } catch {
      // Cart no longer open (paid/closed) → assertCartMember 403. Swallowed HERE so a stale read
      // after a successful add can't surface as a false-negative "Couldn't add" — but no longer
      // swallowed for good (session truth): a failed read is a FACT the effect below explains
      // (`askWhy` → `counterPayOutcome`). A clear, a merge and the sweep close the session, so no
      // Realtime event ever reaches this phone again; this failure is the only signal there is.
      setFailedRead((f) => ({ cartId, n: (f?.n ?? 0) + 1 }));
      return { outcome: "failed", items: null };
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
    // The rows come back WITH the verdict — never re-read from `itemsRef` here (see `readView`).
    return (await readView()).items;
  }, [readView]);

  // PD10 — ONE re-read when the CLOCK alone will move a dish on the kitchen strip (a Send leaving its
  // grace, a bump leaving Mom's undo window), measured on the view's DB clock — the same rule and the
  // same function the Bill's live pass uses (`settleRereadDelayMs`), so the menu's strip and the
  // Bill's pass never disagree about a dish for longer than a read. Null schedules nothing.
  const settleRereadMs = settleRereadDelayMs(items, dbNow ? Date.parse(dbNow) : null);
  useEffect(() => {
    if (settleRereadMs === null) return;
    const id = window.setTimeout(() => void refresh(), settleRereadMs);
    return () => window.clearTimeout(id);
  }, [settleRereadMs, refresh]);

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
        applyView(v, seq, cartId);
        // W5e: no slot sheet at the menu. Pickup timing is an explicit ASAP↔scheduled choice at
        // CHECKOUT (ASAP is a first-class default — a null slot fires immediately at settlement), so
        // a diner is never blocked behind "pick a time" before ordering. Phase 3b · D10 retired the
        // on-demand opener too: the provider's own sheet mount wrote the pick into React state only,
        // and the next view overwrote it — a thrown-away second writer. `pickupSlot` is read here.
      })
      .catch(() => {
        // Cart paid/closed between session mint and first load — leave the view empty (no throw).
        // W9b review — but DO seed the settle baseline: it is only written by `applyView`, so a failed
        // first load left it null and the edge effect then swallowed the next genuine transition
        // (it returns on `prev === null`). `settling` is still its initial `false` here, which is the
        // honest baseline for a view we never got.
        if (active && prevSettling.current === null) prevSettling.current = false;
        // Session truth — and explain it, as every failed read is (the effect below).
        if (active) setFailedRead((f) => ({ cartId, n: (f?.n ?? 0) + 1 }));
      });
    return () => {
      active = false;
    };
  }, [cartId, applyView]);

  // One polite live region for transactional feedback (RED-TEAM/QA). We announce a brief, STATIC
  // confirmation on success and a generic message on failure (WCAG 4.1.3 status messages) — but
  // never the rolling total itself (the CartBar/total deliberately aren't aria-live, so SR users
  // don't hear the amount re-read on every tap). Server errors are redacted in prod → generic text.
  // Phase 1c — `seq` is the Toast's key: MONOTONIC, never the text. Keyed on the text, a repeated
  // sentence (two sheet adds of one dish, two identical peer adds) changed no DOM and was never
  // re-announced. `kind`/`quiet` are what `admitNotice` arbitrates on (lib/notice-slot.ts).
  const [notice, setNotice] = useState<(SlotNotice & { seq: number }) | null>(null);
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
  // `leaving` phase (the .ui-toast-leaving settle), then a short exit timer unmounts. Both timers are
  // single-slot — a fresh flash cancels BOTH so overlapping notices still replace deterministically.
  const [noticeLeaving, setNoticeLeaving] = useState(false);
  // W13 — `my` is an optional Burmese segment rendered as its own lang="my" span (WCAG 3.1.2 —
  // correct SR pronunciation; the mixed-string alternative would read Burmese with EN rules).
  //
  // Phase 1c — the slot is ARBITRATED, not last-caller-wins (`admitNotice`, lib/notice-slot.ts):
  // claims are now spoken at the TAP, so a quiet "Mohinga added" could otherwise erase a tablemate's
  // news before anyone read it, and a queued claim could un-say the correction that retracted it.
  // `showingRef` is the notice INSIDE its display window (null through the leave phase, so anything
  // may take the slot then); `deferredRef` is one-deep, newest wins, shown when the window ends.
  const showingRef = useRef<(SlotNotice & { seq: number }) | null>(null);
  const deferredRef = useRef<{ notice: SlotNotice; ms: number; still?: () => boolean } | null>(
    null,
  );
  const noticeSeq = useRef(0);
  const flash = useCallback(
    (
      msg: string,
      ms = 2200,
      my?: string,
      opts: {
        quiet?: boolean;
        kind?: NoticeKind;
        family?: SlotNotice["family"];
        still?: () => boolean;
      } = {},
    ) => {
      // Put a notice in the slot and run its window. `keepSeq` (an `extend`) keeps the node's key, so
      // the identical correction is not spoken twice; the window restarts.
      function display(n: SlotNotice, dur: number, keepSeq: boolean) {
        if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
        if (noticeExitTimer.current !== null) window.clearTimeout(noticeExitTimer.current);
        const current = showingRef.current;
        const seq = keepSeq && current ? current.seq : (noticeSeq.current += 1);
        const shown = { ...n, seq };
        showingRef.current = shown;
        setNoticeLeaving(false);
        setNotice(shown);
        noticeTimer.current = window.setTimeout(() => {
          // The window ended: a notice that waited for it goes next, otherwise the slot leaves.
          // A waiting line is asked again first (`still`, F31): one no longer true is dropped.
          const next = deferredRef.current;
          deferredRef.current = null;
          if (next && next.still?.() !== false) {
            display(next.notice, next.ms, false);
            return;
          }
          showingRef.current = null;
          setNoticeLeaving(true);
          // 200ms > the RM-collapsed exit; under reduced motion the node just lingers invisibly.
          noticeExitTimer.current = window.setTimeout(() => {
            setNotice(null);
            setNoticeLeaving(false);
          }, 200);
        }, dur);
      }

      const incoming: SlotNotice = {
        text: msg,
        my,
        quiet: opts.quiet ?? false,
        kind: opts.kind ?? "news",
        family: opts.family,
      };
      // A correction drops a claim still waiting: it may be the very claim being retracted, and a
      // retracted claim spoken a beat later is a lie.
      const waiting = deferredRef.current;
      if (waiting && purgesDeferred(incoming, waiting.notice)) deferredRef.current = null;
      const verdict = admitNotice(showingRef.current, incoming);
      if (verdict === "defer") {
        deferredRef.current = { notice: incoming, ms, still: opts.still };
        return;
      }
      // Two dishes refused under one lock → the unnamed sentence, which covers both (rule 2).
      if (verdict === "generalize" && incoming.family) {
        display({ ...incoming, text: incoming.family.text, my: incoming.family.my }, ms, false);
        return;
      }
      // Five refused taps under one lock → one sentence: an identical correction EXTENDS.
      display(incoming, ms, verdict === "extend");
    },
    [],
  );
  // Codex round 1 on #313 (P1) — the drain a navigation awaits, with its deadline's meaning fixed
  // HERE, where the toast lives: a write past `DRAIN_MAX_MS` is slow, not dead, so a `"timed-out"`
  // drain says so (a correction — it retracts the tap's promise to move on) and the caller must not
  // leave. The market's page carries the same shape over its own ledger and toast.
  const drain = useCallback(async (): Promise<DrainOutcome> => {
    const outcome = await bounded(settled());
    if (outcome === "timed-out")
      flash(DRAIN_TIMED_OUT_NOTICE, 3000, undefined, { kind: "correction" });
    return outcome;
  }, [settled, flash]);
  // Lifecycle audit (out-of-stock 2 · diner-live-status 3 · edit-notes 7) — the view diff's voice: a
  // change someone ELSE made to this order (staff removing a dish — "we ran out" when that is the
  // reason —, the host or a server changing the diner's own unsent dish or its note, a server adding
  // one), said as ONE sentence per re-read through this view's ONE region, never a toast per change.
  // NEWS: it shows over a claim and never waits behind one. Held for the time it takes to read
  // (`freshnessDurationMs`, the same reading-time rule the menu-freshness sentence uses).
  const announceOrderChanges = useCallback(
    (prev: CartItem[], next: CartItem[], seat: string) => {
      const notice = orderChangeNotice(
        orderChanges(prev, next, seat, {
          lineIds: heldKeys(ownLinesRef.current),
          dishes: heldKeys(ownDishesRef.current),
        }),
      );
      if (notice) flash(notice, freshnessDurationMs(notice));
    },
    [flash],
  );
  useLayoutEffect(() => {
    viewDiffRef.current = announceOrderChanges;
  }, [announceOrderChanges]);
  // Cancel a pending clear-timer on unmount so it can't fire setState on an unmounted component
  // (same cancel-guard discipline as the load effects above).
  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Session-recovery messaging (bugfix: a silently-expired table session). When a cart op fails we
  // re-mint (revalidate) instead of stranding the diner behind a hopeless "try again". The effect
  // below reads the OUTCOME of that re-mint by diffing the cartId. Deferred (microtask) so it's not
  // a synchronous setState in the effect body.
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
  /** Session truth — the terminal answer that drove a SOLO re-mint, so its sentence names the cause
   *  (`mintNotice`); null for a re-mint whose cause we could not see. */
  const recoveryCauseRef = useRef<TableEnd | null>(null);
  /** Session truth — the mint in flight is the diner's own "Start a new order". */
  const restartingRef = useRef(false);
  const prevCartIdRef = useRef<string | null>(null);

  /**
   * Session truth — WHY could this cart not be read? Asked of the one member-gated server answer
   * (`counterPayOutcome`, classified by `cartFate`). A throw is `unknown` (an outage establishes
   * nothing — the M116 rule).
   *
   * DEDUPED for PASSIVE triggers only — an echo burst, a focus and a poll tick landing together ask
   * once. A WRITE's diagnosis passes `fresh` and always issues its own ask (the blind pass on #361):
   * a poll asked a beat BEFORE a Clear committed answers `open`, and a write that reused that stale
   * answer skipped the hold and re-minted under the diner — the exact silent re-mint this exists to
   * end. The fresh ask also becomes the one later passive triggers share.
   */
  const whyRef = useRef<{ cartId: string; p: Promise<CartOutcome> } | null>(null);
  const askWhy = useCallback((id: string, fresh = false): Promise<CartOutcome> => {
    const out = whyRef.current;
    if (!fresh && out && out.cartId === id) return out.p;
    const p = counterPayOutcome({ cartId: id })
      .catch((): CartOutcome => ({ kind: "unknown" }))
      .finally(() => {
        if (whyRef.current?.p === p) whyRef.current = null;
      });
    whyRef.current = { cartId: id, p };
    return p;
  }, []);

  /**
   * Session truth — HOLD a dine-in table that ended: the card, the inert controls, and ONE sentence
   * through the one live region (the card's own title). Nothing re-mints: the diner chooses when to
   * start again, and the sticker in this page's props can no longer re-host a table staff just
   * freed (M172).
   *
   * The dead cart's last freeze is retired SILENTLY: both edge baselines are moved first, so the
   * lock and settle effects see no transition — "The order's unlocked" or "The counter stopped
   * taking payment" over a table that has just PAID would be false. (`settling` used to stick true
   * after a register settle: the T20 re-check ends on a failed read, so every Add stayed disabled
   * under "splitting the bill" until a reload.)
   */
  const holdEnd = useCallback(
    (id: string, end: TableEnd) => {
      if (id !== cartIdRef.current) return; // an answer about a cart this provider has left
      if (endedRef.current?.cartId === id) {
        // Already held — said once. But an INCOMPLETE paid end (a read behind its tender or its
        // order failed) takes what a later answer resolved, SILENTLY: the card gains its receipt
        // link or its tender when the read does (Codex round 2 on #361, `heldEndUpgrade`).
        const next = heldEndUpgrade(endedRef.current.end, end);
        if (next !== null) {
          endedRef.current = { cartId: id, end: next };
          setEnded({ cartId: id, end: next });
        }
        return;
      }
      endedRef.current = { cartId: id, end };
      prevLocked.current = false;
      prevSettling.current = false;
      freezeRef.current = { locked: false, lockedBy: null, mySeat: freezeRef.current.mySeat };
      settlingRef.current = false;
      explainedFreezeRef.current = null;
      setLocked(false);
      setLockedBy(null);
      setSettling(false);
      setEnded({ cartId: id, end });
      const key = endedNewsKey(end);
      flash(t("en", key), 5000, t("my", key), { kind: "news" });
    },
    [flash],
  );

  /**
   * Session truth — act on an explained failure (`afterFailedRead`): hold a dine-in end, re-mint a
   * solo one (its cause said by `mintNotice`) or a write's unexplained failure (the shipped
   * recovery), and leave a passive read's unexplained failure on the last good view.
   */
  const settleFate = useCallback(
    (id: string, o: CartOutcome, write: boolean) => {
      if (id !== cartIdRef.current) return;
      const next = afterFailedRead(o, { isGroup, write });
      if (next === "hold" && tableEnded(o)) holdEnd(id, o);
      else if (next === "remint") {
        recoveringRef.current = true;
        recoveryCauseRef.current = tableEnded(o) ? o : null;
        revalidate();
      }
    },
    [isGroup, holdEnd, revalidate],
  );

  // A failed PASSIVE read, explained (focus, an echo, the freeze re-check, the first load). A cart
  // already held is not asked again.
  useEffect(() => {
    if (!failedRead) return;
    const id = failedRead.cartId;
    if (endedRef.current?.cartId === id) return;
    void askWhy(id).then((o) => settleFate(id, o, false));
  }, [failedRead, askWhy, settleFate]);

  // The end as the CURRENT cart sees it: a new cart (the diner's new order) is not ended, and the
  // card stays through the new order's own mint (`cartId` is null in between) so its button can
  // say it is working, and say so again if the mint fails.
  const endedNow = ended && (cartId === null || cartId === ended.cartId) ? ended.end : null;
  // …and the cart it ended, which outlives the live `cartId` through the restart's mint.
  const endedCartId = endedNow !== null && ended ? ended.cartId : null;

  // "Start a new order" — ONE re-mint by the accepted code under J15 (`dineinMintEntry`): the same
  // table while it is still seated (a paid table), a bare new order when it is not. The busy state
  // ends in the notice effect below (the new cart) or the failure effect after it.
  const startNewOrder = useCallback(() => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    recoveringRef.current = false;
    recoveryWriteUnconfirmedRef.current = false;
    recoveryCauseRef.current = null;
    setRestarting(true);
    revalidate();
  }, [revalidate]);

  // The ONE sentence a mint earns (`mintNotice`): the diner's new order, a recovery re-mint (never
  // "idle" — the cause we know, or that we do not know it), the home card's resume, or a cold mount
  // whose stored table had ended (finding 4: reload, a new tab or home → Dine-in used to land
  // silently in a new, unnumbered "Just you"). Runs on every null → cart transition.
  useEffect(() => {
    if (!cartId || !session) return;
    const prev = prevCartIdRef.current;
    prevCartIdRef.current = cartId;
    const recovering = recoveringRef.current;
    recoveringRef.current = false;
    const restarted = restartingRef.current;
    restartingRef.current = false;
    const unconfirmed = recoveryWriteUnconfirmedRef.current;
    if (recovering || restarted) recoveryWriteUnconfirmedRef.current = false;
    const cause = recoveryCauseRef.current;
    recoveryCauseRef.current = null;
    const notice = mintNotice({
      firstMint: prev === null,
      recovering,
      restarted,
      newCart: prev !== null && prev !== cartId,
      unconfirmed,
      cause,
      created: session.created,
      resume: !!resume,
      replacedStored: session.replacedStored,
    });
    void Promise.resolve().then(() => {
      // J18 — a mint that SUCCEEDED ends the diner's retry: the solo banner's "Reconnecting…" belongs
      // to the retry the diner pressed, never to a later automatic re-mint (the blind pass on #361,
      // CRITICAL 3 — the tick was never reset, so every later re-mint raised a `role="alert"`
      // "Reconnecting to your order…" while the polite region said a new order had started).
      setSoloRetryTick(0);
      if (restarted) {
        setRestarting(false);
        // The card — and the button the diner pressed — has just left the page: give focus to the
        // menu's heading rather than <body> (WCAG 2.4.3), only if nothing else has taken it.
        if (focusOrphaned(document.activeElement, document.body))
          document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
      }
      if (notice) flash(notice.text, notice.ms);
    });
  }, [cartId, session, resume, flash]);

  // A new order that could not be started: the card's button comes back, and the region says so.
  useEffect(() => {
    if (!error || !restartingRef.current) return;
    restartingRef.current = false;
    void Promise.resolve().then(() => {
      setRestarting(false);
      flash("Couldn’t start a new order — try again.", 3500, undefined, { kind: "correction" });
    });
  }, [error, flash]);

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
   * Session truth — the close no event carries. A staff Clear, a Merge and the sweep all close the
   * session in the same transaction that ends the cart, so `is_member` is already false when
   * Realtime authorizes the change: this phone hears nothing, and a diner who is not tapping would
   * sit on a frozen menu reading "being made" over dishes the clear voided. So while a dine-in cart
   * is live, ask once a minute, and only while the page is visible (the visibility re-read above
   * covers the return). The ask is `counterPayOutcome` itself, not a full view read: an open cart
   * answers in three indexed reads and changes nothing on screen. The poll stops the moment the
   * table is held with a COMPLETE answer (`endPollDelayMs`, `endComplete`). It renews nothing — an
   * abandoned tab never keeps a table alive.
   * The interval and its visibility rule are `useEndPoll` (lib/end-poll), shared with /cart.
   */
  // The cadence (`endPollDelayMs`) and the visible-only tick (`useEndPoll`) are shared with the Bill.
  // An INCOMPLETE paid end keeps the poll (Codex round 2 on #361): its next tick re-asks, and
  // `holdEnd` folds in what that answer resolved.
  const endPollMs = endPollDelayMs({
    isGroup,
    hasCart: cartId !== null,
    ended: endedNow !== null && endComplete(endedNow),
  });
  const endPollTick = useCallback(() => {
    const id = cartIdRef.current;
    if (!id) return;
    void askWhy(id).then((o) => settleFate(id, o, false));
  }, [askWhy, settleFate]);
  useEndPoll(endPollMs, endPollTick);

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
        void readView().then(({ outcome }) => {
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
          if (!cancelled && readReachedServer(outcome)) arm();
        });
      }, delay);
    };
    arm();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locked, settling, readView]);

  /**
   * The coalescer — window, arithmetic and timer — lives in `lib/echo-refresh.ts`, because /cart
   * needs the same one (M193 was only half-closed by #275: `Checkout.tsx` still re-read per event).
   * `scripts/check-echo-coalesce.mjs` is what keeps both call sites on it.
   */
  const scheduleEchoRefresh = useCoalescedRefresh(refresh);

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
      // COALESCED, not fired per event. One add writes to BOTH watched tables — the `qr_cart_items`
      // INSERT and `touchCart`'s `qr_carts` UPDATE — so a single tap echoes back to the actor's own
      // phone at least twice, and each echo used to run its own `getCartView`: ~7 sequential DB
      // round trips apiece, on top of the view the mutation already returned. Measured in
      // production on 2026-09-09: four `POST /cart` inside four seconds from ONE tap. At a table of
      // four, every diner's tap fanned that out to all four phones.
      //
      // Coalescing rather than SKIPPING the self-echo is deliberate, because the echo is a recovery
      // path, not noise. When a mutation's own view comes back unreadable — the "written,
      // unreadable" case `viewAfterWrite` exists for — this refresh is what heals the screen; and
      // T14's stale-freeze correction rides the `qr_carts` UPDATE specifically (the comment above
      // explains why that subtree needs it even in solo modes). Dropping either would trade a
      // latency win for a stuck screen.
      //
      // Safe because `readView` is TICKETED: a coalesced read that lands after a fresher one is
      // discarded by its sequence number rather than overwriting it.
      // ⚠️ A MAXIMUM, not just a quiet period. A pure trailing debounce re-arms from zero on every
      // event, so a stream whose gaps stay under `ECHO_COALESCE_MS` postpones the read forever — and
      // the read is a RECOVERY path, not a nicety (see `ECHO_MAX_WAIT_MS`). The deadline is anchored
      // to the burst's first event and survives every re-arm within it.
      scheduleEchoRefresh();
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
    [scheduleEchoRefresh, session, flash],
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
   * sentence is unaffected: `refusal` and `fresh` are both read off `v` directly, and
   * they describe why THIS write was refused — a fact about the moment it was diagnosed, which a
   * later view does not revise. Being overtaken can only mean the list beside the sentence is newer
   * than the sentence, never older.
   */
  const explainCaught = useCallback(
    async (
      id: string,
    ): Promise<{
      fresh: CartItem[] | null;
      viewIsCurrent: boolean;
      /** null ⇔ the re-read itself failed (`unreachable`), which is never publishable — T30. */
      refusal: PublishableRefusal | null;
      /** Session truth — the dine-in table this write found ENDED (now held), or null. */
      held: TableEnd | null;
    }> => {
      let fresh: CartItem[] | null = null;
      // ⚠️ Did the re-read WIN the screen? (Codex round 3 on #251, P1.) `applyView` answers, and
      // discarding that answer let an OVERTAKEN snapshot be threaded into the next queued write —
      // rows that may predate the view that beat it. `readView` already makes exactly this
      // distinction (`readIsOurs`); this helper is the second ticketed read and had not adopted it.
      let viewIsCurrent = false;
      let refusal: RefusedWrite;
      const seq = issueRead(viewSeqRef.current);
      try {
        const v = await getCartView(id);
        viewIsCurrent = applyView(v, seq, id);
        // `fresh` is kept even when overtaken: it is what we OBSERVED, and the refusal it classifies
        // is a fact about that moment. Only its use as a threadable list is gated, one layer out.
        fresh = v.items;
        // ⚠️ NO `holderIsViewer` ANY MORE. It re-answered, from a second `cartFreeze` call, a
        // question `classifyRefusedWrite` answers on the very next line — one fact computed twice,
        // which is the drift shape W17 named. `refusal.freeze === "self"` carries it now.
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
        //
        // ⚠️ `fresh` IS CLEARED EXPLICITLY, not left to luck. It is null on entry and the only write
        // to it sits inside the `try` above, so this is a no-op TODAY — and it is exactly the kind
        // of invariant that a later edit breaks silently. The mutant
        // `refusal/unreadable-cart-yields-a-list` is what makes this line load-bearing rather than
        // decorative: with a list here, the unreachable arm classifies as a refusal we cannot name.
        fresh = null;
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
      //
      // ⚠️ SESSION TRUTH — THE ARM THAT COULD NOT READ ASKS WHY BEFORE IT RE-MINTS. It re-minted on
      // the spot, so a table staff had CLEARED (or merged away, or that had PAID) was re-minted under
      // the diner and announced as "Your table sat idle too long": false for all three, the tapped
      // dish lost, and a sticker-entered phone re-hosting the table staff had just freed (M172). The
      // member-gated answer decides (`settleFate`): a dine-in end is HELD (the card), a solo one
      // re-mints with its cause said, and only an unknowable answer takes the shipped re-mint.
      let held: TableEnd | null = null;
      if (refusalNeedsRemint(refusal)) {
        const o = await askWhy(id, true);
        if (isGroup && tableEnded(o)) held = o;
        settleFate(id, o, true);
      }
      // ⚠️ THE CLASSIFICATION CROSSES THE SEAM, NOT A SENTENCE (T32). The caller may be the provider
      // publishing it alone, or `YourUsual` composing it into its own sentence — and those need
      // different renderings of one fact. Handing over the finished sentence is what made the card
      // append a whole verdict inside its own, so the diner heard it twice.
      //
      // `unreachable` is narrowed away HERE, at the one seam it could have escaped through: that
      // arm's write is `unconfirmed`, never `refused`, so nothing downstream may publish it (T30).
      return {
        fresh,
        viewIsCurrent,
        refusal: refusal.cause === "unreachable" ? null : refusal,
        held,
      };
    },
    [applyView, askWhy, settleFate, isGroup],
  );

  /**
   * Publish a refusal the caller has decided is real (no landing was detected), and RETURN its
   * CLAUSE so the write's own result can carry the cause to a consumer announcing its own outcome
   * afterwards (T42 — it used to go into a provider-global latch, which an overlapping write could
   * overwrite before the consumer read it).
   *
   * ⚠️ THE TOAST GETS THE SENTENCE, THE RESULT GETS THE CLAUSE (T32). They are two renderings of one
   * classification, composed in `cart-freeze.ts` from a single fragment. The latch used to hold the
   * whole sentence, and `YourUsual` appended it to a sentence of its own that already opened with
   * the same verdict.
   */
  const publishRefusal = useCallback(
    (refusal: PublishableRefusal, name?: string): string => {
      // T33 — record WHICH freeze this sentence explained, so the banner for that same freeze stays
      // silent instead of overwriting it a microtask later. Derived from the CAUSE, never from the
      // cart's current flags: the cause is what was spoken, the flags are what is true now, and the
      // two disagreeing by a tick is the whole class of defect this sits in.
      //
      // ⚠️ CURRENCY IS ASKED HERE, AGAINST WHAT IS ON SCREEN — not carried in from the read (blind
      // pass CRITICAL, then Codex round 1 P1 on the first fix for it). `explainCaught` classifies
      // from the read it made EVEN WHEN THAT READ LOST THE SCREEN, deliberately: the refusal is a
      // fact about the moment it looked. A latch is a different claim — that the diner can SEE this
      // freeze — so it needs a different source.
      //
      // Passing `applyView`'s return value down was the first attempt and it is a SNAPSHOT, not a
      // check: it answers "did my read win when it landed", and another mutation's view can apply
      // between that and this line. `freezeRef`/`settlingRef` are written synchronously by
      // `applyView` from the very view it applies, so reading them here asks the question at the
      // only moment that matters.
      explainedFreezeRef.current = explanationHolds(explainedByRefusal(refusal), {
        locked: freezeRef.current.locked,
        settling: settlingRef.current,
        // ⚠️ THROUGH `cartFreeze`, the same function that gave the refusal its attribution inside
        // `classifyRefusedWrite` (Codex round 2, P2). Asking it of the applied view answers "whose
        // lock is on screen now" with the one derivation both sides already share.
        lockedByYou: cartFreeze(freezeRef.current) === "self",
      });
      // Phase 1c — a CORRECTION, and it names the dish when the caller handed `add` one: with rows
      // in flight or a sheet already closed, "That didn’t go through" does not say which.
      flash(
        name ? namedRefusedWriteNotice(refusal, name) : refusedWriteNotice(refusal),
        2600,
        undefined,
        { kind: "correction", family: name ? { text: refusedWriteNotice(refusal) } : undefined },
      );
      // T42 — the clause leaves WITH the write that established it, via `add`'s result.
      return refusedWriteClause(refusal);
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
   * NOT `publishRefusal`, and it carries no clause: a clause means "a refusal the caller decided is
   * real" and is carried into `YourUsual`'s copy (since T42 on the `refused` result alone — the
   * `unconfirmed` arm of `AddResult` has no field to carry one). An unconfirmed write has not been
   * refused, and lending it a refusal's sentence is the fabricated-diagnosis class again.
   *
   * Phase 1c — the claim may now have been spoken by the CALLER, at the tap, rather than by `add`
   * (`AddButton` passes `claim: null` and says "Mohinga added" itself), and it may have been QUIET.
   * The duty is unchanged: whoever made the claim, this retracts it — visibly, as a CORRECTION the
   * slot never defers — and names the dish when the caller handed `add` one.
   */
  const publishUnconfirmed = useCallback(
    (name?: string, held?: TableEnd | null) => {
      // Session truth — the table ENDED under this write (`explainCaught` held it): the retraction
      // names the cause, and nothing re-mints, so the recovery latch below is not set.
      if (held) {
        flash(endedWriteNotice(held, name), 3000, undefined, {
          kind: "correction",
          family: name ? { text: endedWriteNotice(held) } : undefined,
        });
        return;
      }
      // Latch BEFORE the flash: `explainCaught` has already fired `revalidate()` on the arm that could
      // not read the cart, so the recovery effect may run at any point after this and must find the
      // flag set. Cleared by that effect, so a later ordinary re-mint still says "try that again".
      recoveryWriteUnconfirmedRef.current = true;
      flash(name ? namedUnconfirmedWriteNotice(name) : unconfirmedWriteNotice(), 3000, undefined, {
        kind: "correction",
        family: name ? { text: unconfirmedWriteNotice() } : undefined,
      });
    },
    [flash],
  );

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
   * `mms_cart_item_inc_qty` skips comped rows and still answers success, so a comp landing on the
   * merge target between `insertOrIncLine`'s sibling read and its bump makes the add a successful
   * no-op, and "That line is already at our 99 max" would name a cap that is not the cause. Growth
   * is the only thing proving the write moved this line, so only a short GROWTH is diagnosed. (T25
   * took comped rows out of the sibling read, so an add no longer matches one outright; the race
   * window is what is left, and closing it needs the RPC's applied delta — T27.)
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
      if (correction) flash(correction, 3000, undefined, { kind: "correction" });
    },
    [flash],
  );

  const add = useCallback(
    async (
      menuItemId: string,
      modifierIds: string[] = [],
      notes?: string,
      qty: number = 1,
      opts?: { claim?: CartClaim | null; name?: string },
    ): Promise<AddResult> => {
      // No cart to write to: nothing left, so a retry is the right offer. No view exists to thread,
      // and nothing was read, so no cause is carried (T42 — never a previous write's: the clause
      // lives on each result, so there is no shared value left for this exit to pick up, T31).
      if (!cartId) return { state: "refused", view: null, clause: null };
      // Session truth — a table already held as ENDED takes no write: nothing is sent, so this is a
      // true refusal (`mayRetry` holds once a new order exists), said with its cause. The pill and
      // the sheet are inert already (`inertReason`); this is for `YourUsual`, which never gates.
      // Unlike a freeze, an end never heals by waiting, so refusing at the door hides no correction.
      if (endedRef.current?.cartId === cartId) {
        const msg = `${opts?.name ?? "That"} didn’t go through — ${CLOSED_ORDER_CLAUSE}.`;
        flash(msg, 3000, undefined, { kind: "correction" });
        return { state: "refused", view: null, clause: CLOSED_ORDER_CLAUSE };
      }
      // Optimistic: bump the visible count + confirm on tap, so the cart bar responds immediately
      // instead of after the round-trip. The total stays server-authoritative (no client price math),
      // so it settles when the view returns — the count is the instant feedback. `qty` (W5c sheet
      // stepper) bumps the count by the whole pre-add quantity — one write, one flash.
      setPendingDelta((n) => n + qty);
      // Honest count for a multi-unit sheet add — an SR user hears how many units landed (4.1.3).
      // Phase 1c — the CALLER may speak instead: `undefined` keeps this default byte-for-byte, a
      // claim replaces it (the sheet's named, visible one), and `null` means the caller already
      // spoke at the tap (AddButton's quiet "Mohinga added"), so nothing is said here.
      const claim =
        opts?.claim === undefined
          ? {
              text: qty > 1 ? `Added ${qty} to your order` : "Added to your order",
              my: "ထည့်ပြီးပါပြီ",
              ms: 2000,
            }
          : opts.claim;
      if (claim)
        flash(claim.text, claim.ms ?? 2000, claim.my, { quiet: claim.quiet, kind: "claim" });
      // The pre-add lines (from the ref, never a stale render closure). BOTH the success path and the
      // recovery path below compare against this one snapshot through `classifyAddLanding`, so they
      // cannot disagree about how many units landed — the "name it ONCE" rule applied to a count.
      const itemsBefore = itemsRef.current;
      // Lifecycle audit — this dish's change is OURS until a view read after the write has shown it
      // (the view diff skips it meanwhile — #362, `lib/own-write-hold.ts`).
      const own = holdPending("dish", menuItemId);
      const settleOwn = own.settle;
      try {
        // Modifier ids only (R6b sheet) — `addItem`→`priceItem` validates them against the item's groups
        // and re-derives the charge; a client-sent price is never trusted. ONE round-trip returns the view.
        // `notes` (W3b) is the kitchen note — free text, length-bounded server-side, never a price.
        // Settled the moment the write answers, BEFORE any recovery read below is issued, so that
        // read is one that can end the hold.
        const out = await addItemOutcome(cartId, menuItemId, modifierIds, notes, qty).finally(
          settleOwn,
        );
        if (!out.ok) {
          // Lifecycle audit (out-of-stock 0) — a refusal the SERVER NAMED (`priceItem`: the dish is
          // sold out or off the menu), answered as a value because a thrown message is redacted in
          // production. DEFINITE — the refusal precedes the insert — so it is `refused`, named, and
          // carries the view on screen (nothing changed). It used to reach this phone as a throw,
          // re-read, find no lock and hedge "We couldn’t confirm Mohinga" over a card that stayed
          // live. The MARK flips the menu's card to "Sold out" now; a fresher catalog clears it.
          // #362 — either kind flips the card (the kitchen cannot make it); the SENTENCE says which.
          if (out.refused === "sold_out" || out.refused === "gone") {
            const at = Date.parse(out.at);
            setSoldOutMarks((prev) =>
              new Map(prev).set(menuItemId, Number.isFinite(at) ? at : Date.now()),
            );
          }
          const named = serverNamedRefusal(out.refused) ?? { cause: "unknown" as const };
          return {
            state: "refused",
            view: itemsRef.current,
            clause: publishRefusal(named, opts?.name),
          };
        }
        const view = out.view;
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
          // ⚠️ `applied`, NOT `unconfirmed`, EVEN WHEN THE RE-READ FAILS (Codex round 4 on #251, P2).
          // The comment above is the argument and the code used to contradict it: `viewAfterWrite`
          // returns null only AFTER the row landed, so the mutation response has already established
          // the outcome. A failed re-read leaves us without a VIEW, not without a verdict —
          // downgrading it retracted a true success notice, suppressed the analytics capture, and
          // made `YourUsual` tell the diner a dish it had just added could not be confirmed.
          //
          // `unconfirmed` belongs only where the mutation response ITSELF said nothing: the catch
          // arm, where the action rejected and the write may or may not have committed.
          if (reread.outcome !== "applied") return { state: "applied", view: null };
          // The re-read is ours, so correct the optimistic announce against it exactly as the
          // success path does — a cap reached on a write whose first view failed is still a cap.
          // (Not reachable above: without a view there is nothing to attribute a shortfall against,
          // so the optimistic announce stands — the T27 residual, unchanged by this slice.)
          announceShortfall(itemsBefore, reread.items, menuItemId, qty);
          return { state: "applied", view: reread.items };
        }
        // The write's OWN view, read after it committed: once diffed with the dish held, its hold
        // ends — no ticketed read follows on /menu to end it (#362 blind pass 9).
        if (applyView(view, undefined, cartId)) own.ownView();
        // If the server capped the merge, correct the earlier optimistic announce so the SR live
        // region and the count agree with what actually landed.
        //
        // ⚠️ PER DISH, NOT PER BASKET (T21(c)). This used to subtract basket-wide totals, which any
        // concurrent peer write skews: a tablemate removing one unit of THEIR line made `landed`
        // come out one short and fired "Added 4 — that line is now at our 99 max" about a dish
        // sitting at 6 of 99. That needs no near-cap line to reach, so it was likelier than the cap
        // it claimed. `none` is spoken HERE and only here, because the mutation returned a view — so
        // the write provably COMMITTED and the sentence is not a guess about that. ⚠️ It is still not
        // proof of the CAP, which this note used to claim: a zero net delta is equally a comp racing
        // the merge bump (T25's window) or a concurrent restore (T43). `addShortfallNotice` says
        // only "Nothing was added", which is what a zero actually supports.
        //
        // ⚠️ NOT GATED ON `qty > 1` (blind adversarial pass). It used to be, which left the most
        // ordinary way to hit the cap uncorrected: a single "+" on a line already at 99 announced
        // "Added to your order" and nothing ever took it back. `partial` cannot occur for a request
        // of one — a single unit either lands or does not — so the only sentence this adds for a
        // quick-add is the true one.
        announceShortfall(itemsBefore, view.items, menuItemId, qty);
        // ⚠️ ONLY `partial` SPEAKS (Codex round 2, P2). A zero delta does NOT establish the 99 cap:
        // `mms_cart_item_inc_qty` skips comped rows and still answers success, so a comp landing on
        // the merge target between `insertOrIncLine`'s sibling read and its bump makes the add a
        // successful no-op, and "That line is already at our 99 max" would name a cap that is not
        // the cause. Growth is the only thing proving the write moved this line, so only a short
        // GROWTH is diagnosed. (T25 took comped rows out of the sibling read; the race is what is
        // left — T27.)
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
        const { fresh, viewIsCurrent, refusal, held } = await explainCaught(cartId);
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
          // `full`/`partial` = this dish grew, so the write landed. `unknown` = unattributable.
          //
          // ⚠️ `none` IS TREATED AS A REFUSAL AND IS NOT ONE — the note here claimed "this dish did
          // not move, which IS evidence of a refusal" (Codex round 4 on #255). `none` means the NET
          // delta was zero, which a restoring host produces on a write that COMMITTED: `dishDeltas`
          // does nothing at `d === 0`. `mayRetry` is then true and `YourUsual` re-adds it. This line
          // is the defect OPEN-ITEMS **T43** fixes; it is left as-is deliberately, because changing
          // the mapping without the classifier is how a wrong number ships.
          landed: outcome === null ? null : outcome === "unknown" ? null : outcome !== "none",
          viewIsCurrent,
        });
        // Only a state that establishes a refusal may publish one — an `unconfirmed` write has not
        // been refused, and saying so is the fabricated-diagnosis class this slice's ancestors
        // (M116, T14) exist to remove. The caller is told "unconfirmed" and decides for itself.
        // ⚠️ THE `refusal ?` IS TOTAL, NOT DEFENSIVE. `refused` requires a re-read that SUCCEEDED
        // (`recoveredWrite` answers `unconfirmed` for a null one), and `refusal` is null only when
        // that read failed — so the two can never disagree. It is written as a narrowing rather than
        // a cast because the mutant `refusal/unreadable-cart-yields-a-list` proves the coupling
        // instead of asserting it.
        //
        // ⚠️ T42 — THE CLAUSE RIDES THIS RESULT. It used to go into a provider-global latch that the
        // consumer read after `add` resolved, and an overlapping write could publish its own cause in
        // that gap — dish A announced with write B's diagnosis.
        // ⚠️ Read by AddButton and YourUsual, NOT by ItemSheet: W20 made the sheet close on tap
        // (`void add(...)` then `onClose()`, ItemSheet.tsx:225-226) so adding feels instant, and it
        // never awaits this. The older comment here claimed the sheet stays open "keeping the diner's
        // modifier choices", which stopped being true then — and it is the only caller that can pass
        // qty > 1, so a reader reasoning from it would mis-model the whole partial-fill path above.
        if (result.state === "refused")
          return { ...result, clause: refusal ? publishRefusal(refusal, opts?.name) : null };
        // The optimistic claim is still standing — ours, or the one the caller spoke at the tap;
        // retract it rather than let an outcome that may not claim a landing stand as one.
        if (result.state === "unconfirmed") publishUnconfirmed(opts?.name, held);
        return result;
      } finally {
        setPendingDelta((n) => n - qty);
        settleOwn(); // idempotent — every path above already settled it
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
      holdPending,
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
      // Session truth — nothing reaches a cart held as ENDED (see `add`).
      if (endedRef.current?.cartId === cartId) {
        flash(`That didn’t go through — ${CLOSED_ORDER_CLAUSE}.`, 3000, undefined, {
          kind: "correction",
        });
        return { state: "refused", view: null };
      }
      // Announce the outcome immediately (optimistic, like `add`'s "Added to your order") so SR users get
      // instant confirmation; the error path below replaces it with the recovery message if the write fails.
      if (announce) flash(announce, 2000, undefined, { kind: "claim" });
      // Instant CartBar count: shift the signed optimistic delta by this line's change (new qty − current;
      // a remove is qty 0). Reconciled to 0 in `finally` once the returned view re-derives the true count.
      const line = itemsRef.current.find((i) => i.id === cartItemId);
      const delta = line ? Math.max(0, qty) - line.qty : 0;
      setPendingDelta((d) => d + delta);
      // Lifecycle audit — this line's change is OURS until a view read after the write has shown it
      // (the view diff skips it meanwhile — #362, `lib/own-write-hold.ts`).
      const own = holdPending("line", cartItemId);
      const settleOwn = own.settle;
      try {
        // ONE round-trip: setQty now returns the fresh server-authoritative view (like addItem), so we
        // apply it directly instead of a second getCartView refresh — the "cart actions feel delayed" fix.
        // Settled the moment the write answers, before the recovery reads below are issued.
        const view = await setQtyAction(cartItemId, qty).finally(settleOwn);
        if (isServerRefusal(view)) {
          // Lifecycle audit (edit-notes 6) — a refusal the SERVER NAMED, as a value: the line had
          // already gone to the kitchen (a tablemate's Send landed inside the echo window), or the
          // write would grow a dish that sold out. DEFINITE — nothing was written — so unlike the
          // catch below (T41: a thrown write is never proof) this one is `refused`. The menu "−"
          // used to say "Removed Mohinga" at the tap and then hedge "We couldn’t confirm that"
          // while the dish was cooking and stayed on the bill; the correction now names the fact.
          // The re-read still runs: it snaps the stepper back to server truth and re-asks whether
          // the fact still HOLDS (an Undo inside the Send's grace puts the line back in draft —
          // M230's rule). Held, the server's word is said; otherwise the re-read's own reading is.
          const named = serverNamedRefusal(view.refused);
          const { fresh, viewIsCurrent, refusal } = await explainCaught(cartId);
          const now = fresh?.find((i) => i.id === cartItemId);
          const spoken =
            named !== null && (fresh === null || namedRefusalHolds(named, now)) ? named : refusal;
          if (spoken) publishRefusal(spoken, line?.name);
          return { state: "refused", view: viewIsCurrent ? fresh : null };
        }
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
          // Same as `add`'s arm: the row COMMITTED (that is what a null view means here), so this is
          // `applied` either way and the optimistic `announce` stands. Only the VIEW is missing, and
          // `view: null` says exactly that — the next queued op re-reads rather than threading.
          return { state: "applied", view: reread.items };
        }
        // The write's OWN view ends its hold (see `add`) — #362 blind pass 9.
        if (applyView(view, undefined, cartId)) own.ownView();
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
        // The re-read's freeze classification is not read here (T41, below) — `explainCaught` still
        // runs for the re-read, the snap-back it applies, and the re-mint on the unreadable arm.
        const { fresh, viewIsCurrent, held } = await explainCaught(cartId);
        // Same post-commit rule as `add`: `setQty` writes the row and only THEN returns the view, so
        // a trailing-read failure lands here with the qty already applied. The target is exact
        // (`setQty` is absolute, not a delta), so the re-read is the evidence: the line at `qty`, or
        // gone when the tap was a remove.
        //
        // ⚠️ T41 — THE EVIDENCE IS ONE-SIDED, SO THE VERDICT IS TOO. `setQty` is absolute, so no
        // peer write can forge a LANDING: the line reads `qty` only if something set it there. It
        // can absolutely forge a NON-landing — our set to 3 commits, an authorized host sets the
        // same line to 5 inside the round trip, and the re-read reads 5. This path used to answer
        // `refused` there, so `mayRetry` was TRUE for a write that landed; the `unknown` cause's
        // hedged opener shrank the SENTENCE and left the STATE wrong (Codex round 2 on #255).
        //
        // So only "the line sits at our target" maps to a landing, and EVERY other reading —
        // including one under a freeze — maps to `landed: null`, i.e. `unconfirmed`:
        //
        //   • "the line sits at the PRE-write value → refused" is unsound: a host RESTORING that
        //     value after our write landed reads exactly the same (the T43 ordering, on this path);
        //   • "the cart is frozen → refused" is unsound: a freeze describes the cart at RE-READ time,
        //     so a host who overwrites our line and THEN starts checkout reads as a refusal of a
        //     write that committed. The freeze is still TOLD — the lock/settle banner speaks it on
        //     the edge this re-read applied — it just is not offered as the reason this write failed.
        //
        // ⚠️ THIS DOES NOT RE-CREATE #251's STALE-ABSOLUTE-QUANTITY P1, which is what kept the row
        // filed: `AddButton`'s queue reads `threaded ?? refreshed ?? (prior === null ? itemsRef.current
        // : null)`, so an `unconfirmed` op (no view) makes the NEXT op re-read, and sends nothing when
        // that read fails too (Codex round 6 on #251). And no consumer re-sends a `setItemQty` — the
        // stepper is the only caller — so `refused` bought nothing here that `unconfirmed` loses.
        const now = fresh?.find((i) => i.id === cartItemId);
        const atTarget = fresh !== null && (qty <= 0 ? now === undefined : now?.qty === qty);
        const result = recoveredWrite({
          reread: fresh,
          landed: atTarget ? true : null,
          viewIsCurrent,
        });
        // `refused` is unreachable on this path by construction (the landing is `true` or `null`),
        // so a write that is not confirmed is retracted — never explained as a refusal.
        // F30 (lifecycle audit) — the retraction NAMES the dish, as `add`'s does: with rows in flight a
        // bare "We couldn’t confirm that" does not say which "−" it is about. Codex A (#362): from
        // the re-read when it has the line, else from the rows held when the tap was made (`line`,
        // captured before the write) — a FAILED re-read is exactly the case F30 exists for. Session
        // truth: a table this write found ENDED (`held`) names its cause too, as `add`'s does.
        if (result.state === "unconfirmed") publishUnconfirmed(now?.name ?? line?.name, held);
        return result;
      } finally {
        setPendingDelta((d) => d - delta);
        settleOwn(); // idempotent — every path above already settled it
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
      holdPending,
    ],
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

  // Lifecycle audit (diner-live-status 3) — a REMOVED line is not counted: the bar's subtotal
  // already excludes it, and "1 · View order · $0.00" after staff took the only dish off was the
  // count and the money disagreeing on one bar. `orderUnitCount` is the bar's own confirmed count.
  const count = Math.max(0, orderUnitCount(items) + pendingDelta);
  /**
   * MEMOISED on primitives, because a fresh object here defeats the whole context memo below.
   *
   * As a bare literal this minted a new `me` on every render, so `ctxValue`'s dependency array
   * changed every time and `useMemo` could never hit — every consumer re-rendered exactly as if the
   * memo were not there. Found by the context-identity test rather than by reading: the memo was in
   * place and the identity still moved.
   */
  const me = useMemo(
    () => (session ? { seat: session.seat, name } : null),
    [session?.seat, name, session],
  );
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
  // (`prevLocked` is declared beside `prevSettling`, above.)
  useEffect(() => {
    if (locked === prevLocked.current) return;
    prevLocked.current = locked;
    // T33 — the release edge clears what a refusal explained, so a fact that has ended can no longer
    // silence anything. Without it, peer-releases-then-re-locks leaves a stale axis suppressing a
    // banner about a freeze the diner was never told about.
    //
    // ⚠️ SCOPED TO THIS AXIS (Codex round 1 on #256, P2). An unconditional clear discards a SETTLING
    // explanation when the LOCK lifts — reachable when one recovery view carries the whole handoff
    // ({locked, !settling} → {!locked, settling}), where the refusal is classified `settling` and
    // this effect runs first. The settle-enter callback would then see null and overwrite the
    // detailed refusal with the generic banner: the exact collision this slice removes, rebuilt by
    // its own cleanup.
    if (!locked && explainedFreezeRef.current?.axis === "locked") explainedFreezeRef.current = null;
    const msg = !locked
      ? // ⚠️ THE RELEASE IS NOT ALWAYS AN INVITATION (blind pass on this PR). `locked` and `settling`
        // are independent columns, so a pay-lock can lift while the table is still splitting — and
        // "you can edit again" is then false: every `addItem`/`setQty` still refuses on `settling`.
        // The copy predates this slice, but rule 1 now PINS the release as always-spoken, so the
        // false case would have been guarded in rather than merely left standing.
        settling
        ? "Checkout ended — the order stays locked while your table splits the bill"
        : "The order’s unlocked — you can edit again"
      : lockedByYou
        ? "You’re checking out — the order’s locked"
        : `${lockedByName ?? "Someone"} is checking out — the order’s locked`;
    // T33 — decided AT SPEAK TIME, inside the microtask, not before deferring. The slot is
    // last-writer-wins and this callback is the last writer; asking earlier would answer about a
    // moment that is not the one the sentence lands in.
    void Promise.resolve().then(() => {
      if (
        freezeBannerSuppressed({
          axis: "locked",
          entering: locked,
          explained: explainedFreezeRef.current,
          // `lockedByYou` is the RENDERED binding — the one `msg` above was composed from — so the
          // suppression is asked about the very sentence that would otherwise take the slot.
          current: { locked, settling: settlingRef.current, lockedByYou },
        })
      )
        return;
      flash(msg, 2600);
    });
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
    // T33 — same release-clears-the-fact rule as the lock edge above, and SCOPED the same way: a
    // settle release must not discard a lock explanation that is still true.
    if (!settling && explainedFreezeRef.current?.axis === "settling")
      explainedFreezeRef.current = null;
    // Session truth (finding 2) — WHOSE freeze it is decides the words: with the self-serve split
    // parked only the register takes it, so this speaks the register's own sentence, and a release
    // without a payment is its own — never "the split was called off" (`settleEdgeNotice`).
    const msg = settleEdgeNotice(settling, surfaceOpen("selfServeSplit"));
    void Promise.resolve().then(() => {
      if (
        freezeBannerSuppressed({
          axis: "settling",
          entering: settling,
          explained: explainedFreezeRef.current,
          current: {
            locked: freezeRef.current.locked,
            settling,
            lockedByYou: cartFreeze(freezeRef.current) === "self",
          },
        })
      )
        return;
      flash(msg, 2600);
    });
  }, [settling, flash]);

  /**
   * MEMOISED, and the arrow that used to sit in here is now a `useCallback`.
   *
   * This value was a fresh object literal on every render of the provider, which holds eleven pieces
   * of state that change during ordering (`items`, `totals`, `pendingDelta`, `notice`, `locked`,
   * `settling`, `members`, `name`, …). `MenuBrowser` consumes this context and owns the menu grid,
   * and there is no `React.memo` on the cards — so every one of those state changes reconciled all
   * ~97 `<li>` subtrees, each carrying a framer-motion button, a `next/image` and a re-computed
   * badge list. Roughly six full-grid reconciles per Add tap, and the same cost on a category tab,
   * a diet pill, a search keystroke and a sheet open — none of which touch the network at all.
   *
   * `GroceryBrowse` already learned this lesson for the ~400-SKU grid and says so in its own comment
   * ("memo'd with stable parent callbacks so typing in the page-level search box … doesn't
   * re-render the ~400-card grid"); the menu never got the same treatment.
   *
   * ⚠️ Every function in here must stay a stable callback: an inline arrow mints a new identity on
   * every render, which defeats this memo entirely (the retired `lastRefusalClause` was the case
   * that taught it).
   */
  const ctxValue = useMemo(
    () => ({
      cartId,
      mode,
      loading,
      error,
      errorReason,
      items,
      totals,
      count,
      add: trackedAdd,
      setItemQty: trackedSetItemQty,
      settled,
      drain,
      refresh,
      revalidate,
      announce: flash,
      pickupSlot,
      isGroup,
      members,
      me,
      role: session?.role ?? null,
      joinCode: session?.joinCode ?? null,
      // 3c-ii (D30) — the latest confirmed view's number first, the mint's own while none has.
      tableNumber:
        (viewTable && viewTable.cartId === cartId ? viewTable.n : null) ??
        session?.tableNumber ??
        null,
      setName,
      locked,
      lockedByName,
      lockedByYou,
      settling,
      sendNudge,
      dbNow,
      ended: endedNow,
      endedCartId,
      restarting,
      startNewOrder,
      soldOutMarks,
    }),
    [
      cartId,
      mode,
      loading,
      error,
      errorReason,
      items,
      totals,
      count,
      trackedAdd,
      trackedSetItemQty,
      settled,
      drain,
      refresh,
      revalidate,
      flash,
      pickupSlot,
      isGroup,
      members,
      me,
      session?.role,
      session?.joinCode,
      session?.tableNumber,
      viewTable,
      setName,
      locked,
      lockedByName,
      lockedByYou,
      settling,
      sendNudge,
      dbNow,
      endedNow,
      endedCartId,
      restarting,
      startNewOrder,
      soldOutMarks,
    ],
  );

  const soloRetrying = !isGroup && soloRetryTick > 0 && loading;
  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      {/* Recovery affordance for SOLO modes (scan-&-go / pickup). If a session mint — or a re-mint
          after a failed cart op — fails, `cartId` is null and taps silently no-op; without this the
          diner is stranded behind an auto-clearing toast. Dine-in surfaces the same recovery in
          GuestList (group-aware copy); this fills the gap GuestList's `!isGroup → null` leaves.
          J18 — `soloRetrying` keeps it MOUNTED through the re-mint: `revalidate()` clears `error`,
          and a banner gated on it alone deleted the button under the finger (focus to <body>, nothing
          said, the banner silently back on a second failure). */}
      {(error || soloRetrying) && !isGroup && (
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
            fontWeight: "var(--fw-bold)",
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
          {/* The text CHANGES on retry, so the alert narrates the attempt — and changes again when
              the failure returns, which is what makes a repeat failure audible at all. */}
          {soloRetrying ? "Reconnecting to your order…" : "Couldn’t reach your order."}{" "}
          <button
            type="button"
            // `aria-disabled`, never `disabled`: a disabled button leaves the focus order, and the
            // keyboard user who just pressed it would lose their place.
            aria-disabled={soloRetrying || undefined}
            onClick={() => {
              if (soloRetrying) return;
              setSoloRetryTick((n) => n + 1);
              revalidate();
            }}
            style={{
              minHeight: 44,
              padding: "0 4px",
              background: "none",
              border: "none",
              color: "var(--warn)",
              fontWeight: "var(--fw-heavy)",
              fontSize: "var(--fs-sm)",
              textDecoration: "underline",
              cursor: soloRetrying ? "progress" : "pointer",
            }}
          >
            {soloRetrying ? "Reconnecting…" : "Try again"}
          </button>
        </p>
      )}
      {/* Phase 0 — the ONE diner toast (`@mms/ui` Toast): always-mounted live region, docked on the
          published CTA band (`--cta-dock-h`, which CartBar writes) instead of the hard 84px that
          assumed one bar height. The MY half rides its own lang="my" span on the Padauk stack inside
          the primitive. Phase 1c — keyed on the monotonic `seq`, not the text, so a repeated
          sentence is announced again; `quiet` claims are spoken through this same region and drawn
          nowhere (a change the diner can already see where they tapped). */}
      <Toast
        message={
          notice ? { key: notice.seq, text: notice.text, my: notice.my, quiet: notice.quiet } : null
        }
        leaving={noticeLeaving}
      />
    </Ctx.Provider>
  );
}
