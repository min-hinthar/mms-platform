import { beforeEach, describe, expect, it, vi } from "vitest";

const del = vi.fn();
const cookiesMock = vi.fn(async () => ({ delete: del, set: vi.fn(), get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// `./staff-lock` opens with `import "server-only"`, which throws outside a server bundle; the action
// only needs the cookie NAME from it, and the name is what the delete is asserted against.
vi.mock("./staff-lock", () => ({ LOCK_COOKIE: "mms_staff_lock", isConsoleLocked: vi.fn() }));
const getStaffAuth = vi.fn();
vi.mock("./staff", () => ({
  getStaffAuth: () => getStaffAuth(),
  staffGate: vi.fn(),
}));
vi.mock("./staff-pin", () => ({
  setStaffPin: vi.fn(),
  clearStaffPin: vi.fn(),
  verifyStaffPin: vi.fn(),
  staffHasPin: vi.fn(),
}));

const { releaseLockAfterSignOut } = await import("./staff-pin-actions");

/**
 * P7·2 — the lock is a device cookie the browser sign-out cannot clear, so it is released by the
 * server — and ONLY once the server can see no session. The two refusals are the whole point: a
 * public POST that dropped the lock for a live session would be an unlock without a PIN, and an
 * unknowable answer must never read as "signed out".
 */
beforeEach(() => {
  del.mockReset();
  getStaffAuth.mockReset();
  cookiesMock.mockClear();
});

describe("releaseLockAfterSignOut", () => {
  it("deletes the lock cookie, path-scoped like its writer, once no session is left", async () => {
    getStaffAuth.mockResolvedValue({ kind: "anon" });
    await expect(releaseLockAfterSignOut()).resolves.toEqual({ released: true });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0]![0]).toEqual({ name: "mms_staff_lock", path: "/staff" });
  });
  it("keeps the lock for a LIVE session — this is a public POST, not an unlock", async () => {
    getStaffAuth.mockResolvedValue({ kind: "staff", caller: { staffId: "s1" } });
    await expect(releaseLockAfterSignOut()).resolves.toEqual({ released: false });
    expect(del).not.toHaveBeenCalled();
  });
  it("keeps the lock for a signed-in non-staff account too", async () => {
    getStaffAuth.mockResolvedValue({ kind: "not_staff" });
    await expect(releaseLockAfterSignOut()).resolves.toEqual({ released: false });
    expect(del).not.toHaveBeenCalled();
  });
  it("keeps the lock when the answer is unknowable — an outage never reads as signed out", async () => {
    getStaffAuth.mockResolvedValue({ kind: "unavailable" });
    await expect(releaseLockAfterSignOut()).resolves.toEqual({ released: false });
    expect(del).not.toHaveBeenCalled();
  });
});
