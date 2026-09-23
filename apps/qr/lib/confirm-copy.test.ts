import { describe, expect, it } from "vitest";
import {
  confirmCopy,
  dollars,
  hostSendsCopy,
  payProceedLabel,
  sentCopy,
  unsentPayNote,
  type ConfirmDecision,
} from "./confirm-copy";

/**
 * W16c — the confirm copy's rules. Every decision the diner can be asked to confirm is walked
 * here (the DECISIONS list below IS the exhaustiveness guard: a new confirmable money action that
 * isn't added shows up as a bare compile error on the union, and a kind added to the union with
 * no copy branch can't typecheck at all).
 */

const DECISIONS: ConfirmDecision[] = [{ kind: "authorizeShare", amountCents: 1240 }];

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
  it("a share hold names its own amount, not the table's", () => {
    const c = confirmCopy({ kind: "authorizeShare", amountCents: 1240 });
    expect(dollars(1240)).toBe("$12.40"); // pins the formatter itself (2dp, Latin, leading $)
    expect(c.questionEn).toContain(dollars(1240));
    expect(c.questionMy).toContain(dollars(1240));
    expect(c.proceedEn).toContain(dollars(1240));
  });
});

describe("Phase 1b — what the retired send confirm carried, now on the send's outcome", () => {
  it("the success line carries the owner's Burmese verbatim (W16 directive)", () => {
    // Pinned so a future reword is a deliberate act with the owner, not a silent drift: this exact
    // string is what Min wrote in the W16 directive. It is a completed-action statement, so it
    // rides the moment the send has LANDED.
    expect(sentCopy(2).my).toBe("Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ");
  });

  it("names the count the send committed, and pluralizes EN", () => {
    const three = sentCopy(3).en;
    const one = sentCopy(1).en;
    expect(three).toBe("Sent to the kitchen — 3 items on the way.");
    expect(one).toBe("Sent to the kitchen — 1 item on the way.");
    expect(three).not.toBe(one); // a pluralizer returning one string for both is the degenerate case
  });
});

describe("Phase 1b — what the retired pay confirm carried, now on the Pay button and above it", () => {
  it("the Pay button names the sum it charges, Latin digits", () => {
    // Not transcribed: the expectation is `dollars()` of the same cents.
    expect(payProceedLabel(4210)).toBe(`Pay ${dollars(4210)}`);
    expect(payProceedLabel(4210)).toContain("$42.10");
  });

  it("names unsent dishes in BOTH tongues, Latin digits (W19)", () => {
    const n = unsentPayNote(3)!;
    expect(n.en).toContain("3 items not sent yet");
    expect(n.en).toContain("the moment you pay");
    expect(n.my).toContain("3");
    expect(/\p{Script=Myanmar}/u.test(n.my)).toBe(true);
    expect(n.my).not.toMatch(/[၀-၉]/); // money-path rule: Latin digits in the MY line too
  });

  it("singular reads as one item, not '1 items'", () => {
    const n = unsentPayNote(1)!;
    expect(n.en).toContain("1 item not sent yet");
    expect(n.en).not.toContain("1 items");
  });

  it("says nothing when nothing is unsent", () => {
    expect(unsentPayNote(0)).toBeNull();
  });
});

describe("Phase 1b — a guest who is not the host is told who sends", () => {
  it("names the host when the table knows them, in both tongues", () => {
    // MUTATION: drop the name — "Your host" where the table has a real name reads as a stranger; red.
    const c = hostSendsCopy("Aung");
    expect(c.en).toBe("Aung sends the table’s order to the kitchen — your dishes go with it.");
    expect(c.my).toContain("Aung");
    expect(/\p{Script=Myanmar}/u.test(c.my)).toBe(true);
  });

  it("falls back to the role, never a blank name", () => {
    expect(hostSendsCopy(null).en).toMatch(/^Your host sends/);
    expect(hostSendsCopy("  ").en).toMatch(/^Your host sends/);
  });
});
