"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Icon, Toast, categoryIconName, useSheetSubject } from "@mms/ui";
import { tableDisplay, type TableDetail, type TableLineView } from "@/lib/floor-types";
import { staffSetQty } from "@/lib/staff-cart";
import { setCartCustomerName } from "@/lib/register";
import { counterAskLive } from "@/lib/counter-pay-state";
import {
  sendHoldFrom,
  staffSendView,
  type SendNotice,
  type StaffLineEdit,
  type StaffSendHold,
} from "@/lib/staff-send-view";
import { heldAfter, type HeldAddKey } from "@/lib/staff-add-key";
import {
  padAmountsSettled,
  padCategories,
  padDishName,
  padSections,
  padSendView,
  padSettle,
  padTileBlock,
  ticketUnitsByItem,
  tileAction,
  type PadCatalogItem,
} from "@/lib/order-pad";
import { pendingCounts, pendingUnitsByItem } from "@/lib/pad-pending";
import {
  padAddNotice,
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
import { StaffSendButton } from "./StaffSendButton";
import { StaffModSheet, type StaffSheetFailure } from "./StaffModSheet";
import { useStaffSend } from "./useStaffSend";
import { usePadDetailLive } from "./usePadDetailLive";
import { usePadWrites, type PadAddOutcome } from "./usePadWrites";
import { usePadNotices } from "./usePadNotices";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
 *     NAVIGATES to the table's payment section (`?settle=1`): the pad never takes money itself;
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
}: {
  sessionId: string;
  /** A SEED: the pad owns the detail after mount (it never adopts a re-rendered prop). */
  initialDetail: TableDetail;
  catalog: PadCatalog;
  counterOrder: boolean;
  initialName: string | null;
  hasPin: boolean;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const readsRef = useRef(0);
  const refreshRef = useRef<() => void>(() => {});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const { shown, leaving, notify } = usePadNotices();

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
  const live = usePadDetailLive({
    initial: initialDetail,
    sessionId,
    readsRef,
    onCommit: writes.commit,
  });
  const { refresh } = live;
  useEffect(() => {
    refreshRef.current = () => void refresh();
  }, [refresh]);
  const detail = live.detail;
  const counts = pendingCounts(writes.pending);
  const open = detail.cartId != null && !detail.settled;
  const paying = detail.paymentInFlight;
  const canWrite = open && !paying;
  const tileBlock = padTileBlock({ open, paying, pending: counts });
  const blocker = writes.pending.find((p) => p.state === "unconfirmed" || p.state === "lost");

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
  const [pending, startTransition] = useTransition();
  // The key held for a retry of the SAME intent after an unknown outcome (`lib/staff-add-key.ts`).
  const heldKey = useRef<HeldAddKey>(null);

  function addWithChoice(
    item: PadCatalogItem,
    choice: { modifierIds: string[]; qty: number; notes?: string },
  ) {
    setSheetError(null);
    const intent = JSON.stringify([
      item.id,
      [...choice.modifierIds].sort(),
      choice.qty,
      choice.notes ?? "",
    ]);
    const held = heldKey.current;
    startTransition(async () => {
      let key: string | null;
      let outcome: PadAddOutcome;
      if (held !== null && held.intent === intent) {
        key = held.key;
        outcome = await writes.resend(held.key);
      } else {
        const r = writes.add(
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
        key = r.key;
        outcome = await r.done;
      }
      const unknown = outcome === "unknown" || outcome === "unconfirmed";
      heldKey.current = key && unknown ? heldAfter(intent, key, "unknown") : null;
      if (outcome === "ok") {
        setSheetItem(null);
        // The origin (the sheet) is gone: the claim is DRAWN, not quiet (§23).
        notify(
          padSlotNotice("claim", "browse.added", { n: choice.qty, x: dishName(itemName(item)) }),
        );
      } else if (unknown) {
        setSheetError({ kind: "unconfirmed" });
      } else if (outcome === "offline") {
        setSheetError({
          kind: "msg",
          msg: { k: "pad.err.add.offline", vars: { x: dishName(itemName(item)) } },
        });
      } else {
        setSheetError(
          writes.lastRefusal(key) ?? {
            kind: "msg",
            msg: { k: "pad.err.add.failed", vars: { x: dishName(itemName(item)) } },
          },
        );
      }
    });
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
      if (tileBlock === "closed") {
        notify(padSlotNotice("correction", "pad.settled.note"));
        return;
      }
      if (tileBlock === "paying") {
        notify(padSlotNotice("correction", "pad.paused"));
        return;
      }
      if (tileBlock === "waiting") {
        notify(
          padSlotNotice("correction", "table.send.hold.add", {
            x: blocker ? dishName(blocker) : x,
          }),
        );
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
  const removals = useRef(0);
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
      const back = () =>
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(line.id);
          return next;
        });
      staffSetQty(sessionId, { cartItemId: line.id, qty: 0 })
        .then(
          (res) => {
            if (!res.ok) {
              back(); // refused: the row comes back in place, and the region says why
              notify(padSentenceNotice(res.error));
            }
          },
          (e: unknown) => {
            // The answer was lost: the removal may have landed. Put the row back and re-read — the
            // read is the truth (a line that is gone stays gone).
            console.error("[OrderPad] staffSetQty threw", e);
            back();
            notify(padSentenceNotice("Couldn’t update that — check the connection and try again."));
          },
        )
        .finally(() => {
          removals.current -= 1;
          refreshRef.current();
        });
    },
    [notify, sessionId],
  );

  // ── the Send (the table page's controller, reused; owned HERE) ─────────────────────────────────
  const sendRaw = staffSendView({
    mode: detail.mode,
    counterOrder,
    cartOpen: open,
    paymentInFlight: paying,
    hostPresent: detail.hostPresent,
    counterAsk: counterAskLive(detail.counterRequestedAt),
    counts: detail.send,
  });
  const sendable = detail.mode === "dinein" && open;
  const padSend = padSendView(sendRaw, { sendable, paying, pending: counts });
  const lineEdits = useRef(new Map<string, StaffLineEdit>());
  const [lineHold, setLineHold] = useState<StaffSendHold>(null);
  const onEditState = useCallback((lineId: string, edit: StaffLineEdit | null) => {
    if (edit) lineEdits.current.set(lineId, edit);
    else lineEdits.current.delete(lineId);
    const next = sendHoldFrom([...lineEdits.current.values()]);
    setLineHold((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const getHold = useCallback((): StaffSendHold => {
    const lines = sendHoldFrom([...lineEdits.current.values()]);
    if (lines) return lines;
    if (removals.current > 0) return { kind: "writing" };
    const b = writes.blocker();
    return b ? { kind: "add", name: dishName(b) } : null;
  }, [writes, dishName]);
  const renderedHold: StaffSendHold =
    lineHold ?? (blocker ? { kind: "add", name: dishName(blocker) } : null);
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
      notify(padSlotNotice("correction", "table.send.hold.add", { x: dishName(b) }));
      return false;
    }
    return true;
  }, [writes, notify, dishName]);
  const onRefresh = useCallback(() => refreshRef.current(), []);
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
  });
  const sendBusy =
    send.phase === "sending" || send.phase === "undoing" || send.phase === "returning";
  // A note hold on the phone's MENU view: the note field is in the hidden order view, so the view
  // flips first (synchronously) and the controller's focus lands on a field that exists.
  const onSendTap = useCallback(() => {
    const h = getHold();
    if (h?.kind === "note") flushSync(() => setView("order"));
    send.onSend();
  }, [getHold, send]);

  // ── the counter order's name ───────────────────────────────────────────────────────────────────
  const [name, setName] = useState(initialName ?? "");
  const [savedName, setSavedName] = useState((initialName ?? "").trim());
  const [savingName, setSavingName] = useState(false);
  const nameDirty = name.trim() !== savedName;
  const saveName = useCallback(async (): Promise<boolean> => {
    const value = name.trim();
    setSavingName(true);
    try {
      const r = await setCartCustomerName({ sessionId, name: value });
      if (!r.ok) {
        notify(padSentenceNotice(r.error));
        return false;
      }
      setSavedName(value);
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
  }, [name, sessionId, notify]);

  // ── Take payment ───────────────────────────────────────────────────────────────────────────────
  const [settlePhase, setSettlePhase] = useState<"idle" | "draining" | "saving">("idle");
  const settleInFlight = useRef(false);
  // One tap past a failed name save goes on without it (a rushed counter is never blocked on a name).
  const skipName = useRef(false);
  const settle = padSettle({
    mode: detail.mode,
    open,
    paying,
    itemCount: detail.itemCount,
    settleTotalCents: detail.settleTotalCents,
    pending: counts,
    sendBusy,
    settlePhase,
  });
  const onSettle = async () => {
    if (settleInFlight.current || !settle.enabled) return; // aria-disabled; the hint says why
    settleInFlight.current = true;
    haptic("commit");
    setSettlePhase("draining");
    await writes.settled();
    const b = writes.blocker();
    if (b) {
      notify(padSlotNotice("correction", "table.send.hold.add", { x: dishName(b) }));
      setSettlePhase("idle");
      settleInFlight.current = false;
      return;
    }
    if (counterOrder && nameDirty && !skipName.current) {
      setSettlePhase("saving");
      if (!(await saveName())) {
        skipName.current = true;
        notify(padSlotNotice("correction", "pad.nameNotSaved"));
        setSettlePhase("idle");
        settleInFlight.current = false;
        return;
      }
    }
    // The table page's payment section takes it from here (the one money path — never a second
    // copy of the cash / reader / hand-off flow on this screen). Busy until the route changes.
    router.push(`/staff/table/${sessionId}?settle=1`);
  };

  // ── focus: when a control in the dock turns into another (Undo → Done), focus stays in the dock ─
  const dockHadFocus = useRef(false);
  const dockKey = `${send.display.kind}:${send.phase}`;
  useEffect(() => {
    if (document.activeElement === document.body && dockHadFocus.current)
      dockRef.current?.querySelector<HTMLElement>(".pad-dock-primary button")?.focus({
        preventScroll: true,
      });
  }, [dockKey]);

  const table = tableDisplay(detail).text;
  const tab = detail.tab !== "none";
  const settleReasonId = "pad-settle-why";
  const settleReason =
    settle.block === "paying" ? (
      <Chrome
        lang={lang}
        k={tab ? "table.detail.payingPhone.tab" : "table.detail.payingPhone.cash"}
        echo="stack"
      />
    ) : settle.block === "empty" ? (
      <Chrome lang={lang} k="pad.reason.empty" echo="stack" />
    ) : settle.block === "waiting" ? (
      blocker ? (
        <Chrome lang={lang} k="table.send.hold.add" vars={{ x: dishName(blocker) }} echo="stack" />
      ) : (
        <Chrome lang={lang} k="table.send.hold.writing" echo="stack" />
      )
    ) : null;
  const settleNode = open ? (
    <div className="pad-settle">
      <Button
        variant={settle.variant}
        size="xl"
        block
        busy={settle.busy}
        busyLabel={<Chrome lang={lang} k="pad.settle.busy" echo="stack" />}
        {...(!settle.enabled && !settle.busy ? { "aria-disabled": true } : {})}
        aria-describedby={settleReason ? settleReasonId : undefined}
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
      {settleReason && (
        <p id={settleReasonId} className="pad-hint">
          {settleReason}
        </p>
      )}
    </div>
  ) : null;

  // The Send slot (dine-in, open): the controller's view while there is something to send or an
  // undo is open; otherwise the way back to the table — "Done · Table N".
  const sendSlot =
    sendable && (send.display.kind === "send" || send.display.kind === "undo") ? (
      <StaffSendButton
        lang={lang}
        ctl={{ ...send, onSend: onSendTap }}
        controlRef={send.controlRef}
        statusRef={send.statusRef}
        hold={renderedHold}
        hostName={detail.members.find((m) => m.isHost)?.name ?? null}
        bare={padSend.bare}
      />
    ) : sendable ? (
      <Button
        variant="primary"
        size="xl"
        block
        onClick={() => router.push(`/staff/table/${sessionId}`)}
      >
        <Chrome lang={lang} k="pad.done" vars={{ id: table }} echo="stack" />
      </Button>
    ) : null;
  // The status the Send's slot would otherwise speak (to-go at pay · everything sent · counter at
  // pay) — a row in the ticket's foot, never a pill.
  const status =
    sendRaw.kind === "allSent" ||
    sendRaw.kind === "togoAtPay" ||
    sendRaw.kind === "counterAtPay" ? (
      <p className="pad-status">
        <Icon
          name={
            sendRaw.kind === "allSent" ? "check" : sendRaw.kind === "togoAtPay" ? "bag" : "receipt"
          }
          size={18}
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
            <Chrome lang={lang} k="table.send.counterAtPay" echo="stack" />
          )}
        </span>
      </p>
    ) : null;

  const shownMsg: PadMsg | null = shown ? shown.msg : null;
  const anyPending = counts.flying + counts.unseen + counts.unconfirmed + counts.lost > 0;

  return (
    <>
      {/* The FIRST focusable element: a keyboard at the desktop register is not walked through
          ~190 tile stops to reach the order. A button (not an anchor): on a phone the order is the
          other view, so the jump flips it first. */}
      <button type="button" className="pad-skip" onClick={showOrder}>
        <Chrome lang={lang} k="pad.a11y.skipToOrder" />
      </button>
      <StaffBar
        lang={lang}
        title={counterOrder ? "browse.title.counter" : "browse.title.add"}
        leading={
          counterOrder
            ? { kind: "back", href: STAFF_DOOR_TARGET.counter, k: "floor.back" }
            : {
                kind: "back",
                href: `/staff/table/${sessionId}`,
                k: "browse.back.table",
                vars: { id: table },
              }
        }
        lock={hasPin}
        live={live.degraded ? "not_updating" : "live"}
      />
      <div className="pad-shell" data-view={view} data-counter={counterOrder || undefined}>
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
              <Button variant="secondary" onClick={() => router.refresh()}>
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
                        block={tileBlock}
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
          amountsSettled={padAmountsSettled(counts)}
          degraded={live.degraded}
          nowMs={live.nowMs}
          showReload={counts.unconfirmed + counts.lost > 0}
          onReload={() => window.location.reload()}
          headingRef={headingRef}
          rootRef={ticketRef}
          counterName={
            counterOrder && open
              ? {
                  value: name,
                  onChange: setName,
                  onSave: () => {
                    if (savingName || !nameDirty) return;
                    void saveName();
                  },
                  saving: savingName,
                  saved: !nameDirty && savedName !== "",
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
                {anyPending && (
                  <>
                    {" · "}
                    <Chrome lang={lang} k="pad.ghost.adding" />
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
          <div className="pad-dock-primary">{counterOrder ? settleNode : sendSlot}</div>
          {!counterOrder && settleNode && <div className="pad-dock-settle">{settleNode}</div>}
        </div>
      </div>

      {/* The view's ONE live region (§17): every claim, correction and send line, arbitrated. */}
      <Toast
        message={
          shown && shownMsg !== null
            ? { key: shown.seq, text: <MsgText lang={lang} msg={shownMsg} />, quiet: shown.quiet }
            : null
        }
        leaving={leaving}
      />

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
          pending={pending}
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
    setCat((c) => (slug === null ? null : c === slug ? null : slug));
    tilesRef.current?.scrollTo?.({ top: 0 });
  }
}

function itemName(i: PadCatalogItem) {
  return { name: i.nameEn, nameMy: i.nameMy };
}

export type { PadCatalogItem };
