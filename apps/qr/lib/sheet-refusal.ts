/**
 * PD4 (blind pass 2 on #329) — a refusal said in the Name sheet's own state line.
 *
 * The line is the modal's live region (`role="status"`, GroceryNameSheet). A live region announces
 * what CHANGES in it, so a second identical refusal — the same tap refused twice, or two adds
 * refused for one reason — changed no DOM and was never heard. Each refusal therefore carries a
 * fresh `key`, and the sheet re-keys the sentence's node on it (the page Toast's own rule, keyed on
 * a sequence for exactly this). The Burmese half rides with it (`my`): the page's `say()` used to
 * drop it on the way into the sheet.
 */
export type SheetRefusal = { text: string; my: string | null; key: number };

/** The next refusal: always a NEW key, so an identical sentence still arrives as a new node. */
export function nextRefusal(
  prev: SheetRefusal | null,
  text: string,
  my?: string | null,
): SheetRefusal {
  return { text, my: my ?? null, key: (prev?.key ?? 0) + 1 };
}
