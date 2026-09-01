import { describe, expect, it } from "vitest";
import { attemptReleaseBody, classifyRelease, normalizeEra, readPayAttempt } from "./pay-attempt";

/**
 * M124 — the attempt token's shape rules, tested as BEHAVIOUR rather than as a signature.
 *
 * Every case below names the mutation it exists to catch, because a test that merely calls each
 * export and asserts it returned something is satisfied by a stub (LEARNINGS #60). The rule these
 * guard is a money rule: the value that reaches `.eq("locked_at", …)` decides whether an abandoned
 * tab clears a LIVE attempt's promo pin.
 */

describe("normalizeEra — the client's echo, re-emitted as the server's own string", () => {
  it("round-trips the exact spelling acquireCartLock writes", () => {
    // `acquireCartLock` writes `new Date().toISOString()` — always millisecond `...000Z`.
    // MUTATION: `return raw` instead of re-emitting → still passes THIS case, which is why the
    // offset case below exists.
    expect(normalizeEra("2026-09-01T10:00:00.000Z")).toBe("2026-09-01T10:00:00.000Z");
  });

  it("THE POINT: an offset spelling of the same instant normalizes to the stored spelling", () => {
    // A bare zod `.datetime({ offset: true })` accepts this and passes it through verbatim. The
    // stored column holds the `Z` spelling, so a pass-through makes the match depend on how the
    // client happened to serialize.
    // MUTATION: `return raw` → this returns the `+00:00` string and the case fails.
    expect(normalizeEra("2026-09-01T10:00:00.000+00:00")).toBe("2026-09-01T10:00:00.000Z");
  });

  it("fails CLOSED on anything unparseable, so a forged token releases nothing", () => {
    // MUTATION: drop the `Number.isFinite` guard → `new Date("nonsense").toISOString()` THROWS,
    // inside a page-unload beacon that must never throw.
    for (const bad of ["nonsense", "", "   ", "2026-13-45T99:99:99Z"]) {
      expect(normalizeEra(bad)).toBeNull();
    }
  });

  it("rejects non-strings rather than coercing them", () => {
    // MUTATION: `new Date(raw as any)` without the typeof check → `normalizeEra(0)` yields the
    // epoch, a real ISO string that could match a row. A number must never become an era.
    for (const bad of [null, undefined, 0, 1_756_720_000_000, {}, [], true]) {
      expect(normalizeEra(bad)).toBeNull();
    }
  });
});

describe("readPayAttempt — the secret and its token are one value", () => {
  it("pairs the token with the secret it was minted under", () => {
    const got = readPayAttempt({
      clientSecret: "pi_123_secret_abc",
      totals: {},
      attempt: "2026-09-01T10:00:00.000Z",
    });
    expect(got).toEqual({
      clientSecret: "pi_123_secret_abc",
      attempt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("degrades to a null attempt when the server sent none, and does NOT invent one", () => {
    // The mid-deploy case: a client bundle outliving the build that answered it. Naming no attempt
    // releases nothing (the lock TTL is the backstop) — strictly safer than guessing an era.
    // MUTATION: default `attempt` to `new Date().toISOString()` → a fabricated era that could match
    // a live row and clear its pin. This case fails.
    expect(readPayAttempt({ clientSecret: "pi_1_secret_x" })).toEqual({
      clientSecret: "pi_1_secret_x",
      attempt: null,
    });
  });

  it("refuses a body with no usable secret", () => {
    // MUTATION: drop the `clientSecret === ""` check → an empty secret mounts an Element that can
    // never confirm, and the pay step strands.
    for (const bad of [{}, { clientSecret: "" }, { clientSecret: 5 }, null, "x", undefined]) {
      expect(readPayAttempt(bad)).toBeNull();
    }
  });

  it("normalizes the attempt on the way in, not at the call site", () => {
    expect(readPayAttempt({ clientSecret: "s", attempt: "2026-09-01T10:00:00.000+00:00" })).toEqual(
      {
        clientSecret: "s",
        attempt: "2026-09-01T10:00:00.000Z",
      },
    );
  });
});

describe("attemptReleaseBody — omit, never null", () => {
  it("carries the attempt when known", () => {
    expect(attemptReleaseBody("cart-1", "2026-09-01T10:00:00.000Z")).toEqual({
      cartId: "cart-1",
      attempt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("OMITS the key when unknown, so the wire shape stays schema-valid", () => {
    // `releaseAttemptInput` declares `.optional()`, not `.nullable()` — a null would be REJECTED by
    // the beacon route's parse and the whole release (lock included) would be lost, leaving the
    // table frozen for the full TTL.
    // MUTATION: `{ cartId, attempt: attempt ?? null }` → the key is present and the parse 400s.
    const body = attemptReleaseBody("cart-1", null);
    expect(body).toEqual({ cartId: "cart-1" });
    expect("attempt" in body).toBe(false);
  });
});

describe("classifyRelease — three facts, three answers", () => {
  it("a matched write is a real release", () => {
    expect(classifyRelease({ released: true, error: null })).toEqual({ released: true });
  });

  it("THE CASE THAT MATTERS: only a SUCCEEDED write matching nothing means superseded", () => {
    expect(classifyRelease({ released: false, error: null })).toEqual({
      released: false,
      reason: "superseded",
    });
  });

  it("a transport failure is OUR outage, never a claim about the diner's tab", () => {
    // MUTATION: test `released` before `error` → a failed write (count null → released false)
    // reports "superseded", and the UI tells a diner mid-checkout that another tab took over.
    // That is a fabricated diagnosis on a money surface (the M116 / M119 class).
    expect(classifyRelease({ released: false, error: { message: "boom" } })).toEqual({
      released: false,
      reason: "error",
    });
  });

  it("an error wins even if the driver also reported a match", () => {
    // Defensive: a client that returns both is incoherent, and the safe read is "we do not know".
    expect(classifyRelease({ released: true, error: { message: "boom" } })).toEqual({
      released: false,
      reason: "error",
    });
  });
});
