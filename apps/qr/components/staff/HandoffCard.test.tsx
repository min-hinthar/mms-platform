/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    // PD6 — the solid ✓ disc is decoration; the title word is the name.
    const disc = card.querySelector(".staff-seal-disc")!;
    expect(disc.getAttribute("aria-hidden")).toBe("true");
    expect(disc.querySelector("svg")).not.toBeNull();
  });

  it("the rows come from handoffRows: the Change is the HERO, Total and Cash received count it back (PD6)", () => {
    show(COUNTER);
    const hero = document.querySelector(".staff-seal-hero")!;
    expect(hero.getAttribute("data-row")).toBe("change");
    expect(hero.querySelector("dt")!.textContent).toBe(STAFF["settle.cash.changeLabel"].en);
    expect(hero.querySelector("dd")!.textContent).toBe("$6.53");
    const rows = [...document.querySelectorAll(".staff-seal-rows > div")].map((d) => [
      d.querySelector("dt")!.textContent,
      d.querySelector("dd")!.textContent,
    ]);
    expect(rows).toEqual([
      [STAFF["floor.settled.row.total"].en, "$13.47"],
      [STAFF["table.detail.handoff.tendered"].en, "$20.00"],
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
      STAFF["settle.cash.changeLabel"].en,
      STAFF["floor.settled.row.total"].en,
      STAFF["floor.settled.row.tip"].en,
      STAFF["table.detail.handoff.tendered"].en,
    ]);
    // No stub on a table's seal (reconciliation 4).
    expect(document.querySelector(".ui-pass")).toBeNull();
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

describe("HandoffCard — PD6's SEAL (m6 screen 2)", () => {
  it("the #CODE stub IS the CounterPass, named by its label and the code, notched to the seal's own ground", () => {
    show(COUNTER);
    const pass = document.querySelector(".ui-pass.staff-seal-pass")!;
    // MUTATION seal/stub-redrawn (the stub drawn as a plain paragraph again): the code stops being
    // the one pass the family learns; red.
    expect(pass).not.toBeNull();
    expect(pass.getAttribute("data-figure")).toBe("code");
    expect(document.getElementById("handoff-code")!.textContent).toContain("#A1B2C3");
    expect(pass.textContent).toContain(STAFF["table.detail.handoff.callout"].en);
    // The pass never stamps here: the seal's ✓ disc is the one paid mark on the counter.
    expect(pass.getAttribute("data-terminal")).toBeNull();
  });

  it("CALM by default — no wash, no rise: green fills only where the settle just landed (m6 B6)", () => {
    show(COUNTER);
    const seal = document.querySelector(".staff-seal")!;
    expect(seal.hasAttribute("data-landing")).toBe(false);
    expect(seal.classList.contains("mms-rise")).toBe(false);
    cleanup();
    render(
      <StaffLangProvider lang="en">
        <HandoffCard lang="en" handoff={COUNTER} landing />
      </StaffLangProvider>,
    );
    const landed = document.querySelector(".staff-seal")!;
    expect(landed.hasAttribute("data-landing")).toBe(true);
    expect(landed.classList.contains("mms-rise")).toBe(true);
  });

  it("no tender: the Total is the hero; no Change and no Cash received anywhere (Codex round 4 on m6)", () => {
    show({ ...COUNTER, tenderedCents: null, tipCents: 200, totalCents: 1547 });
    const hero = document.querySelector(".staff-seal-hero")!;
    expect(hero.getAttribute("data-row")).toBe("total");
    expect(hero.querySelector("dd")!.textContent).toBe("$15.47");
    expect(document.body.textContent).not.toContain(STAFF["settle.cash.changeLabel"].en);
    expect(document.body.textContent).not.toContain(STAFF["table.detail.handoff.tendered"].en);
    expect([...document.querySelectorAll(".staff-seal-rows dt")].map((d) => d.textContent)).toEqual(
      [STAFF["floor.settled.row.tip"].en],
    );
  });

  it("the quiet secondary rides beside Back to the counter, and Takeaway bags outranks it (decision 20)", () => {
    render(
      <StaffLangProvider lang="en">
        <HandoffCard lang="en" handoff={COUNTER} next={<button type="button">Walk-up</button>} />
      </StaffLangProvider>,
    );
    const row = document.querySelector(".staff-seal-actions-in")!;
    expect([...row.querySelectorAll("a, button")].map((e) => e.textContent)).toEqual([
      "Walk-up",
      `${STAFF["table.detail.handoff.done"].en}→`,
    ]);
    cleanup();
    render(
      <StaffLangProvider lang="en">
        <HandoffCard
          lang="en"
          handoff={{ ...COUNTER, sentEarly: true }}
          next={<button type="button">Walk-up</button>}
        />
      </StaffLangProvider>,
    );
    expect(screen.queryByRole("button", { name: "Walk-up" })).toBeNull();
    expect(screen.getByRole("link", { name: STAFF["expo.title"].en })).toBeTruthy();
  });

  it("nativeBack — the way out is a full-document <a> (a stuck start's queue goes with the page)", () => {
    render(
      <StaffLangProvider lang="en">
        <HandoffCard lang="en" handoff={COUNTER} nativeBack />
      </StaffLangProvider>,
    );
    const back = screen.getByRole("link", { name: /Back to the counter/ });
    expect(back.getAttribute("href")).toBe(STAFF_DOOR_TARGET.counter);
    expect(back.tagName).toBe("A");
  });

  it("a dine-in seal in the counter's pane: Back to the counter closes the pane; no stub, no #CODE", () => {
    const onDone = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <HandoffCard
          lang="en"
          handoff={{ ...COUNTER, isCounter: false }}
          onDone={onDone}
          headingLevel={3}
        />
      </StaffLangProvider>,
    );
    expect(document.querySelector(".ui-pass")).toBeNull();
    expect(document.body.textContent).not.toContain("#A1B2C3");
    fireEvent.click(screen.getByRole("link", { name: /Back to the counter/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Burmese: the visual English echo of the title and the hero word stays OUT of the name", () => {
    render(
      <StaffLangProvider lang="my">
        <HandoffCard lang="my" handoff={COUNTER} />
      </StaffLangProvider>,
    );
    const seal = document.querySelector(".staff-seal") as HTMLElement;
    // "Change" is K15-HIGH: its echo is drawn even on a Burmese-only device; both echoes hidden.
    const echoes = [...seal.querySelectorAll(".staff-seal-echo")];
    expect(echoes.map((e) => e.textContent)).toContain(STAFF["settle.cash.changeLabel"].en);
    expect(echoes.every((e) => e.getAttribute("aria-hidden") === "true")).toBe(true);
    const name = screen.getByRole("region", { name: /\$6\.53/ });
    expect(name).toBe(seal);
  });
});

describe("the seal's wide geometry is the till's (m6 decision 7)", () => {
  it("the actions take track 5 of the tray's own tracks, under the ONE till query", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { cssDeclarations } = await import("@/lib/css-declarations");
    const { TILL_MEDIA, TILL_COLUMNS_PX } = await import("@/lib/till");
    const decls = cssDeclarations(readFileSync(join(__dirname, "../../app/globals.css"), "utf8"));
    const wide = decls.filter((d) => d.selector.startsWith(".staff-seal[data-wide]"));
    expect(new Set(wide.map((d) => d.media))).toEqual(new Set([`@media ${TILL_MEDIA}`]));
    const tracks = wide.find(
      (d) =>
        d.selector === ".staff-seal[data-wide] .staff-seal-actions" &&
        d.prop === "grid-template-columns",
    )!;
    const [o, g1, t, g2, v] = TILL_COLUMNS_PX;
    expect(tracks.value.replace(/\s+/g, " ")).toBe(
      `minmax(0, ${o}fr) ${g1}px minmax(0, ${t}fr) ${g2}px minmax(0, ${v}fr)`,
    );
    // MUTATION seal/actions-leave-the-money-corner (track 1): Walk-up lands under Take's old span;
    // red.
    expect(
      wide.find(
        (d) =>
          d.selector === ".staff-seal[data-wide] .staff-seal-actions > .staff-seal-actions-in" &&
          d.prop === "grid-column",
      )!.value,
    ).toBe("5");
    // The seal stands where the tray stood: the same gutter and padding (x52–1314 of content).
    const box = Object.fromEntries(
      wide.filter((d) => d.selector === ".staff-seal[data-wide]").map((d) => [d.prop, d.value]),
    );
    expect(box).toEqual({ "margin-inline": "var(--s5)", padding: "var(--s8)" });
  });
});
