import { describe, expect, it } from "vitest";
import { nameSheetCloseTarget, parkTarget, type FocusTarget } from "./grocery-focus";

/**
 * PD4 — the market page's focus chains. Each MUTATION is a row in scripts/verify-slice.mjs
 * (`grocery-focus/…`), induced and watched go red.
 */

const el = (isConnected = true): FocusTarget => ({ isConnected, focus() {} });

describe("nameSheetCloseTarget — the Name sheet's exit never drops focus on <body>", () => {
  it("a FINISHED basket: the opener, the chip and the stage are gone — the fresh-basket button takes it", () => {
    // Codex r2 on #329 (4226434706). MUTATION: drop `fresh` from the chain → null (= <body>); red.
    const fresh = el();
    expect(
      nameSheetCloseTarget({
        closedByAdd: false,
        chipAction: null,
        opener: el(false), // the tag's button unmounted with the stage
        fresh,
        stage: null,
        panelTitle: null,
      }),
    ).toBe(fresh);
  });

  it("after an add, the chip's action — even while the old opener is still mounted", () => {
    // MUTATION: drop the closedByAdd arm → the opener wins; red.
    const chipAction = el();
    expect(
      nameSheetCloseTarget({
        closedByAdd: true,
        chipAction,
        opener: el(),
        fresh: null,
        stage: el(),
        panelTitle: null,
      }),
    ).toBe(chipAction);
  });

  it("a plain close returns to the opener while it lives; a disconnected one is skipped", () => {
    const opener = el();
    const stage = el();
    expect(
      nameSheetCloseTarget({
        closedByAdd: false,
        chipAction: null,
        opener,
        fresh: null,
        stage,
        panelTitle: null,
      }),
    ).toBe(opener);
    // MUTATION: `live` ignores isConnected → a dead opener is "focused" and focus falls to <body>;
    // red.
    expect(
      nameSheetCloseTarget({
        closedByAdd: false,
        chipAction: null,
        opener: el(false),
        fresh: null,
        stage,
        panelTitle: null,
      }),
    ).toBe(stage);
  });
});

describe("parkTarget — the one parking fallback", () => {
  it("the Browse field when it exists", () => {
    const field = el();
    expect(parkTarget({ field, fresh: el(), stage: el(), panelTitle: null })).toBe(field);
  });

  it("the Scan door with a FINISHED basket: no field, no stage — the fresh-basket button", () => {
    // MUTATION: drop `fresh` → null (= <body>) when the basket sheet closes on a finished basket
    // on the Scan door (the PD4 regression: the field used to sit above both doors); red.
    const fresh = el();
    expect(parkTarget({ field: null, fresh, stage: null, panelTitle: null })).toBe(fresh);
  });

  it("the Scan door otherwise: the stage, then a camera panel's title", () => {
    const stage = el();
    expect(parkTarget({ field: null, fresh: null, stage, panelTitle: el() })).toBe(stage);
    const panelTitle = el();
    expect(parkTarget({ field: null, fresh: null, stage: null, panelTitle })).toBe(panelTitle);
  });
});
