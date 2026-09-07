import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
const del = vi.fn();
const cookiesMock = vi.fn(async () => ({ set, delete: del }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const { setStaffDoor } = await import("./staff-door-actions");

/**
 * P7 — the door writer. Pinned: site-wide path (the wall TV is not under /staff and the counter
 * door IS /staff), the enum as the only validation, `null` as "forget", and — the one that goes red
 * the moment someone hardens it — NO auth round trip, so a refused write is a refusal, never a
 * throw into the staff error boundary.
 */
beforeEach(() => {
  set.mockReset();
  del.mockReset();
  cookiesMock.mockReset();
  cookiesMock.mockImplementation(async () => ({ set, delete: del }));
});

describe("setStaffDoor", () => {
  it("writes the door site-wide, httpOnly and lax", async () => {
    const res = await setStaffDoor({ door: "kitchen" });
    expect(res).toEqual({ ok: true, door: "kitchen" });
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0]!;
    expect(name).toBe("mms_staff_door");
    expect(value).toBe("kitchen");
    expect(options.path).toBe("/");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(del).not.toHaveBeenCalled();
  });
  it("null forgets the door — a delete, never an empty write", async () => {
    const res = await setStaffDoor({ door: null });
    expect(res).toEqual({ ok: true, door: null });
    expect(del).toHaveBeenCalledWith("mms_staff_door");
    expect(set).not.toHaveBeenCalled();
  });
  it("refuses anything but the two doors without touching the jar", async () => {
    for (const bad of [
      { door: "board" },
      { door: "Kitchen" },
      { lang: "kitchen" },
      "kitchen",
      null,
    ])
      expect((await setStaffDoor(bad)).ok).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(cookiesMock).not.toHaveBeenCalled();
  });
  it("a jar that throws is a refusal, not a throw", async () => {
    cookiesMock.mockImplementation(async () => {
      throw new Error("outside a request scope");
    });
    const res = await setStaffDoor({ door: "counter" });
    expect(res.ok).toBe(false);
  });
});
