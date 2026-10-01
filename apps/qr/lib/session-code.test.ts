import { describe, expect, it } from "vitest";
import {
  generateJoinCode,
  isReservedSessionCode,
  reservedCodeRefusal,
  sweepsExpiredSquatter,
} from "./session-code";

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

// ── Phase 2f · P2v (Codex r3 on #308) ──
describe("reservedCodeRefusal — /api/session never attaches a diner to a server-issued code", () => {
  it("refuses a JOIN to an active reg- counter order", () => {
    // p2f-cx3-join/join-to-active-counter-order
    expect(reservedCodeRefusal({ found: true, code: "reg-ABCD1234" })).toBe("join");
  });

  it("still refuses CREATING any reserved code", () => {
    // p2f-cx3-join/create-refusal-dropped
    expect(reservedCodeRefusal({ found: false, code: "reg-ABCD1234" })).toBe("create");
    expect(reservedCodeRefusal({ found: false, code: "kiosk-ABCD1234" })).toBe("create");
  });

  it("refuses a JOIN to an active kiosk- session too — fail closed on every reserved prefix", () => {
    // p2f-cx3-join/kiosk-join-refused — a kiosk DINE-IN cart fires through `mms_fire_cart` before
    // payment, and the kiosk device inserts its own membership, so no real client joins one here.
    expect(reservedCodeRefusal({ found: true, code: "kiosk-ABCD1234" })).toBe("join");
  });

  it("leaves ordinary sticker / invite / solo codes alone, found or not", () => {
    // p2f-cx3-join/ordinary-join-refused
    for (const code of ["ABCD1234", "pickup-3f2a", "scango-3f2a", "REG-ABCD1234"]) {
      expect(reservedCodeRefusal({ found: true, code })).toBeNull();
      expect(reservedCodeRefusal({ found: false, code })).toBeNull();
    }
    expect(reservedCodeRefusal({ found: false, code: undefined })).toBeNull();
    expect(reservedCodeRefusal({ found: false, code: null })).toBeNull();
  });
});
