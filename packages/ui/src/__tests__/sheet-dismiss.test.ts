import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISMISS_VECTORS,
  DRAG_CLOSE_PX,
  DRAG_CLOSE_VELOCITY,
  channelOf,
  dragClosed,
  mayDismiss,
  sheetDismiss,
} from "../sheet-dismiss";

/**
 * M82 — the dismissal policy, and the wiring that has to consult it.
 *
 * Two halves, deliberately. The policy is pure and asserted directly; the WIRING is asserted as
 * source text, because `packages/ui` has no DOM runner (nor does `apps/qr`, nor anywhere in this
 * monorepo) and a behavioural "Esc while busy leaves the dialog open" test would cost an infra slice
 * — jsdom + a React plugin + widening the vitest include + relaxing CI's orphan-`.test.tsx` guard.
 *
 * The second half is not optional padding. W22c, W22e and W22f each shipped a correct module whose
 * CALLER defeated it, and W22f's own post-mortem is "the module was right and the app around it
 * falsified the module's central claim". A pure predicate cannot notice that `sheet.tsx` forgot one
 * of the four vectors — which is the entire defect class M82 exists to close.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const SHEET = readFileSync(path.join(HERE, "..", "sheet.tsx"), "utf8");
/**
 * ⚠️ The CALLER half of this guard lives in `apps/qr/lib/sheet-busy-callers.test.ts`, not here.
 * A test in `packages/ui` that reads `apps/qr` off disk inverts the one-way dependency rule — the
 * package would fail because an app changed — so the assertion sits on the side that already
 * depends on this one. It is not optional: see that file's header for what it caught.
 */
/** Comments stripped — a rule that lives only in prose has repeatedly passed a source assertion in
 *  this repo (the `your-usual-read` privacy guard, W22e). Block comments only: a `//` inside a
 *  string is not a comment, which is the trap M83's review demonstrated. */
const SHEET_CODE = strip(SHEET);

describe("mayDismiss — busy blocks, idle allows", () => {
  it("⚠️ refuses while an irreversible write is in flight", () => {
    expect(mayDismiss({ busy: true })).toBe(false);
  });

  it("allows when nothing is in flight — the default for every sheet", () => {
    expect(mayDismiss({ busy: false })).toBe(true);
  });
});

describe("dragClosed — what counts as a decisive flick", () => {
  it("closes past the distance threshold, not at it", () => {
    expect(dragClosed(DRAG_CLOSE_PX + 1, 0)).toBe(true);
    expect(dragClosed(DRAG_CLOSE_PX, 0)).toBe(false);
    expect(dragClosed(DRAG_CLOSE_PX - 1, 0)).toBe(false);
  });

  it("closes past the velocity threshold however short the travel", () => {
    expect(dragClosed(4, DRAG_CLOSE_VELOCITY + 1)).toBe(true);
    expect(dragClosed(4, DRAG_CLOSE_VELOCITY)).toBe(false);
  });

  it("⚠️ is DOWNWARD only — an upward tug never dismisses", () => {
    // The sheet is bottom-anchored and rubber-bands at the top of its constraint, so an upward drag
    // is a person pulling the sheet FURTHER OPEN. Closing on it would mean a sheet that goes away
    // when you try to see more of it. Magnitudes here clear both thresholds in the wrong direction.
    expect(dragClosed(-400, -4000)).toBe(false);
    expect(dragClosed(-(DRAG_CLOSE_PX + 1), 0)).toBe(false);
    expect(dragClosed(0, -(DRAG_CLOSE_VELOCITY + 1))).toBe(false);
  });

  it("holds a real threshold — neither bound is degenerate", () => {
    // Guards against a "fix" that makes either number 0 (every stray scroll closes the sheet) or
    // absurd (nothing ever closes). Both were inline magic numbers with no assertion before M82.
    expect(DRAG_CLOSE_PX).toBeGreaterThan(40);
    expect(DRAG_CLOSE_VELOCITY).toBeGreaterThan(100);
  });
});

describe("sheetDismiss — every vector, and the one the registry forgot", () => {
  it("⚠️ refuses ALL FOUR vectors while busy — including the scrim", () => {
    // THE assertion of this slice. `docs/OPEN-ITEMS.md`'s M82 said "three dismissal vectors" and
    // "blocks the three exits", counting Esc, ✕ and drag and omitting the SCRIM — the easiest of
    // the four to hit by accident on a phone, since a bottom-anchored sheet with the keyboard up
    // leaves the whole upper screen as scrim. A guard built to that description blocks three and
    // leaks the fourth, which is indistinguishable from no guard the first time it happens.
    const refused = DISMISS_VECTORS.filter(
      (v) =>
        !sheetDismiss(
          channelOf(v) === "drag"
            ? { busy: true, via: "drag", offsetY: 999, velocityY: 9999 }
            : { busy: true, via: "radix" },
        ),
    );
    expect(refused).toEqual([...DISMISS_VECTORS]);
    expect(DISMISS_VECTORS).toHaveLength(4);
    expect(DISMISS_VECTORS).toContain("scrim");
  });

  it("⚠️ maps the three Radix-funnelled vectors onto ONE channel, and the drag onto its own", () => {
    // This is what makes the enumeration load-bearing rather than decorative: it proves the single
    // choke point covers three of the four vectors, so a future edit cannot quietly move one of
    // them onto a path of its own without this failing.
    expect(DISMISS_VECTORS.map(channelOf)).toEqual(["radix", "radix", "radix", "drag"]);
    expect(new Set(DISMISS_VECTORS.map(channelOf)).size).toBe(2);
  });

  it("allows the radix channel when idle", () => {
    expect(sheetDismiss({ busy: false, via: "radix" })).toBe(true);
  });

  it("still applies the drag threshold when idle — busy is not the only gate", () => {
    expect(sheetDismiss({ busy: false, via: "drag", offsetY: 10, velocityY: 10 })).toBe(false);
    expect(sheetDismiss({ busy: false, via: "drag", offsetY: 999, velocityY: 0 })).toBe(true);
  });

  it("⚠️ a busy drag past the threshold is still refused", () => {
    // The two gates compose in the right order: a decisive flick during a refund is exactly the
    // gesture this exists to swallow, and it is the one most likely on a tablet being handed around.
    expect(sheetDismiss({ busy: true, via: "drag", offsetY: 999, velocityY: 9999 })).toBe(false);
  });
});

describe("the wiring — sheet.tsx must actually consult the policy", () => {
  it("⚠️ routes onOpenChange through the policy", () => {
    // The single choke point: Radix funnels Esc, the scrim and the ✕ into `onOpenChange`, so this
    // one call covers three of the four vectors. Its absence is the whole bug.
    // ⚠️ SHORTHAND ONLY. The first version of this regex was `busy[^}]*via:` — which happily matches
    // `{ busy: false, via: "radix" }`, i.e. the feature switched off. An adversarial pass turned the
    // whole guard off with that one token and the suite stayed 85/85 green. `\s*,` cannot match a
    // colon, so the property shorthand is now required.
    expect(SHEET_CODE).toMatch(/sheetDismiss\(\{\s*busy\s*,\s*via:\s*"radix"\s*\}\)/);
  });

  it("⚠️ routes the drag through the policy, thresholds and all", () => {
    // The drag never enters Radix — the close is ours — so it needs its own consultation. A guard
    // on `onOpenChange` alone leaves the handle live, and the handle is the vector a person uses
    // while impatient.
    expect(SHEET_CODE).toMatch(/onDragEnd/);
    expect(SHEET_CODE).toMatch(/sheetDismiss\(\{\s*busy\s*,\s*via:\s*"drag"/);
    // The magic numbers must NOT have been re-inlined beside the policy that owns them.
    expect(SHEET_CODE).not.toMatch(/offset\.y\s*>\s*\d/);
    expect(SHEET_CODE).not.toMatch(/velocity\.y\s*>\s*\d/);
  });

  it("⚠️ keeps the ✕ visible and named while busy, and never natively disables it", () => {
    // QA §A P0 demands a visible, labelled ✕ on every sheet; M82 asks for visible-but-disabled. And
    // W22e's rule applies: the ✕ is the FIRST tabbable element here — the container above it is
    // `tabIndex={-1}`, focusable but not tabbable — so a native `disabled` blurs a focused control
    // and destroys the user's place (WCAG 2.4.3). `aria-disabled` announces the
    // state without moving focus, and the handler is the real enforcement.
    expect(SHEET_CODE).toMatch(/aria-disabled=\{busy/);
    expect(SHEET_CODE).toMatch(/aria-label=\{busy\s*\?/);
    expect(SHEET_CODE).not.toMatch(/<Dialog\.Close[^>]*\sdisabled=/s);
  });

  it("⚠️ marks the dialog aria-busy rather than mounting a second live region", () => {
    // QA §A P1 allows exactly ONE polite live region per view, and four Sheet callers already
    // render a `role="status"` inside the sheet body. A region in the primitive would be the second
    // one and would double-announce. `aria-busy` is a STATE — it tells AT the region is mid-update
    // and announces nothing on its own.
    expect(SHEET_CODE).toMatch(/aria-busy=\{busy/);
    expect(SHEET_CODE).not.toMatch(/aria-live=/);
    expect(SHEET_CODE).not.toMatch(/role="status"/);
  });

  it("⚠️ has no dismissal path that bypasses the policy", () => {
    // The completeness belt. Every close in this file must go through `sheetDismiss` — a future
    // `onEscapeKeyDown` or `onPointerDownOutside` added "for clarity" would be a parallel gate that
    // can drift out of agreement with the choke point, which is how a guard half-works.
    expect(SHEET_CODE).not.toMatch(/onEscapeKeyDown/);
    expect(SHEET_CODE).not.toMatch(/onPointerDownOutside/);
    expect(SHEET_CODE).not.toMatch(/onInteractOutside/);
    // …and the policy is consulted once per channel.
    expect([...SHEET_CODE.matchAll(/sheetDismiss\(/g)]).toHaveLength(2);
    // ⚠️ EVERY exit is counted, because banning three Radix prop names does not stop a FIFTH path.
    // The adversarial pass added `onClick={() => onOpenChange(false)}` to `Dialog.Overlay` — a
    // hand-rolled scrim close, the exact defect W22c deleted from `RefundActionSheet` — and the
    // suite stayed green. Three is the whole budget: the guarded wrapper's declaration, its one
    // guarded call, and the guarded descent handed to `SheetContent`. A fourth is a new way out.
    expect([...SHEET_CODE.matchAll(/onOpenChange\(/g)]).toHaveLength(2);
    expect(SHEET_CODE).toMatch(
      /onClose=\{\(\) => \{\s*if \(mayDismiss\(\{ busy \}\)\) onOpenChange\(false\);/,
    );
  });

  it("⚠️ hands SheetContent a GUARDED close, not a raw one", () => {
    // `onClose` is the drag's exit. It carries its own `sheetDismiss`, so today this is belt over
    // brace — but a raw `() => onOpenChange(false)` makes the NEXT consumer of `onClose` unguarded
    // by construction, and nothing else in this file would notice.
    expect(SHEET_CODE).not.toMatch(/onClose=\{\(\) => onOpenChange\(false\)\}/);
  });
});
