import { describe, expect, it } from "vitest";
import {
  STAFF_DOOR_COOKIE,
  STAFF_DOOR_TARGET,
  STAFF_FRONT_DOORS,
  isColdStart,
  parseStaffDoor,
  resolveStaffHome,
  staffDoorCookieOptions,
} from "./staff-door";
import { staffLangCookieOptions } from "./staff-lang";

/**
 * P7 — the door carrier. Four claims, each pinned by a VALUE the mutants in `verify-slice.mjs`
 * flip: the parser admits exactly two strings; the resolver redirects a kitchen device ONLY on a
 * cold start, never traps a tablet behind a remembered door, and opens the floor when asked for it
 * by name; "cold" means "no same-origin referer, or a same-origin referer from a FRONT DOOR" (the
 * lock and the login re-enter /staff through a same-origin client navigation every morning the
 * tablet was locked — the blind pass found the first draft reading those as warm, so Mom's "opens
 * on her board" never held on a locked tablet); and a proxy's multi-valued host is still ours.
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
  it("routes each door to one target — the counter door asking for the floor BY NAME", () => {
    expect(STAFF_DOOR_TARGET.kitchen).toBe("/staff/kitchen");
    // Not a bare `/staff`: that renders the floor only once the cookie exists, so a refused write
    // (or JavaScript off) would land the Counter tap back on the doors — the first draft did.
    expect(STAFF_DOOR_TARGET.counter).toBe("/staff?floor=1");
  });
});

describe("resolveStaffHome — the full matrix", () => {
  type In = Parameters<typeof resolveStaffHome>[0];
  const cases: [In, ReturnType<typeof resolveStaffHome>][] = [
    // ?doors=1 always wins — the Screens chip can never be trapped by a remembered door, and it
    // beats ?floor=1 too, so a URL carrying both still shows the doors.
    [{ door: "kitchen", doorsParam: true, floorParam: false, coldStart: true }, { view: "doors" }],
    [{ door: "kitchen", doorsParam: true, floorParam: false, coldStart: false }, { view: "doors" }],
    [{ door: "counter", doorsParam: true, floorParam: false, coldStart: true }, { view: "doors" }],
    [{ door: "counter", doorsParam: true, floorParam: false, coldStart: false }, { view: "doors" }],
    [{ door: null, doorsParam: true, floorParam: false, coldStart: true }, { view: "doors" }],
    [{ door: null, doorsParam: true, floorParam: false, coldStart: false }, { view: "doors" }],
    [{ door: null, doorsParam: true, floorParam: true, coldStart: true }, { view: "doors" }],
    [{ door: "kitchen", doorsParam: true, floorParam: true, coldStart: true }, { view: "doors" }],
    // ?floor=1 — the Counter door's own href. The floor, whatever the cookie says and whether or
    // not it could be written; on a kitchen device it beats the cold-start redirect, because a
    // person tapped Counter.
    [{ door: null, doorsParam: false, floorParam: true, coldStart: true }, { view: "floor" }],
    [{ door: null, doorsParam: false, floorParam: true, coldStart: false }, { view: "floor" }],
    [{ door: "kitchen", doorsParam: false, floorParam: true, coldStart: true }, { view: "floor" }],
    [{ door: "kitchen", doorsParam: false, floorParam: true, coldStart: false }, { view: "floor" }],
    [{ door: "counter", doorsParam: false, floorParam: true, coldStart: true }, { view: "floor" }],
    // A kitchen device: onto its board from the icon / a bookmark; the doors from an in-app tap.
    [
      { door: "kitchen", doorsParam: false, floorParam: false, coldStart: true },
      { redirect: "/staff/kitchen" },
    ],
    [
      { door: "kitchen", doorsParam: false, floorParam: false, coldStart: false },
      { view: "doors" },
    ],
    // A counter device: the floor IS its door, warm or cold.
    [{ door: "counter", doorsParam: false, floorParam: false, coldStart: true }, { view: "floor" }],
    [
      { door: "counter", doorsParam: false, floorParam: false, coldStart: false },
      { view: "floor" },
    ],
    // No door yet: ask.
    [{ door: null, doorsParam: false, floorParam: false, coldStart: true }, { view: "doors" }],
    [{ door: null, doorsParam: false, floorParam: false, coldStart: false }, { view: "doors" }],
  ];
  it.each(cases)("%j → %j", (input, expected) => {
    expect(resolveStaffHome(input)).toEqual(expected);
  });
  it("never redirects anywhere but the kitchen board, and only from a kitchen device", () => {
    const redirects = cases.filter(([, r]) => "redirect" in r);
    expect(redirects.map(([, r]) => ("redirect" in r ? r.redirect : ""))).toEqual([
      "/staff/kitchen",
    ]);
    expect(redirects.every(([i]) => i.door === "kitchen" && i.coldStart)).toBe(true);
  });
});

describe("isColdStart — no SAME-ORIGIN referer, or one from a FRONT DOOR", () => {
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
  it("arriving from the lock, the login or the auth callback IS a start — cold, same origin or not", () => {
    // `PinUnlock` does `router.replace("/staff")` after the PIN and the login lands on `/staff` by
    // default: both are same-origin client navigations, and both are how a locked or signed-out
    // kitchen tablet begins its day. Reading them as warm sent Mom to the doors every such morning.
    expect(STAFF_FRONT_DOORS).toEqual(["/staff/lock", "/staff/login", "/staff/auth/"]);
    expect(isColdStart("https://mms.example/staff/lock", host)).toBe(true);
    expect(isColdStart("https://mms.example/staff/login", host)).toBe(true);
    expect(isColdStart("https://mms.example/staff/login?next=%2Fstaff", host)).toBe(true);
    expect(isColdStart("https://mms.example/staff/auth/callback?code=x", host)).toBe(true);
    // Exactness: a page that merely STARTS with a front door's name is an ordinary page.
    expect(isColdStart("https://mms.example/staff/lockers", host)).toBe(false);
    expect(isColdStart("https://mms.example/staff/login-help", host)).toBe(false);
    expect(isColdStart("https://mms.example/staff/authors", host)).toBe(false);
  });
  it("a proxy's multi-valued host header is read by its FIRST value", () => {
    // `x-forwarded-host: a, b` is what two proxies produce; `new URL("https://a, b")` throws, and a
    // throw reads as cold — which would redirect every in-app arrival on a kitchen tablet.
    expect(isColdStart("https://mms.example/staff/expo", "mms.example, proxy.internal")).toBe(
      false,
    );
    expect(isColdStart("https://mms.example/staff/expo", " mms.example ,proxy.internal")).toBe(
      false,
    );
    expect(isColdStart("https://evil.example/staff", "mms.example, evil.example")).toBe(true);
  });
});
