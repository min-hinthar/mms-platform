"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addItem, getCartView } from "@/lib/cart";
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
  const [pending, startTransition] = useTransition();

  const refresh = () => {
    getCartView(cartId)
      .then((v) => {
        setView({ items: v.items, totals: v.totals });
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  };
  useEffect(refresh, [cartId]); // initial read per mount (refresh identity is per-render, keyed reads are idempotent)

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
    // timeout on the upsell screen advances to the handoff instead of destroying a decided order.
    onCommitted();
    // The one-shot rule: the rail interposes once, only when it has something genuine to show.
    if (!upsellSeen.current && upsellPicks.length > 0) {
      upsellSeen.current = true;
      setUpsellOpen(true);
      return;
    }
    onHandoff();
  }

  function addUpsell(item: KioskItem) {
    if (item.groups.some((g) => g.minSelect >= 1)) return; // required-choice items never one-tap
    startTransition(async () => {
      try {
        await addItem(cartId, item.id, [], undefined, 1);
        refresh();
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
        <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
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
          <button type="button" className="kiosk-ghost" onClick={onHandoff}>
            {t(lang, "noThanks")}
          </button>
          <button type="button" className="kiosk-cta" onClick={onHandoff}>
            {t(lang, "payAtCounter")}
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
        {/* Server-derived (getCartTotals via getCartView) — incl. the SB-1524 service charge + tax. */}
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
