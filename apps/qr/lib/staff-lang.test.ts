import { describe, expect, it } from "vitest";
import {
  STAFF_LANG_COOKIE,
  STAFF_LANG_MODES,
  STAFF_LANG_MODE_DEFAULT,
  echoesShown,
  langChainOutcome,
  modeForScript,
  modeOf,
  nextLangWrite,
  parseStaffLang,
  parseStaffLangMode,
  resolveBoardLang,
  scriptOf,
  staffLangCookieOptions,
  type StaffLangMode,
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

// ── Phase 2e · lang ──
/**
 * P2e — the mode layer. Every rule below is a VALUE table, and each table carries the row that
 * separates one plausible rewrite from the shipped rule (the `verify:slice` mutants named in the
 * comments). Nothing here is transcribed from prose: the expectations are the three literals and the
 * two scripts, and the property sweep derives its own inputs from a seeded generator.
 */
describe("parseStaffLangMode — exactly three values, everything else is the fallback", () => {
  it("reads the three literals verbatim", () => {
    expect(parseStaffLangMode("en")).toBe("en");
    expect(parseStaffLangMode("my-only")).toBe("my-only");
    expect(parseStaffLangMode("both")).toBe("both");
  });

  it("absence, the empty string and the LEGACY script value all read Both — what they rendered before", () => {
    // mode-default-drops-echoes: a default of "my-only" turns every existing device Burmese-only.
    // mode-legacy-my-reads-burmese-only: the old "my" cookie is Both, never Burmese-only.
    expect(parseStaffLangMode(undefined)).toBe("both");
    expect(parseStaffLangMode("")).toBe("both");
    expect(parseStaffLangMode("my")).toBe("both");
    expect(STAFF_LANG_MODE_DEFAULT).toBe("both");
  });

  it.each([
    "EN",
    " en",
    "en ",
    "my-only ",
    "MY-ONLY",
    "my_only",
    "myonly",
    "Both",
    "english",
    "en-US",
  ])("reads the near-miss %j as the default, never as a mode it resembles", (value) => {
    // mode-lax-parse: a trim + case-fold admits " en" and "EN".
    expect(parseStaffLangMode(value)).toBe("both");
  });

  it("an explicit Both survives a change of the default; only garbage takes the fallback", () => {
    // mode-both-falls-to-fallback: without its own line, "both" reads as whatever the default is.
    expect(parseStaffLangMode("both", "en")).toBe("both");
    expect(parseStaffLangMode(undefined, "en")).toBe("en");
    expect(parseStaffLangMode("my", "my-only")).toBe("my-only");
  });
});

/** mulberry32 — a fixed-seed generator, so the property sweep is the same sweep on every run. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("the mode parse and the script parse agree on EVERY string", () => {
  // The alphabet the real near-misses are built from, plus a Myanmar pair and the empty string.
  const ALPHABET = [
    "e",
    "n",
    "m",
    "y",
    "-",
    "o",
    "l",
    "b",
    "t",
    "h",
    " ",
    "E",
    "N",
    "M",
    "Y",
    "မြ",
  ];
  const rand = mulberry32(0x2e1a);
  const swept: (string | undefined)[] = [undefined, "", "en", "my", "my-only", "both"];
  for (let i = 0; i < 2000; i++) {
    const len = Math.floor(rand() * 13);
    let s = "";
    for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    swept.push(s);
  }

  it("parseStaffLang(v) === scriptOf(parseStaffLangMode(v)), and the mode is always one of three", () => {
    // script-of-both-is-english and mode-lax-parse each break this for some swept string.
    for (const v of swept) {
      expect(scriptOf(parseStaffLangMode(v)), JSON.stringify(v)).toBe(parseStaffLang(v));
      expect(STAFF_LANG_MODES).toContain(parseStaffLangMode(v));
    }
  });
});

describe("scriptOf · echoesShown · modeOf — the provider's two facts and their inverse", () => {
  it("scriptOf: both Burmese modes are Burmese", () => {
    expect(scriptOf("my-only")).toBe("my");
    expect(scriptOf("both")).toBe("my");
    expect(scriptOf("en")).toBe("en");
  });

  it("echoesShown: only Burmese-only drops them, and NO provider keeps them (the wall TV)", () => {
    // echoes-mode-inert · echoes-off-for-both · echoes-off-without-provider.
    expect(echoesShown("my-only")).toBe(false);
    expect(echoesShown("both")).toBe(true);
    expect(echoesShown("en")).toBe(true);
    expect(echoesShown(null)).toBe(true);
  });

  it("modeOf: an English script is English whatever the flag; Burmese splits on it", () => {
    expect(modeOf("en", true)).toBe("en");
    expect(modeOf("en", false)).toBe("en");
    expect(modeOf("my", true)).toBe("both");
    expect(modeOf("my", false)).toBe("my-only");
  });

  it("ROUND TRIP: every mode survives the provider's (script, echoes) pair", () => {
    // mode-of-en-reads-both · mode-of-echoes-ignored.
    for (const m of STAFF_LANG_MODES) expect(modeOf(scriptOf(m), echoesShown(m))).toBe(m);
  });
});

describe("modeForScript — what the front doors' two-script pill writes", () => {
  it.each([
    ["my", "my-only", "my-only"], // script-switch-drops-burmese-only: the tap on the read script keeps the mode
    ["my", "both", "both"],
    ["my", "en", "both"], // script-switch-to-burmese-only: from English, မြန်မာ restores the DEFAULT
    ["en", "my-only", "en"],
    ["en", "both", "en"],
    ["en", "en", "en"],
  ] as const)("(%s, from %s) → %s", (script, current, expected) => {
    expect(modeForScript(script, current)).toBe(expected);
  });
});

describe("the write chain's two decisions", () => {
  it("nextLangWrite: write the latest pick only when the server does not already hold it", () => {
    // next-write-ignores-confirmed: returning the intent re-writes a value the server holds.
    expect(nextLangWrite(null, "my")).toBeNull();
    expect(nextLangWrite("my", "my")).toBeNull();
    expect(nextLangWrite("en", "my")).toBe("en");
    expect(nextLangWrite("my", "en")).toBe("my");
    expect(nextLangWrite<StaffLangMode>("my-only", "both")).toBe("my-only");
    expect(nextLangWrite<StaffLangMode>("both", "both")).toBeNull();
  });

  it("a clean chain: cap on what was written, no line, one refresh", () => {
    expect(langChainOutcome({ wanted: "en", confirmed: "en", wrote: true, failed: false })).toEqual(
      { cap: "en", alert: false, refresh: true },
    );
  });

  it("a failed first write never corrected: the cap follows the provider, the line shows, no refresh", () => {
    expect(
      langChainOutcome({ wanted: "en", confirmed: "both", wrote: false, failed: true }),
    ).toEqual({ cap: null, alert: true, refresh: false });
  });

  it("a failed write the person ALREADY corrected back: no line — their wish is what the server holds", () => {
    // chain-alerts-a-met-wish.
    expect(
      langChainOutcome({ wanted: "both", confirmed: "both", wrote: false, failed: true }),
    ).toEqual({ cap: null, alert: false, refresh: false });
  });

  it("a partial chain (first ok, correction failed): one refresh to what was written, cap on it, the line shown", () => {
    // chain-skips-refresh-after-partial-write · chain-cap-drops-written.
    expect(
      langChainOutcome<StaffLangMode>({
        wanted: "my-only",
        confirmed: "en",
        wrote: true,
        failed: true,
      }),
    ).toEqual({ cap: "en", alert: true, refresh: true });
  });
});
