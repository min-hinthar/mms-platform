import { describe, expect, it, vi } from "vitest";
import {
  distinctGuests,
  GUEST_MEMBER_CAP,
  GUEST_NAME_MAX,
  guestCallName,
  guestNameBySeat,
  lineGuest,
  readGuestNames,
  seatKey,
} from "./guest-names";

describe("guestCallName", () => {
  it("trims, collapses whitespace and refuses blank", () => {
    expect(guestCallName("  Aung   Min ")).toBe("Aung Min");
    expect(guestCallName("   ")).toBeNull();
    expect(guestCallName("")).toBeNull();
    expect(guestCallName(null)).toBeNull();
    expect(guestCallName(undefined)).toBeNull();
  });

  it("cuts at GUEST_NAME_MAX characters with an ellipsis, and leaves a name at the bound whole", () => {
    const atBound = "a".repeat(GUEST_NAME_MAX);
    expect(guestCallName(atBound)).toBe(atBound);
    const over = "b".repeat(GUEST_NAME_MAX + 1);
    const cut = guestCallName(over)!;
    expect([...cut]).toHaveLength(GUEST_NAME_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("counts Burmese by code point, never splitting a surrogate pair", () => {
    const name = "မောင်".repeat(10);
    const cut = guestCallName(name)!;
    expect([...cut]).toHaveLength(GUEST_NAME_MAX);
  });
});

describe("guestNameBySeat · lineGuest", () => {
  const names = guestNameBySeat([
    { session_id: "s1", seat_id: "seat-a", display_name: "Aung" },
    { session_id: "s2", seat_id: "seat-a", display_name: "Mya" },
    { session_id: "s1", seat_id: "seat-b", display_name: "  " },
  ]);

  it("keys by session AND seat — the same seat id in two sessions is two guests", () => {
    expect(lineGuest(names, "s1", "seat-a")).toBe("Aung");
    expect(lineGuest(names, "s2", "seat-a")).toBe("Mya");
  });

  it("a nameless member, an unknown seat and a line with no seat carry no name", () => {
    expect(names.has(seatKey("s1", "seat-b"))).toBe(false);
    expect(lineGuest(names, "s1", "seat-b")).toBeNull();
    expect(lineGuest(names, "s1", "seat-z")).toBeNull();
    expect(lineGuest(names, "s1", null)).toBeNull();
  });
});

describe("distinctGuests", () => {
  it("first appearance order, each name once, nulls dropped", () => {
    expect(distinctGuests(["Mya", null, "Aung", "Mya"])).toEqual(["Mya", "Aung"]);
    expect(distinctGuests([null, null])).toEqual([]);
  });
});

describe("readGuestNames — ADVISORY", () => {
  const db = (answer: { data: unknown; error: unknown } | Error) => {
    const limit = vi.fn(() =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
    );
    const inFn = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as never, from, inFn };
  };

  it("asks nothing for no sessions", async () => {
    const { client, from } = db({ data: [], error: null });
    expect((await readGuestNames(client, [], "t")).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("maps the members it read", async () => {
    const { client, inFn } = db({
      data: [{ session_id: "s1", seat_id: "a", display_name: "Aung" }],
      error: null,
    });
    const out = await readGuestNames(client, ["s1"], "t");
    expect(out.get(seatKey("s1", "a"))).toBe("Aung");
    expect(inFn).toHaveBeenCalledWith("session_id", ["s1"]);
  });

  it("a failed, saturated or throwing read answers no names — never throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (await readGuestNames(db({ data: null, error: { message: "x" } }).client, ["s"], "t")).size,
    ).toBe(0);
    const full = Array.from({ length: GUEST_MEMBER_CAP }, (_, i) => ({
      session_id: "s",
      seat_id: `seat-${i}`,
      display_name: "N",
    }));
    expect((await readGuestNames(db({ data: full, error: null }).client, ["s"], "t")).size).toBe(0);
    expect((await readGuestNames(db(new Error("boom")).client, ["s"], "t")).size).toBe(0);
    expect(err).toHaveBeenCalledTimes(3);
    err.mockRestore();
  });
});
