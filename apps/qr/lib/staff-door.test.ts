import { describe, expect, it } from "vitest";
import {
  STAFF_DOOR_COOKIE,
  STAFF_DOOR_TARGET,
  isColdStart,
  parseStaffDoor,
  resolveStaffHome,
  staffDoorCookieOptions,
} from "./staff-door";
import { staffLangCookieOptions } from "./staff-lang";

/**
 * P7 — the door carrier. Three claims, each pinned by a VALUE the mutants in `verify-slice.mjs`
 * flip: the parser admits exactly two strings; the resolver redirects a kitchen device ONLY on a
 * cold start and never traps a tablet behind a remembered door; and "cold" means "no same-origin
 * referer", never "no referer".
 */
describe("parseStaffDoor — exact equality, two values", () => {
  it("admits the two doors and nothing near them", () => {
    expect(parseStaffDoor("kitchen")).toBe("kitchen");
    expect(parseStaffDoor("counter")).toBe("counter");
    for (const near of [
      "Kitchen",
      " kitchen",
      "kitchen ",
      "KITCHEN",
      "counter\n",
      "board",
      "",
      "null",
    ])
      expect(parseStaffDoor(near)).toBeNull();
    expect(parseStaffDoor(undefined)).toBeNull();
  });
  it("names the cookie with the mms_ convention and shares the language cookie's options", () => {
    expect(STAFF_DOOR_COOKIE).toBe("mms_staff_door");
    // Same jar, same path, same lifetime — a door that outlived its language, or the reverse,
    // would be a tablet half set up.
    expect(staffDoorCookieOptions()).toEqual(staffLangCookieOptions());
    expect(staffDoorCookieOptions().path).toBe("/");
  });
  it("routes each door to one target, the counter door being the floor itself", () => {
    expect(STAFF_DOOR_TARGET.kitchen).toBe("/staff/kitchen");
    expect(STAFF_DOOR_TARGET.counter).toBe("/staff");
  });
});

describe("resolveStaffHome — the full matrix", () => {
  const cases: [
    { door: "kitchen" | "counter" | null; doorsParam: boolean; coldStart: boolean },
    ReturnType<typeof resolveStaffHome>,
  ][] = [
    // ?doors=1 always wins — the Screens chip can never be trapped by a remembered door.
    [{ door: "kitchen", doorsParam: true, coldStart: true }, { view: "doors" }],
    [{ door: "kitchen", doorsParam: true, coldStart: false }, { view: "doors" }],
    [{ door: "counter", doorsParam: true, coldStart: true }, { view: "doors" }],
    [{ door: "counter", doorsParam: true, coldStart: false }, { view: "doors" }],
    [{ door: null, doorsParam: true, coldStart: true }, { view: "doors" }],
    [{ door: null, doorsParam: true, coldStart: false }, { view: "doors" }],
    // A kitchen device: onto its board from the icon / a bookmark; the doors from an in-app tap.
    [{ door: "kitchen", doorsParam: false, coldStart: true }, { redirect: "/staff/kitchen" }],
    [{ door: "kitchen", doorsParam: false, coldStart: false }, { view: "doors" }],
    // A counter device: the floor IS its door, warm or cold.
    [{ door: "counter", doorsParam: false, coldStart: true }, { view: "floor" }],
    [{ door: "counter", doorsParam: false, coldStart: false }, { view: "floor" }],
    // No door yet: ask.
    [{ door: null, doorsParam: false, coldStart: true }, { view: "doors" }],
    [{ door: null, doorsParam: false, coldStart: false }, { view: "doors" }],
  ];
  it.each(cases)("%j → %j", (input, expected) => {
    expect(resolveStaffHome(input)).toEqual(expected);
  });
  it("never redirects anywhere but the kitchen board", () => {
    const targets = new Set(
      cases.map(([i]) => resolveStaffHome(i)).flatMap((r) => ("redirect" in r ? [r.redirect] : [])),
    );
    expect([...targets]).toEqual(["/staff/kitchen"]);
  });
});

describe("isColdStart — no SAME-ORIGIN referer", () => {
  const host = "mms.example";
  it("an icon launch, a bookmark or a typed URL carry no referer → cold", () => {
    expect(isColdStart(null, host)).toBe(true);
    expect(isColdStart("", host)).toBe(true);
  });
  it("an in-app tap carries a same-origin referer → warm, case-insensitively", () => {
    expect(isColdStart("https://mms.example/staff/expo", host)).toBe(false);
    expect(isColdStart("https://MMS.example/staff", host)).toBe(false);
    expect(isColdStart("https://mms.example:443/staff", "mms.example:443")).toBe(false);
  });
  it("a referer from another host, an unparsable one, or an unknown own host → cold", () => {
    expect(isColdStart("https://evil.example/staff", host)).toBe(true);
    expect(isColdStart("not a url", host)).toBe(true);
    expect(isColdStart("https://mms.example/staff", null)).toBe(true);
    // A host that merely CONTAINS or ENDS WITH ours is not ours — `includes`/`endsWith` pass these.
    expect(isColdStart("https://mms.example.evil.example/staff", host)).toBe(true);
    expect(isColdStart("https://evil-mms.example/staff", host)).toBe(true);
  });
});
