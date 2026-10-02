import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_CONTRACT, STAMP_RE, parseServed } from "@/lib/build-stamp";

/**
 * Phase 2i (P2bi) — `/api/version` answers exactly what a staff screen's strict reader accepts, from
 * the same inlined stamp as the client bundle, and is prerendered (a CDN file per deployment).
 */
const QR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const mint = () => execFileSync("node", ["scripts/build-stamp.mjs"], { cwd: QR, encoding: "utf8" });

async function load() {
  vi.resetModules();
  return import("./route");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/version", () => {
  it("answers the build's stamp and the staff contract, in the shape parseServed accepts", async () => {
    // MUTATION (p2i-route/answers-null): `build: null` — every screen reads "no verdict" forever and
    // never learns of a new build; red. (p2i-route/contract-dropped): no `contract` — parseServed
    // refuses the whole answer; red.
    const stamp = mint();
    vi.stubEnv("NEXT_PUBLIC_BUILD_STAMP", stamp);
    const { GET } = await load();
    const body: unknown = await GET().json();
    expect(parseServed(body)).toEqual({ build: stamp, contract: STAFF_CONTRACT });
  });

  it("a stampless build answers no stamp — read as no verdict, never as a new build", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_STAMP", "");
    const { GET } = await load();
    const body: unknown = await GET().json();
    expect(body).toEqual({ build: null, contract: STAFF_CONTRACT });
    expect(parseServed(body)).toBeNull();
  });

  it("is prerendered: force-static, so the poll costs no function and flips with the deployment", async () => {
    // MUTATION (p2i-route/not-static): "force-dynamic" — a function invocation per screen per
    // minute, and the answer no longer belongs to one deployment; red.
    const mod = await load();
    expect(mod.dynamic).toBe("force-static");
  });
});

describe("apps/qr/scripts/build-stamp.mjs", () => {
  it("mints a stamp STAMP_RE accepts, different every build", () => {
    const a = mint();
    const b = mint();
    expect(a).toMatch(STAMP_RE);
    expect(b).toMatch(STAMP_RE);
    expect(a).not.toBe(b);
  });
});
