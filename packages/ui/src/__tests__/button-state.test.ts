import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../button";

/**
 * Phase 2a — the Button's own refusal state survives whatever a caller spreads.
 *
 * The primitive decides `aria-disabled` / `aria-busy` from `disabled` / `busy`. A caller that ALSO
 * passes `aria-disabled={held || undefined}` (the natural React idiom) used to land in `...rest`,
 * spread AFTER the primitive's own attributes — and an explicit `undefined` is still a key, so it
 * ERASED the busy state: a Send mid-flight read as enabled to assistive tech. The caller's value may
 * ADD a refusal; it can never remove the primitive's.
 */
const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(Button, props as never, "Send"));

describe("Button — the primitive's refusal state cannot be erased by a caller's spread", () => {
  it("busy stays aria-disabled when the caller passes aria-disabled={undefined}", () => {
    const html = render({ busy: true, "aria-disabled": undefined });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
  });

  it("busy stays aria-disabled when the caller passes aria-disabled={false}", () => {
    expect(render({ busy: true, "aria-disabled": false })).toContain('aria-disabled="true"');
  });

  it("a caller's aria-disabled still ADDS a refusal on an idle button", () => {
    expect(render({ "aria-disabled": true })).toContain('aria-disabled="true"');
  });

  it("an idle button with no refusal carries none", () => {
    expect(render({})).not.toContain("aria-disabled");
  });
});
