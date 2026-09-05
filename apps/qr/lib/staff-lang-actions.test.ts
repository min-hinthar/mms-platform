import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
const cookiesMock = vi.fn(async () => ({ set }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const { setStaffLang } = await import("./staff-lang-actions");

/**
 * P2 · G2 — the writer.
 *
 * Two things are pinned here that no other suite can see:
 *
 *   `path: "/"`. The cookie-setting idiom next door (`lockConsole`) is path-scoped to `/staff`, and
 *   copying it is the natural mistake. It would leave every `/staff` page working while the wall TV
 *   alone reverted to English, because `/board` is not under `/staff` — a failure with no `/staff`
 *   symptom at all.
 *
 *   NO `staffGate`. The action is ungated on purpose: gating it would kill the control on
 *   `/staff/login` (nobody signed in yet), `/staff/lock`, `/board` (a device token, no staff
 *   session) and inside the outage shell (auth unreachable by definition). The `unavailable` case
 *   below is the one that goes red the moment somebody "hardens" this.
 */
beforeEach(() => {
  set.mockReset();
  cookiesMock.mockReset();
  cookiesMock.mockImplementation(async () => ({ set }));
});

describe("setStaffLang", () => {
  it("writes the cookie site-wide, httpOnly and lax", async () => {
    const res = await setStaffLang({ lang: "en" });
    expect(res).toEqual({ ok: true, lang: "en" });
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0]!;
    expect(name).toBe("mms_staff_lang");
    expect(value).toBe("en");
    expect(options.path).toBe("/");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("writes Burmese too", async () => {
    await setStaffLang({ lang: "my" });
    expect(set.mock.calls[0]![1]).toBe("my");
  });

  it("refuses a value outside the enum and writes nothing", async () => {
    for (const raw of [{ lang: "fr" }, { lang: "EN" }, { lang: "" }, {}, null, "my"]) {
      const res = await setStaffLang(raw);
      expect(res.ok).toBe(false);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("reports a cookie-write failure as a refusal, never a throw", async () => {
    // A throw here would surface as the whole staff screen's error boundary — for a language tap.
    cookiesMock.mockImplementation(async () => {
      throw new Error("outside a request scope");
    });
    const res = await setStaffLang({ lang: "my" });
    expect(res).toEqual({ ok: false, error: expect.any(String) });
  });

  it("SETS THE COOKIE WITH NO STAFF SESSION — the control works on login, lock, board and outage", async () => {
    // There is nothing to mock away: this module imports no auth at all. If a future edit adds
    // `staffGate`, that import lands here unmocked and this case fails — which is the point.
    const mod = await import("./staff-lang-actions");
    expect(mod.setStaffLang).toBeTypeOf("function");
    const res = await setStaffLang({ lang: "my" });
    expect(res.ok).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
  });
});
