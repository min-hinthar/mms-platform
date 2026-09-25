/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import type { Handoff } from "@/lib/register-ui";

/**
 * Phase 2c · register — the paid card (canonical shape; red-first by hand, noted per case). It is a
 * NAMED REGION that is focused, never a `role="status"`: the name carries the facts (Paid · Change ·
 * #CODE), so focus speaks them once.
 */
const { HandoffCard } = await import("./HandoffCard");
const { StaffLangProvider } = await import("./StaffLangProvider");

afterEach(cleanup);

const COUNTER: Handoff = {
  orderId: "0000-a1b2c3",
  totalCents: 1347,
  tipCents: null,
  tenderedCents: 2000,
  isCounter: true,
  cartId: "c1",
};

const show = (h: Handoff) =>
  render(
    <StaffLangProvider lang="en">
      <HandoffCard lang="en" handoff={h} />
    </StaffLangProvider>,
  );

describe("HandoffCard — the paid moment", () => {
  it("is a region NAMED by its facts — Paid, the change, the #CODE — and never a status region", () => {
    const { container } = show(COUNTER);
    // By hand: put `role="status"` back — red (the card is announced twice: live AND on focus).
    expect(container.querySelector('[role="status"]')).toBeNull();
    // 2000 − 1347 = 653. By hand: name it by the title alone — red.
    const card = screen.getByRole("region", { name: /Paid.*Change.*\$6\.53.*#A1B2C3/ });
    expect(card.getAttribute("tabindex")).toBe("-1");
    // The check glyph is decoration; the title word is the name.
    expect(card.querySelector('[aria-hidden="true"]')?.textContent).toBe("✓");
  });

  it("the rows come from handoffRows: Total, Cash received, Change", () => {
    show(COUNTER);
    const dl = document.querySelector("dl")!;
    const rows = [...dl.querySelectorAll(":scope > div")].map((d) => [
      d.querySelector("dt")!.textContent,
      d.querySelector("dd")!.textContent,
    ]);
    expect(rows).toEqual([
      [STAFF["floor.settled.row.total"].en, "$13.47"],
      [STAFF["table.detail.handoff.tendered"].en, "$20.00"],
      [STAFF["settle.cash.changeLabel"].en, "$6.53"],
    ]);
  });

  it("an exact tender still says Change $0.00 — the fact the cashier reads before closing the drawer", () => {
    show({ ...COUNTER, tenderedCents: 1347 });
    expect(screen.getByRole("region", { name: /Change.*\$0\.00/ })).toBeTruthy();
  });

  it("a counter card goes Back to the counter as a primary xl link to the floor BY NAME", () => {
    show(COUNTER);
    const back = screen.getByRole("link", { name: /Back to the counter/ });
    expect(back.getAttribute("href")).toBe(STAFF_DOOR_TARGET.counter);
    expect(back.classList.contains("ui-btn-primary")).toBe(true);
    expect(back.classList.contains("ui-btn-xl")).toBe(true);
    // The arrow is decoration.
    expect(within(back).getByText("→").getAttribute("aria-hidden")).toBe("true");
  });

  it("a TABLE card is rows only — no #CODE, no call-out, no link", () => {
    show({ ...COUNTER, isCounter: false, tipCents: 790, tenderedCents: 5000, totalCents: 5000 });
    // By hand: drop the `isCounter` gate — a table card calls out an order code nobody waits on; red.
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body.textContent).not.toContain("#");
    expect(document.body.textContent).not.toContain(STAFF["table.detail.handoff.callout"].en);
    expect(screen.getByRole("region", { name: /Paid.*Change.*\$0\.00/ })).toBeTruthy();
    const labels = [...document.querySelectorAll("dt")].map((d) => d.textContent);
    expect(labels).toEqual([
      STAFF["floor.settled.row.total"].en,
      STAFF["floor.settled.row.tip"].en,
      STAFF["table.detail.handoff.tendered"].en,
      STAFF["settle.cash.changeLabel"].en,
    ]);
  });

  it("no tender (a reader's counter settle): the total names the card", () => {
    show({ ...COUNTER, tenderedCents: null });
    expect(screen.getByRole("region", { name: /Paid.*\$13\.47.*#A1B2C3/ })).toBeTruthy();
    expect(document.querySelectorAll("dt")).toHaveLength(1);
  });
});
