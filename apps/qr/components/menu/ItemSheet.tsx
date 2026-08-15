"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Badge, Icon, Sheet, useAnimationPreference } from "@mms/ui";
import { useCart } from "@/components/TableCartProvider";
import { inertReason } from "@/lib/inert-reason";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { Rail } from "../Rail";
import { itemBadges } from "@/lib/menu/badges";
import { optionGlyph } from "@/lib/menu/optionGlyph";
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
import { modePriceCents } from "@/lib/mode-price";
import type { MenuItem } from "./MenuBrowser";
import { hapticTap } from "@/lib/haptics";

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
  lineMode,
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
  /** W16a — the session-mode price factor key: dine-in ×1.15, to-go ×1.05 (lib/mode-price). */
  lineMode: "dinein" | "togo";
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
          lineMode={lineMode}
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
  lineMode,
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
  lineMode: "dinein" | "togo";
  rootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSelectItem: (item: MenuItem) => void;
  tableFavorite: boolean;
  hearted?: boolean;
  onToggleHeart?: (id: string) => void;
}) {
  const { add, cartId, loading, locked, lockedByName, settling } = useCart();
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
  // W5c: pre-add quantity (1–9, matching the Zod bound). PRE-add by design — "−" only lowers the pending
  // count (never touches an existing cart line), so a customized line can't be silently deleted from here
  // (QA §D); existing lines keep their own steppers in the cart. Keyed remount resets it to 1.
  const [qty, setQty] = useState(1);

  const deltaCents = selectionDeltaCents(groups, selected);
  // W16a — the preview MUST reproduce the server math exactly (same pure helper, same integer
  // round25) or the sheet quotes a price the charge disagrees with.
  const totalCents = modePriceCents(item.base_price_cents + deltaCents, lineMode) * qty;
  const valid = isSelectionValid(groups, selected);
  const soldOut = item.is_sold_out;
  // The cart is frozen server-side while a member checks out (locked) or the table settles (settling); no cart
  // yet / an add in flight also block. A disabled CTA, never a missing one.
  const blocked = !cartId || busy || locked || settling;
  const canAdd = !soldOut && !blocked && valid;
  // W9b — the same three "why is this dead?" reasons the menu pills now carry (AddButton), spoken in
  // the same order and the same words. Without this the sheet's CTA sat greyed and mute during the
  // mint window and behind a peer's checkout: `loading` had been on the cart context with zero
  // consumers. It does NOT relax `blocked` — an add with no cartId still can't fire.
  const minting = loading && !cartId;
  const reason = inertReason({ minting, locked, lockedByYou: lockedByName === "You", settling });
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
  // W5c pre-merge (safety): a chosen add-on can introduce an allergen the base item doesn't declare
  // (Balachaung → shellfish on an otherwise shellfish-free curry). Fold the SELECTED add-ons' allergens
  // into the Contains line so the fail-safe "declared allergen-free" claim can never be silently broken —
  // the line re-renders as the diner toggles options. Base allergens first, then any add-on-introduced ones.
  const selectedAllergens = groups.flatMap((g) =>
    g.options.filter((o) => (selected[g.id] ?? []).includes(o.id)).flatMap((o) => o.allergens),
  );
  const allAllergenCodes = [...new Set([...item.allergens, ...selectedAllergens])];
  const contains =
    allAllergenCodes.length > 0
      ? allAllergenCodes.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ")
      : null;

  function choose(group: ModGroup, optionId: string) {
    setSelected((s) => ({ ...s, [group.id]: toggleOption(group, s[group.id] ?? [], optionId) }));
  }

  async function addToOrder() {
    if (!canAdd) return;
    // W13 review — the haptic weights the GESTURE, not the network (the AddButton rationale): on a
    // slow link a post-round-trip buzz lands seconds after the tap. A refused add is corrected by
    // the sheet staying open + the live region, same as the optimistic morph.
    hapticTap(12);
    setBusy(true);
    try {
      // Option ids only — the provider's `add` forwards to `addItem`→`priceItem`, which validates the ids
      // against this item's groups and re-derives the charge. The client never sends a price — `qty` (W5c)
      // only multiplies the SERVER-priced unit, bounded again by Zod + the SQL. The kitchen note (W3b)
      // rides along — free text, trimmed here, length-bounded again server-side.
      // Close only on SUCCESS — a refused add (expired session / locked cart / invalid selection) keeps the
      // sheet open with the diner's choices intact (the provider's live region shows the recovery message).
      const ok = await add(item.id, selectedIds(groups, selected), notes.trim() || undefined, qty);
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
      {item.description_my && (
        <p className="item-sheet-desc-my" lang="my">
          {item.description_my}
        </p>
      )}

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
              <span className="item-modgroup-name">
                {g.name}
                {g.nameMy && (
                  <span className="item-modgroup-my" lang="my">
                    {g.nameMy}
                  </span>
                )}
              </span>
              <span className="item-modgroup-hint">{hint}</span>
            </legend>
            {g.options.map((o) => {
              const isOn = chosen.includes(o.id);
              // A multi-select option at the cap that isn't already chosen can't be added.
              const disabled = !single && atMax && !isOn;
              // W5c·r3: glyphs ride INLINE with the label (owner: "in color and inline") — leading for
              // the add-ons pantry, trailing for the 🌶/🍯 intensity meters. aria-hidden; text carries meaning.
              const glyph = optionGlyph(o.slug);
              // W16a review MED — the shown delta is the EFFECT of tapping (mode-priced total after
              // the toggle minus now), NOT the raw menu delta: the factor + round25 apply to the SUM,
              // so a "+$1.00" option moves a ×1.15 total by $1.25 and the raw label would contradict
              // the CTA the diner sums against. Exact by construction (same math as totalCents).
              const effDeltaCents =
                modePriceCents(
                  item.base_price_cents +
                    selectionDeltaCents(groups, {
                      ...selected,
                      [g.id]: toggleOption(g, chosen, o.id),
                    }),
                  lineMode,
                ) - modePriceCents(item.base_price_cents + deltaCents, lineMode);
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
                  <span className="item-opt-name">
                    {glyph && !glyph.trail && (
                      <span className="item-opt-emoji" aria-hidden>
                        {glyph.glyph}{" "}
                      </span>
                    )}
                    {o.name}
                    {glyph?.trail && (
                      <span className="item-opt-emoji" aria-hidden>
                        {" "}
                        {glyph.glyph}
                      </span>
                    )}
                    {o.nameMy && (
                      <span className="item-opt-my" lang="my">
                        {o.nameMy}
                      </span>
                    )}
                    {/* W5c pre-merge (safety): an add-on that introduces an allergen the base dish
                        doesn't declare says so ON the row — VISIBLE (not aria-hidden), so a free-from
                        diner sees "contains shellfish" before choosing Balachaung. Also folded into the
                        item's Contains line above when selected. */}
                    {o.allergens.length > 0 && (
                      <span className="item-opt-allergen">
                        Contains {o.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ")}
                      </span>
                    )}
                  </span>
                  {effDeltaCents !== 0 && (
                    <span className="item-opt-delta">{delta(effDeltaCents)}</span>
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
                  aria-label={`${u.name_en}, ${dollars(modePriceCents(u.base_price_cents, lineMode))} — open to customize`}
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
                  <span className="item-upsell-price">
                    {dollars(modePriceCents(u.base_price_cents, lineMode))}
                  </span>
                </button>
              </li>
            ))}
          </Rail>
        </section>
      )}

      <div className="item-cta-bar">
        {/* W5c pre-add quantity — "−" only lowers the PENDING count (min 1), so it can never silently
            delete a customized cart line (QA §D); the CTA's accessible name re-reads the qty + total on
            activation, so no live region is needed (the sheet keeps one region max). */}
        {!soldOut && (
          <div className="item-qty">
            {/* aria-disabled (focusable no-op), NOT native disabled: pressing "−" at qty 2 lands on the
                bound, and a natively-disabled button would drop keyboard/SR focus to <body> mid-
                interaction (WCAG 2.4.3) — the same pattern the sold-out Add pill uses. aria-controls
                points at the spinbutton so the −/+ read as its controls. */}
            <button
              type="button"
              className="item-qty-btn"
              aria-label={`One fewer ${item.name_en}`}
              aria-controls={`item-qty-${item.id}`}
              aria-disabled={blocked || qty <= 1 || undefined}
              onClick={() => {
                if (blocked || qty <= 1) return;
                setQty((q) => Math.max(1, q - 1));
              }}
            >
              <span aria-hidden>−</span>
            </button>
            {/* spinbutton: the AT announces the new value on each change WITHOUT a second live region
                (aria-valuenow), so an SR user hears "3" as they step up — the sheet keeps one live region.
                The visible digit is aria-hidden; the spinbutton's aria-valuetext carries the spoken value. */}
            <span
              id={`item-qty-${item.id}`}
              className="item-qty-count"
              role="spinbutton"
              aria-label="Quantity"
              aria-valuenow={qty}
              aria-valuemin={1}
              aria-valuemax={9}
              aria-valuetext={`Quantity ${qty}`}
            >
              {/* Keyed remount replays the count-bounce per change (same pattern as the @mms/ui Stepper);
                  inline-block so the transform actually applies (transforms are no-ops on inline spans). */}
              <span
                key={qty}
                aria-hidden
                className={`item-qty-digit${shouldAnimate ? " mms-pop" : ""}`}
              >
                {qty}
              </span>
            </span>
            <button
              type="button"
              className="item-qty-btn"
              aria-label={`One more ${item.name_en}`}
              aria-controls={`item-qty-${item.id}`}
              aria-disabled={blocked || qty >= 9 || undefined}
              onClick={() => {
                if (blocked || qty >= 9) return;
                setQty((q) => Math.min(9, q + 1));
              }}
            >
              <span aria-hidden>+</span>
            </button>
          </div>
        )}
        <button
          type="button"
          className={`item-add-btn${soldOut ? " item-add-btn-solo" : ""}${shouldAnimate ? " item-add-btn-anim" : ""}`}
          disabled={blocked || !valid}
          aria-disabled={soldOut || undefined}
          aria-busy={busy || minting}
          aria-label={
            soldOut
              ? `${item.name_en} is sold out`
              : !valid
                ? `Choose your options to add ${item.name_en}`
                : reason
                  ? `${item.name_en} — ${reason}`
                  : qty > 1
                    ? `Add ${qty} × ${item.name_en} to your order, ${dollars(totalCents)}`
                    : `Add ${item.name_en} to your order, ${dollars(totalCents)}`
          }
          onClick={() => {
            if (!canAdd) return;
            void addToOrder();
          }}
        >
          {/* v7.2 CTA anatomy: label left, live (advisory) total right, inside the one 48px button. */}
          <span>{busy ? "Adding…" : soldOut ? "Sold out" : "Add to order"}</span>
          {!soldOut && <span className="item-add-btn-price">{dollars(totalCents)}</span>}
        </button>
      </div>
    </div>
  );
}
