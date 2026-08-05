// Menu modifier model (R6b). Pure types + client-side helpers for the item detail sheet. The shapes mirror
// the seeded DB tables (modifier_groups / modifier_options / item_modifier_groups) and are loaded EAGERLY with
// each item in the RSC page, so the sheet renders + previews instantly with no client round-trip.
//
// MONEY RULE: every cents value here is for an ADVISORY client preview only. The charge is re-derived
// server-side by `priceItem` on add (the client sends modifier-OPTION ids, never a price). Keep it that way.

export type ModOption = {
  id: string;
  /** W5c·r2: stable data key for the code-side glyph map (never rendered). */
  slug: string;
  name: string;
  /** W5c: bilingual option label (nullable — absent Burmese simply doesn't render). */
  nameMy: string | null;
  priceDeltaCents: number;
  /** W5c pre-merge: allergens this add-on introduces (e.g. Balachaung → shellfish). The sheet surfaces
   *  them on the option row + folds a CHOSEN add-on's allergens into the item's Contains line, so a
   *  free-from claim can't be silently violated by an add-on. Empty = none declared. */
  allergens: string[];
};

export type ModGroup = {
  id: string;
  /** W5c·r2: stable data key (never rendered). */
  slug: string;
  name: string;
  /** W5c: bilingual group label (nullable — absent Burmese simply doesn't render). */
  nameMy: string | null;
  /** "single" ⇒ radio (replace on pick); "multiple" ⇒ checkbox (up to maxSelect). */
  selectionType: "single" | "multiple";
  /** ≥1 ⇒ a choice is required (the CTA is gated until satisfied). */
  minSelect: number;
  /** Upper bound on selections (1 for single-select). */
  maxSelect: number;
  options: ModOption[];
};

/** Selected option ids keyed by group id. */
export type Selection = Record<string, string[]>;

/**
 * Initial selection: pre-seed every REQUIRED single-select group with its first option so the sheet opens in
 * a VALID state (accurate preview, enabled CTA, no confusing disabled button) — the diner can still change it.
 * Optional groups and required multi-selects start empty (the diner makes an explicit choice).
 */
export function initialSelection(groups: ModGroup[]): Selection {
  const sel: Selection = {};
  for (const g of groups) {
    const first = g.options[0];
    sel[g.id] = g.minSelect >= 1 && g.selectionType === "single" && first ? [first.id] : [];
  }
  return sel;
}

/** Sum of the selected options' deltas across all groups — the advisory preview delta (cents). */
export function selectionDeltaCents(groups: ModGroup[], sel: Selection): number {
  let cents = 0;
  for (const g of groups) {
    const chosen = sel[g.id] ?? [];
    for (const o of g.options) if (chosen.includes(o.id)) cents += o.priceDeltaCents;
  }
  return cents;
}

/** Every group satisfies its min/max ⇒ the order is addable. (Interaction also caps at maxSelect.) */
export function isSelectionValid(groups: ModGroup[], sel: Selection): boolean {
  return groups.every((g) => {
    const n = (sel[g.id] ?? []).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
}

/** Flat list of all chosen option ids (what gets sent to `add` → the server). */
export function selectedIds(groups: ModGroup[], sel: Selection): string[] {
  return groups.flatMap((g) =>
    (sel[g.id] ?? []).filter((id) => g.options.some((o) => o.id === id)),
  );
}

/** Raw shape of the nested modifier embed (one row per item→group link) — the exact select both the
 *  diner menu page and the staff add screen (W6a) issue. Extracted from the menu page so the two
 *  surfaces can't drift on how DB rows become ModGroups. */
export type RawModLink = {
  modifier_groups: {
    id: string;
    slug: string;
    name: string;
    name_my: string | null;
    selection_type: string;
    min_select: number;
    max_select: number;
    modifier_options: {
      id: string;
      slug: string;
      name: string;
      name_my: string | null;
      price_delta_cents: number;
      sort_order: number;
      is_active: boolean;
      allergens: string[] | null;
    }[];
  } | null;
};

/** Shape the embed → ModGroup[]: active options only (sorted), required groups (min_select≥1) first so
 *  the sheet shows the radios before the optional checkboxes. Advisory data only — the server re-prices
 *  on add. */
export function shapeModifierGroups(links: RawModLink[] | null | undefined): ModGroup[] {
  const groups = (links ?? [])
    .map((l) => l.modifier_groups)
    .filter((g): g is NonNullable<RawModLink["modifier_groups"]> => g != null)
    .map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      nameMy: g.name_my,
      selectionType: g.selection_type === "multiple" ? ("multiple" as const) : ("single" as const),
      minSelect: g.min_select,
      maxSelect: g.max_select,
      options: [...(g.modifier_options ?? [])]
        .filter((o) => o.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({
          id: o.id,
          slug: o.slug,
          name: o.name,
          nameMy: o.name_my,
          priceDeltaCents: o.price_delta_cents,
          allergens: o.allergens ?? [],
        })),
    }))
    .filter((g) => g.options.length > 0);
  // Required (radio) groups before optional (checkbox) ones; stable within each.
  return groups.sort((a, b) => (b.minSelect >= 1 ? 1 : 0) - (a.minSelect >= 1 ? 1 : 0));
}

/** An item with a REQUIRED group whose options are ALL inactive can't be completed (the required choice
 *  has no options), and the server's `enforceCardinality` would reject every add. Treat it as
 *  unavailable so the menu shows it sold-out (honest) rather than an addable item that always fails. */
export function requiredChoiceUnavailable(links: RawModLink[] | null | undefined): boolean {
  return (links ?? []).some((l) => {
    const g = l.modifier_groups;
    return !!g && g.min_select >= 1 && !(g.modifier_options ?? []).some((o) => o.is_active);
  });
}

/** Toggle an option within a group, honoring single (replace) vs multiple (add/remove, capped at maxSelect).
 *  A required single-select can't be emptied by re-tapping the only choice (keeps a valid state). */
export function toggleOption(group: ModGroup, current: string[], optionId: string): string[] {
  const has = current.includes(optionId);
  if (group.selectionType === "single") {
    // Re-tapping the current choice in a required group is a no-op (stays selected); optional single can clear.
    if (has) return group.minSelect >= 1 ? current : [];
    return [optionId];
  }
  if (has) return current.filter((id) => id !== optionId);
  if (current.length >= group.maxSelect) return current; // at cap — ignore (the UI also disables it)
  return [...current, optionId];
}
