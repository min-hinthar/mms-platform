import { describe, expect, it } from "vitest";
import { STAFF } from "./i18n/staff";
import type { KitchenErrCode } from "./kitchen-types";
import type { SoldOutErrCode } from "./menu-availability";
import {
  actionErrorStale,
  eightySixOutcome,
  ERR_DWELL_MS,
  kitchenErrOutcome,
  type KdsAct,
} from "./kds-errors";

const CODES: readonly KitchenErrCode[] = [
  "sentence",
  "signin",
  "invalid",
  "failed",
  "stale",
  "recall-window",
  "already-live",
];
const ACTS: readonly KdsAct[] = ["bump", "fire", "recall", "line"];

describe("kitchenErrOutcome — a refused kitchen action speaks the device language (kitchen-3)", () => {
  it("every code except sign-in resolves to something the region can hold, and sign-in leaves", () => {
    for (const code of CODES) {
      const out = kitchenErrOutcome({ error: "server sentence", code }, "bump", "T4");
      if (code === "signin") expect(out).toEqual({ kind: "leave", href: "/staff/login" });
      else expect(out.kind).toBe("show");
    }
  });

  it("`sentence` is shown verbatim — the outage twin lives in OutageText", () => {
    const out = kitchenErrOutcome(
      { error: "That needs a manager — ask one to step in.", code: "sentence" },
      "line",
      "Mohinga",
    );
    expect(out).toEqual({ kind: "show", msg: "That needs a manager — ask one to step in." });
  });

  it("a keyed refusal names the thing that was tapped, and the key exists in both tongues", () => {
    const keyed = [
      ["stale", "kds.err.stale"],
      ["recall-window", "kds.err.recall.window"],
      ["already-live", "kds.err.fire.live"],
    ] as const;
    for (const [code, k] of keyed) {
      const out = kitchenErrOutcome({ error: "x", code }, "bump", "T4");
      expect(out).toEqual({ kind: "show", msg: { k, vars: { x: "T4" } } });
      expect(STAFF[k].en).toContain("{x}");
      expect(STAFF[k].my).toContain("{x}");
    }
    expect(kitchenErrOutcome({ error: "x", code: "invalid" }, "bump", "T4")).toEqual({
      kind: "show",
      msg: { k: "kds.err.invalid" },
    });
  });

  it("`failed` picks the sentence for the ACT that failed — four acts, four distinct keys", () => {
    const keys = ACTS.map((act) => {
      const out = kitchenErrOutcome({ error: "x", code: "failed" }, act, "T4");
      expect(out.kind).toBe("show");
      const msg = out.kind === "show" ? out.msg : null;
      expect(typeof msg).toBe("object");
      return typeof msg === "object" && msg ? msg.k : "";
    });
    expect(new Set(keys).size).toBe(ACTS.length);
    expect(keys).toEqual(["kds.err.bump", "kds.err.fire", "kds.err.recall", "kds.err.line"]);
  });
});

describe("eightySixOutcome — the menu's refusal, said about the dish (kitchen-3, the 86 arm)", () => {
  it("every menu code resolves, keyed arms name the dish in both tongues, sentence stays verbatim", () => {
    const codes: readonly SoldOutErrCode[] = ["sentence", "invalid", "gone", "stale"];
    for (const code of codes)
      expect(eightySixOutcome({ error: "s", code }, "မုန့်ဟင်းခါး")).toBeTruthy();
    expect(
      eightySixOutcome({ error: "Can’t reach the menu right now.", code: "sentence" }, "x"),
    ).toBe("Can’t reach the menu right now.");
    expect(eightySixOutcome({ error: "s", code: "gone" }, "Mohinga")).toEqual({
      k: "kds.err.86.gone",
      vars: { x: "Mohinga" },
    });
    expect(eightySixOutcome({ error: "s", code: "stale" }, "Mohinga")).toEqual({
      k: "kds.err.stale",
      vars: { x: "Mohinga" },
    });
    expect(STAFF["kds.err.86.gone"].en).toContain("{x}");
    expect(STAFF["kds.err.86.gone"].my).toContain("{x}");
  });
});

describe("actionErrorStale — a banner outlives the poll that follows it (kitchen-10)", () => {
  it("survives a snapshot younger than the dwell and clears at the dwell", () => {
    expect(actionErrorStale(10_000, 10_000 + ERR_DWELL_MS - 1)).toBe(false);
    expect(actionErrorStale(10_000, 10_000 + ERR_DWELL_MS)).toBe(true);
  });
  it("no banner is always stale (nothing to keep), and the dwell is a real parameter", () => {
    expect(actionErrorStale(null, 0)).toBe(true);
    expect(actionErrorStale(0, 500, 1_000)).toBe(false);
    expect(actionErrorStale(0, 1_000, 1_000)).toBe(true);
  });
});
