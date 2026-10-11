/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { CartItem } from "@mms/db";

/**
 * PD10 (Codex round 2 on #346) — the One Pass's dish rows keep their WORDS on the boarded pay step.
 * A comp and a removal both strike the price, and a strikethrough is CSS a screen reader never hears
 * and a sighted payer cannot tell apart. So "On the house" and "Removed" stay, and so do "In your
 * basket" and a to-go draft's sentence. Only the kitchen track and the owner leave the boarded rows.
 *
 * `NumberFlow` re-exports `@number-flow/react` (a custom element jsdom cannot run); the rest of
 * `@mms/ui` (the pass, the track) is real.
 */
vi.mock("@mms/ui", async (orig) => ({
  ...(await orig<typeof import("@mms/ui")>()),
  NumberFlow: ({ value }: { value: number }) => <span>{value}</span>,
}));

const { LivePass } = await import("./LivePass");

const NOW = "2026-10-08T10:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const dish = (over: Partial<CartItem>): CartItem => ({
  id: "l-1",
  menuItemId: "m-1",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "in_progress",
  fireAt: at(-600_000),
  bumpedAt: null,
  fulfillment: "dinein",
  ...over,
});
const COMPED = dish({ id: "l-comp", name: "Shan Noodles", comped: true });
const VOIDED = dish({ id: "l-void", name: "Ohn No Khao Swè", lineState: "voided" });
const COOKING = dish({ id: "l-cook", name: "Mohinga" });

function renderPass(boarded: boolean, items: CartItem[] = [COMPED, VOIDED, COOKING]) {
  return render(
    <LivePass
      items={items}
      nowIso={NOW}
      tableNumber={7}
      hostName="Aye"
      hostLabel="You"
      ownerOf={() => "Thiri"}
      totalCents={1200}
      tipCents={0}
      filling={null}
      turning={false}
      boarded={boarded}
    />,
  );
}
const rowOf = (name: string) =>
  Array.from(document.querySelectorAll("li.live-pass-dish")).find((li) =>
    li.textContent?.includes(name),
  )!;

afterEach(() => cleanup());

describe("LivePass — a boarded row keeps its words; only the track and the owner leave", () => {
  it("boarded: a comp reads 'On the house' and a removal 'Removed' — never a bare strikethrough", () => {
    // MUTATION (live-pass/boarded-drops-comp-and-removal): the boarded variant drops the whole
    // state line — a comp and a removal are two identical struck prices, and a screen reader hears
    // a full price for both; red.
    renderPass(true);
    expect(rowOf("Shan Noodles").textContent).toContain("On the house");
    expect(rowOf("Ohn No Khao Swè").textContent).toContain("Removed");
    // The kitchen track and the owner are not on the boarded rows.
    expect(document.querySelector(".live-pass-dishes .ui-track")).toBeNull();
    expect(document.body.textContent).not.toContain("Thiri");
    // A row with nothing to say draws no empty state line, and a comp alone leads with no dot.
    expect(rowOf("Mohinga").querySelector(".live-pass-dish-state")).toBeNull();
    expect(rowOf("Shan Noodles").querySelector(".live-pass-dot")).toBeNull();
  });

  it("boarded: a to-go draft keeps its sentence (what the charge covers), without the ring", () => {
    renderPass(true, [
      dish({ id: "l-togo", lineState: "draft", fulfillment: "togo", fireAt: null }),
    ]);
    const row = rowOf("Mohinga");
    expect(row.textContent).toContain("Not sent yet — goes to the kitchen when you pay");
    expect(row.querySelector(".ui-track")).toBeNull();
  });

  it("the full pass keeps every row's track, its words and the owner", () => {
    renderPass(false);
    expect(rowOf("Mohinga").querySelector(".ui-track")).not.toBeNull();
    expect(rowOf("Shan Noodles").textContent).toContain("On the house");
    expect(rowOf("Shan Noodles").querySelector(".ui-track")).not.toBeNull();
    expect(rowOf("Ohn No Khao Swè").textContent).toContain("Removed");
    expect(rowOf("Mohinga").textContent).toContain("Thiri");
  });
});
