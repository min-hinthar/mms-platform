import { describe, expect, it } from "vitest";
import { generateJoinCode, isReservedSessionCode } from "./session-code";

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
