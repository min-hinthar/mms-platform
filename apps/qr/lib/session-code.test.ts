import { describe, expect, it } from "vitest";
import { generateJoinCode, isReservedSessionCode, sweepsExpiredSquatter } from "./session-code";

describe("isReservedSessionCode — the /api/session mint refusal (W6b)", () => {
  it("marks both reserved prefixes", () => {
    // reg-/kiosk- are SERVER-ISSUED identities the register queue, floor board, and kiosk reset
    // all trust; a client-minted one is a spoofed counter-queue entry.
    expect(isReservedSessionCode("reg-ABCD1234")).toBe(true);
    expect(isReservedSessionCode("kiosk-ABCD1234")).toBe(true);
  });

  it("passes ordinary sticker/invite codes through", () => {
    expect(isReservedSessionCode("ABCD1234")).toBe(false);
    expect(isReservedSessionCode("pickup-3f2a")).toBe(false);
    expect(isReservedSessionCode("scango-3f2a")).toBe(false);
  });

  it("a generated join code is never reserved (the mint loop must not refuse itself)", () => {
    for (let i = 0; i < 20; i++) expect(isReservedSessionCode(generateJoinCode())).toBe(false);
  });
});

// ── Phase 2f · P2v (D10) ──
describe("sweepsExpiredSquatter — /api/session never closes a reserved code", () => {
  it("a scan that found no active session sweeps an expired squatter on a STICKER code", () => {
    expect(sweepsExpiredSquatter({ found: false, code: "ABCD1234", joinOnly: false })).toBe(true);
  });

  it("never a reserved code — a forged ?t=reg-… would close a sent, unpaid counter order", () => {
    // sticker-sweep-closes-a-counter-session
    expect(sweepsExpiredSquatter({ found: false, code: "reg-ABCD1234", joinOnly: false })).toBe(
      false,
    );
    expect(sweepsExpiredSquatter({ found: false, code: "kiosk-ABCD1234", joinOnly: false })).toBe(
      false,
    );
  });

  it("never on a join-only request, a found session or no code", () => {
    expect(sweepsExpiredSquatter({ found: false, code: "ABCD1234", joinOnly: true })).toBe(false);
    expect(sweepsExpiredSquatter({ found: true, code: "ABCD1234", joinOnly: false })).toBe(false);
    expect(sweepsExpiredSquatter({ found: false, code: null, joinOnly: false })).toBe(false);
  });
});
