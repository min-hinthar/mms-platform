import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Toast, type ToastMessage } from "../toast";

/**
 * Phase 1c — the Toast's QUIET variant: spoken through the one region, drawn nowhere.
 *
 * Node env, static markup: the proposition is about what the primitive RENDERS for each message
 * shape, which needs no DOM. The region itself must be identical either way — a quiet line rides the
 * view's one live region and never needs (or gets) a second.
 */

/** The PILL's class token exactly — `ui-toast-region` and `ui-toast-quiet` share its prefix, so a
 *  substring test would be satisfied by the region the pill sits in. */
const PILL = /class="ui-toast(?:"| )/;

const render = (message: ToastMessage | null) =>
  renderToStaticMarkup(createElement(Toast, { message }));

const QUIET: ToastMessage = {
  key: 1,
  text: "Mohinga added",
  my: "ထည့်ပြီးပါပြီ",
  quiet: true,
};

describe("Toast — quiet: spoken, not drawn", () => {
  it("renders the visually-hidden line with its Burmese half, and no pill or button", () => {
    const html = render(QUIET);
    expect(html).toContain('class="ui-toast-quiet"');
    expect(html).toContain("Mohinga added");
    expect(html).toContain('lang="my"');
    expect(html).toContain("ထည့်ပြီးပါပြီ");
    expect(html).not.toMatch(PILL);
    expect(html).not.toContain("<button");
  });

  it("drops an action on a quiet line — there is nothing drawn to press", () => {
    const html = render({ ...QUIET, action: { label: "Undo", onAction: () => {} } });
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Undo");
  });

  it("keeps the ONE always-mounted polite region, quiet or not", () => {
    for (const message of [QUIET, { ...QUIET, quiet: undefined }, null]) {
      const html = render(message);
      expect(html).toMatch(/^<div role="status" aria-live="polite" aria-atomic="true"/);
      expect(html.match(/role="status"/g)).toHaveLength(1);
    }
  });

  it("the same message WITHOUT quiet still draws the pill", () => {
    const html = render({ key: 1, text: "Mohinga added", my: "ထည့်ပြီးပါပြီ" });
    expect(html).toMatch(PILL);
    expect(html).not.toContain("ui-toast-quiet");
  });
});
