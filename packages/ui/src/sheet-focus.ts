/**
 * PD4 (D1(d)) — where a `Sheet` puts INITIAL focus on open.
 *
 * The default (W9e, J21) is the sheet's own container: it announces the dialog and its title, and a
 * screen-reader user never hears "Close" first. A caller may opt in to a different first stop with
 * `initialFocus` — a ref or a selector — for the one shape the default fails: a sheet whose whole
 * job is one field (the grocery Name sheet), where a container stop costs a second tap before the
 * keyboard rises. The decision is pure so the ui package's own suite falsifies it by a value
 * (`verify:slice` cannot mutate `packages/ui` — OPEN-ITEMS M77).
 *
 * Two refusals, both deliberate:
 *   · a target OUTSIDE the sheet is never focused. Radix traps focus inside the content; focusing a
 *     page node from inside the open-autofocus event would fight the trap and leave focus on <body>.
 *   · a selector that matches nothing falls back to the container, never to the first tabbable
 *     (the ✕ — exactly the W9e finding).
 */
export type SheetInitialFocus = { current: Focusable | null } | string;

/** What a target must be able to do — a real element in the browser, a stub in the node suite. */
export type Focusable = { focus(options?: { preventScroll?: boolean }): void };

/** The minimum of the container the decision reads. */
export type FocusContainer = {
  contains(node: unknown): boolean;
  querySelector(selector: string): unknown;
};

const focusable = (el: unknown): el is Focusable =>
  typeof el === "object" && el !== null && typeof (el as Focusable).focus === "function";

/** The element to focus on open, or `null` for the container (the default). */
export function sheetInitialFocusTarget(
  initialFocus: SheetInitialFocus | undefined,
  container: FocusContainer | null,
): Focusable | null {
  if (initialFocus === undefined || container === null) return null;
  if (typeof initialFocus === "string") {
    const el = container.querySelector(initialFocus);
    return focusable(el) ? el : null;
  }
  const el = initialFocus.current;
  if (!focusable(el) || !container.contains(el)) return null;
  return el;
}
