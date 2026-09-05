import { describe, expect, it } from "vitest";
import {
  allDayKey,
  allDayRows,
  burmeseAddsInfo,
  catalogNameMy,
  isUuid,
  pairModifiersMy,
  uuidOptionIds,
  type AllDayLine,
} from "./ticket-names";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("catalogNameMy — a Burmese name is a catalog fact or nothing", () => {
  it("returns the trimmed Burmese", () => {
    expect(catalogNameMy(" မုန့်ဟင်းခါး ", "Mohinga")).toBe("မုန့်ဟင်းခါး");
  });
  it("blank, whitespace, null and undefined are all null", () => {
    expect(catalogNameMy("", "Mohinga")).toBeNull();
    expect(catalogNameMy("   ", "Mohinga")).toBeNull();
    expect(catalogNameMy(null, "Mohinga")).toBeNull();
    expect(catalogNameMy(undefined, "Mohinga")).toBeNull();
  });
  it("a name_my with no Myanmar-script character is not Burmese, whatever it differs from", () => {
    // MUTATION: drop the script test → "Red Bull 8.4oz" ships under lang="my" in Padauk. Mixed
    // script is fine: a brand name inside a Burmese phrase has Myanmar codepoints.
    expect(catalogNameMy("Red Bull 8.4oz", "Red Bull")).toBeNull();
    expect(catalogNameMy("mohinga", "Mohinga")).toBeNull();
    expect(catalogNameMy("Red Bull အားဖြည့်", "Red Bull")).toBe("Red Bull အားဖြည့်");
  });
  it("a name_my equal to the snapshot name adds no second tongue — even when both are Burmese", () => {
    // A brand name stored twice ("Red Bull" / "Red Bull") is already stopped by the script rule, so
    // it cannot tell the equality clause from that rule. The input that SEPARATES them is a
    // Burmese-only catalog row stored twice: the script rule admits it, and without the equality
    // clause the board prints the same Burmese twice — once as its own "English" echo.
    // MUTATION: drop `if (my === en.trim()) return null` → the second and third lines fail.
    expect(catalogNameMy("Red Bull", "Red Bull")).toBeNull();
    expect(catalogNameMy("မုန့်ဟင်းခါး", "မုန့်ဟင်းခါး")).toBeNull();
    expect(catalogNameMy("မုန့်ဟင်းခါး ", " မုန့်ဟင်းခါး")).toBeNull();
  });
});

describe("pairModifiersMy — per slot, parallel, never a guessed pairing", () => {
  const byId = new Map<string, string | null>([
    [A, "အစပ်"],
    [B, null],
  ]);
  it("pairs each label with its option's Burmese, null where the option has none", () => {
    expect(pairModifiersMy([A, B], ["Spicy", "No egg"], byId)).toEqual(["အစပ်", null]);
  });
  it("THE HOLE RULE: a null slot stays null — the renderer marks the EN fallback, the data never substitutes it", () => {
    // MUTATION: `?? labels[i]` in the mapper → this slot reads "No egg" and the board typesets English
    // in Padauk under lang="my". The design panel rejected two drafts for exactly this.
    const out = pairModifiersMy([A, B], ["Spicy", "No egg"], byId);
    expect(out[1]).toBeNull();
    expect(out).toHaveLength(2);
  });
  it("a count mismatch is NOT a mapping — every slot null", () => {
    // Legacy '[]' rows predate M3's ids; a prefix pairing would attach the first option's Burmese
    // to whatever label happens to sit first.
    expect(pairModifiersMy([], ["Spicy", "No egg"], byId)).toEqual([null, null]);
    expect(pairModifiersMy([A], ["Spicy", "No egg"], byId)).toEqual([null, null]);
    expect(pairModifiersMy([A, B, A], ["Spicy", "No egg"], byId)).toEqual([null, null]);
    expect(pairModifiersMy(null, ["Spicy"], byId)).toEqual([null]);
    expect(pairModifiersMy("garbage", ["Spicy"], byId)).toEqual([null]);
  });
  it("an id the lookup did not return (deactivated option, degraded read) is null, not a throw", () => {
    expect(
      pairModifiersMy([A, "33333333-3333-4333-8333-333333333333"], ["Spicy", "Iced"], byId),
    ).toEqual(["အစပ်", null]);
  });
  it("a slot whose Burmese equals its label adds nothing (rule 1 applies per slot)", () => {
    // Both halves of rule 1, per slot: the Latin duplicate (script rule) and the Burmese-only
    // duplicate (equality clause) each leave the slot null.
    expect(pairModifiersMy([A], ["Masala"], new Map([[A, "Masala"]]))).toEqual([null]);
    expect(pairModifiersMy([A], ["အစပ်"], new Map([[A, "အစပ်"]]))).toEqual([null]);
  });
  it("no modifiers → empty, never a phantom slot", () => {
    expect(pairModifiersMy([], [], byId)).toEqual([]);
  });
});

describe("uuidOptionIds / isUuid — partition BEFORE the IN-list", () => {
  it("drops non-uuid ids (a barcode, a legacy token) and dedupes, keeping stored order", () => {
    expect(uuidOptionIds([A, "012345678905", B, A])).toEqual([A, B]);
    expect(isUuid("012345678905")).toBe(false);
    expect(isUuid(A.toUpperCase())).toBe(true);
  });
  it("malformed storage reads as no ids", () => {
    expect(uuidOptionIds(null)).toEqual([]);
    expect(uuidOptionIds({ a: 1 })).toEqual([]);
    expect(uuidOptionIds([1, null, A])).toEqual([A]);
  });
});

describe("burmeseAddsInfo — the dedupe that keeps an all-English line byte-identical", () => {
  it("false when neither the name nor any modifier has Burmese", () => {
    expect(burmeseAddsInfo(null, [null, null])).toBe(false);
    expect(burmeseAddsInfo(null, [])).toBe(false);
  });
  it("true on a Burmese name alone, or on one Burmese modifier alone", () => {
    expect(burmeseAddsInfo("မုန့်ဟင်းခါး", [])).toBe(true);
    expect(burmeseAddsInfo(null, [null, "အစပ်"])).toBe(true);
  });
});

describe("allDayRows — the rail's key is the English label; a row carries the most Burmese known", () => {
  const MOHINGA_MY = "မုန့်ဟင်းခါး";
  const MILD_MY = "အစပ်လျှော့";
  const MEDIUM_MY = "ပုံမှန်အစပ်";
  const line = (o: Partial<AllDayLine> & { name: string }): AllDayLine => ({
    nameMy: null,
    qty: 1,
    modifiers: [],
    modifiersMy: [],
    ...o,
  });

  it("allDayKey is the W3d composition byte for byte", () => {
    expect(allDayKey({ name: "Mohinga", modifiers: [] })).toBe("Mohinga");
    expect(allDayKey({ name: "Mohinga", modifiers: ["Mild", "No egg"] })).toBe(
      "Mohinga · Mild, No egg",
    );
  });

  it("sums under the English key, largest first", () => {
    const rows = allDayRows([
      line({ name: "Tea" }),
      line({ name: "Mohinga", qty: 2 }),
      line({ name: "Mohinga", qty: 3 }),
    ]);
    expect(rows.map((r) => [r.label, r.qty])).toEqual([
      ["Mohinga", 5],
      ["Tea", 1],
    ]);
  });

  it("THE SPLIT RULE: Burmese never enters the key — a legacy row and a fresh one are ONE count", () => {
    // MUTATION: `const key = l.nameMy ?? allDayKey(l)` → two rows of 1, and the wok's obligation
    // under-reports by exactly the split.
    const rows = allDayRows([
      line({ name: "Mohinga" }),
      line({ name: "Mohinga", nameMy: MOHINGA_MY }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(2);
    expect(rows[0]!.nameMy).toBe(MOHINGA_MY);
  });

  it("THE FILL RULE: the first non-null Burmese wins and is not overwritten; each modifier slot fills from the first line that has it", () => {
    // The `nameMy: "other"` line models two CATALOG ROWS sharing one English snapshot name (a
    // re-added dish) — the only way one poll hands one key two Burmese values. MUTATION: delete the
    // `nameMy` fill → the row stays null although the second line knew the Burmese; MUTATION:
    // overwrite instead of fill → "other" replaces the first name.
    const rows = allDayRows([
      line({ name: "Mohinga", modifiers: ["Mild", "Medium"], modifiersMy: [null, null] }),
      line({
        name: "Mohinga",
        nameMy: MOHINGA_MY,
        modifiers: ["Mild", "Medium"],
        modifiersMy: [MILD_MY, null],
      }),
      line({
        name: "Mohinga",
        nameMy: "other",
        modifiers: ["Mild", "Medium"],
        modifiersMy: [null, MEDIUM_MY],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(3);
    expect(rows[0]!.nameMy).toBe(MOHINGA_MY);
    expect(rows[0]!.modifiersMy).toEqual([MILD_MY, MEDIUM_MY]);
  });

  it("does not alias the first line's modifiersMy array (a later fill must not mutate a line)", () => {
    const first = line({ name: "Mohinga", modifiers: ["Mild"], modifiersMy: [null] });
    allDayRows([first, line({ name: "Mohinga", modifiers: ["Mild"], modifiersMy: [MILD_MY] })]);
    expect(first.modifiersMy).toEqual([null]);
  });
});
