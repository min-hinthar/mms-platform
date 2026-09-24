import { describe, expect, it } from "vitest";
import { centsToField, noteLabel, parseMoneyCents, sanitizeMoneyInput } from "./money-input";

/** What the field holds after `text` is typed ONE KEY AT A TIME — the path real hands take. */
const typed = (text: string) => [...text].reduce((v, ch) => sanitizeMoneyInput(v + ch), "");

describe("parseMoneyCents — the whole string decides what a comma means", () => {
  it.each([
    ["5,00", 500], // a decimal comma — the W21d P1: this recorded 50000
    ["5,5", 550],
    ["12,50", 1250],
    ["1,234.56", 123456], // a dot present: commas are grouping
    ["1,234", 123400], // comma-only, three digits after: grouping
    ["0", 0],
    ["5", 500],
    [".5", 50],
    ["5.", 500],
  ])("%s → %i", (text, cents) => {
    // MUTATION: delete the decimal-comma branch — "5,00" reads as 50000; red.
    expect(parseMoneyCents(text)).toBe(cents);
  });

  it("0.29 → 29 exactly — integer arithmetic, never float × 100", () => {
    const cents = parseMoneyCents("0.29");
    // MUTATION: `parseFloat(normalized) * 100` — 28.999999999999996, not an integer; red.
    expect(Number.isSafeInteger(cents)).toBe(true);
    expect(cents).toBe(29);
  });

  it.each([[""], ["."], [","], ["12345678"]])("%j is not an amount → null", (text) => {
    expect(parseMoneyCents(text)).toBeNull();
  });

  it.each([["5,00."], ["5,5.0"], ["12,50.00"]])(
    "%j — a decimal comma then a dot (a paste) is not an amount → null",
    (text) => {
      // MUTATION: drop the mixed-order refusal — "5,00." strips its comma as grouping and reads
      // 50000 cents ($500 for a $5 tip); "5,5.0" reads 5500. Red.
      expect(parseMoneyCents(text)).toBeNull();
    },
  );
});

describe("sanitizeMoneyInput — per keystroke it only refuses, never rewrites", () => {
  it("'5,00' typed key by key keeps its comma and reads $5.00", () => {
    // MUTATION: the sanitizer drops commas (the old per-keystroke path) — the field builds "500"
    // and the settle records 50000; red.
    expect(typed("5,00")).toBe("5,00");
    expect(parseMoneyCents(typed("5,00"))).toBe(500);
  });

  it("'12,50' typed → 1250", () => {
    expect(parseMoneyCents(typed("12,50"))).toBe(1250);
  });

  it("a dot after a DECIMAL comma is refused: '5,00.' typed stays '5,00' and reads $5.00", () => {
    // MUTATION: accept the dot — the field holds "5,00.", where a dot makes every comma grouping,
    // and the settle records 50000 cents for a $5 tip. Red.
    expect(typed("5,00.")).toBe("5,00");
    expect(parseMoneyCents(typed("5,00."))).toBe(500);
    expect(typed("5,5.0")).toBe("5,50");
    expect(parseMoneyCents(typed("5,5.0"))).toBe(550);
  });

  it("a dot after a GROUPING comma is still kept: '1,234.56' typed → 123456", () => {
    expect(typed("1,234.56")).toBe("1,234.56");
    expect(parseMoneyCents(typed("1,234.56"))).toBe(123456);
    expect(parseMoneyCents(typed("1,234"))).toBe(123400);
  });

  it("a second dot is refused: '1.2.3' → '1.23'", () => {
    expect(typed("1.2.3")).toBe("1.23");
  });

  it("a third decimal digit is refused, not rounded: '1,234.567' → '1,234.56'", () => {
    // MUTATION: allow a third decimal — the field holds "1,234.567"; red.
    expect(typed("1,234.567")).toBe("1,234.56");
    expect(parseMoneyCents(typed("1,234.567"))).toBe(123456);
  });

  it("drops everything that is not a digit, a dot or a pre-dot comma; caps at 12 characters", () => {
    expect(sanitizeMoneyInput("$ 5a.0,0")).toBe("5.00");
    expect(sanitizeMoneyInput("1234567890123456")).toBe("123456789012");
  });

  it("is keystroke-stable: re-sanitizing its own output changes nothing", () => {
    for (const s of ["5,00", "1,234.56", "1.2.3", "0.29", ",,,", "12,5"]) {
      const once = sanitizeMoneyInput(s);
      expect(sanitizeMoneyInput(once)).toBe(once);
    }
  });
});

describe("the formatters", () => {
  it("centsToField(2000) = '20.00'", () => {
    expect(centsToField(2000)).toBe("20.00");
    expect(centsToField(5)).toBe("0.05");
  });

  it("noteLabel drops the cents only on whole dollars", () => {
    expect(noteLabel(2000)).toBe("$20");
    expect(noteLabel(1347)).toBe("$13.47");
  });

  it("round-trips through the parser", () => {
    for (const c of [0, 5, 29, 800, 1347, 100000]) expect(parseMoneyCents(centsToField(c))).toBe(c);
  });
});
