import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Stepper } from "../stepper";
import { Icon } from "../icon";

/**
 * Phase 2c · pad — the Stepper's names can be handed in WHOLE (`labels`), so a caller with its own
 * dictionary (the staff console, Burmese-first) names every control in one tongue. Before this the
 * primitive hard-coded "Remove {name}" and "Decrease {name} quantity", so the staff line editor
 * could localize one name of three and shipped the rest in English. All-or-nothing: the three base
 * names come together; a caller that passes nothing (the diner cart) renders exactly as before.
 */
const names = (props: Record<string, unknown>) =>
  [
    ...renderToStaticMarkup(
      createElement(Stepper, { onChange: () => {}, name: "Mohinga", ...props } as never),
    ).matchAll(/aria-label="([^"]*)"/g),
  ].map((m) => m[1]);

const LABELS = {
  decrease: "မုန့်ဟင်းခါး တစ်ခု လျှော့",
  remove: "မုန့်ဟင်းခါး ကို ဖျက်",
  increase: "မုန့်ဟင်းခါး တစ်ခု ထပ်ထည့်",
  soldOut: "မုန့်ဟင်းခါး ကုန်သွားပြီ",
  max: "မုန့်ဟင်းခါး အများဆုံး ဖြစ်ပြီ",
};

describe("Stepper — labels", () => {
  it("names both controls from the labels at every state", () => {
    // qty 2: − is a decrease; + an increase.
    expect(names({ qty: 2, labels: LABELS })).toEqual([LABELS.decrease, LABELS.increase]);
    // qty 1: − became Remove.
    expect(names({ qty: 1, labels: LABELS })).toEqual([LABELS.remove, LABELS.increase]);
    // Sold out and at the maximum each take their own label.
    expect(names({ qty: 2, labels: LABELS, soldOut: true })[1]).toBe(LABELS.soldOut);
    expect(names({ qty: 5, max: 5, labels: LABELS })[1]).toBe(LABELS.max);
  });

  it("a caller that passes no labels renders exactly as before (the diner cart)", () => {
    expect(names({ qty: 1 })).toEqual(["Remove Mohinga", "Increase Mohinga quantity"]);
    expect(names({ qty: 2, soldOut: true })).toEqual([
      "Decrease Mohinga quantity",
      "Mohinga is sold out",
    ]);
    expect(names({ qty: 3, max: 3 })[1]).toBe("Maximum 3 Mohinga");
  });

  it("a busy control's reason still wins over every label", () => {
    expect(names({ qty: 2, labels: LABELS, disabled: true, disabledLabel: "Wait" })).toEqual([
      "Wait",
      "Wait",
    ]);
  });
});

describe("Icon — sliders (the order pad's options corner)", () => {
  it("renders a decorative glyph", () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: "sliders" }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<svg");
  });
});
