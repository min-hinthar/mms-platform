import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs run by CI with `node` after the build; its decision is tested here
// because `scripts/` is not a suite root (the orphan guard enumerates `apps/qr` and `packages/ui/src`).
import { checkBuildStamp, loadParseServed } from "../../../scripts/check-build-stamp.mjs";
import { STAFF_CONTRACT, parseServed } from "./build-stamp";

/**
 * Phase 2i (P2bi) — the CI artifact check's decision. The build-output half (a real `next build`
 * with the env assignment removed → red; with the client import removed → red) is measured by hand
 * in the S1 notes; here every way the decision could wrongly pass gets a case.
 */
type Input = { body: string | null; chunks: Iterable<string>; parseServed: typeof parseServed };
const check = checkBuildStamp as (i: Input) => { ok: boolean; stamp?: string; reason?: string };
const STAMP = "mfq3k9aa-00112233";
const body = (b: unknown) => JSON.stringify(b);

describe("checkBuildStamp", () => {
  it("passes when the prerendered body's stamp is in a client chunk", () => {
    const out = check({
      body: body({ build: STAMP, contract: STAFF_CONTRACT }),
      chunks: ["a()", `var x="${STAMP}"`],
      parseServed,
    });
    expect(out).toEqual({ ok: true, stamp: STAMP });
  });

  it("refuses a stampless build: the route answers { build: null }", () => {
    const out = check({
      body: body({ build: null, contract: STAFF_CONTRACT }),
      chunks: [`var x="${STAMP}"`],
      parseServed,
    });
    expect(out.ok).toBe(false);
  });

  it("refuses a stamp no client chunk carries", () => {
    const out = check({
      body: body({ build: STAMP, contract: STAFF_CONTRACT }),
      chunks: ["a()", "mfq3k9aa-00112234"],
      parseServed,
    });
    expect(out.ok).toBe(false);
  });

  it("refuses a missing body, a body that is not JSON, and a body parseServed rejects", () => {
    for (const b of [null, "<html>", body({ build: STAMP }), body([STAMP])])
      expect(check({ body: b, chunks: [STAMP], parseServed }).ok).toBe(false);
  });

  it("refuses an empty chunk directory", () => {
    expect(
      check({ body: body({ build: STAMP, contract: STAFF_CONTRACT }), chunks: [], parseServed }).ok,
    ).toBe(false);
  });
});

describe("loadParseServed — the app's own rule, transpiled, never a copy", () => {
  it("agrees with parseServed on accepted and refused answers", async () => {
    const loaded = (await (loadParseServed as () => Promise<typeof parseServed>)()) as
      | typeof parseServed
      | undefined;
    expect(typeof loaded).toBe("function");
    const cases: unknown[] = [
      { build: STAMP, contract: 1 },
      { build: STAMP, contract: 0 },
      { build: "x".repeat(64), contract: 1 },
      { build: null, contract: 1 },
      {},
      "<html>",
      null,
    ];
    for (const c of cases) expect(loaded?.(c)).toEqual(parseServed(c));
  });
});
