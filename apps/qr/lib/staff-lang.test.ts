import { describe, expect, it } from "vitest";
import {
  STAFF_LANG_COOKIE,
  parseStaffLang,
  resolveBoardLang,
  staffLangCookieOptions,
} from "./staff-lang";

/**
 * P2 · G1 — the parser and the board's resolution.
 *
 * The parse rule is EXACT equality against `"en"`, and this suite exists to make the lax rewrite
 * fail: `value?.toLowerCase().startsWith("e")` reads as "a bit more forgiving" and admits `"EU"`,
 * `"english"` and a truncated cookie chunk. A cookie jar is not a trusted input — it carries
 * whatever a previous build or a hand-edit left behind, including the retired `mms_locale` values —
 * and the failure direction of a lax parse is a console that silently reverts to English for the
 * people who need Burmese most.
 */
describe("parseStaffLang — exactly two values, everything else is Burmese", () => {
  it("returns the two real values", () => {
    expect(parseStaffLang("en")).toBe("en");
    expect(parseStaffLang("my")).toBe("my");
  });

  it("defaults to Burmese on absence — the first visit needs no control", () => {
    expect(parseStaffLang(undefined)).toBe("my");
    expect(parseStaffLang("")).toBe("my");
  });

  it.each([
    ["EN", "an upper-cased value — a case-fold would admit it"],
    ["En", "mixed case"],
    ["my ", "a trailing space — a trim would admit it"],
    [" en", "a leading space"],
    ["english", "the long form — a prefix match would admit it"],
    ["EU", "the exact string a startsWith('e') rewrite lets through"],
    ["e", "a truncated cookie chunk"],
    ["fr", "a language this app does not speak"],
    ["en-US", "a BCP-47 tag — a prefix match would admit it"],
  ])("treats %j as Burmese (%s)", (value) => {
    expect(parseStaffLang(value)).toBe("my");
  });
});

describe("resolveBoardLang — the TV's bookmark beats the cookie, and a typo does not", () => {
  it("an explicit query wins over the cookie, both ways", () => {
    expect(resolveBoardLang("en", "my")).toBe("en");
    expect(resolveBoardLang("my", "en")).toBe("my");
  });

  it("falls through to the cookie when there is no query", () => {
    expect(resolveBoardLang(undefined, "en")).toBe("en");
    expect(resolveBoardLang(undefined, "my")).toBe("my");
  });

  it("a GARBAGE query falls through to the cookie, not to the default", () => {
    // A typo in the TV's URL must not silently override a device that was set up correctly.
    expect(resolveBoardLang("EN", "en")).toBe("en");
    expect(resolveBoardLang("burmese", "en")).toBe("en");
  });

  it("defaults to Burmese when neither is present", () => {
    expect(resolveBoardLang(undefined, undefined)).toBe("my");
  });
});

describe("the cookie's shape", () => {
  it("is named with the cookie convention, not the storage one", () => {
    // `mms_` underscore is the COOKIE convention here (mms_staff_lock, mms_staff_next); `mms.` dot
    // is for storage keys (mms.kds.station). The plan's source doc had this wrong.
    expect(STAFF_LANG_COOKIE).toBe("mms_staff_lang");
    expect(STAFF_LANG_COOKIE).not.toContain(".");
  });

  it("is site-wide, because /board is not under /staff", () => {
    // The neighbouring lock cookie is path-scoped to /staff. Copying that would starve the wall TV
    // while every /staff page kept working — a failure no /staff test could see.
    expect(staffLangCookieOptions().path).toBe("/");
  });

  it("is httpOnly, lax, and persists", () => {
    const o = staffLangCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.maxAge).toBeGreaterThan(0);
  });
});
