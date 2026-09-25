import { describe, expect, it } from "vitest";
import { admitNotice, purgesDeferred } from "./notice-slot";
import { STAFF } from "./i18n/staff";
import { STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY } from "./staff-outage";
import type { StaffWriteCode } from "./staff-add-outcome";
import {
  padAddNotice,
  padAddVerdict,
  padAttemptOutcome,
  padRetryVerdict,
  padSendNotice,
  padSlotNotice,
} from "./pad-errors";

/**
 * Phase 2c · pad — what an add's answer MEANS on the pad, and what the one region says about it.
 * The two halves that must never be confused: a definite non-landing (the ghost goes, the dish is
 * named, a settle cue plays) and an UNKNOWN outcome (the ghost stays, "Try again" resends the SAME
 * key — a new tap would be a new key, i.e. a second plate).
 */

const EVERY_CODE: readonly StaffWriteCode[] = [
  "signin",
  "sentence",
  "invalid",
  "closed",
  "no-cart",
  "paying",
  "sold_out",
  "gone",
  "outage",
  "failed",
  "unconfirmed",
];

describe("padAddVerdict — the add's answer, by its CODE (never its message)", () => {
  it("ok is ok", () => {
    expect(padAddVerdict({ ok: true })).toEqual({ kind: "ok" });
  });

  it("a write that may have committed is UNKNOWN — never a refusal", () => {
    // MUTATION: `unconfirmed` read as a refusal — the ghost vanishes, the correction says "didn't
    // go on", and the natural re-tap mints a NEW key: a second plate cooked and charged; red.
    expect(padAddVerdict({ ok: false, error: "x", code: "unconfirmed" })).toEqual({
      kind: "unknown",
    });
    // A thrown action (the response lost) is the same: it may have landed.
    expect(padAddVerdict("threw")).toEqual({ kind: "unknown" });
  });

  it("each definite refusal names its own sentence", () => {
    const err = (code: StaffWriteCode) => {
      const v = padAddVerdict({ ok: false, error: "server words", code });
      return v.kind === "refused" && v.err.kind === "key" ? v.err.key : v;
    };
    // MUTATION: collapsing sold_out into failed — "try again" over a dish that just sold out, and
    // the tile never turns sold out; red.
    expect(err("sold_out")).toBe("pad.err.add.soldOut");
    expect(err("gone")).toBe("pad.err.add.gone");
    expect(err("paying")).toBe("pad.err.add.paying");
    expect(err("closed")).toBe("pad.err.add.closed");
    expect(err("no-cart")).toBe("pad.err.add.closed");
    expect(err("outage")).toBe("pad.err.add.outage");
    expect(err("failed")).toBe("pad.err.add.failed");
    expect(err("invalid")).toBe("pad.err.add.failed");
    // No code at all is a definite failure (the add wrote nothing it can name).
    const bare = padAddVerdict({ ok: false, error: "x" });
    expect(bare.kind === "refused" && bare.err.kind === "key" && bare.err.key).toBe(
      "pad.err.add.failed",
    );
  });

  it("a sign-in ask is a redirect; a gate sentence passes through as the server wrote it", () => {
    expect(padAddVerdict({ ok: false, error: "x", code: "signin" })).toEqual({
      kind: "refused",
      err: { kind: "signin" },
    });
    expect(padAddVerdict({ ok: false, error: STAFF_WRITE_OUTAGE, code: "sentence" })).toEqual({
      kind: "refused",
      err: { kind: "sentence", text: STAFF_WRITE_OUTAGE },
    });
  });

  it("every code the server can answer maps to a verdict", () => {
    for (const code of EVERY_CODE) {
      const v = padAddVerdict({ ok: false, error: "x", code });
      expect(v.kind, code).not.toBe("ok");
    }
  });
});

describe("padSlotNotice — the one region's notices, compared as rendered text", () => {
  it("renders both tongues through the dictionary, counts in Burmese digits", () => {
    const n = padSlotNotice("claim", "browse.added", { n: 2, x: "Mohinga" }, { quiet: true });
    expect(n).toMatchObject({
      kind: "claim",
      quiet: true,
      text: "Added 2 × Mohinga.",
      my: "Mohinga ၂ ခု ထည့်ပြီးပြီ။",
      msg: { k: "browse.added", vars: { n: 2, x: "Mohinga" } },
    });
  });

  it("a claim arriving over a correction waits (a retraction is never erased by its claim)", () => {
    const correction = padAddNotice("pad.err.add.paying", "Mohinga");
    const claim = padSlotNotice("claim", "browse.added", { n: 1, x: "Tea" }, { quiet: true });
    expect(admitNotice(correction, claim)).toBe("defer");
    expect(purgesDeferred(correction, claim)).toBe(true);
  });

  it("two dishes refused for ONE cause generalize to the family sentence", () => {
    const first = padAddNotice("pad.err.add.paying", "Mohinga");
    const second = padAddNotice("pad.err.add.paying", "Tea");
    // MUTATION: no family on a pad correction — last-caller-wins: "Tea didn't go on" erases
    // Mohinga's retraction and Mohinga's claim stands unretracted; red.
    expect(admitNotice(first, second)).toBe("generalize");
    expect(second.family).toEqual({
      text: STAFF["pad.err.add.paying.family"].en,
      my: STAFF["pad.err.add.paying.family"].my,
    });
    expect(second.familyMsg).toEqual({ k: "pad.err.add.paying.family" });
    // …and five refused taps of ONE dish are one sentence, extended.
    expect(admitNotice(first, padAddNotice("pad.err.add.paying", "Mohinga"))).toBe("extend");
  });
});

describe("padSendNotice — the reused send controller's lines, into the pad's one region", () => {
  it("ok is news; warn is a correction; the outage sentence carries its Burmese twin", () => {
    const sent = padSendNotice({ tone: "ok", msg: { k: "table.send.sent.many", vars: { n: 3 } } });
    expect(sent).toMatchObject({ kind: "news", text: "Sent 3 items to the kitchen." });
    const refused = padSendNotice({ tone: "warn", msg: { k: "table.send.paying" } });
    expect(refused).toMatchObject({ kind: "correction" });
    expect(padSendNotice({ tone: "warn", msg: STAFF_WRITE_OUTAGE })).toMatchObject({
      kind: "correction",
      text: STAFF_WRITE_OUTAGE,
      my: STAFF_WRITE_OUTAGE_MY,
      msg: STAFF_WRITE_OUTAGE,
    });
    expect(padSendNotice("signin")).toBe("signin");
  });
});

describe("padAttemptOutcome — the chain's answer in the add key's own words (Phase 2a)", () => {
  it("a key survives only an outcome that may have committed", () => {
    expect(padAttemptOutcome("ok")).toBe("ok");
    expect(padAttemptOutcome("unknown")).toBe("unknown");
    // MUTATION: 15s of no answer read as definite — the options sheet's retry mints a NEW key
    // while the first may still land: a second plate; red.
    expect(padAttemptOutcome("unconfirmed")).toBe("unknown");
    expect(padAttemptOutcome("refused")).toBe("definite");
    // Offline sent nothing: the next tap is a new add.
    expect(padAttemptOutcome("offline")).toBe("definite");
  });
});

// ── Phase 2c · review fixes · pad2 ──
describe("padRetryVerdict — a refused RETRY says nothing about the first attempt", () => {
  const verdict = (code: StaffWriteCode) =>
    padRetryVerdict(padAddVerdict({ ok: false, error: "server words", code }));

  it("every definite refusal of a retry leaves the add UNKNOWN — never 'didn't go on'", () => {
    // MUTATION (pad2/retry-refusal-read-as-definite): the retry's refusal read as definite — the
    // ghost goes, the key is dropped, "{x} didn't go on" invites a new tap under a NEW key, and if
    // the first attempt landed the table gets a second plate; red.
    for (const code of EVERY_CODE.filter((c) => c !== "signin" && c !== "unconfirmed"))
      expect(verdict(code).kind, code).toBe("unknown");
  });

  it("says WHY the retry could not run: the outage and the paying guest by name, the rest generic", () => {
    // MUTATION (pad2/retry-outage-said-as-failed): the outage collapsed into the generic sentence —
    // "That didn't go through" when the fix is the connection; red.
    expect(verdict("outage")).toEqual({ kind: "unknown", retry: "pad.err.retry.outage" });
    expect(verdict("paying")).toEqual({ kind: "unknown", retry: "pad.err.retry.paying" });
    for (const code of ["closed", "no-cart", "sold_out", "gone", "failed", "invalid", "sentence"])
      expect(verdict(code as StaffWriteCode), code).toEqual({
        kind: "unknown",
        retry: "pad.err.retry.failed",
      });
  });

  it("each retry sentence says the dish MAY already be on, and never that it didn't go on", () => {
    for (const k of [
      "pad.err.retry.outage",
      "pad.err.retry.paying",
      "pad.err.retry.failed",
    ] as const) {
      expect(STAFF[k].en).toContain("may already be on the order");
      expect(STAFF[k].en).not.toMatch(/didn’t go on/);
    }
  });

  it("an ok, an unknown and a sign-in ask pass through unchanged", () => {
    expect(padRetryVerdict({ kind: "ok" })).toEqual({ kind: "ok" });
    expect(padRetryVerdict({ kind: "unknown" })).toEqual({ kind: "unknown" });
    expect(verdict("signin")).toEqual({ kind: "refused", err: { kind: "signin" } });
    expect(verdict("unconfirmed")).toEqual({ kind: "unknown" });
  });

  it("the chain reads an unknown retry as UNKNOWN — the options sheet keeps its key", () => {
    expect(padAttemptOutcome(verdict("outage").kind)).toBe("unknown");
  });
});
