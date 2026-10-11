"use client";
import type { GroceryHit } from "@/lib/grocery";
import { saleInfo, sizeLabel } from "@/lib/grocery-aisles";
import { t } from "@/lib/i18n";

/**
 * PD4 — the ONE name-search result row, shared by the Browse door's field and the Scan door's Name
 * sheet so the two can never drift (m4 screen 2: "extracted so Browse and the sheet cannot drift").
 *
 * Tapping it is the caller's `add(barcode, "search")` — the one server-priced `scanAdd` path; the
 * price shown is the catalog's and never what is charged (that is the cart's own snapshot).
 *
 * BUSY KEEPS FULL INK (the critic's fix B10; DESIGN-LANGUAGE §7): the shipped row dimmed to 0.55,
 * which put its text at 3.96:1 and its meta at 2.24:1. Busy is now `aria-busy` plus the visible word
 * "Adding…" in both tongues — never opacity. Other rows are `aria-disabled`, never natively
 * disabled (a disabled control drops out of the tab order under a keyboard shopper).
 */
export function GroceryResultRow({
  hit,
  busy,
  disabled,
  onAdd,
}: {
  hit: GroceryHit;
  /** THIS row's add is in flight. */
  busy: boolean;
  /** Another add or stepper op is in flight — the tap is refused and says so. */
  disabled: boolean;
  onAdd: () => void;
}) {
  const sale = saleInfo(hit.unitPriceCents, hit.compareAtCents);
  return (
    <li>
      <button
        type="button"
        className="grocery-result"
        aria-disabled={disabled || undefined}
        aria-busy={busy || undefined}
        onClick={() => {
          if (disabled) return;
          onAdd();
        }}
      >
        <span style={{ minWidth: 0 }}>
          {hit.name}{" "}
          {hit.ebt && (
            <small style={{ color: "var(--ok)", fontWeight: "var(--fw-bold)" }}>EBT</small>
          )}
          <small
            style={{
              display: "block",
              color: "var(--t3)",
              fontWeight: "var(--fw-medium)",
            }}
          >
            {/* Burmese name carries lang="my" so a screen reader picks the right voice; the roman
                meta (brand · size) is appended outside the tag. */}
            {hit.nameMy && <span lang="my">{hit.nameMy}</span>}
            {hit.nameMy && (hit.brand || hit.sizeQty) ? " · " : ""}
            {[hit.brand, sizeLabel(hit.sizeQty, hit.sizeUnit)].filter(Boolean).join(" · ")}
          </small>
          {busy && (
            <small className="grocery-result-busy">
              {t("en", "adding")}
              <span lang="my">{t("my", "adding")}</span>
            </small>
          )}
        </span>
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            flexShrink: 0,
          }}
        >
          <b style={{ fontVariantNumeric: "tabular-nums" }}>
            ${(hit.unitPriceCents / 100).toFixed(2)}
          </b>
          {sale && (
            // Visible "Compare at" (market-comparison framing, not a bare struck number) + an
            // sr-only companion so the sale reaches screen readers too. The QUIET surface: no
            // "−N%" shout here (W9d — that belongs only to featured deals).
            <>
              <small
                aria-hidden
                style={{ color: "var(--ac-strong)", fontWeight: "var(--fw-bold)" }}
              >
                Compare at{" "}
                <s style={{ color: "var(--t3)", fontWeight: "var(--fw-medium)" }}>
                  ${(sale.compareAtCents / 100).toFixed(2)}
                </s>
              </small>
              <span className="sr-only"> compare at ${(sale.compareAtCents / 100).toFixed(2)}</span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}
