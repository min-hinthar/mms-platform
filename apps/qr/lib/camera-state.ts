/**
 * Phase 1c — the Scan door's camera, as decisions a test can falsify without a camera.
 *
 * `components/grocery/ScanStage.tsx` owns the UI and `components/BarcodeScanner.tsx` owns the stream;
 * everything they DECIDE lives here, because a component needs a render and five mocks to prove a
 * rule a pure function proves with one value.
 *
 * The states, and the two geometries they draw in:
 *   · INK (one fixed box, the viewfinder): idle · primer · starting · live
 *   · PAPER (a recovery card that grows freely): denied · busy · no-camera · unsupported · in-app ·
 *     failed
 */

export type CameraFailure = "denied" | "busy" | "no-camera" | "unsupported" | "in-app" | "failed";

export type CameraState = "idle" | "primer" | "starting" | "live" | CameraFailure;

/** The ink states share one box; moving between them never changes layout. */
export const INK_STATES: readonly CameraState[] = ["idle", "primer", "starting", "live"];

export const isPaper = (s: CameraState): s is CameraFailure => !INK_STATES.includes(s);

/**
 * Instagram / Facebook / LINE in-app webviews. ⚠️ This only CLASSIFIES a failure — it never
 * pre-empts the camera, because current Instagram and Facebook webviews on iOS can grant it. A wrong
 * match costs one differently-worded panel, never a blocked camera.
 *
 * `Line/` is matched WHOLE and slash-anchored ON PURPOSE: Android Chrome's UA opens "(Linux; Android
 * …", so any looser prefix of it (`\bLin`, `Lin[a-z]*`) would call every Android phone an in-app
 * browser.
 */
const IN_APP = /\bFBAN\b|\bFBAV\b|\bFB_IAB\b|\bInstagram\b|\bLine\//;
export function isInAppBrowser(ua: string): boolean {
  return IN_APP.test(ua);
}

/** The `name` of whatever `getUserMedia` (or the code around it) threw — a DOMException, usually. */
function errName(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err) {
    const n = (err as { name: unknown }).name;
    return typeof n === "string" ? n : "";
  }
  return "";
}

/**
 * What a camera failure MEANS to the shopper, by `err.name`.
 *
 *   · NotAllowedError | PermissionDeniedError → a person (or the browser, on their behalf) said no:
 *     `denied` — or `in-app` inside a webview that refuses on its own.
 *   · SecurityError | TypeError → policy, an iframe, an insecure context. Not a person saying no.
 *   · NotReadableError | TrackStartError | AbortError → the camera exists but could not be opened
 *     (another app holds it, or the OS switched it off). The copy HEDGES the cause.
 *   · NotFoundError | DevicesNotFoundError | OverconstrainedError → no usable camera.
 *   · anything else → `failed`.
 */
export function cameraFailure(err: unknown, ctx: { inApp: boolean }): CameraFailure {
  switch (errName(err)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return ctx.inApp ? "in-app" : "denied";
    case "SecurityError":
    case "TypeError":
      return "unsupported";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no-camera";
    default:
      return "failed";
  }
}

export type PermissionReading = "granted" | "denied" | "prompt" | "unknown";

export type CameraOpening = "auto" | "primer" | "denied" | "unsupported" | "in-app";

/**
 * What the Scan door does the moment it opens. The camera prompt only ever follows the shopper's
 * tap, or a grant they already gave.
 *
 *   · no camera API, or an insecure context → `in-app` inside a webview, else `unsupported`;
 *   · permission `denied` → `denied` (no futile getUserMedia) — checked BEFORE the remembered grant,
 *     because a revoked grant is still remembered on this device;
 *   · permission `granted` → `auto`;
 *   · `prompt` or `unknown` WITH a remembered grant → `auto`. iOS Safari commonly reports `prompt` on
 *     every load, so a shopper who allowed the camera before skips OUR explainer — the OS may still
 *     ask (measure on a real iPhone before any copy claims otherwise);
 *   · otherwise → `primer` (one tap).
 */
export function cameraOpening(i: {
  cameraApi: boolean;
  secure: boolean;
  inApp: boolean;
  permission: PermissionReading;
  rememberedGrant: boolean;
}): CameraOpening {
  if (!i.cameraApi || !i.secure) return i.inApp ? "in-app" : "unsupported";
  if (i.permission === "denied") return "denied";
  if (i.permission === "granted") return "auto";
  if ((i.permission === "prompt" || i.permission === "unknown") && i.rememberedGrant) return "auto";
  return "primer";
}

/**
 * A `denied` answer this soon after a USER tap means the browser refused without asking (Chrome
 * remembers a denial). The settings help then opens itself — the shopper was never shown a prompt,
 * so they need the path to the setting, not another tap on a button that cannot work.
 */
export const INSTANT_REFUSAL_MS = 400;
export function instantRefusal(i: { failure: CameraFailure; elapsedMs: number }): boolean {
  return i.failure === "denied" && i.elapsedMs < INSTANT_REFUSAL_MS;
}

/**
 * What the scanner does with a decoded sighting — and so whether a sighting may become a charge
 * attempt (M186 lineage; the charge itself is still `classifyScan`'s call, in the page).
 *
 *   · `swallow` — the basket sheet covers the viewfinder. Sightings are still RECORDED in the
 *     throttle but none is announced, before or after the sheet: a jar resting in frame behind the
 *     modal is never charged unseen, and never charged the moment the sheet closes either.
 *     Checked FIRST — a sheet over a basket that is still minting is still a sheet.
 *   · `hold` — the basket does not exist yet. Sightings are recorded; when the hold lifts the
 *     scanner resets its throttle, so the jar the shopper is already pointing at adds ONCE, the
 *     moment the basket exists.
 *   · `none` — announce as normal.
 *
 * Decoding itself continues under both (ZXing decodes continuously). Nothing here claims frames go
 * unread; it claims no sighting is ANNOUNCED.
 */
export type DecodeHold = "none" | "hold" | "swallow";
export function decodeHold(i: { cartReady: boolean; sheetOpen: boolean }): DecodeHold {
  if (i.sheetOpen) return "swallow";
  if (!i.cartReady) return "hold";
  return "none";
}

/**
 * The scanner's throttle across a hold change. Only the `hold → none` edge resets it (the basket now
 * exists; the item in frame should announce once). `swallow → none` KEEPS it — resetting there would
 * announce, and charge, the jar that sat in frame behind the sheet the whole time.
 */
export function gateOnHoldChange(prev: DecodeHold, next: DecodeHold): "reset" | "keep" {
  return prev === "hold" && next === "none" ? "reset" : "keep";
}

/** How long the permission query may take before it reads as `unknown` (→ primer, one tap). */
export const PERMISSION_QUERY_MS = 500;

/**
 * `navigator.permissions.query({ name: "camera" })`, raced against a timeout. A throw (Firefox
 * rejects the `camera` name), an absent API or a timeout all read `unknown` — never `granted`. The
 * status object comes back too when there is one, so the stage can listen for a later change.
 */
export async function readCameraPermission(
  permissions: { query?: (d: { name: string }) => Promise<PermissionStatusLike> } | undefined,
  timeoutMs: number = PERMISSION_QUERY_MS,
): Promise<{ reading: PermissionReading; status: PermissionStatusLike | null }> {
  if (!permissions?.query) return { reading: "unknown", status: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      permissions.query({ name: "camera" }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!status) return { reading: "unknown", status: null };
    return { reading: readingOf(status.state), status };
  } catch {
    // Deliberate: an unanswerable query is `unknown` — the primer's one tap, never an auto-start.
    return { reading: "unknown", status: null };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type PermissionStatusLike = {
  state: string;
  onchange: ((this: unknown, ev: Event) => unknown) | null;
};

export function readingOf(state: string): PermissionReading {
  return state === "granted" || state === "denied" || state === "prompt" ? state : "unknown";
}
