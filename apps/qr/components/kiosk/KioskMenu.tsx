"use client";
import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { addItem } from "@/lib/cart";
import { t, type KioskLang } from "@/lib/kiosk/strings";
import { modePriceCents } from "@/lib/mode-price";
import { StaffModSheet } from "@/components/staff/StaffModSheet";
import type { KioskItem } from "./types";

/**
 * The kiosk food browser (W6b): category chips + a 3-col big-touch grid over the same catalog the
 * diner menu reads. Adds ride the DINER `addItem` action (the kiosk uid is a member of its minted
 * session — server-authoritative pricing, cardinality enforced); required-choice items open the
 * staff modifier sheet (pure presentation — its onAdd is ours).
 */
export function KioskMenu({
  lang,
  cartId,
  lineMode,
  items,
  categories,
  count,
  onAdded,
  onReview,
}: {
  lang: KioskLang;
  cartId: string;
  /** Which mode-derived price the server will mint (W16a) — the dine-in door ×1.15, to-go ×1.05. */
  lineMode: "dinein" | "togo";
  items: KioskItem[];
  categories: string[];
  /** The order tally lives in the FLOW (review finding): a per-mount count of 0 after "Back" from
   *  review disabled "View order" over a non-empty cart — a double-add / walk-away dead end. */
  count: number;
  onAdded: (qty: number) => void;
  onReview: () => void;
}) {
  const [cat, setCat] = useState<string | null>(categories[0] ?? null);
  const [sheetItem, setSheetItem] = useState<KioskItem | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => items.filter((i) => (cat ? i.category === cat : true)), [items, cat]);

  function add(item: KioskItem, choice: { modifierIds: string[]; qty: number; notes?: string }) {
    setSheetError(null);
    startTransition(async () => {
      try {
        await addItem(cartId, item.id, choice.modifierIds, choice.notes, choice.qty);
        setSheetItem(null);
        onAdded(choice.qty);
        setStatus(`${t(lang, "add")} · ${choice.qty} × ${item.nameEn}`);
      } catch {
        // Into the sheet when it's open (the page live region is behind the scrim), else the page.
        if (sheetItem) setSheetError(t(lang, "somethingWrong"));
        else setStatus(t(lang, "somethingWrong"));
      }
    });
  }

  return (
    <div className="kiosk-screen">
      <div
        style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}
        role="group"
        aria-label={t(lang, "categories")}
      >
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={cat === c ? "kiosk-cta" : "kiosk-ghost"}
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* The screen's ONE polite live region — add confirmations + refusals. */}
      <p role="status" className="kiosk-touch-hint" style={{ minHeight: 28, margin: 0 }}>
        {status ?? ""}
      </p>

      <ul
        role="list"
        aria-label={t(lang, "menu")}
        className="kiosk-door-grid"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {shown.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="kiosk-door"
              style={{ width: "100%", opacity: i.soldOut ? 0.55 : 1 }}
              disabled={i.soldOut || pending}
              onClick={() =>
                i.groups.length > 0 ? setSheetItem(i) : add(i, { modifierIds: [], qty: 1 })
              }
            >
              {i.imageUrl && (
                <span
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: "var(--r-card)",
                    overflow: "hidden",
                    background: "var(--grad)",
                    position: "relative",
                    display: "block",
                  }}
                >
                  <Image
                    src={i.imageUrl}
                    alt=""
                    width={96}
                    height={96}
                    sizes="96px"
                    style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  />
                </span>
              )}
              <span className="kiosk-door-label">{i.nameEn}</span>
              {i.nameMy && (
                <span className="kiosk-door-hint" lang="my">
                  {i.nameMy}
                </span>
              )}
              <span className="kiosk-door-hint" style={{ fontWeight: 800, color: "var(--tx)" }}>
                ${(modePriceCents(i.priceCents, lineMode) / 100).toFixed(2)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          position: "sticky",
          bottom: "var(--s4)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button type="button" className="kiosk-cta" disabled={count === 0} onClick={onReview}>
          {t(lang, "viewOrder")}
          {count > 0 ? ` · ${count}` : ""}
        </button>
      </div>

      {sheetItem && (
        <StaffModSheet
          key={sheetItem.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSheetItem(null);
              setSheetError(null);
            }
          }}
          itemName={sheetItem.nameEn}
          basePriceCents={sheetItem.priceCents}
          lineMode={lineMode}
          groups={sheetItem.groups}
          pending={pending}
          error={sheetError}
          onAdd={(choice) => add(sheetItem, choice)}
        />
      )}
    </div>
  );
}
