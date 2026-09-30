import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
const cookiesMock = vi.fn(async () => ({ set }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const { setStaffLang } = await import("./staff-lang-actions");
const { staffLangCookieOptions } = await import("./staff-lang");

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
 *   `/staff/login` (nobody signed in yet), `/staff/lock`, the outage shell and the error screen
 *   (auth unreachable by definition) — and, since P2e, the Help sheet and the Profile under an auth
 *   outage. The "SETS THE COOKIE WITH NO STAFF SESSION" case below is the one that goes red the
 *   moment somebody "hardens" this (the `staffGate` import lands unmocked).
 */
beforeEach(() => {
  set.mockReset();
  cookiesMock.mockReset();
  cookiesMock.mockImplementation(async () => ({ set }));
});

describe("setStaffLang", () => {
  it("writes the cookie site-wide, httpOnly and lax", async () => {
    const res = await setStaffLang({ mode: "en" });
    expect(res).toEqual({ ok: true, mode: "en" });
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0]!;
    expect(name).toBe("mms_staff_lang");
    expect(value).toBe("en");
    expect(options.path).toBe("/");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it.each(["my-only", "both", "en"] as const)(
    "P2e — writes the mode %s VERBATIM (a mode literal, never a script)",
    async (mode) => {
      const res = await setStaffLang({ mode });
      expect(res).toEqual({ ok: true, mode });
      expect(set.mock.calls[0]![1]).toBe(mode);
      expect(set.mock.calls[0]![2]).toEqual(staffLangCookieOptions());
    },
  );

  it("refuses a value outside the enum and writes nothing — the legacy script and the old SHAPE included", async () => {
    // P2e — "my" is a SCRIPT, never a mode, and `{ lang }` is the shape a tab from before the deploy
    // still sends: both are refused (the control's bilingual failure line, never the error boundary),
    // and a reload fixes the tab. Red-first: add "my" to the enum and the first row goes green → red.
    for (const raw of [
      { mode: "my" },
      { lang: "en" },
      { lang: "my" },
      { mode: "EN" },
      { mode: "" },
      { mode: "my-only " },
      {},
      null,
      "both",
    ]) {
      const res = await setStaffLang(raw);
      expect(res.ok, JSON.stringify(raw)).toBe(false);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it("reports a cookie-write failure as a refusal, never a throw", async () => {
    // A throw here would surface as the whole staff screen's error boundary — for a language tap.
    cookiesMock.mockImplementation(async () => {
      throw new Error("outside a request scope");
    });
    const res = await setStaffLang({ mode: "both" });
    expect(res).toEqual({ ok: false, error: expect.any(String) });
  });

  it("SETS THE COOKIE WITH NO STAFF SESSION — the control works on login, lock, outage and error", async () => {
    // There is nothing to mock away: this module imports no auth at all. If a future edit adds
    // `staffGate`, that import lands here unmocked and this case fails — which is the point.
    const mod = await import("./staff-lang-actions");
    expect(mod.setStaffLang).toBeTypeOf("function");
    const res = await setStaffLang({ mode: "my-only" });
    expect(res.ok).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
  });
});
