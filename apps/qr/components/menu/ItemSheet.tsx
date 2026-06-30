"use client";
import { useMemo, useState } from "react";
import { Badge, Sheet, useAnimationPreference } from "@mms/ui";
import { useCart } from "@/components/TableCartProvider";
import { BlurUpImage } from "./BlurUpImage";
import { itemBadges } from "@/lib/menu/badges";
import { goesWellWith } from "@/lib/menu/upsell";
import { passesDiets, type Diet } from "@/lib/menu/dietary";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  selectionDeltaCents,
  toggleOption,
  type ModGroup,
  type Selection,
} from "@/lib/menu/modifiers";
import type { MenuItem } from "./MenuBrowser";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const delta = (cents: number) =>
  cents > 0 ? `+${dollars(cents)}` : cents < 0 ? `−${dollars(Math.abs(cents))}` : "";

// Declared-allergen codes → reader labels (the fail-safe disclaimer always accompanies these).
const ALLERGEN_LABEL: Record<string, string> = {
  shellfish: "shellfish",
  fish: "fish",
  egg: "egg",
  soy: "soy",
  peanuts: "peanuts",
  dairy: "dairy",
  tree_nuts: "tree nuts",
  gluten_wheat: "gluten/wheat",
  sesame: "sesame",
};

/**
 * Item detail sheet (R6b). Opens from a menu row: big blur-up photo-hero, name/MY/description, honest badges
 * + a fail-safe allergen note, the item's modifier groups (required radios then optional checkboxes), a
 * **client-preview** live price (base + selected deltas — advisory only), a hardcoded "Goes well with" row,
 * and a sticky **Add to order** CTA. The CTA calls `add(id, modifierIds)` — the SERVER re-derives the charge
 * (`priceItem`); the client sends option ids, never a price. Reuses the @mms/ui `Sheet` (R5b swipe-to-close,
 * Radix focus-trap + focus-restore to the trigger row).
 *
 * The body is **keyed on item.id** so a swap (open OR upsell tap) remounts it — modifier selection resets via
 * a lazy initializer (the React "reset state with a key" pattern, no setState-in-effect).
 */
export function ItemSheet({
  item,
  allItems,
  diets,
  open,
  onClose,
  onSelectItem,
}: {
  item: MenuItem | null;
  allItems: MenuItem[];
  diets: Diet[];
  open: boolean;
  onClose: () => void;
  onSelectItem: (item: MenuItem) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={item?.name_en ?? ""}>
      {item && (
        <ItemSheetBody
          key={item.id}
          item={item}
          allItems={allItems}
          diets={diets}
          onClose={onClose}
          onSelectItem={onSelectItem}
        />
      )}
    </Sheet>
  );
}

function ItemSheetBody({
  item,
  allItems,
  diets,
  onClose,
  onSelectItem,
}: {
  item: MenuItem;
  allItems: MenuItem[];
  diets: Diet[];
  onClose: () => void;
  onSelectItem: (item: MenuItem) => void;
}) {
  const { add, cartId, locked, settling } = useCart();
  const { shouldAnimate } = useAnimationPreference();
  const groups: ModGroup[] = item.modifierGroups;
  // Required single-selects pre-seeded so the sheet opens VALID (accurate preview, enabled CTA). Lazy init —
  // remounts (keyed on item.id) re-run it, so a swap resets cleanly without an effect.
  const [selected, setSelected] = useState<Selection>(() => initialSelection(groups));
  const [busy, setBusy] = useState(false);

  const deltaCents = selectionDeltaCents(groups, selected);
  const totalCents = item.base_price_cents + deltaCents;
  const valid = isSelectionValid(groups, selected);
  const soldOut = item.is_sold_out;
  // The cart is frozen server-side while a member checks out (locked) or the table settles (settling); no cart
  // yet / an add in flight also block. A disabled CTA, never a missing one.
  const blocked = !cartId || busy || locked || settling;
  const canAdd = !soldOut && !blocked && valid;
  // Upsell respects the diner's ACTIVE dietary filters (fail-safe): a "No shellfish" diner must not be
  // recommended a shellfish dish the browse list just hid. Stable per item (the body is keyed on item.id).
  const upsell = useMemo(
    () => goesWellWith(item, allItems.filter((i) => passesDiets(i, diets))),
    [item, allItems, diets],
  );

  const badges = itemBadges(item.tags);
  const contains =
    item.allergens.length > 0
      ? item.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ")
      : null;

  function choose(group: ModGroup, optionId: string) {
    setSelected((s) => ({ ...s, [group.id]: toggleOption(group, s[group.id] ?? [], optionId) }));
  }

  async function addToOrder() {
    if (!canAdd) return;
    setBusy(true);
    try {
      // Option ids only — the provider's `add` forwards to `addItem`→`priceItem`, which validates the ids
      // against this item's groups and re-derives the charge. The client never sends a price.
      await add(item.id, selectedIds(groups, selected));
      onClose(); // optimistic close (the provider's live region confirms / recovers); Radix restores focus
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-sheet">
      {item.name_my && (
        <p className="item-sheet-my" lang="my">
          {item.name_my}
        </p>
      )}

      <div className="item-hero" style={{ background: "var(--grad)" }}>
        <BlurUpImage
          src={item.image_url}
          alt=""
          width={440}
          height={248}
          sizes="(max-width: 440px) 100vw, 440px"
        />
      </div>

      {badges.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {badges.map((b) => (
            <Badge key={b.label} tone={b.tone}>
              {b.label}
            </Badge>
          ))}
        </div>
      )}

      {item.description_en && <p className="item-sheet-desc">{item.description_en}</p>}

      {/* Fail-safe allergen note: declared allergens (when any) + the always-on "ask us" disclaimer —
          never asserts a free-from claim from absent data. One static note, not a live region. */}
      <p className="item-sheet-allergens" role="note">
        {contains && (
          <>
            <span style={{ fontWeight: 700 }}>Contains</span> {contains}.{" "}
          </>
        )}
        Allergen info is a guide — please tell our staff about any allergy.
      </p>

      {groups.map((g) => {
        const chosen = selected[g.id] ?? [];
        const single = g.selectionType === "single";
        const atMax = chosen.length >= g.maxSelect;
        const hint =
          g.minSelect >= 1 ? "Required" : single ? "Optional" : `Choose up to ${g.maxSelect}`;
        return (
          <fieldset key={g.id} className="item-modgroup">
            <legend className="item-modgroup-legend">
              {g.name}
              <span className="item-modgroup-hint">{hint}</span>
            </legend>
            {g.options.map((o) => {
              const isOn = chosen.includes(o.id);
              // A multi-select option at the cap that isn't already chosen can't be added.
              const disabled = !single && atMax && !isOn;
              return (
                <label key={o.id} className="item-opt" data-disabled={disabled || undefined}>
                  <input
                    className="item-opt-input"
                    type={single ? "radio" : "checkbox"}
                    name={single ? `mod-${g.id}` : undefined}
                    checked={isOn}
                    disabled={disabled}
                    onChange={() => choose(g, o.id)}
                    // A native radio doesn't fire onChange when the already-checked one is re-tapped, so an
                    // OPTIONAL single-select couldn't be cleared back to "none". Handle that one case on click.
                    onClick={
                      single && g.minSelect === 0 && isOn ? () => choose(g, o.id) : undefined
                    }
                  />
                  <span className="item-opt-name">{o.name}</span>
                  {o.priceDeltaCents !== 0 && (
                    <span className="item-opt-delta">{delta(o.priceDeltaCents)}</span>
                  )}
                </label>
              );
            })}
          </fieldset>
        );
      })}

      {upsell.length > 0 && (
        <section className="item-upsell" aria-label="Goes well with">
          <h3 className="item-upsell-title">Goes well with</h3>
          <ul className="item-upsell-row" role="list">
            {upsell.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="item-upsell-card"
                  onClick={() => onSelectItem(u)}
                  aria-label={`${u.name_en}, ${dollars(u.base_price_cents)} — open to customize`}
                >
                  <span className="item-upsell-thumb" style={{ background: "var(--grad)" }}>
                    <BlurUpImage src={u.image_url} alt="" width={120} height={84} sizes="120px" />
                  </span>
                  <span className="item-upsell-name">{u.name_en}</span>
                  <span className="item-upsell-price">{dollars(u.base_price_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="item-cta-bar">
        <span className="item-cta-price">
          {/* sr-only carries the real amount; the visible figure isn't a live region (no per-tap re-read) */}
          <span className="sr-only">Total {dollars(totalCents)}</span>
          <span aria-hidden>{dollars(totalCents)}</span>
        </span>
        <button
          type="button"
          className={`item-add-btn${shouldAnimate ? " item-add-btn-anim" : ""}`}
          disabled={blocked || !valid}
          aria-disabled={soldOut || undefined}
          aria-label={
            soldOut
              ? `${item.name_en} is sold out`
              : !valid
                ? `Choose your options to add ${item.name_en}`
                : `Add ${item.name_en} to your order, ${dollars(totalCents)}`
          }
          onClick={() => {
            if (!canAdd) return;
            void addToOrder();
          }}
        >
          {busy ? "Adding…" : soldOut ? "Sold out" : "Add to order"}
        </button>
      </div>
    </div>
  );
}
