"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Badge, Icon, Sheet, useAnimationPreference } from "@mms/ui";
import { useCart } from "@/components/TableCartProvider";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";
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
  tableFavorite = false,
  hearted = false,
  onToggleHeart,
}: {
  item: MenuItem | null;
  allItems: MenuItem[];
  diets: Diet[];
  open: boolean;
  onClose: () => void;
  onSelectItem: (item: MenuItem) => void;
  /** J2: the data-backed favorite flag for THIS item (real paid-order counts) — keeps the sheet's badge
   *  in agreement with the menu row it opened from. */
  tableFavorite?: boolean;
  /** J5: the CALLER's own heart on this item (qr_favorites) + the optimistic toggle. Optional so other
   *  mounts (if any) stay heart-less rather than broken. */
  hearted?: boolean;
  onToggleHeart?: (id: string) => void;
}) {
  // Detect an upsell SWAP (item changes while the sheet stays open) in an EFFECT — never read refs during
  // render (React Compiler). On a swap the keyed body remounts mid-scroll and the tapped upsell card
  // unmounts, so move focus to the top of the new content (WCAG 2.4.3); the INITIAL open is left to Radix.
  // Runs after the body's own mount effect (child effects fire first), so scroll-to-top lands before focus.
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = open ? (item?.id ?? null) : null;
    const prev = prevIdRef.current;
    prevIdRef.current = cur;
    // preventScroll: the child already reset the sheet to top; don't let focus() nudge it (belt-and-suspenders).
    if (prev != null && cur != null && prev !== cur)
      bodyRef.current?.focus({ preventScroll: true });
  }, [item?.id, open]);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={item?.name_en ?? ""}>
      {item && (
        <ItemSheetBody
          key={item.id}
          item={item}
          allItems={allItems}
          diets={diets}
          rootRef={bodyRef}
          onClose={onClose}
          onSelectItem={onSelectItem}
          tableFavorite={tableFavorite}
          hearted={hearted}
          onToggleHeart={onToggleHeart}
        />
      )}
    </Sheet>
  );
}

function ItemSheetBody({
  item,
  allItems,
  diets,
  rootRef,
  onClose,
  onSelectItem,
  tableFavorite,
  hearted = false,
  onToggleHeart,
}: {
  item: MenuItem;
  allItems: MenuItem[];
  diets: Diet[];
  rootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSelectItem: (item: MenuItem) => void;
  tableFavorite: boolean;
  hearted?: boolean;
  onToggleHeart?: (id: string) => void;
}) {
  const { add, cartId, locked, settling } = useCart();
  const { shouldAnimate } = useAnimationPreference();
  // On mount (each keyed remount = open OR upsell swap): reset the SHARED sheet scroll to the top so a
  // swapped-in item starts at its hero, not wherever the previous item's "Goes well with" row sat. Reading
  // rootRef in an EFFECT is allowed (never during render); the parent handles focus-on-swap.
  useEffect(() => {
    rootRef.current?.closest<HTMLElement>(".mms-sheet")?.scrollTo({ top: 0 });
  }, [rootRef]);
  const groups: ModGroup[] = item.modifierGroups;
  // Required single-selects pre-seeded so the sheet opens VALID (accurate preview, enabled CTA). Lazy init —
  // remounts (keyed on item.id) re-run it, so a swap resets cleanly without an effect.
  const [selected, setSelected] = useState<Selection>(() => initialSelection(groups));
  const [busy, setBusy] = useState(false);
  // W3b: the kitchen note (allergy/request channel). Keyed remount (item.id) resets it with the rest of
  // the selection; bounded to the schema/column cap so the server never truncates silently.
  const [notes, setNotes] = useState("");

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
    () =>
      goesWellWith(
        item,
        allItems.filter((i) => passesDiets(i, diets)),
      ),
    [item, allItems, diets],
  );

  const badges = itemBadges(item.tags, tableFavorite);
  const contains =
    item.allergens.length > 0 ? item.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ") : null;

  function choose(group: ModGroup, optionId: string) {
    setSelected((s) => ({ ...s, [group.id]: toggleOption(group, s[group.id] ?? [], optionId) }));
  }

  async function addToOrder() {
    if (!canAdd) return;
    setBusy(true);
    try {
      // Option ids only — the provider's `add` forwards to `addItem`→`priceItem`, which validates the ids
      // against this item's groups and re-derives the charge. The client never sends a price. The kitchen
      // note (W3b) rides along — free text, trimmed here, length-bounded again server-side.
      // Close only on SUCCESS — a refused add (expired session / locked cart / invalid selection) keeps the
      // sheet open with the diner's choices intact (the provider's live region shows the recovery message).
      const ok = await add(item.id, selectedIds(groups, selected), notes.trim() || undefined);
      if (ok) onClose(); // Radix restores focus to the trigger row
    } finally {
      setBusy(false);
    }
  }

  return (
    // tabIndex -1 + an accessible name so a swap can land focus at the top of the new item (not <body>);
    // it's not in the tab order (only programmatically focused), so it adds no extra Tab stop.
    <div className="item-sheet" ref={rootRef} tabIndex={-1} aria-label={item.name_en}>
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
          fallback={<PhotoPlaceholder category={item.category} variant="hero" />}
        />
        {/* J5 — the heart (uid-scoped favorite). A true toggle (aria-pressed), 44px, optimistic via the
            parent; state is conveyed by aria-pressed so no announcement is needed (no second region). */}
        {onToggleHeart && (
          <button
            type="button"
            className={`sheet-heart${hearted ? " sheet-heart-on" : ""}`}
            aria-pressed={hearted}
            aria-label="Save to your favorites"
            onClick={() => onToggleHeart(item.id)}
          >
            <Icon name="favorite" size={22} fill={hearted ? "currentColor" : "none"} />
          </button>
        )}
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

      {/* Fail-safe allergen note: declared allergens (when any) + the always-on disclaimer — never
          asserts a free-from claim from absent data. W3b: the note now points at a REAL channel (the
          kitchen-note field below) instead of "tell our staff" with nowhere to put it. */}
      <p className="item-sheet-allergens" role="note">
        {contains && (
          <>
            <span style={{ fontWeight: 700 }}>Contains</span> {contains}.{" "}
          </>
        )}
        Allergen info is a guide — add any allergy in the note below and the kitchen will see it.
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

      {/* W3b: the kitchen-note channel — allergies and requests reach the KDS as a red band. Optional,
          bounded (160 = the Zod cap + column CHECK); the counter only appears once it matters. */}
      <div className="item-note">
        <label htmlFor={`item-note-${item.id}`} className="item-note-label">
          A note for the kitchen{" "}
          <span className="item-modgroup-hint" style={{ textTransform: "none" }}>
            Optional
          </span>
        </label>
        <textarea
          id={`item-note-${item.id}`}
          className="item-note-input"
          value={notes}
          maxLength={160}
          rows={2}
          placeholder="e.g. No peanuts — allergy"
          onChange={(e) => setNotes(e.target.value)}
          aria-describedby={notes.length >= 120 ? `item-note-count-${item.id}` : undefined}
        />
        {/* SR-reachable via aria-describedby (maxLength hard-stops silently otherwise) but NOT a live
            region — per-keystroke announcements would be noise, and the sheet keeps one region max. */}
        {notes.length >= 120 && (
          <p id={`item-note-count-${item.id}`} className="item-note-count">
            {160 - notes.length} characters left
          </p>
        )}
      </div>

      {upsell.length > 0 && (
        <section className="item-upsell" aria-label="Goes well with">
          <h3 className="item-upsell-title">Goes well with</h3>
          <Rail as="ul" className="item-upsell-row" role="list">
            {upsell.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="item-upsell-card"
                  onClick={() => onSelectItem(u)}
                  aria-label={`${u.name_en}, ${dollars(u.base_price_cents)} — open to customize`}
                >
                  <span className="item-upsell-thumb" style={{ background: "var(--grad)" }}>
                    <BlurUpImage
                      src={u.image_url}
                      alt=""
                      width={120}
                      height={84}
                      sizes="120px"
                      fallback={<PhotoPlaceholder category={u.category} />}
                    />
                  </span>
                  <span className="item-upsell-name">{u.name_en}</span>
                  <span className="item-upsell-price">{dollars(u.base_price_cents)}</span>
                </button>
              </li>
            ))}
          </Rail>
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
