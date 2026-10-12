import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { soloRemintKey, uuidV5 } = await import("./solo-remint");

/**
 * PD3 follow-up (Codex P2 on #339) — the solo re-mint key is RETRY-STABLE: a lost response or a
 * second tab recomputes the same key and lands on the same session. verify:slice: solo-remint/*.
 */
describe("uuidV5 — RFC 9562 §5.5", () => {
  it("matches the reference vector (computed with Python's uuid.uuid5, not transcribed from prose)", () => {
    // python3 -c 'import uuid; print(uuid.uuid5(uuid.NAMESPACE_DNS, "www.example.com"))'
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });
});

describe("soloRemintKey — the same device and seat always re-mint under the same key", () => {
  const STORED = "pickup-3f2a6c1e-0000-4000-8000-00000000abcd";
  const SEAT = "00000000-0000-0000-0000-00000000cx30";

  it("is deterministic: a retry, or a second tab, computes the SAME key", () => {
    // MUTATION: a random key per request — a lost response or two tabs mint two sessions.
    expect(soloRemintKey("pickup", STORED, SEAT)).toBe(soloRemintKey("pickup", STORED, SEAT));
  });

  it("is per seat and per stored key: another identity, or another device, gets its own", () => {
    // MUTATION: leave the seat out — two identities arriving with one stored key share a session
    // key, and the second is refused at the write instead of getting its own session.
    const k = soloRemintKey("pickup", STORED, SEAT);
    expect(soloRemintKey("pickup", STORED, "00000000-0000-0000-0000-00000000ffff")).not.toBe(k);
    expect(soloRemintKey("pickup", `${STORED}0`, SEAT)).not.toBe(k);
  });

  it("has the client's own `${mode}-<uuid>` shape — a version-5 uuid — and is never the stored key", () => {
    const k = soloRemintKey("scango", STORED, SEAT);
    expect(k).toMatch(
      /^scango-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(k).not.toBe(STORED);
  });
});
