import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STAFF_CONTRACT,
  STAMP_RE,
  parseServed,
  readStamp,
  versionVerdict,
  type Served,
} from "./build-stamp";

/**
 * Phase 2i (P2bi) — the build stamp and the strict reading of `/api/version`. Every "no verdict"
 * case is a network the tablet can really be on (a captive portal's HTML 200, a proxy's `{}`), and
 * every one must read as "unknown", never "changed": a false "changed" reloads a working screen.
 */
const A = "mfq3k2x1-0a1b2c3d";
const B = "mfq3k9zz-ffee0011";

describe("STAMP_RE — the shape build-stamp.mjs prints", () => {
  it("accepts base-36 time + 8 hex, and nothing looser", () => {
    expect(STAMP_RE.test(A)).toBe(true);
    expect(STAMP_RE.test(`${Date.now().toString(36)}-deadbeef`)).toBe(true);
    for (const bad of ["hello", "mfq3k2x1-0A1B2C3D", "mfq3k2x1-0a1b2c3", "x".repeat(80), ` ${A}`]) {
      expect(STAMP_RE.test(bad)).toBe(false);
    }
  });
});

describe("parseServed — strict, or no verdict", () => {
  it("our own shape parses", () => {
    expect(parseServed({ build: A, contract: STAFF_CONTRACT })).toEqual({
      build: A,
      contract: STAFF_CONTRACT,
    });
  });

  it("a portal's page, an empty object, a missing or non-string build are NO verdict", () => {
    // MUTATION (p2i-stamp/portal-reads-as-build): anything with a `build` key reads as a build — a
    // captive portal or proxy answer reloads a working screen; red.
    for (const body of [
      "<html>",
      {},
      null,
      [A],
      { build: null, contract: 1 },
      { build: 5, contract: 1 },
      { build: "x".repeat(80), contract: 1 },
    ]) {
      expect(parseServed(body)).toBeNull();
    }
  });

  it("a string that is not a stamp is no verdict", () => {
    // MUTATION (p2i-stamp/any-string-is-a-build): STAMP_RE is not enforced; red.
    expect(parseServed({ build: "hello", contract: 1 })).toBeNull();
  });

  it("a contract that is not a safe integer ≥ 1 is no verdict", () => {
    // MUTATION (p2i-stamp/contract-unchecked): any contract parses; red.
    for (const contract of [undefined, 0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseServed({ build: A, contract })).toBeNull();
    }
  });
});

describe("versionVerdict", () => {
  const served = (build: string, contract = STAFF_CONTRACT): Served => ({ build, contract });

  it("the same build is current", () => {
    // MUTATION (p2i-stamp/same-reads-changed): equal stamps read as changed — every screen reloads
    // forever; red.
    expect(versionVerdict(A, STAFF_CONTRACT, served(A))).toEqual({ kind: "current" });
  });

  it("no stamp of our own, or no verdict from the server, is UNKNOWN — never changed", () => {
    // MUTATION (p2i-stamp/null-is-changed): a stampless bundle (dev, a broken build) or a portal
    // answer reads as changed — a working screen reloads; red.
    expect(versionVerdict(null, STAFF_CONTRACT, served(B))).toEqual({ kind: "unknown" });
    expect(versionVerdict(A, STAFF_CONTRACT, null)).toEqual({ kind: "unknown" });
  });

  it("a different build is changed; incompatible only when the contract differs", () => {
    // MUTATION (p2i-stamp/contract-ignored): a new contract is never flagged — an old screen keeps
    // misreading new answers while a live sound holds it; red.
    expect(versionVerdict(A, STAFF_CONTRACT, served(B))).toEqual({
      kind: "changed",
      served: served(B),
      incompatible: false,
    });
    expect(versionVerdict(A, STAFF_CONTRACT, served(B, STAFF_CONTRACT + 1))).toEqual({
      kind: "changed",
      served: served(B, STAFF_CONTRACT + 1),
      incompatible: true,
    });
  });
});

describe("CLIENT_BUILD — the inlined stamp, validated", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is the stamp when the build set one, null when it did not or set junk", async () => {
    // MUTATION (p2i-stamp/client-unvalidated): the raw env value is trusted — a junk value makes
    // this screen call every served build "changed"; red.
    vi.stubEnv("NEXT_PUBLIC_BUILD_STAMP", A);
    vi.resetModules();
    expect((await import("./build-stamp")).CLIENT_BUILD).toBe(A);
    vi.stubEnv("NEXT_PUBLIC_BUILD_STAMP", "not-a-stamp");
    vi.resetModules();
    expect((await import("./build-stamp")).CLIENT_BUILD).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_BUILD_STAMP", "");
    vi.resetModules();
    expect((await import("./build-stamp")).CLIENT_BUILD).toBeNull();
  });

  it("readStamp is the one validation", () => {
    expect(readStamp(A)).toBe(A);
    expect(readStamp(undefined)).toBeNull();
    expect(readStamp(42)).toBeNull();
  });
});
