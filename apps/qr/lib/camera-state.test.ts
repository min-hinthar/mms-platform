import { describe, expect, it } from "vitest";
import {
  INSTANT_REFUSAL_MS,
  cameraFailure,
  cameraOpening,
  decodeHold,
  gateOnHoldChange,
  instantRefusal,
  isInAppBrowser,
  isPaper,
  readCameraPermission,
} from "./camera-state";

/**
 * Phase 1c — the camera decisions. Each MUTATION line is an edit induced against the module and
 * watched turn its case red. The two `decodeHold` mutations are also verify:slice mutants: that rule
 * decides whether a decoded sighting may become a charge attempt.
 */

const dom = (name: string) => Object.assign(new Error(name), { name });

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  fban: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;]",
  fbav: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.108",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0",
};

describe("cameraFailure — by err.name", () => {
  it("a refusal is `denied`, or `in-app` inside a webview", () => {
    // MUTATION: ignore `inApp` → the in-app case reads denied; red.
    expect(cameraFailure(dom("NotAllowedError"), { inApp: false })).toBe("denied");
    expect(cameraFailure(dom("NotAllowedError"), { inApp: true })).toBe("in-app");
    expect(cameraFailure(dom("PermissionDeniedError"), { inApp: false })).toBe("denied");
  });

  it("policy is not a person saying no", () => {
    // MUTATION: map SecurityError to denied; red.
    expect(cameraFailure(dom("SecurityError"), { inApp: false })).toBe("unsupported");
    expect(cameraFailure(dom("TypeError"), { inApp: false })).toBe("unsupported");
    expect(cameraFailure(new TypeError("insecure"), { inApp: false })).toBe("unsupported");
  });

  it("busy, missing, and everything else", () => {
    expect(cameraFailure(dom("NotReadableError"), { inApp: false })).toBe("busy");
    expect(cameraFailure(dom("TrackStartError"), { inApp: false })).toBe("busy");
    expect(cameraFailure(dom("AbortError"), { inApp: false })).toBe("busy");
    expect(cameraFailure(dom("NotFoundError"), { inApp: false })).toBe("no-camera");
    expect(cameraFailure(dom("DevicesNotFoundError"), { inApp: false })).toBe("no-camera");
    expect(cameraFailure(dom("OverconstrainedError"), { inApp: false })).toBe("no-camera");
    expect(cameraFailure(new Error("boom"), { inApp: false })).toBe("failed");
    expect(cameraFailure("a string", { inApp: false })).toBe("failed");
    expect(cameraFailure(null, { inApp: true })).toBe("failed");
  });
});

describe("isInAppBrowser — classifies, never pre-empts", () => {
  it("true for Facebook, Instagram and LINE webviews", () => {
    expect(isInAppBrowser(UA.fban)).toBe(true);
    expect(isInAppBrowser(UA.fbav)).toBe(true);
    expect(isInAppBrowser(UA.instagram)).toBe(true);
    expect(isInAppBrowser(UA.line)).toBe(true);
  });

  it("false for the real browsers — Android Chrome's 'Linux' is not LINE", () => {
    // MUTATION: loosen `\bLine\/` to the prefix `\bLin` → the Android Chrome fixture (its UA opens
    // "(Linux; Android") reads in-app; red. (`/line/i` would NOT catch it: "Linux" is not "line".)
    expect(isInAppBrowser(UA.iosSafari)).toBe(false);
    expect(isInAppBrowser(UA.androidChrome)).toBe(false);
    expect(isInAppBrowser(UA.desktopChrome)).toBe(false);
  });
});

describe("cameraOpening — the prompt follows a tap or a prior grant", () => {
  const base = { cameraApi: true, secure: true, inApp: false, rememberedGrant: false } as const;

  it("granted → auto", () => {
    expect(cameraOpening({ ...base, permission: "granted" })).toBe("auto");
  });

  it("prompt + a remembered grant → auto (iOS reports prompt on every load)", () => {
    // MUTATION: only `unknown` counts with a remembered grant → primer; red.
    expect(cameraOpening({ ...base, permission: "prompt", rememberedGrant: true })).toBe("auto");
    expect(cameraOpening({ ...base, permission: "unknown", rememberedGrant: true })).toBe("auto");
  });

  it("unknown or prompt with nothing remembered → primer (one tap)", () => {
    expect(cameraOpening({ ...base, permission: "unknown" })).toBe("primer");
    expect(cameraOpening({ ...base, permission: "prompt" })).toBe("primer");
  });

  it("a denial outranks a remembered grant", () => {
    // MUTATION: check `rememberedGrant` before `denied` → auto (a futile getUserMedia); red.
    expect(cameraOpening({ ...base, permission: "denied", rememberedGrant: true })).toBe("denied");
  });

  it("no camera API or an insecure context → unsupported, or in-app inside a webview", () => {
    expect(cameraOpening({ ...base, secure: false, permission: "granted" })).toBe("unsupported");
    expect(cameraOpening({ ...base, cameraApi: false, permission: "granted" })).toBe("unsupported");
    expect(cameraOpening({ ...base, cameraApi: false, inApp: true, permission: "unknown" })).toBe(
      "in-app",
    );
  });
});

describe("instantRefusal — a denial the browser gave without asking", () => {
  it("denied just under the bound is instant; at the bound it is not", () => {
    // MUTATION: `<=` → 400ms reads instant; red.
    expect(instantRefusal({ failure: "denied", elapsedMs: INSTANT_REFUSAL_MS - 1 })).toBe(true);
    expect(instantRefusal({ failure: "denied", elapsedMs: INSTANT_REFUSAL_MS })).toBe(false);
  });

  it("only a denial counts — a busy camera is not a refusal", () => {
    expect(instantRefusal({ failure: "busy", elapsedMs: 10 })).toBe(false);
  });

  it("the bound is 400ms (spelled out: the symbolic cases above pass under any value)", () => {
    expect(INSTANT_REFUSAL_MS).toBe(400);
  });
});

describe("decodeHold — may a sighting become a charge attempt?", () => {
  it("a sheet swallows sightings even before the basket exists", () => {
    // MUTATION (verify:slice): test `cartReady` first → hold, and the hold→none reset would then
    // announce the jar that sat behind the sheet; red.
    expect(decodeHold({ cartReady: false, sheetOpen: true })).toBe("swallow");
  });

  it("a sheet over a live basket swallows — it never merely holds", () => {
    // MUTATION (verify:slice): sheet → "hold" → the gate resets when the sheet closes and the jar in
    // frame is charged unseen; red.
    expect(decodeHold({ cartReady: true, sheetOpen: true })).toBe("swallow");
  });

  it("no basket yet holds; a live basket announces", () => {
    expect(decodeHold({ cartReady: false, sheetOpen: false })).toBe("hold");
    expect(decodeHold({ cartReady: true, sheetOpen: false })).toBe("none");
  });
});

describe("gateOnHoldChange — which edge resets the throttle", () => {
  it("only hold → none resets", () => {
    expect(gateOnHoldChange("hold", "none")).toBe("reset");
    // MUTATION: reset on any → none edge → the jar behind the sheet announces on close; red.
    expect(gateOnHoldChange("swallow", "none")).toBe("keep");
    expect(gateOnHoldChange("none", "swallow")).toBe("keep");
    expect(gateOnHoldChange("none", "hold")).toBe("keep");
    expect(gateOnHoldChange("hold", "swallow")).toBe("keep");
    expect(gateOnHoldChange("none", "none")).toBe("keep");
  });
});

describe("isPaper — which states are recovery cards", () => {
  it("ink states are not paper; every failure is", () => {
    for (const s of ["idle", "primer", "starting", "live"] as const) expect(isPaper(s)).toBe(false);
    for (const s of ["denied", "busy", "no-camera", "unsupported", "in-app", "failed"] as const)
      expect(isPaper(s)).toBe(true);
  });
});

describe("readCameraPermission — never reads as granted by accident", () => {
  it("absent API → unknown", async () => {
    expect(await readCameraPermission(undefined)).toEqual({ reading: "unknown", status: null });
    expect(await readCameraPermission({})).toEqual({ reading: "unknown", status: null });
  });

  it("a throw → unknown (Firefox rejects the camera name)", async () => {
    const r = await readCameraPermission({ query: () => Promise.reject(new TypeError("nope")) });
    expect(r).toEqual({ reading: "unknown", status: null });
  });

  it("a query slower than the bound → unknown", async () => {
    const never = () => new Promise<never>(() => {});
    const r = await readCameraPermission({ query: never }, 5);
    expect(r.reading).toBe("unknown");
  });

  it("a real answer comes back with its status object", async () => {
    const status = { state: "granted", onchange: null };
    const r = await readCameraPermission({ query: () => Promise.resolve(status) });
    expect(r.reading).toBe("granted");
    expect(r.status).toBe(status);
    const odd = await readCameraPermission({
      query: () => Promise.resolve({ state: "weird", onchange: null }),
    });
    expect(odd.reading).toBe("unknown");
  });
});
