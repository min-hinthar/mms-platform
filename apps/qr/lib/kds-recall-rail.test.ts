import { describe, expect, it } from "vitest";
import { CARD_CHIPS, DISH_CHIPS, railWith, type RailChip } from "./kds-recall-rail";

const cardChip = (n: number): RailChip => ({ key: `card-${n}` });
const dishChip = (n: number): RailChip => ({ key: `line:${n}`, scope: "line" });

describe("railWith — a dish chip never evicts a card chip (decision 15 · B6)", () => {
  it("five card chips stand through any number of single-dish Dones", () => {
    // lck/kds-rail/dish-evicts-a-card — the old one-cap rail: the third dish Done pushed the oldest
    // mis-bumped card off inside its two minutes.
    let rail: RailChip[] = [];
    for (let i = 0; i < CARD_CHIPS; i++) rail = railWith(rail, cardChip(i));
    for (let i = 0; i < 10; i++) rail = railWith(rail, dishChip(i));
    expect(rail.filter((r) => r.scope !== "line").map((r) => r.key)).toEqual([
      "card-4",
      "card-3",
      "card-2",
      "card-1",
      "card-0",
    ]);
  });

  it("dishes keep their own cap, newest first", () => {
    // lck/kds-rail/dishes-uncapped — a run of dish Dones grows the rail without bound.
    let rail: RailChip[] = [];
    for (let i = 0; i < 6; i++) rail = railWith(rail, dishChip(i));
    expect(rail.map((r) => r.key)).toEqual(["line:5", "line:4", "line:3"]);
    expect(rail).toHaveLength(DISH_CHIPS);
  });

  it("cards alone keep the last five, exactly as before", () => {
    let rail: RailChip[] = [];
    for (let i = 0; i < 7; i++) rail = railWith(rail, cardChip(i));
    expect(rail.map((r) => r.key)).toEqual(["card-6", "card-5", "card-4", "card-3", "card-2"]);
  });
});
