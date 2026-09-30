/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import type { Handoff } from "@/lib/register-ui";

/**
 * Phase 2c · register — the paid card (canonical shape; red-first by hand, noted per case). It is a
 * NAMED REGION that is focused, never a `role="status"`: the name carries the facts (Paid · Change ·
 * #CODE), so focus speaks them once.
 */
// ⚠️ P2F-INTEGRATION — REMOVE when Area B lands: `laneHref` (plan §5.4) is B's export in
// staff-more.ts; the PLANNED rule is layered over the real module until then.
vi.mock("@/lib/staff-more", async (orig) => ({
  ...(await orig<typeof import("@/lib/staff-more")>()),
  laneHref: (inPane: boolean) => (inPane ? "#expo-h" : "/staff?floor=1#expo-h"),
}));

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

  // Phase 2d · review fixes — the card's title follows its host's outline: h2 on the table page,
  // h3 inside the counter's pane (Table 7 › Paid), the StaffPromoControl pattern.
  it("its title is an h2 by default and an h3 when the host asks (the pane)", () => {
    show(COUNTER);
    expect(document.getElementById("handoff-title")!.tagName).toBe("H2");
    cleanup();
    render(
      <StaffLangProvider lang="en">
        <HandoffCard lang="en" handoff={COUNTER} headingLevel={3} />
      </StaffLangProvider>,
    );
    expect(document.getElementById("handoff-title")!.tagName).toBe("H3");
    // Still the card's name — the level changes the outline, never the facts.
    expect(screen.getByRole("region", { name: /Paid.*Change.*\$6\.53.*#A1B2C3/ })).toBeTruthy();
  });

  it("no tender (a reader's counter settle): the total names the card", () => {
    show({ ...COUNTER, tenderedCents: null });
    expect(screen.getByRole("region", { name: /Paid.*\$13\.47.*#A1B2C3/ })).toBeTruthy();
    expect(document.querySelectorAll("dt")).toHaveLength(1);
  });
});

describe("HandoffCard — Phase 2f · food sent before it was paid", () => {
  it("names the early send in the card's NAME, and links to the lane (the page's zone; the pane's hash)", () => {
    show({ ...COUNTER, sentEarly: true });
    const card = screen.getByRole("region", {
      name: new RegExp(`#A1B2C3.*${STAFF["table.detail.handoff.sentEarly"].en.slice(0, 20)}`),
    });
    const line = document.getElementById("handoff-sent-early")!;
    expect(line.textContent).toBe(STAFF["table.detail.handoff.sentEarly"].en);
    const lane = within(card).getByRole("link", { name: STAFF["expo.title"].en });
    expect(lane.getAttribute("href")).toBe("/staff?floor=1#expo-h");
    expect(lane.className).toContain("ui-btn-secondary");
    // Never "ready": the lane says that (owner 7d).
    expect(line.closest(".staff-handoff-early")!.textContent).not.toMatch(/ready/i);
    cleanup();
    render(
      <StaffLangProvider lang="en">
        <HandoffCard lang="en" handoff={{ ...COUNTER, sentEarly: true }} onDone={() => {}} />
      </StaffLangProvider>,
    );
    expect(screen.getByRole("link", { name: STAFF["expo.title"].en }).getAttribute("href")).toBe(
      "#expo-h",
    );
  });

  it("without the flag — and on a table's card, ever — no line and no lane link", () => {
    show(COUNTER);
    expect(document.getElementById("handoff-sent-early")).toBeNull();
    expect(screen.queryByRole("link", { name: STAFF["expo.title"].en })).toBeNull();
    cleanup();
    show({ ...COUNTER, isCounter: false, sentEarly: true });
    expect(document.getElementById("handoff-sent-early")).toBeNull();
    expect(screen.queryByRole("link", { name: STAFF["expo.title"].en })).toBeNull();
  });
});
