"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Button, Icon, Toast, buttonClass, categoryIconName, useSheetSubject } from "@mms/ui";
import Link from "next/link";
import { tableDisplay, type TableDetail, type TableLineView } from "@/lib/floor-types";
import { staffSetQty } from "@/lib/staff-cart";
import { setCartCustomerName } from "@/lib/register";
import { track } from "@/lib/bounded-write";
import { counterAskLive } from "@/lib/counter-pay-state";
import { raceTimeout } from "@/lib/staff-outage";
import { useCtaDock } from "@/lib/hooks/useCtaDock";
import {
  sendHoldFrom,
  sendHoldMsg,
  sendRefusalMsg,
  staffSendView,
  type SendNotice,
  type StaffKeyMsg,
  type StaffLineEdit,
  type StaffSendHold,
} from "@/lib/staff-send-view";
import { heldAfter, keyForAttempt, type HeldAddKey } from "@/lib/staff-add-key";
import {
  padAmountsSettled,
  padCategories,
  padDishName,
  padPickCat,
  padSections,
  padCounterDock,
  padSendView,
  padSettle,
  padSettleBusyKey,
  padSettleReason,
  padSettleStartPhase,
  padTileBlock,
  ticketUnitsByItem,
  tileAction,
  unsavedNoteFrom,
  // ── Phase 2c · review fixes · pad2 ──
  padDishHold,
  padNameReconcile,
  padNameSave,
  padViewStatus,
  type PadNameSync,
  type PadCatalogItem,
  type PadLineWrites,
  type PadReasonCtx,
  type PadSettleInput,
  type PadSettlePhase,
} from "@/lib/order-pad";
import {
  pendingBlocker,
  pendingCounts,
  pendingUnitsByItem,
  unreadAfterCommit,
  type PendingAdd,
} from "@/lib/pad-pending";
import {
  padAddNotice,
  padAttemptOutcome,
  padSendNotice,
  padSentenceNotice,
  padSlotNotice,
  type PadMsg,
} from "@/lib/pad-errors";
import { plural } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { haptic } from "@/lib/haptics";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { useStaffLang } from "./StaffLangProvider";
import { StaffBar } from "./StaffBar";
import { Chrome } from "./Chrome";
import { MsgText } from "./StaffMsg";
import { PadTile } from "./PadTile";
import { StaffTicket } from "./StaffTicket";
import { StaffSendButton, counterSentMsg } from "./StaffSendButton";
import { StaffModSheet, type StaffSheetFailure } from "./StaffModSheet";
import { useStaffSend } from "./useStaffSend";
import { usePadDetailLive } from "./usePadDetailLive";
import { usePadWrites } from "./usePadWrites";
import { usePadNotices } from "./usePadNotices";
import { useReloadHold } from "./useReloadHold";
import { draftHeld } from "@/lib/reload-guard";
// ── Phase 2d · split ──
import {
  PANE_QUERY,
  markSealLanding,
  paneUrl,
  stashHandoff,
  tableDestination,
} from "@/lib/floor-pane";
// ── PD6 · K39 — the walk-up sale stays on the pad ──
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import { settleUnknownAfterRead } from "@/lib/register-math";
import type { Handoff } from "@/lib/register-ui";
import type { StaffLang } from "@/lib/staff-lang";
import { SEAL_OFFERS_WALKUP, tillSlipFrom } from "@/lib/till";
import { CashSettleButton, type CashSettled, type TillDoor } from "./CashSettleButton";
import { HandoffCard } from "./HandoffCard";
import { CounterMintProvider, useCounterMint, type MintNotice } from "./CounterMint";
import { SealWalkUp } from "./SealWalkUp";

/** Phase 2d · split — is the counter's pane where a way back to this table lands? Read at TAP time. */
const splitNow = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(PANE_QUERY).matches;

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A Take payment whose navigation never lands (a dropped push) comes back to idle after this long,
 *  so the button cannot stay busy for good. A starting value, unmeasured on a device. */
const SETTLE_OPEN_RESET_MS = 10_000;

/** The ticket's line editors, as the pad holds them: the Send's hold, the note Take payment waits
 *  on, and how many line writes are in flight. */
type LineState = {
  send: StaffSendHold;
  note: { lineId: string; name: string } | null;
  writing: number;
};
const NO_LINES: LineState = { send: null, note: null, writing: 0 };

/** An add whose fate is unknown, as the Send's hold names it. */
const addHold = (p: PendingAdd, name: string): NonNullable<StaffSendHold> => ({
  kind: "add",
  name,
  state: p.state === "lost" ? "lost" : "unconfirmed",
});

/** The catalog as the page read it: the dishes, or an outage (the ORDER still works). */
export type PadCatalog = { kind: "ok"; items: PadCatalogItem[] } | { kind: "outage" };

/**
 * Phase 2c · pad — the ORDER PAD (DESIGN-LANGUAGE §28): a server or the counter builds an order in
 * seconds, on a tablet or a phone. Dish TILES beside ONE live ticket, with the Send and Take payment
 * always in reach. An app shell, not a scrolling document: the bar on top, the panes scrolling
 * beneath it.
 *
 * What it composes, and who owns what:
 *   • the table's live detail — `usePadDetailLive` (a seq-ordered read; the pad's own topic);
 *   • the add chain — `usePadWrites` (serialized, one add key per tap, 15s → "Checking…");
 *   • the Send — the table page's controller, REUSED: `useStaffSend` owned HERE (a refresh or a view
 *     swap cannot kill an open undo) and `StaffSendButton` as its view, with the add chain drained
 *     before every fire;
 *   • Take payment — `padSettle` decides; a tap drains the chain, saves a typed counter name, then
 *     NAVIGATES to the table's payment section (`?settle=1`) — at a dine-in table. PD6 (K39, §28's
 *     one exception): on a COUNTER order the door is "Take cash · $X" itself (`CashSettleButton`,
 *     the one cash sheet), its tap runs the same holds and drains as the pad's GATE (`door`), the
 *     crowned till tray opens in place, and a landed settle stands the SEAL where the pad was —
 *     stashed for a same-tab reload (Codex correction 4), the poll paused under it;
 *   • the ONE live region — the Toast, arbitrated (`usePadNotices` over `lib/notice-slot`).
 *
 * Every amount on screen is the server's, and none is shown while an add is pending (§23).
 */
export function OrderPad({
  sessionId,
  initialDetail,
  catalog,
  counterOrder,
  initialName,
  hasPin,
  focusName = false,
}: {
  sessionId: string;
  /** A SEED: the pad owns the detail after mount (it never adopts a re-rendered prop). */
  initialDetail: TableDetail;
  catalog: PadCatalog;
  counterOrder: boolean;
  initialName: string | null;
  hasPin: boolean;
  /** Phase 2f — `?name=1` (the table page's "Add a name →"): land on the counter order's name field
   *  once, then drop the param so a reload does not re-focus. */
  focusName?: boolean;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const pathname = usePathname();
  const readsRef = useRef(0);
  const refreshRef = useRef<() => void>(() => {});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // ── Phase 2c · review fixes · pad2 ── Take payment's phase as a TAP reads it (the state is what
  // renders): a tile, the options sheet and the drain decide from this, never from the last render.
  const phaseRef = useRef<PadSettlePhase>("idle");

  const { shown, leaving, notify } = usePadNotices();
  // A refusal, said once through the one region — the same sentence its hint carries.
  const say = useCallback(
    (m: StaffKeyMsg) => notify(padSlotNotice("correction", m.k, m.vars)),
    [notify],
  );

  // ── the add chain ──────────────────────────────────────────────────────────────────────────────
  const [soldLocal, setSoldLocal] = useState<ReadonlySet<string>>(() => new Set());
  const [pops, setPops] = useState<Readonly<Record<string, number>>>({});
  const [settles, setSettles] = useState<Readonly<Record<string, number>>>({});
  const dishName = useCallback(
    (r: { name: string; nameMy: string | null }) => padDishName(lang, r.name, r.nameMy).lead.text,
    [lang],
  );
  const onLanded = useCallback(() => refreshRef.current(), []);
  const onSignin = useCallback(() => window.location.assign("/staff/login"), []);
  const onRefused = useCallback((itemId: string, soldOut: boolean) => {
    setSettles((s) => ({ ...s, [itemId]: (s[itemId] ?? 0) + 1 }));
    if (soldOut) setSoldLocal((prev) => new Set(prev).add(itemId));
  }, []);
  const writes = usePadWrites({
    sessionId,
    readsRef,
    dishName,
    onLanded,
    onNotice: notify,
    onSignin,
    onRefused,
  });
  // The ticket's own writes (a qty change, a note, a removal) follow the landed ghost's rule: once
  // one answers, the amounts wait for a read that STARTED after it (`unreadAfterCommit`).
  const [lineUnreadSeq, setLineUnreadSeq] = useState<number | null>(null);
  // The START sequence of the read the rendered detail came from (committed with it, one batch) —
  // the counter name's reconcile tells a read that began after its own save from one that did not.
  const [commitSeq, setCommitSeq] = useState(0);
  const markLineUnread = useCallback(() => {
    setLineUnreadSeq(readsRef.current);
    refreshRef.current();
  }, []);
  const { commit: commitAdds } = writes;
  // ── PD6 · K39 — the walk-up sale stays on the pad ──────────────────────────────────────────────
  // The SEAL (a landed counter settle), standing where the pad shell was; while it stands the poll
  // is PAUSED (`pausedRef`, read by the poll when a read would start and when one answers): like a
  // printed receipt, nothing re-reads under it, and the session closing behind its settle never
  // navigates it away. A ref beside the state because the poll reads it outside any render.
  const pausedRef = useRef(false);
  const [seal, setSeal] = useState<Handoff | null>(null);
  // A counter settle whose outcome is UNKNOWN (its answer lost, or still out past the bound): when
  // was it learned, or null. A `closed` read while it stands means the settle most likely landed
  // (the session closes behind it) — said in place, never a bounce to the floor (§29's hold, on the
  // pad). It ends on a read that started after the settle could last land and shows the cart open
  // (`settleUnknownAfterRead`, the table page's own rule).
  const unknownSince = useRef<number | null>(null);
  const readsResolvedRef = useRef(0);
  const [closedUnknown, setClosedUnknown] = useState(false);
  const onClosed = useCallback(() => {
    if (unknownSince.current === null) return false;
    pausedRef.current = true;
    setClosedUnknown(true);
    return true;
  }, []);
  const onCommit = useCallback(
    (readStartSeq: number, read: { startedAtMs: number; cartOpen: boolean }) => {
      commitAdds(readStartSeq);
      setLineUnreadSeq((s) => unreadAfterCommit(s, readStartSeq));
      setCommitSeq(readStartSeq);
      const before = unknownSince.current;
      unknownSince.current = settleUnknownAfterRead(before, read);
      // #334 C1 — a read RESOLVED an unknown settle (nothing was recorded): the till's positive signal.
      if (before !== null && unknownSince.current === null) readsResolvedRef.current += 1;
    },
    [commitAdds],
  );
  const live = usePadDetailLive({
    initial: initialDetail,
    sessionId,
    readsRef,
    onCommit,
    pausedRef,
    onClosed,
  });
  const { refresh } = live;
  useEffect(() => {
    refreshRef.current = () => void refresh();
  }, [refresh]);
  // PD6 — the till's gate waits for a read that STARTED after its last write (an add that landed,
  // a line write, the name it just saved): the tray freezes THAT read's figures, never the last
  // render's. Each waiter is released by the first commit whose start sequence is past its own, in
  // the effect after that commit's render — so the door's control has re-rendered with the new
  // detail before its open runs. Bounded: a read that never answers frees the gate at the hang
  // bound, refused (the pad says so) — never a tray opened over a figure nobody read.
  const commitWaiters = useRef(new Set<{ after: number; done: () => void }>());
  useEffect(() => {
    for (const w of [...commitWaiters.current])
      if (commitSeq > w.after) {
        commitWaiters.current.delete(w);
        w.done();
      }
  }, [commitSeq]);
  const waitFreshRead = useCallback(
    (): Promise<boolean> =>
      new Promise((resolve) => {
        const w = {
          after: readsRef.current,
          done: () => {
            clearTimeout(timer);
            resolve(true);
          },
        };
        const timer = setTimeout(() => {
          commitWaiters.current.delete(w);
          resolve(false);
        }, STAFF_HANG_MS);
        commitWaiters.current.add(w);
        refreshRef.current();
      }),
    [],
  );
  const detail = live.detail;
  const counts = pendingCounts(writes.pending);
  const open = detail.cartId != null && !detail.settled;
  const paying = detail.paymentInFlight;
  const [settlePhase, setSettlePhase] = useState<PadSettlePhase>("idle");
  // Codex round 2 (P2) — the ticket's own writes are closed while Take payment is on its way out
  // (draining, saving the name, opening payment): a quantity change or removal started then would
  // be left pending under a page that is leaving, its refusal or reconciliation said to nobody.
  const canWrite = open && !paying && settlePhase === "idle";
  const blocker = pendingBlocker(writes.pending);
  // A dish on the ticket, named as the console renders it (a hold names a LINE by its id).
  const lineDish = (lineId: string, fallback: string) => {
    const l = detail.lines.find((x) => x.id === lineId);
    return l ? dishName(l) : fallback;
  };

  // A frozen feed is said ONCE per freeze, through the one region ("Not updating" — the bar's own
  // word); the ticket's foot keeps the full frozen-board line after. Scheduled, never synchronous
  // in the effect body.
  const frozen = live.degraded != null;
  useEffect(() => {
    if (!frozen) return;
    const id = setTimeout(() => notify(padSlotNotice("news", "shell.live.stale")), 0);
    return () => clearTimeout(id);
  }, [frozen, notify]);

  // ── the menu: search, the rail, the sections ───────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const items = catalog.kind === "ok" ? catalog.items : [];
  const categories = padCategories(items);
  const { activeCat, sections } = padSections(items, { q, cat });
  const searching = q.trim() !== "";
  const confirmedBy = ticketUnitsByItem(detail.lines);
  const pendingBy = pendingUnitsByItem(writes.pending);

  // The menu outage's "Try again": busy while the page re-reads, and — when the menu is STILL down
  // after it — the outage line again through the one region, so a retry that changed nothing is
  // never silent. Scheduled, never synchronous in the effect body.
  const [retrying, startRetry] = useTransition();
  const [retries, setRetries] = useState(0);
  const saidRetry = useRef(0);
  useEffect(() => {
    if (retrying || retries === saidRetry.current) return;
    const id = setTimeout(() => {
      saidRetry.current = retries;
      if (catalog.kind === "outage") notify(padSlotNotice("correction", "pad.menu.outage"));
    }, 0);
    return () => clearTimeout(id);
  }, [retries, retrying, catalog.kind, notify]);

  // ── the phone's two views (menu | order); a tablet shows both, and CSS decides ────────────────
  const [view, setView] = useState<"menu" | "order">("menu");
  const showOrder = useCallback(() => {
    flushSync(() => setView("order"));
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  const showMenu = useCallback(() => {
    flushSync(() => setView("menu"));
    searchBtnRef.current?.focus({ preventScroll: true });
  }, []);

  // ── the options sheet ──────────────────────────────────────────────────────────────────────────
  const [sheetItem, setSheetItem] = useState<PadCatalogItem | null>(null);
  const mod = useSheetSubject(sheetItem);
  const [sheetError, setSheetError] = useState<StaffSheetFailure | null>(null);
  // Phase 2h (9a) — the options sheet's `busy`: STATE set at the tap and cleared in the `finally`
  // around the pad chain's own BOUNDED `done` (it resolves "unconfirmed" STAFF_HANG_MS after the tap
  // at the latest, even queued behind a hung add) — never a transition's `pending`, which held the
  // sheet until the add ANSWERED (Next's per-tab action queue; LEARNINGS #149 · #200). The ref is
  // the tap-time guard: two taps in one frame both read the render before `sheetBusy` flipped.
  const [sheetBusy, setSheetBusy] = useState(false);
  const sheetFlight = useRef(false);
  // The key held for a retry of the SAME intent after an unknown outcome (`lib/staff-add-key.ts`).
  const heldKey = useRef<HeldAddKey>(null);

  async function addWithChoice(
    item: PadCatalogItem,
    choice: { modifierIds: string[]; qty: number; notes?: string },
  ) {
    if (sheetFlight.current) return;
    setSheetError(null);
    // ── Phase 2c · review fixes · pad2 ── nothing goes on while Take payment is on its way out (P4).
    const leaving = padSettleBusyKey(phaseRef.current);
    if (leaving) {
      setSheetError({ kind: "msg", msg: { k: leaving } });
      return;
    }
    const intent = JSON.stringify([
      item.id,
      [...choice.modifierIds].sort(),
      choice.qty,
      choice.notes ?? "",
    ]);
    // Phase 2a's rule, READ (never restated): the held key when this is a retry of the same intent
    // after an unknown outcome, else a new one. The chain sends a key it already holds again.
    const key = keyForAttempt(heldKey.current, intent, () => crypto.randomUUID());
    // ── Phase 2c · review fixes · pad2 ── a NEW key for a dish whose add is unknown is a second plate
    // if the first landed (P1): refused, naming the fix. The held attempt's own key passes.
    const dishHold = writes.holdFor(item.id, key);
    if (dishHold) {
      setSheetError({ kind: "msg", msg: sendHoldMsg(addHold(dishHold, dishName(dishHold))) });
      return;
    }
    sheetFlight.current = true;
    setSheetBusy(true);
    try {
      // 9b — the add goes through the pad's serialized chain (its own key, its own late answer — the
      // ghost says it), never inside a transition; `done` is bounded by the chain at the tap's 15s.
      const r = writes.attempt(
        key,
        {
          itemId: item.id,
          name: item.nameEn,
          nameMy: item.nameMy,
          qty: choice.qty,
          modifierIds: choice.modifierIds,
          notes: choice.notes,
        },
        { quietRefusal: true },
      );
      const outcome = await r.done;
      const lifetime = padAttemptOutcome(outcome);
      heldKey.current = heldAfter(intent, key, lifetime);
      const unknown = lifetime === "unknown";
      if (outcome === "ok") {
        setSheetItem(null);
        // The origin (the sheet) is gone: the claim is DRAWN, not quiet (§23).
        notify(
          padSlotNotice("claim", "browse.added", { n: choice.qty, x: dishName(itemName(item)) }),
        );
      } else if (unknown) {
        // A retry refused before the ledger says why it could not run (P2); else the sheet's own line.
        setSheetError(writes.retryRefusal(r.key) ?? { kind: "unconfirmed" });
      } else if (outcome === "offline") {
        setSheetError({
          kind: "msg",
          msg: { k: "pad.err.add.offline", vars: { x: dishName(itemName(item)) } },
        });
      } else {
        setSheetError(
          writes.lastRefusal(r.key) ?? {
            kind: "msg",
            msg: { k: "pad.err.add.failed", vars: { x: dishName(itemName(item)) } },
          },
        );
      }
    } finally {
      sheetFlight.current = false;
      setSheetBusy(false); // frees by the bound on every path — the M82 guard parses for it
    }
  }

  // ── tile taps (stable callbacks over the latest state, so the memo'd tiles never re-render
  //    for a callback's identity) ───────────────────────────────────────────────────────────────
  const tapRef = useRef<(id: string, opts: boolean) => void>(() => {});
  useEffect(() => {
    tapRef.current = (id, opts) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      const action = tileAction({
        soldOut: item.soldOut || soldLocal.has(id),
        groups: item.groups,
      });
      const x = dishName(itemName(item));
      if (action === "soldOut") {
        notify(padSlotNotice("correction", "pad.soldOut", { x }));
        return;
      }
      // ── Phase 2c · review fixes · pad2 ── decided AT THE TAP, from refs: the adds and Take
      // payment as they are now (a tap between two renders reads the truth, not the last paint).
      const dishHold = writes.holdFor(id);
      const tileBlock = padTileBlock({
        open,
        paying,
        pending: writes.counts(),
        settling: phaseRef.current !== "idle",
        dishHeld: dishHold !== null,
      });
      if (tileBlock === "closed") {
        notify(padSlotNotice("correction", "pad.settled.note"));
        return;
      }
      if (tileBlock === "paying") {
        notify(padSlotNotice("correction", "pad.paused"));
        return;
      }
      if (tileBlock === "settling") {
        // What Take payment is doing — the reason nothing more goes on (P4).
        const leaving = padSettleBusyKey(phaseRef.current);
        if (leaving) say({ k: leaving });
        return;
      }
      if (tileBlock === "held" && dishHold) {
        // A new tap is a new add key — a second plate if the first landed. The fix is the ghost's
        // Try again (the SAME key) or a reload (P1).
        say(sendHoldMsg(addHold(dishHold, dishName(dishHold))));
        return;
      }
      if (tileBlock === "waiting") {
        // The hung add is what holds the queue (`padTileBlock`): name it, in the Send's words.
        const hung = writes.pending.find((p) => p.state === "unconfirmed");
        say(sendHoldMsg(hung ? addHold(hung, dishName(hung)) : { kind: "writing" }));
        return;
      }
      if (opts || action === "choose") {
        heldKey.current = null;
        setSheetError(null);
        setSheetItem(item);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        notify(padAddNotice("pad.err.add.offline", x));
        return;
      }
      // The add moment (§23): the press, the pop, the buzz, the ghost and the SPOKEN claim, all at
      // the tap; the write follows in tap order. Focus stays on the tile.
      haptic("add");
      setPops((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
      notify(padSlotNotice("claim", "browse.added", { n: 1, x }, { quiet: true }));
      void writes.add({
        itemId: id,
        name: item.nameEn,
        nameMy: item.nameMy,
        qty: 1,
        modifierIds: [],
      }).done;
    };
  });
  const onMain = useCallback((id: string) => tapRef.current(id, false), []);
  const onOpts = useCallback((id: string) => tapRef.current(id, true), []);

  // ── line removals (the ticket's ghost; focus moved by the ticket BEFORE this) ──────────────────
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set());
  // Removals in flight: the REF is what a tap reads (the Send's hold); the state is what renders its
  // hint. Both count down when the removal answers — or when 15s pass without an answer.
  const removals = useRef(0);
  const [removalsLive, setRemovalsLive] = useState(0);
  // Removals whose request is still hung after 15s: Next runs actions one at a time, so every later
  // write waits behind it — the ticket offers "Reload the order" until it answers.
  const [hungRemovals, setHungRemovals] = useState(0);
  // A removal the server confirmed leaves `removing` once the read no longer has the line.
  const lineIds = detail.lines.map((l) => l.id).join("\u0001");
  const [seenLineIds, setSeenLineIds] = useState(lineIds);
  if (seenLineIds !== lineIds) {
    setSeenLineIds(lineIds);
    const present = new Set(detail.lines.map((l) => l.id));
    const kept = [...removing].filter((id) => present.has(id));
    if (kept.length !== removing.size) setRemoving(new Set(kept));
  }
  const onError = useCallback((msg: string) => notify(padSentenceNotice(msg)), [notify]);
  const onRemove = useCallback(
    (line: TableLineView) => {
      setRemoving((prev) => new Set(prev).add(line.id));
      removals.current += 1;
      setRemovalsLive((n) => n + 1);
      const back = () =>
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(line.id);
          return next;
        });
      const raw = staffSetQty(sessionId, { cartItemId: line.id, qty: 0 });
      // The raw request, watched on its own: after a 15s give-up it may still be holding the queue.
      let answered = false;
      let hung = false;
      const onAnswer = () => {
        answered = true;
        if (!hung) return;
        hung = false;
        setHungRemovals((n) => n - 1);
        refreshRef.current(); // the late answer: re-read what it did
      };
      raw.then(onAnswer, onAnswer);
      raceTimeout(raw, "write")
        .then(
          (res) => {
            if (!res.ok) {
              back(); // refused: the row comes back in place, and the region says why
              notify(padSentenceNotice(res.error));
            }
          },
          (e: unknown) => {
            // It threw, or 15s passed with no answer: the removal MAY have landed. Put the row back,
            // say it as unknown (never "not removed"), and re-read — the read is the truth (a line
            // that is gone stays gone). A request still hung holds the queue: offer the reload.
            console.error("[OrderPad] staffSetQty threw or timed out", e);
            back();
            say({ k: "pad.err.remove.unknown", vars: { x: dishName(line) } });
            if (!answered) {
              hung = true;
              setHungRemovals((n) => n + 1);
            }
          },
        )
        .finally(() => {
          removals.current -= 1;
          setRemovalsLive((n) => n - 1);
          markLineUnread(); // re-read now; the amounts wait for a read that started after this
        });
    },
    [notify, say, sessionId, dishName, markLineUnread],
  );

  // ── the counter order's name ───────────────────────────────────────────────────────────────────
  // (Declared before the Send: a counter order's Send needs a name — decision 7c.)
  const [name, setName] = useState(initialName ?? "");
  const [savedName, setSavedName] = useState((initialName ?? "").trim());
  // Codex round 3 (P2) — the server's name, reconciled when it CHANGES (another device set or
  // cleared it): `savedName` always follows it, and the field follows too while it is PRISTINE — a
  // name being typed is never clobbered. Keyed on the change, not the value — and after this pad's
  // own save, on the first read that STARTED after it (Phase 2f review, PT-7): a read already on the
  // wire before the save cannot revert it, and the read after it is the truth even when it carries
  // the old name back (another device wrote it). `padNameReconcile` holds the rule.
  const serverName = (detail.customerName ?? "").trim();
  const [nameSync, setNameSync] = useState<PadNameSync>({ seen: serverName, checkAfter: null });
  const nameNext = padNameReconcile({ server: serverName, sync: nameSync, commitSeq });
  if (nameNext !== null) {
    setNameSync(nameNext);
    setSavedName(serverName);
    if (name.trim() === savedName) setName(serverName);
  }
  const hasName = savedName !== "" || name.trim() !== "";
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Codex round 1 (P2) — the LATEST name, for Take payment's decision after its drain: the field
  // stays editable while it waits, and a render-time `name` captured at the tap would save the old
  // call-out (or skip a new one) and leave with the visible name thrown away. (Phase 2f: the Send's
  // drain reads them too.)
  const nameRef = useRef(name);
  const savedNameRef = useRef(savedName);
  useEffect(() => {
    nameRef.current = name;
    savedNameRef.current = savedName;
  }, [name, savedName]);
  // The latest `saveName` (declared with Take payment, below) for the Send's drain.
  const saveNameRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  // ── the Send (the table page's controller, reused; owned HERE) ─────────────────────────────────
  const sendRaw = staffSendView({
    mode: detail.mode,
    counterOrder,
    cartOpen: open,
    paymentInFlight: paying,
    hostPresent: detail.hostPresent,
    counterAsk: counterAskLive(detail.counterRequestedAt),
    counts: detail.send,
    // Phase 2f · pay at pickup — the arm (a phone order leads with its Send), whether the order has
    // the name it needs to be sent (saved, or typed: the Send's drain saves it first), the switch.
    counterArm: detail.counterArm,
    hasName,
    payAtPickup: detail.payAtPickup,
  });
  // Where a Send can exist at all: an open dine-in table, or (Phase 2f) an open counter order while
  // pay-at-pickup is on — a counter order's Send fires unpaid, so the switch parks it here too.
  const sendable = open && (detail.mode === "dinein" || (counterOrder && detail.payAtPickup));
  const padSend = padSendView(sendRaw, {
    sendable,
    paying,
    pending: counts,
    counter: counterOrder ? { arm: detail.counterArm, hasName } : undefined,
  });
  const lineEdits = useRef(new Map<string, StaffLineEdit>());
  const [lineState, setLineState] = useState<LineState>(NO_LINES);
  const onEditState = useCallback(
    (lineId: string, edit: StaffLineEdit | null) => {
      const was = lineEdits.current.get(lineId);
      if (edit) lineEdits.current.set(lineId, edit);
      else lineEdits.current.delete(lineId);
      // A qty or note write just ANSWERED: its figures are unread until a later read commits.
      if (was?.writing && !edit?.writing) markLineUnread();
      const edits = [...lineEdits.current.values()];
      const next: LineState = {
        send: sendHoldFrom(edits),
        note: unsavedNoteFrom(edits),
        writing: edits.filter((e) => e.writing).length,
      };
      setLineState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    },
    [markLineUnread],
  );
  // A hold as the pad SAYS it: a note names its dish Burmese-first, like every name on the pad.
  const named = (h: StaffSendHold): StaffSendHold =>
    h?.kind === "note" ? { ...h, name: lineDish(h.lineId, h.name) } : h;
  const getHold = (): StaffSendHold => {
    const lines = sendHoldFrom([...lineEdits.current.values()]);
    if (lines) return named(lines);
    if (removals.current > 0) return { kind: "writing" };
    const b = writes.blocker();
    return b ? addHold(b, dishName(b)) : null;
  };
  // What the Send's hint shows — the same order as `getHold`, from rendered state.
  const renderedHold: StaffSendHold = lineState.send
    ? named(lineState.send)
    : removalsLive > 0
      ? { kind: "writing" }
      : blocker
        ? addHold(blocker, dishName(blocker))
        : null;
  // The ticket's own writes, as the amounts and Take payment read them.
  const lineWrites: PadLineWrites = {
    writing: lineState.writing + removalsLive,
    unread: lineUnreadSeq !== null,
  };
  const onSendNotice = useCallback(
    (n: SendNotice | null) => {
      if (n === null) return; // the pad's slot is arbitrated; a new tap does not blank it
      const p = padSendNotice(n);
      if (p === "signin") window.location.assign("/staff/login");
      else notify(p);
    },
    [notify],
  );
  const drain = useCallback(async () => {
    await writes.settled();
    const b = writes.blocker();
    if (b) {
      say(sendHoldMsg(addHold(b, dishName(b))));
      return false;
    }
    // Phase 2f — a counter order's name typed but not saved goes to the server BEFORE the fire: the
    // unpaid send refuses a nameless order in its own statement, and the kitchen ticket and the lane
    // call the bag by the SAVED name. A failed save holds the fire (the pad says why).
    if (counterOrder && nameRef.current.trim() !== savedNameRef.current) {
      if (!(await saveNameRef.current())) {
        notify(padSlotNotice("correction", "pad.nameNotSaved"));
        return false;
      }
    }
    return true;
  }, [writes, say, dishName, counterOrder, notify]);
  const onRefresh = useCallback(() => refreshRef.current(), []);
  const onSendBlocked = useCallback((b: "paying" | "noName") => {
    if (b !== "noName") return;
    flushSync(() => setView("order"));
    nameInputRef.current?.focus();
  }, []);
  const send = useStaffSend({
    sessionId,
    view: padSend.view,
    detailSeq: live.detailSeq,
    degraded: live.degraded != null,
    getHold,
    rootRef: ticketRef,
    onNotice: onSendNotice,
    onRefresh,
    drain,
    // Phase 2f — a no-name tap takes the finger to the name field (the order view first, on a phone).
    onBlocked: onSendBlocked,
  });
  const sendBusy =
    send.phase === "sending" || send.phase === "undoing" || send.phase === "returning";
  // ── Phase 2f · pay at pickup ── a counter order's dock: which control is filled and where each
  // sits (`padCounterDock` — a walk-up leads with Take payment, a phone order with the Send; after
  // everything went unpaid, "Done · Counter"). The Send's slot at its tap holds through its undo.
  const [heldSlot, setHeldSlot] = useState<"primary" | "secondary" | null>(null);
  const counterDock = counterOrder
    ? padCounterDock(send.display.kind === "undo" ? sendRaw : padSend.view, send.phase, heldSlot)
    : null;
  // A note hold on the phone's MENU view: the note field is in the hidden order view, so the view
  // flips first (synchronously) and the controller's focus lands on a field that exists. A REFUSED
  // tap says why, once, through the one region (§17): on a phone the hint under the Send is spoken
  // only — the bar has no room for a sentence — so without this the tap did nothing on screen.
  const onSendTap = () => {
    const h = getHold();
    if (h?.kind === "note") flushSync(() => setView("order"));
    const why = send.phase === "idle" ? sendRefusalMsg(padSend.view, h) : null;
    if (why) say(why);
    // Phase 2f — the Send keeps the dock slot it held at the tap for its whole tap → undo life, so the
    // control never remounts under the finger (`padCounterDock`'s heldSlot).
    if (counterOrder && send.phase === "idle")
      setHeldSlot(counterDock?.primary === "send" ? "primary" : "secondary");
    send.onSend();
  };

  // ── the counter order's name (its state is declared above the Send) ───────────────────────────
  const [savingName, setSavingName] = useState(false);
  const nameDirty = draftHeld(name, savedName);
  // Codex r2 on #311 — a call-out typed and not saved holds a reload for a new version, whether or
  // not its field still has focus (the cashier taps a dish next).
  useReloadHold("unsent", "draft", "counterName", counterOrder && nameDirty);
  // ── Phase 2c · review fixes · pad2 ── Save is never a live-looking no-op (P11).
  const nameSave = padNameSave(name, savedName);
  const saveName = useCallback(async (): Promise<boolean> => {
    const value = nameRef.current.trim();
    setSavingName(true);
    try {
      // Phase 2h (9d) — on the stall ledger until it answers (a hung name write holds the queue).
      const r = await track(setCartCustomerName({ sessionId, name: value }));
      if (!r.ok) {
        // Phase 2f — clearing the name of an order cooking unpaid is refused (the lock, decision
        // 7c): the pad's own sentence, and the field goes back to the name the server holds.
        if (r.code === "keepName") {
          say({ k: "browse.name.keep" });
          setName(savedNameRef.current);
          return false;
        }
        notify(padSentenceNotice(r.error));
        return false;
      }
      setSavedName(value);
      // PT-7 — the first read that STARTS after this answer settles the name (`padNameReconcile`).
      const savedAfter = readsRef.current;
      setNameSync((s) => ({ ...s, checkAfter: savedAfter }));
      notify(
        value
          ? padSlotNotice("news", "browse.name.set", { x: value })
          : padSlotNotice("news", "browse.name.cleared"),
      );
      return true;
    } catch {
      notify(padSlotNotice("correction", "browse.name.failed"));
      return false;
    } finally {
      setSavingName(false);
    }
  }, [sessionId, notify, say, setName, setNameSync]);
  useEffect(() => {
    saveNameRef.current = saveName;
  }, [saveName]);
  // `?name=1` — the name field, focused once; the param dropped so a reload does not re-focus.
  const focusNameOnce = useRef(focusName);
  useEffect(() => {
    if (!focusNameOnce.current) return;
    focusNameOnce.current = false;
    flushSync(() => setView("order"));
    nameInputRef.current?.focus();
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  // ── Take payment ───────────────────────────────────────────────────────────────────────────────
  const settleInFlight = useRef(false);
  // One tap past a failed name save goes on without it (a rushed counter is never blocked on a name).
  const skipName = useRef(false);
  const tab = detail.tab !== "none";
  const settleInput: PadSettleInput = {
    mode: detail.mode,
    open,
    paying,
    itemCount: detail.itemCount,
    settleTotalCents: detail.settleTotalCents,
    pending: counts,
    sendBusy,
    unsavedNote: lineState.note !== null,
    lines: lineWrites,
    settlePhase,
    // Phase 2c · gate — the server's unsent dine-in units; `padSettle` hands them to the gate.
    unsentUnits: detail.send.sendable,
    // Phase 2f — a counter order's Take payment takes the emphasis its dock slot gives it.
    variantOverride: counterDock?.settleVariant,
  };
  const settle = padSettle(settleInput);
  // #334 C2 — the decision's inputs as of the LAST commit, for the till gate's re-check after its
  // awaits (the tapping render's closure cannot see a refused add, or the read the gate waited for).
  const settleInputRef = useRef(settleInput);
  useLayoutEffect(() => {
    settleInputRef.current = settleInput;
  });
  // What a refused Take payment names: the note's dish, the add it waits on (lost or still coming).
  const reasonCtx = (
    note: { lineId: string; name: string } | null,
    b: PendingAdd | null,
  ): PadReasonCtx => ({
    tab,
    note: note ? lineDish(note.lineId, note.name) : null,
    blocker: b ? { name: dishName(b), state: b.state === "lost" ? "lost" : "unconfirmed" } : null,
    // The count `padSettle` refused on: the server's drafts AND the adds still on their way.
    unsent: detail.send.sendable + writes.counts().flying + writes.counts().unseen,
  });
  // The field a note hold points at — in the order view, which a phone shows only after the flip.
  const focusNote = (lineId: string) => {
    flushSync(() => setView("order"));
    Array.from(ticketRef.current?.querySelectorAll<HTMLElement>("[data-note-for]") ?? [])
      .find((el) => el.dataset.noteFor === lineId)
      ?.focus();
  };
  // Take payment's phase: the ref a tap reads and the state that renders, moved together.
  const toPhase = (p: PadSettlePhase) => {
    phaseRef.current = p;
    setSettlePhase(p);
  };
  const stopSettle = () => {
    toPhase("idle");
    settleInFlight.current = false;
  };
  /** A refused Take payment — said once, and on a note hold or the gate's `unsent` the finger goes
   *  to the fix. The pad's door (PD6) says a held tap the same way. */
  const refuseSettle = (
    block: NonNullable<ReturnType<typeof padSettle>["block"]>,
    note: { lineId: string; name: string } | null,
  ) => {
    // Refused: say why, once (§17 — a phone shows the hint to nobody sighted), and on a note hold
    // take the finger to the note: it is where an allergy lives, and leaving would drop it.
    say(padSettleReason(block, reasonCtx(note, writes.blocker())));
    if (block === "note" && note) focusNote(note.lineId);
    // Phase 2c · gate — the fix is the Send: the order view first (on a phone the unsent dishes
    // are listed there, right above the bar's Send), then the Send itself. Nothing jumps — the
    // dock is on screen at every width.
    if (block === "unsent") {
      flushSync(() => setView("order"));
      send.controlRef.current?.focus({ preventScroll: true });
    }
  };
  // PD6 — whether THIS tap's gate saved the typed name (a write the tray's figures must follow).
  const nameSavedAtGate = useRef(false);
  /**
   * Take payment's GATE, re-decided at the tap from refs: the holds, the add chain drained, a typed
   * counter name saved (and the chain drained AGAIN), the note re-read. True when the tap may go on —
   * to the table's payment section at a dine-in table (`onSettle`), or into the till tray on a
   * counter order (`openTillGate`). Every refusal says why and returns false, the phase back to idle.
   */
  const settleGate = async (forTill: boolean): Promise<boolean> => {
    if (settleInFlight.current) return false;
    nameSavedAtGate.current = false;
    // Decided NOW, from what the tap sees (the in-flight guard is a ref read at tap time): the
    // note being typed, the adds, the ticket's own writes.
    const edits = [...lineEdits.current.values()];
    const note = unsavedNoteFrom(edits);
    const now = padSettle({
      ...settleInput,
      pending: writes.counts(),
      unsavedNote: note !== null,
      lines: { ...lineWrites, writing: edits.filter((e) => e.writing).length + removals.current },
    });
    if (!now.enabled) {
      if (now.block) refuseSettle(now.block, note);
      return false;
    }
    settleInFlight.current = true;
    haptic("commit");
    const nameToSave = counterOrder && nameDirty && !skipName.current;
    // Busy in the phase it is actually in: it waits for a dish only while one is on its way. PD6 —
    // the till's door never says "Opening payment…" over nothing: with nothing to drain or save it
    // stays idle, and the tray simply opens.
    const start = padSettleStartPhase({ flying: writes.counts().flying, saveName: nameToSave });
    if (!(forTill && start === "opening")) toPhase(start);
    await writes.settled();
    const b = writes.blocker();
    if (b) {
      say(sendHoldMsg(addHold(b, dishName(b))));
      stopSettle();
      return false;
    }
    // Read AFTER the drain, from the field as it is now (a name typed while it waited is saved).
    const nameNow =
      counterOrder && nameRef.current.trim() !== savedNameRef.current && !skipName.current;
    if (nameNow) {
      toPhase("saving");
      if (!(await saveName())) {
        skipName.current = true;
        notify(padSlotNotice("correction", "pad.nameNotSaved"));
        stopSettle();
        return false;
      }
      nameSavedAtGate.current = true;
      // ── Phase 2c · review fixes · pad2 ── drain AGAIN (P4): the name save was a round trip. No
      // tile or sheet can add while Take payment runs (they refuse on its phase), but the CHAIN is
      // the truth, not the doors — anything in it lands, or is named, before the page leaves.
      await writes.settled();
      const again = writes.blocker();
      if (again) {
        say(sendHoldMsg(addHold(again, dishName(again))));
        stopSettle();
        return false;
      }
    }
    // A note typed while it waited is read again before leaving: the drain can take seconds.
    const late = unsavedNoteFrom([...lineEdits.current.values()]);
    if (late) {
      say(padSettleReason("note", reasonCtx(late, null)));
      focusNote(late.lineId);
      stopSettle();
      return false;
    }
    return true;
  };
  const onSettle = async () => {
    if (!(await settleGate(false))) return;
    // The table page's payment section takes it from here (the one money path — never a second
    // copy of the cash / reader / hand-off flow on this screen). Busy until the route changes, or
    // until SETTLE_OPEN_RESET_MS says the push never landed.
    toPhase("opening");
    // Phase 2d · split — the pane on the counter screen at split width (read at tap time).
    router.push(tableDestination(sessionId, { split: splitNow(), settle: true }));
  };
  // PD6 — the counter door's gate (`TillDoor.beforeOpen`): the pad's own gate, then — when this tap
  // wrote anything the last read cannot have seen (an add that landed but is unread, a line write
  // unread, the name just saved) — a read that STARTED after it, so the tray quotes the cart as it
  // now is. Its phase goes idle before the tray opens (the door is never busy under the tray).
  const lineUnreadNow = useRef<number | null>(null);
  useEffect(() => {
    lineUnreadNow.current = lineUnreadSeq;
  }, [lineUnreadSeq]);
  const openTillGate = async (): Promise<boolean> => {
    if (!(await settleGate(true))) return false;
    const unread =
      nameSavedAtGate.current || writes.counts().unseen > 0 || lineUnreadNow.current !== null;
    if (unread) {
      toPhase("opening");
      if (!(await waitFreshRead())) {
        say({ k: "table.send.hold.writing" });
        stopSettle();
        return false;
      }
    }
    // #334 C2 — the hold RE-DECIDED on the order as it is NOW, by the same decision the tap made
    // (`padSettle`, one binding): a dish refused while it flew is dropped from the chain, which can
    // leave an empty or an unpriced order behind an accepted tap — the tray never opens over a due
    // nobody read; the hold's own words say why.
    const edits = [...lineEdits.current.values()];
    const late = unsavedNoteFrom(edits);
    const nowInput = settleInputRef.current;
    const after = padSettle({
      ...nowInput,
      pending: writes.counts(),
      unsavedNote: late !== null,
      lines: {
        ...nowInput.lines,
        writing: edits.filter((e) => e.writing).length + removals.current,
      },
      settlePhase: "idle",
    });
    if (after.block) {
      stopSettle();
      refuseSettle(after.block, late);
      return false;
    }
    stopSettle();
    return true;
  };
  // PD6 — a landed counter settle: the SEAL stands where the pad was. The stash FIRST (Codex
  // correction 4 — a pure write that survives this pad unmounting, so a same-tab reload finds Cash
  // received and Change: `/add` sends a closed counter session to its table page, whose card adopts
  // it for the same order), then the pause, then the seal.
  const onTillSettled = (h: CashSettled) => {
    const handoff: Handoff = {
      ...h,
      isCounter: true,
      cartId: detail.cartId,
      sentEarly: detail.unpaidSent,
    };
    stashHandoff(sessionId, handoff);
    // m6 B6 — the same-tab RELOAD lands once more (a one-shot note); a later revisit is calm (#334).
    markSealLanding(sessionId, handoff.orderId, Date.now());
    pausedRef.current = true;
    unknownSince.current = null;
    setSeal(handoff);
  };
  const onTillUnknown = useCallback((unknown: boolean) => {
    if (!unknown) unknownSince.current = null;
    else if (unknownSince.current === null) unknownSince.current = Date.now();
  }, []);
  // A push that never lands (dropped, or a page restored from the back-forward cache) must not leave
  // Take payment busy for good: it comes back to idle and a second tap goes again.
  useEffect(() => {
    if (settlePhase !== "opening") return;
    const reset = () => {
      settleInFlight.current = false;
      phaseRef.current = "idle";
      setSettlePhase("idle");
    };
    const id = setTimeout(reset, SETTLE_OPEN_RESET_MS);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset();
    };
    window.addEventListener("pageshow", onShow);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pageshow", onShow);
    };
  }, [settlePhase]);

  // ── focus: when a control in the dock turns into another (Undo → Done), focus stays in the dock ─
  const dockHadFocus = useRef(false);
  const dockKey = `${send.display.kind}:${send.phase}`;
  useEffect(() => {
    if (document.activeElement === document.body && dockHadFocus.current)
      dockRef.current?.querySelector<HTMLElement>(".pad-dock-primary button")?.focus({
        preventScroll: true,
      });
  }, [dockKey]);
  // ── Phase 2c · review fixes · pad2 ── the focus CATCH-ALL (WCAG 2.4.3, P7) — FloorDetailLive's
  // rule on the pad: any read or any add's answer can unmount the control that held focus (a ghost
  // leaving, a row changing, a note editor closing). When focus FELL to <body> after real focus on
  // the pad, it goes to the ticket's heading (the menu's search circle when the phone shows the
  // menu and the heading is hidden) — edge-triggered, so an idle touch device never gets focus
  // planted by the 5s poll, and a control the user moved to is never yanked. Declared AFTER the
  // dock's own restore, which wins when both run.
  const padHadFocus = useRef(false);
  const pendingNow = writes.pending;
  useEffect(() => {
    if (document.activeElement === document.body && padHadFocus.current) {
      headingRef.current?.focus({ preventScroll: true });
      if (document.activeElement === document.body)
        searchBtnRef.current?.focus({ preventScroll: true });
    }
    padHadFocus.current = document.activeElement !== document.body;
  }, [detail, pendingNow]);
  // The phone's dock publishes its MEASURED height, so the one Toast rides above it whatever the
  // labels wrap to (from the tablet tier the dock is not at the bottom, and CSS zeroes the offset).
  useCtaDock(dockRef, true);
  // PD6 — the seal (or the closed-while-unknown notice) takes focus the moment it stands: the sheet
  // has UNMOUNTED (no exit to wait on, M76), so the page is un-hidden and the seal's NAME — Paid ·
  // Change · #CODE — is what focus speaks, once. Never a live region.
  const sealRef = useRef<HTMLElement>(null);
  const sealUp = seal !== null || closedUnknown;
  useEffect(() => {
    if (sealUp) sealRef.current?.focus();
  }, [sealUp]);

  const table = tableDisplay(detail).text;
  const settleReasonId = "pad-settle-why";
  const settleWhy = settle.block
    ? padSettleReason(settle.block, reasonCtx(lineState.note, blocker))
    : null;
  const busyKey = padSettleBusyKey(settlePhase);
  const settleNode = open ? (
    <div className="pad-settle">
      <Button
        variant={settle.variant}
        size="xl"
        block
        busy={settle.busy}
        busyLabel={busyKey ? <Chrome lang={lang} k={busyKey} echo="stack" /> : undefined}
        {...(!settle.enabled && !settle.busy ? { "aria-disabled": true } : {})}
        aria-describedby={settleWhy ? settleReasonId : undefined}
        onClick={() => void onSettle()}
      >
        {settle.showAmount && detail.settleTotalCents !== null ? (
          <Chrome
            lang={lang}
            k={tab ? "pad.settle.tab" : "pad.settle"}
            vars={{ m: fmt(detail.settleTotalCents) }}
            echo="stack"
          />
        ) : (
          <Chrome lang={lang} k="pad.settle.bare" echo="stack" />
        )}
      </Button>
      {settleWhy && (
        <p id={settleReasonId} className="pad-hint">
          <Chrome lang={lang} k={settleWhy.k} vars={settleWhy.vars} echo="stack" />
        </p>
      )}
    </div>
  ) : null;

  // PD6 (K39) — a COUNTER order's door IS the cash settle ("Take cash · $X", one money verb end to
  // end): the pad's holds and busy phases ride it (`door`), its gate is the pad's, the tray opens in
  // place, and the landing stands the seal. The pad's hint under it stays (the held reason); the
  // idle hint is dropped (the receipt right above it says Tax — m6 decision 26).
  const tillDoor: TillDoor = {
    held: settle.block
      ? {
          noteId: settleReasonId,
          onTap: () =>
            refuseSettle(settle.block!, unsavedNoteFrom([...lineEdits.current.values()])),
        }
      : null,
    busy: settle.busy && busyKey ? <Chrome lang={lang} k={busyKey} echo="stack" /> : null,
    showAmount: settle.showAmount && detail.settleTotalCents !== null,
    beforeOpen: openTillGate,
    // m6 B7 — the pad's ONE region says a held tap's sentence; the control mounts no alert here.
    onHeldTap: () => say({ k: "settle.cash.waiting" }),
    // m6 graft 5 — said after the tray is gone, only when an attempt came to nothing recorded.
    onCancelClean: () => notify(padSlotNotice("correction", "settle.cash.cancelClean")),
    // #334 C1 — the pad's own view of a settle it was told is unknown: until a read resolves it
    // (`settleUnknownAfterRead`) or it lands, the tray says nothing reassuring.
    outcomeOpen: () => unknownSince.current !== null,
    readsResolved: () => readsResolvedRef.current,
  };
  const tillNode = open ? (
    <div className="pad-settle">
      <CashSettleButton
        sessionId={sessionId}
        // A held door (unpriced, or an amount still pending) never opens; its trigger reads bare.
        // #334 C2 — null passes as null: the tray's quote is a number by type, so an unpriced read
        // can never be frozen into a due (the gate re-decides the hold on the fresh read first).
        totalCents={detail.settleTotalCents}
        tipBaseCents={detail.settleTipBaseCents}
        intendedTipCents={detail.intendedTipCents}
        isTab={tab}
        handoff
        variant={settle.variant}
        onSettled={onTillSettled}
        onChanged={() => refreshRef.current()}
        onOutcomeUnknown={onTillUnknown}
        readTicket={commitSeq}
        readsStarted={() => readsRef.current}
        slip={tillSlipFrom(detail.lines, lang)}
        door={tillDoor}
      />
      {settleWhy && (
        <p id={settleReasonId} className="pad-hint">
          <Chrome lang={lang} k={settleWhy.k} vars={settleWhy.vars} echo="stack" />
        </p>
      )}
    </div>
  ) : null;

  // Codex round 4 (P2) — `sendable` gates only a NEW Send. An undo already open (this tap's, or one
  // the controller restored from the device after a reload) renders while the cart stays open, even
  // when pay at pickup was parked meanwhile: the switch parks new sends, and the server takes a send
  // in its grace back regardless (`staffUndoFire` — "the session decides the undo's RPC, never the
  // switch"). Gated on `sendable` too, a reload inside the 10s stranded a valid take-back.
  const sendLive =
    (sendable && send.display.kind === "send") || (open && send.display.kind === "undo");
  // The Send slot (dine-in, open): the controller's view while there is something to send or an
  // undo is open; otherwise the way back to the table — "Done · Table N".
  const sendSlot = sendLive ? (
    <StaffSendButton
      lang={lang}
      ctl={{ ...send, onSend: onSendTap }}
      controlRef={send.controlRef}
      statusRef={send.statusRef}
      hold={renderedHold}
      hostName={detail.members.find((m) => m.isHost)?.name ?? null}
      bare={padSend.bare}
    />
  ) : detail.mode === "dinein" ? (
    // Nothing to send (or the order is paid): the way back to the table, never an empty slot.
    <Button
      variant="primary"
      size="xl"
      block
      onClick={() => router.push(tableDestination(sessionId, { split: splitNow() }))}
    >
      <Chrome lang={lang} k="pad.done" vars={{ id: table }} echo="stack" />
    </Button>
  ) : null;
  // Phase 2f — a counter order's Send (pay at pickup) and its way out once everything went unpaid.
  const counterSendNode = sendLive ? (
    <StaffSendButton
      lang={lang}
      ctl={{ ...send, onSend: onSendTap }}
      controlRef={send.controlRef}
      statusRef={send.statusRef}
      hold={renderedHold}
      hostName={null}
      bare={padSend.bare}
    />
  ) : null;
  const counterDone = (
    <Button
      variant="primary"
      size="xl"
      block
      onClick={() => router.push(STAFF_DOOR_TARGET.counter)}
    >
      <Chrome lang={lang} k="pad.done.counter" echo="stack" />
    </Button>
  );
  const counterSlot = (k: "send" | "settle" | "done" | null) =>
    k === "send" ? counterSendNode : k === "settle" ? tillNode : k === "done" ? counterDone : null;
  const dockPrimary = counterDock ? counterSlot(counterDock.primary) : sendSlot;
  const dockSecondary = counterDock ? counterSlot(counterDock.secondary) : settleNode;
  // The status the Send's slot would otherwise speak (to-go at pay · everything sent · a counter
  // order sent unpaid) — a row in the ticket's foot, never a pill.
  const status =
    sendRaw.kind === "allSent" || sendRaw.kind === "togoAtPay" || sendRaw.kind === "counterSent" ? (
      <p className="pad-status">
        <Icon
          name={
            sendRaw.kind === "allSent" ? "check" : sendRaw.kind === "togoAtPay" ? "bag" : "receipt"
          }
          size={18}
          aria-hidden
        />
        <span>
          {sendRaw.kind === "allSent" ? (
            <Chrome lang={lang} k="table.send.allSent" echo="stack" />
          ) : sendRaw.kind === "togoAtPay" ? (
            <Chrome
              lang={lang}
              k={plural(sendRaw.units, "table.send.togoAtPay.one", "table.send.togoAtPay.many")}
              vars={{ n: sendRaw.units }}
              echo="stack"
            />
          ) : (
            // Phase 2f review — names the drafts still unsent, never "sent" over them.
            <Chrome
              lang={lang}
              k={counterSentMsg(detail.send.counterDraft).k}
              vars={counterSentMsg(detail.send.counterDraft).vars}
              echo="stack"
            />
          )}
        </span>
      </p>
    ) : null;

  const shownMsg: PadMsg | null = shown ? shown.msg : null;
  // ── Phase 2c · review fixes · pad2 ── what the adds ARE, never "Adding…" over a lost one (P8).
  const viewStatus = padViewStatus(counts);
  // The view's ONE live region (§17): every claim, correction and send line, arbitrated. PD6 — it
  // stays mounted with the seal, for Walk-up's refusals.
  const toast = (
    <Toast
      message={
        shown && shownMsg !== null
          ? { key: shown.seq, text: <MsgText lang={lang} msg={shownMsg} />, quiet: shown.quiet }
          : null
      }
      leaving={leaving}
    />
  );
  const bar = (
    <StaffBar
      lang={lang}
      title={counterOrder ? "browse.title.counter" : "browse.title.add"}
      leading={
        counterOrder
          ? { kind: "back", href: STAFF_DOOR_TARGET.counter, k: "floor.back" }
          : {
              kind: "back",
              href: `/staff/table/${sessionId}`,
              // Phase 2d · split — at split width the way back is the counter's pane.
              paneHref: paneUrl(sessionId),
              k: "browse.back.table",
              vars: { id: table },
            }
      }
      lock={hasPin}
      live={live.degraded ? "not_updating" : "live"}
    />
  );

  // PD6 — the sale changed SHAPE: the pad shell is UNMOUNTED (not hidden — its tiles, ticket, dock
  // and skip button can take no focus) and the seal stands in its place, focused (above). Or the
  // counter order closed while its settle's outcome was unknown: "most likely went through", said
  // where the settle was, with the way back (§29's hold, on the pad).
  if (seal || closedUnknown)
    return (
      <>
        {bar}
        <div className="pad-sealed">
          {seal ? (
            <CounterMintProvider>
              <PadSeal
                lang={lang}
                handoff={seal}
                sealRef={sealRef}
                onNotice={(n) =>
                  notify(
                    typeof n === "string" ? padSentenceNotice(n) : padSlotNotice("correction", n.k),
                  )
                }
              />
            </CounterMintProvider>
          ) : (
            <section
              ref={sealRef}
              tabIndex={-1}
              aria-labelledby="pad-settle-closed-h"
              className="card card-textured staff-settle-closed"
            >
              {/* `echo={false}`: an aria-labelledby target — both scripts would be the name. */}
              <p id="pad-settle-closed-h" style={{ margin: 0 }}>
                <Chrome lang={lang} k="settle.cash.unknownClosed" echo={false} />
              </p>
              <Link
                href={STAFF_DOOR_TARGET.counter}
                className={buttonClass({ variant: "primary", size: "xl", block: true })}
              >
                <Chrome lang={lang} k="table.detail.handoff.done" echo="stack" />
              </Link>
            </section>
          )}
        </div>
        {toast}
      </>
    );

  return (
    <>
      {/* The FIRST focusable element: a keyboard at the desktop register is not walked through
          ~190 tile stops to reach the order. A button (not an anchor): on a phone the order is the
          other view, so the jump flips it first. */}
      <button type="button" className="pad-skip" onClick={showOrder}>
        <Chrome lang={lang} k="pad.a11y.skipToOrder" />
      </button>
      {bar}
      <div
        className="pad-shell"
        data-view={view}
        data-counter={counterOrder || undefined}
        onFocusCapture={() => {
          padHadFocus.current = true;
        }}
      >
        <div className="pad-tools" data-search={searchOpen ? "open" : undefined}>
          <button
            ref={searchBtnRef}
            type="button"
            className="pad-search-btn staff-press"
            aria-expanded={searchOpen}
            aria-controls="pad-search"
            onClick={() => {
              flushSync(() => setSearchOpen(true));
              searchInputRef.current?.focus();
            }}
          >
            <Icon name="search" size={20} />
            <span className="sr-only">
              <Chrome lang={lang} k="browse.a11y.search" />
            </span>
          </button>
          <div id="pad-search" className="pad-search" role="search">
            <input
              ref={searchInputRef}
              type="search"
              className="pad-search-input"
              value={q}
              enterKeyHint="search"
              autoComplete="off"
              placeholder={ts(lang, "browse.search.placeholder")}
              aria-label={sx(lang, "browse.a11y.search")}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") clearSearch();
              }}
            />
            <button type="button" className="pad-search-clear" onClick={clearSearch}>
              <Icon name="close" size={18} />
              <span className="sr-only">
                <Chrome lang={lang} k="pad.search.clear" />
              </span>
            </button>
          </div>
          <div className="pad-rail" role="group" aria-label={sx(lang, "browse.a11y.categories")}>
            <button
              type="button"
              className="staff-chip"
              aria-pressed={!searching && activeCat === null}
              onClick={() => pickCat(null)}
            >
              {/* No echo on a 44px chip — two scripts cannot legibly stack in one. */}
              <Chrome lang={lang} k="browse.cat.all" />
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                className="staff-chip"
                aria-pressed={activeCat === c.slug}
                onClick={() => pickCat(c.slug)}
              >
                {/* English until the owner-gated `menu_categories.name_my` lands — marked. */}
                <span lang="en">{c.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={tilesRef} className="pad-tiles">
          {paying && open && (
            <p className="pad-banner">
              <Chrome lang={lang} k="pad.paused" echo="stack" />
            </p>
          )}
          {!open && (
            <p className="pad-banner">
              <Chrome lang={lang} k="pad.settled.note" echo="stack" />
            </p>
          )}
          {catalog.kind === "outage" ? (
            <div className="pad-outage">
              <p>
                <Chrome lang={lang} k="pad.menu.outage" echo="stack" />
              </p>
              <Button
                variant="secondary"
                busy={retrying}
                onClick={() => {
                  setRetries((n) => n + 1);
                  startRetry(() => router.refresh());
                }}
              >
                <Chrome lang={lang} k="pad.menu.retry" />
              </Button>
            </div>
          ) : searching && sections[0]?.items.length === 0 ? (
            <div className="pad-empty">
              <p>
                <Chrome lang={lang} k="pad.search.none" vars={{ x: q.trim() }} echo="stack" />
              </p>
              <Button variant="secondary" onClick={clearSearch}>
                <Chrome lang={lang} k="pad.search.clear" />
              </Button>
            </div>
          ) : (
            sections.map((sec) => (
              <section
                key={sec.key}
                className="pad-section"
                {...(sec.title
                  ? { "aria-labelledby": `pad-sec-${sec.key}` }
                  : { "aria-label": sx(lang, "browse.a11y.items") })}
              >
                {sec.title && (
                  <h2 id={`pad-sec-${sec.key}`} className="pad-section-h">
                    <Icon name={categoryIconName(sec.title)} size={18} />
                    <span lang="en">{sec.title}</span>
                  </h2>
                )}
                <ul role="list" className="pad-grid" aria-label={sx(lang, "browse.a11y.items")}>
                  {sec.items.map((i) => {
                    const n = padDishName(lang, i.nameEn, i.nameMy);
                    return (
                      <PadTile
                        key={i.id}
                        id={i.id}
                        lang={lang}
                        lead={n.lead.text}
                        leadLang={n.lead.lang}
                        echo={n.echo?.text ?? null}
                        echoLang={n.echo?.lang ?? null}
                        price={fmt(i.priceCents)}
                        action={tileAction({
                          soldOut: i.soldOut || soldLocal.has(i.id),
                          groups: i.groups,
                        })}
                        confirmed={confirmedBy.get(i.id) ?? 0}
                        pending={pendingBy.get(i.id) ?? 0}
                        block={padTileBlock({
                          open,
                          paying,
                          pending: counts,
                          settling: settlePhase !== "idle",
                          dishHeld: padDishHold(writes.pending, i.id) !== null,
                        })}
                        popKey={pops[i.id] ?? 0}
                        settleKey={settles[i.id] ?? 0}
                        onMain={onMain}
                        onOpts={onOpts}
                      />
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <StaffTicket
          lang={lang}
          sessionId={sessionId}
          detail={detail}
          pending={writes.pending}
          amountsSettled={padAmountsSettled(counts, lineWrites)}
          degraded={live.degraded}
          nowMs={live.nowMs}
          showReload={counts.unconfirmed + counts.lost > 0 || hungRemovals > 0}
          onReload={() => window.location.reload()}
          headingRef={headingRef}
          rootRef={ticketRef}
          counterName={
            counterOrder && open
              ? {
                  value: name,
                  onChange: setName,
                  onSave: () => {
                    if (savingName) return;
                    // Nothing typed and nothing saved: refused, and the tap says why (§17).
                    if (nameSave === "empty") say({ k: "pad.name.empty" });
                    if (nameSave !== "save") return;
                    void saveName();
                  },
                  saving: savingName,
                  saved: nameSave === "saved",
                  empty: nameSave === "empty",
                  inputRef: nameInputRef,
                }
              : null
          }
          foot={status}
          canWrite={canWrite}
          removing={removing}
          onRemove={onRemove}
          onResend={(key) => void writes.resend(key)}
          onError={onError}
          onEditState={onEditState}
        />

        <div
          ref={dockRef}
          className="pad-dock"
          onFocusCapture={() => {
            dockHadFocus.current = true;
          }}
          onBlurCapture={(e) => {
            const to = e.relatedTarget;
            if (to instanceof Node && !dockRef.current?.contains(to)) dockHadFocus.current = false;
          }}
        >
          <button
            type="button"
            className="pad-view staff-press"
            onClick={view === "menu" ? showOrder : showMenu}
          >
            <Icon name={view === "menu" ? "chevron-up" : "chevron-down"} size={20} />
            {view === "menu" ? (
              <span>
                <Chrome
                  lang={lang}
                  k={plural(detail.itemCount, "pad.bar.order.one", "pad.bar.order.many")}
                  vars={{ n: detail.itemCount }}
                />
                {viewStatus && (
                  <>
                    {" · "}
                    <Chrome lang={lang} k={viewStatus} />
                  </>
                )}
              </span>
            ) : (
              <Chrome lang={lang} k="pad.bar.menu" />
            )}
          </button>
          {/* ONE node each for the Send and Take payment, placed by CSS per tier: on a phone the
              primary slot rides the bar and a table's Take payment shows above it in the order
              view; from the tablet tier both sit under the ticket, the Send first. */}
          <div className="pad-dock-primary">{dockPrimary}</div>
          {dockSecondary && <div className="pad-dock-settle">{dockSecondary}</div>}
        </div>
      </div>

      {/* The view's ONE live region (§17): every claim, correction and send line, arbitrated. */}
      {toast}

      {/* M76 — the dish is HELD through the exit; `key` makes every open a fresh sheet. */}
      {mod.held && (
        <StaffModSheet
          key={mod.key}
          open={mod.open}
          onOpenChange={(o) => {
            if (!o) {
              setSheetItem(null);
              setSheetError(null);
            }
          }}
          itemName={mod.held.nameEn}
          itemNameMy={mod.held.nameMy}
          basePriceCents={mod.held.priceCents}
          groups={mod.held.groups}
          busy={sheetBusy}
          error={sheetError}
          lang={lang}
          onAdd={(choice) => addWithChoice(mod.held!, choice)}
        />
      )}
    </>
  );

  function clearSearch() {
    flushSync(() => {
      setQ("");
      setSearchOpen(false);
    });
    // Back to the circle that opened it — or the field itself where the field is always shown.
    const btn = searchBtnRef.current;
    if (btn && btn.offsetParent !== null) btn.focus();
    else searchInputRef.current?.focus();
  }

  function pickCat(slug: string | null) {
    haptic("pick");
    setQ("");
    setSearchOpen(false);
    // Against what is SHOWN (`activeCat` is null during a search), never the stored choice.
    setCat(padPickCat(activeCat, slug));
    tilesRef.current?.scrollTo?.({ top: 0 });
  }
}

function itemName(i: PadCatalogItem) {
  return { name: i.nameEn, nameMy: i.nameMy };
}

/**
 * PD6 — the pad's seal, inside its ONE mint lock (`CounterMintProvider`, mounted around it, so
 * Walk-up is the only start control on this screen): the landed sale's seal, Walk-up as its quiet
 * secondary (one constant, `SEAL_OFFERS_WALKUP`), and — while the next start is unanswered past its
 * bound — "Back to the counter" as a full-document `<a>`, so the way out also clears the stuck queue.
 */
function PadSeal({
  lang,
  handoff,
  sealRef,
  onNotice,
}: {
  lang: StaffLang;
  handoff: Handoff;
  sealRef: RefObject<HTMLElement | null>;
  onNotice: (n: MintNotice) => void;
}) {
  const { waiting } = useCounterMint();
  return (
    <HandoffCard
      ref={sealRef}
      lang={lang}
      handoff={handoff}
      landing
      next={SEAL_OFFERS_WALKUP ? <SealWalkUp lang={lang} onNotice={onNotice} /> : undefined}
      nativeBack={waiting !== null}
    />
  );
}
