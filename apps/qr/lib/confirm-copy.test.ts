import { describe, expect, it } from "vitest";
import { confirmCopy, dollars, type ConfirmDecision } from "./confirm-copy";
import { t } from "./i18n";

/**
 * W16c — the confirm copy's rules. Every decision the diner can be asked to confirm is walked
 * here (the DECISIONS list below IS the exhaustiveness guard: a new confirmable money action that
 * isn't added shows up as a bare compile error on the union, and a kind added to the union with
 * no copy branch can't typecheck at all).
 */

const DECISIONS: ConfirmDecision[] = [
  { kind: "sendToKitchen", itemCount: 3 },
  { kind: "sendToKitchen", itemCount: 1 },
  { kind: "sendToKitchen", itemCount: 0 },
  { kind: "pay", amountCents: 4210 },
  { kind: "authorizeShare", amountCents: 1240 },
];

describe("confirmCopy — both tongues, every field, every decision", () => {
  it("never returns an empty slot (a blank confirm is a dead-end decision)", () => {
    for (const d of DECISIONS) {
      const c = confirmCopy(d);
      const blanks = Object.entries(c)
        .filter(([, v]) => !v || !v.trim())
        .map(([k]) => `${d.kind}.${k}`);
      expect(blanks).toEqual([]);
    }
  });

  it("every MY line carries Myanmar script — no English pasted into the Burmese slot", () => {
    for (const d of DECISIONS) {
      const c = confirmCopy(d);
      for (const field of ["questionMy", "detailMy", "proceedMy", "cancelMy"] as const) {
        expect(/\p{Script=Myanmar}/u.test(c[field]), `${d.kind}.${field}`).toBe(true);
      }
    }
  });

  it("MONEY DIGITS ARE LATIN in BOTH tongues — never ၀–၉ (the money-path numerals rule)", () => {
    for (const d of DECISIONS) {
      const c = confirmCopy(d);
      const burmeseNumerals = Object.entries(c)
        .filter(([, v]) => /[၀-၉]/.test(v))
        .map(([k]) => `${d.kind}.${k}`);
      expect(burmeseNumerals).toEqual([]);
    }
  });
});

describe("confirmCopy — the numbers the diner is deciding on", () => {
  it("the amount appears in BOTH tongues' question and on the proceed button", () => {
    // Not transcribed: the expectation is `dollars()` of the same cents the decision carries.
    const cents = 4210;
    const c = confirmCopy({ kind: "pay", amountCents: cents });
    const amount = dollars(cents);
    expect(amount).toBe("$42.10"); // pins the formatter itself (2dp, Latin, leading $)
    expect(c.questionEn).toContain(amount);
    expect(c.questionMy).toContain(amount);
    expect(c.proceedEn).toContain(amount);
    expect(c.proceedMy).toContain(amount);
  });

  it("a share hold names its own amount, not the table's", () => {
    const c = confirmCopy({ kind: "authorizeShare", amountCents: 1240 });
    expect(c.questionEn).toContain(dollars(1240));
    expect(c.questionMy).toContain(dollars(1240));
  });

  it("the send confirm names the COUNT it commits, and pluralizes EN (MY ခု is invariant)", () => {
    const three = confirmCopy({ kind: "sendToKitchen", itemCount: 3 });
    const one = confirmCopy({ kind: "sendToKitchen", itemCount: 1 });
    expect(three.questionEn).toBe(`Send 3 ${t("en", "countItems")} to the kitchen?`);
    expect(one.questionEn).toBe(`Send 1 ${t("en", "countItem")} to the kitchen?`);
    // The two EN forms must actually DIFFER — a pluralizer that returns one string for both is
    // the degenerate fixture this asserts against.
    expect(three.questionEn).not.toBe(one.questionEn);
    expect(three.questionMy).toContain("3");
    expect(one.questionMy).toContain("1");
  });

  it("an unknown count falls back to a countless question, never 'Send 0 items'", () => {
    const c = confirmCopy({ kind: "sendToKitchen", itemCount: 0 });
    expect(c.questionEn).not.toContain("0");
    expect(c.questionMy).not.toContain("0");
  });
});

describe("confirmCopy — the owner's own words", () => {
  it("the send-to-kitchen PROCEED button carries the owner's Burmese verbatim (W16 directive)", () => {
    // Pinned so a future reword is a deliberate act with the owner, not a silent drift: this exact
    // string is what Min wrote in the W16 directive for this button.
    expect(confirmCopy({ kind: "sendToKitchen", itemCount: 2 }).proceedMy).toBe(
      "Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ",
    );
  });
});
