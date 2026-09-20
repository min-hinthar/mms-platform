import { beforeEach, describe, expect, it, vi } from "vitest";

const del = vi.fn();
const set = vi.fn();
const cookiesMock = vi.fn(async () => ({ delete: del, set, get: vi.fn() }));
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
const staffHasPin = vi.fn();
vi.mock("./staff-pin", () => ({
  setStaffPin: vi.fn(),
  clearStaffPin: vi.fn(),
  verifyStaffPin: vi.fn(),
  staffHasPin: () => staffHasPin(),
}));

const { lockConsole, releaseLockAfterSignOut } = await import("./staff-pin-actions");

/**
 * P7·2 — the lock is a device cookie the browser sign-out cannot clear, so it is released by the
 * server — and ONLY once the server can see no session. The two refusals are the whole point: a
 * public POST that dropped the lock for a live session would be an unlock without a PIN, and an
 * unknowable answer must never read as "signed out".
 */
beforeEach(() => {
  del.mockReset();
  set.mockReset();
  staffHasPin.mockReset();
  getStaffAuth.mockReset();
  cookiesMock.mockClear();
});

/**
 * signin-3 — the lock answers REASON CODES, never a sentence: the bar renders each as a dictionary
 * key. The three refusals are pinned by their code and by the cookie NOT being written; the happy
 * path by the cookie's name, value, scope and the httpOnly that keeps page JS off it.
 */
describe("lockConsole", () => {
  it("`outage` when the caller cannot be verified — nothing written", async () => {
    getStaffAuth.mockResolvedValue({ kind: "unavailable" });
    await expect(lockConsole()).resolves.toEqual({ ok: false, reason: "outage" });
    expect(set).not.toHaveBeenCalled();
    expect(staffHasPin).not.toHaveBeenCalled();
  });
  it.each([["anon"], ["not_staff"]])("`auth` when there is no staff session (%s)", async (kind) => {
    getStaffAuth.mockResolvedValue({ kind });
    await expect(lockConsole()).resolves.toEqual({ ok: false, reason: "auth" });
    expect(set).not.toHaveBeenCalled();
  });
  it("`no_pin` for a staff member with no PIN — a lock with no way back is refused", async () => {
    getStaffAuth.mockResolvedValue({ kind: "staff", caller: { staffId: "s1", role: "server" } });
    staffHasPin.mockResolvedValue(false);
    await expect(lockConsole()).resolves.toEqual({ ok: false, reason: "no_pin" });
    expect(set).not.toHaveBeenCalled();
  });
  it("sets the httpOnly, /staff-scoped session cookie for a staff member with a PIN", async () => {
    getStaffAuth.mockResolvedValue({ kind: "staff", caller: { staffId: "s1", role: "server" } });
    staffHasPin.mockResolvedValue(true);
    await expect(lockConsole()).resolves.toEqual({ ok: true });
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = set.mock.calls[0]!;
    expect(name).toBe("mms_staff_lock");
    expect(value).toBe("1");
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/staff" });
    expect(opts).not.toHaveProperty("maxAge");
  });
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
