"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addItem, getCartView, setKioskTip } from "@/lib/cart";
import { tipPresets, tipWithinAmountCap } from "@/lib/tip";
import type { CartItem, CartTotals } from "@mms/db";
import { goesWellWith } from "@/lib/menu/upsell";
import { t, type KioskLang } from "@/lib/kiosk/strings";
import type { KioskItem } from "./types";

/**
 * The kiosk review + the ONE upsell + the counter handoff (W6b). Totals are server-derived
 * (`getCartView` → the same CartTotals the diner checkout renders) — the kiosk never computes
 * money. The upsell is `goesWellWith` (real, in-stock, non-cart items only; empty = no rail),
 * anchored on the LAST-ADDED food line, capped 6, and shown EXACTLY ONCE per order — declining or
 * adding both continue to the handoff.
 */
export function KioskReview({
  lang,
  cartId,
  items,
  onBack,
  onCommitted,
  onHandoff,
}: {
  lang: KioskLang;
  cartId: string;
  items: KioskItem[];
  onBack: () => void;
  /** Fired the moment the customer taps "Pay at the counter" (before the upsell interposes): from
   *  here the flow's idle timeout must move the screen FORWARD, never abandon the decided order. */
  onCommitted: () => void;
  onHandoff: () => void;
}) {
  const [view, setView] = useState<{ items: CartItem[]; totals: CartTotals } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const upsellSeen = useRef(false);
  // W17c-3 — the tip ask, shown ONCE between the commitment and the handoff. The kiosk pays at the
  // counter, so this records an INTENT on the cart that the register pre-fills from; the cashier
  // still confirms what was actually handed over.
  const [tipOpen, setTipOpen] = useState(false);
  const tipSeen = useRef(false);
  const [pending, startTransition] = useTransition();

  // The upsell and tip screens INTERPOSE — the button that opened them unmounts with the review
  // screen, so without this, focus silently drops to <body> on each swap (QA §A: focus moves on a
  // step change). The heading is the step's name; focusing it also makes a screen reader announce
  // where the flow just went.
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!loadFailed && (upsellOpen || tipOpen)) stepHeadingRef.current?.focus();
    // `loadFailed` is a dep deliberately (Codex P2 on #188): recovering from the failed-read screen
    // remounts the open step's heading with both step flags unchanged — without this, the retry
    // button unmounts under the keyboard user and focus falls to <body>.
  }, [upsellOpen, tipOpen, loadFailed]);

  const refresh = () =>
    getCartView(cartId)
      .then((v) => {
        setView({ items: v.items, totals: v.totals });
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  useEffect(() => {
    void refresh(); // initial read per mount (refresh identity is per-render, keyed reads are idempotent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartId]);

  // The server's own tip base (subtotal − discount), and whether this basket can be tipped at all.
  const tipBaseCents = view
    ? view.items.some((l) => l.fulfillment !== "grocery")
      ? view.totals.subtotalCents - view.totals.discountCents
      : 0
    : 0;

  const upsellPicks = useMemo(() => {
    if (!view) return [];
    const inCart = new Set(view.items.map((i) => i.menuItemId));
    const pool = items
      .filter((i) => !inCart.has(i.id))
      .map((i) => ({ ...i, is_sold_out: i.soldOut }));
    const anchorLine = [...view.items].reverse().find((l) => l.fulfillment !== "grocery");
    const anchor = anchorLine ? items.find((i) => i.id === anchorLine.menuItemId) : undefined;
    if (!anchor) return [];
    return goesWellWith({ ...anchor, is_sold_out: anchor.soldOut }, pool, 6);
  }, [view, items]);

  function proceed() {
    // "Pay at the counter" IS the commitment — tell the flow before anything else, so an idle
    // timeout on any interposed screen advances to the handoff instead of destroying a decided order.
    onCommitted();
    // The one-shot rule: the rail interposes once, only when it has something genuine to show.
    if (!upsellSeen.current && upsellPicks.length > 0) {
      upsellSeen.current = true;
      setUpsellOpen(true);
      return;
    }
    askTipThenHandoff();
  }

  /** The tip ask interposes ONCE, and only when there is something to tip on — a pure-grocery
   *  basket takes no tip (the server force-zeros it) and an unreadable total has no base. */
  function askTipThenHandoff() {
    // Close the upsell EXPLICITLY: it renders ahead of the tip screen, and `upsellOpen` was never
    // cleared — so on every order where the upsell interposed, "No thanks" re-rendered the SAME
    // upsell screen (a dead-feeling tap), and the second tap skipped the tip ask entirely
    // (tipSeen had already latched → straight to handoff, intent recorded as "never asked").
    // Found by the W17 design-pass review tracing the upsell→tip swap.
    setUpsellOpen(false);
    if (!tipSeen.current && tipBaseCents > 0) {
      tipSeen.current = true;
      setTipOpen(true);
      return;
    }
    onHandoff();
  }

  /** Record the choice, then hand off REGARDLESS of whether the write landed. A failed tip write
   *  must never strand a guest who has already committed to paying: the cashier's entry is the
   *  authority anyway, so the worst case is that they ask at the counter. */
  function chooseTip(cents: number) {
    startTransition(async () => {
      try {
        await setKioskTip({ cartId, tipCents: cents });
      } catch {
        /* deliberate: an unrecorded intent is a smaller harm than a dead-ended kiosk */
      }
      onHandoff();
    });
  }

  function addUpsell(item: KioskItem) {
    if (item.groups.some((g) => g.minSelect >= 1)) return; // required-choice items never one-tap
    startTransition(async () => {
      try {
        await addItem(cartId, item.id, [], undefined, 1);
        // W21d (Codex P2 on #184/#188) — AWAIT the re-read inside the transition: `pending` now
        // holds until the refreshed totals (including this add) have landed, and the footer below
        // disables on `pending` — so a fast "Pay at the counter" can no longer open the tip step
        // against the PRE-upsell subtotal and record a percentage of the wrong base.
        await refresh();
      } catch {
        /* deliberate: a failed upsell add is a non-event — the rail is an offer, not a promise */
      }
    });
  }

  if (loadFailed) {
    return (
      <div className="kiosk-screen">
        <p role="status" className="kiosk-touch-hint">
          {t(lang, "somethingWrong")}
        </p>
        <button type="button" className="kiosk-ghost" onClick={refresh}>
          {t(lang, "viewOrder")}
        </button>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="kiosk-screen">
        <p role="status" className="kiosk-touch-hint">
          …
        </p>
      </div>
    );
  }

  if (upsellOpen) {
    return (
      <div className="kiosk-screen">
        <h1
          ref={stepHeadingRef}
          tabIndex={-1}
          style={{ outline: "none" }}
          className="kiosk-h1"
          lang={lang === "my" ? "my" : undefined}
        >
          {t(lang, "goesWellWith")}
        </h1>
        <ul
          role="list"
          aria-label={t(lang, "goesWellWith")}
          className="kiosk-door-grid"
          style={{ listStyle: "none", padding: 0, margin: 0 }}
        >
          {upsellPicks.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="kiosk-door"
                style={{ width: "100%" }}
                disabled={pending || p.groups.some((g) => g.minSelect >= 1)}
                onClick={() => addUpsell(p)}
              >
                <span className="kiosk-door-label">{p.nameEn}</span>
                {p.nameMy && (
                  <span className="kiosk-door-hint" lang="my">
                    {p.nameMy}
                  </span>
                )}
                <span className="kiosk-door-hint" style={{ fontWeight: 800, color: "var(--tx)" }}>
                  + ${(p.priceCents / 100).toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "var(--s3)", justifyContent: "center" }}>
          {/* Disabled while an upsell add + its re-read are in flight (see addUpsell) — continuing
              mid-add would price the tip ask off the pre-upsell subtotal. */}
          <button
            type="button"
            className="kiosk-ghost"
            disabled={pending}
            onClick={askTipThenHandoff}
          >
            {t(lang, "noThanks")}
          </button>
          <button
            type="button"
            className="kiosk-cta"
            disabled={pending}
            onClick={askTipThenHandoff}
          >
            {t(lang, "payAtCounter")}
          </button>
        </div>
      </div>
    );
  }

  if (tipOpen) {
    // W21d (Codex P2 on #184) — drop any preset whose DERIVED cents breach the $1,000 amount cap
    // (30% of a ~$3,334+ base): setKioskTip refuses those, and chooseTip deliberately ignores the
    // result — the guest's choice would vanish silently. A chip the write layer refuses is never
    // offered (the tipPresets rate-cap rule, applied to the amount cap).
    const presets = tipPresets(tipBaseCents).filter((p) =>
      tipWithinAmountCap(Math.round(tipBaseCents * p.rate)),
    );
    return (
      <div className="kiosk-screen">
        <h1
          ref={stepHeadingRef}
          tabIndex={-1}
          style={{ outline: "none" }}
          className="kiosk-h1"
          lang={lang === "my" ? "my" : undefined}
        >
          {t(lang, "addATip")}
        </h1>
        <p className="kiosk-touch-hint" lang={lang === "my" ? "my" : undefined}>
          {t(lang, "tipForTheTeam")}
        </p>
        <div
          role="group"
          aria-label={t(lang, "addATip")}
          className="kiosk-door-grid"
          style={{ margin: "0 auto" }}
        >
          {/* W18 (owner: "none is not encouraged lol") — the PERCENTAGES are the doors; declining
              moved to the quiet ghost below the grid. Still one honest tap, still records 0 (a real
              answer, not null "never asked", which the register distinguishes) — just no longer the
              first thing the ask offers. */}
          {presets.map((p) => {
            // Latin digits, integer cents — the same amount the server will record.
            const cents = Math.round(tipBaseCents * p.rate);
            return (
              <button
                key={p.label}
                type="button"
                className="kiosk-door"
                disabled={pending}
                onClick={() => chooseTip(cents)}
              >
                <span className="kiosk-door-label">{p.label}</span>
                {/* The amount carries the warmth — accent ink, not muted meta-grey. */}
                <span
                  className="kiosk-door-hint"
                  style={{ color: "var(--ac-strong)", fontWeight: 800 }}
                >
                  ${(cents / 100).toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className="kiosk-ghost"
            disabled={pending}
            onClick={() => chooseTip(0)}
            lang={lang === "my" ? "my" : undefined}
          >
            {t(lang, "noTip")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-screen">
      <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
        {t(lang, "yourOrder")}
      </h1>
      <ul
        role="list"
        aria-label={t(lang, "yourOrder")}
        style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--s2)" }}
      >
        {view.items.map((l) => (
          <li
            key={l.id}
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--s3)",
              padding: "var(--s3) var(--s4)",
              fontSize: "var(--xfs-body)",
            }}
          >
            <span>
              {l.qty} × {l.name}
              {l.modifiers.length > 0 && (
                <span className="kiosk-door-hint"> · {l.modifiers.join(", ")}</span>
              )}
            </span>
            <span style={{ fontWeight: 800 }}>
              ${((l.qty * l.unitPriceCents) / 100).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "var(--s4)",
          fontSize: "var(--xfs-tile)",
          fontWeight: 800,
        }}
      >
        <span lang={lang === "my" ? "my" : undefined}>{t(lang, "total")}</span>
        {/* Server-derived (getCartTotals via getCartView) — POS-priced lines + tax (no service charge). */}
        <span>${(view.totals.totalCents / 100).toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", gap: "var(--s3)", justifyContent: "center" }}>
        <button type="button" className="kiosk-ghost" onClick={onBack}>
          {t(lang, "back")}
        </button>
        <button
          type="button"
          className="kiosk-cta"
          disabled={view.items.length === 0}
          onClick={proceed}
        >
          {t(lang, "payAtCounter")}
        </button>
      </div>
    </div>
  );
}
