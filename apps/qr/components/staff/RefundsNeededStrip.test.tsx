/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefundNeeded } from "@/lib/approvals";
import { STAFF } from "@/lib/i18n/staff";

/**
 * P2e review (A5) — the refunds strip's "Mark refunded" NAME says what the button SHOWS, in the
 * device's mode. Every row shows the same two words, so the name carries the payment intent too
 * (`al()`'s `verb` arm: the visible label, then the subject). Before this, the label half was
 * derived with its echo always on, so a Burmese-only device announced "Mark refunded" beside a
 * button that no longer printed it — a name holding a word the screen does not.
 *
 * Read off the RENDER, never off `al()`: the parts are the Burmese span and the English echo when
 * `<Chrome>` draws the pair, and the name must be exactly those parts, then the intent.
 */
vi.mock("@/lib/approvals", () => ({ resolveRefundNeeded: () => Promise.resolve() }));

const { RefundsNeededStrip } = await import("./RefundsNeededStrip");
const { StaffLangProvider } = await import("./StaffLangProvider");

afterEach(cleanup);

const ROW: RefundNeeded = {
  id: "r1",
  paymentIntent: "pi_r1",
  cartId: null,
  amountCents: 1200,
  reason: "orphaned_charge",
  createdAt: "2026-09-09T01:00:00.000Z",
};

const MODES = [
  ["English", "en", true],
  ["Both", "my", true],
  ["Burmese only", "my", false],
] as const;

describe("Mark refunded — the name is the button's own label, then the intent", () => {
  for (const [what, lang, echoes] of MODES) {
    it(`${what}: the label half of the name is exactly what the button shows`, () => {
      const { container } = render(
        <StaffLangProvider lang={lang} echoes={echoes}>
          <RefundsNeededStrip lang={lang} refunds={[ROW]} />
        </StaffLangProvider>,
      );
      const btn = container.querySelector<HTMLButtonElement>("#refund-mark-r1")!;
      const name = btn.getAttribute("aria-label") ?? "";
      const spans = btn.querySelectorAll('[lang="my"], .chrome-en');
      const parts = spans.length ? [...spans].map((e) => e.textContent ?? "") : [btn.textContent];
      expect(name).toBe(`${parts.join(" ")} — ${ROW.paymentIntent}`);
    });
  }

  it("Burmese only: no English in the name, because none is on the button", () => {
    const { container } = render(
      <StaffLangProvider lang="my" echoes={false}>
        <RefundsNeededStrip lang="my" refunds={[ROW]} />
      </StaffLangProvider>,
    );
    const btn = container.querySelector<HTMLButtonElement>("#refund-mark-r1")!;
    const en = STAFF["table.appr.verb.markRefunded"].en;
    expect(btn.textContent).not.toContain(en);
    expect(btn.getAttribute("aria-label")).not.toContain(en);
    expect(btn.getAttribute("aria-label")).toContain(STAFF["table.appr.verb.markRefunded"].my);
  });
});
