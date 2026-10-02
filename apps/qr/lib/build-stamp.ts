/**
 * Phase 2i (P2bi) — which BUILD this screen is running, and the strict reading of which build the
 * server is serving now. Pure; client-safe (no `next/*`, no React).
 *
 * WHY A STAMP OF OUR OWN. The package build script mints one random value per `next build`
 * (`apps/qr/scripts/build-stamp.mjs`) into `NEXT_PUBLIC_BUILD_STAMP`, and Next inlines it into the
 * client bundle AND into the force-static `GET /api/version` of the same build. A tab compares the
 * two. Not the commit SHA (a same-commit redeploy rotates Next's build id and the action key without
 * changing it), not `.next/BUILD_ID` (constant under `deploymentId`), and never the service worker
 * (stamping `sw.js` would reload every diner tab on every deploy).
 *
 * WHY STRICT. The answer arrives over whatever network the tablet is on: a captive portal answers
 * HTML 200, a proxy answers `{}`. Anything that is not exactly our shape is "no verdict" — never
 * "changed", which would reload a working screen into a login page.
 */

/** The stamp's shape — `build-stamp.mjs` prints `${Date.now().toString(36)}-${8 hex}`. */
export const STAMP_RE = /^[0-9a-z]{6,12}-[0-9a-f]{8}$/;

/**
 * Bump in the SAME PR that changes a staff action's or staff poll's return shape so that an older
 * client would misread it. A served contract that differs from this one makes the tab "retired":
 * even a sound-live board takes the new version at its next quiet moment (owner decision D11).
 */
export const STAFF_CONTRACT = 1;

/** A build stamp, or null when the value is not one (dev, tests, a stampless build). */
export function readStamp(value: unknown): string | null {
  return typeof value === "string" && STAMP_RE.test(value) ? value : null;
}

/**
 * This bundle's build. ⚠️ `process.env.NEXT_PUBLIC_BUILD_STAMP` is written as a LITERAL member
 * expression on purpose: Next inlines only that exact spelling, so a destructure or a computed key
 * would leave the client bundle reading `undefined` (and the CI artifact check red).
 */
export const CLIENT_BUILD: string | null = readStamp(process.env.NEXT_PUBLIC_BUILD_STAMP);

export type Served = { build: string; contract: number };

/**
 * The served answer, strictly: a plain object with a STAMP_RE `build` and a safe-integer
 * `contract` ≥ 1. Anything else — a portal's HTML, `{}`, `{ build: null }`, a 64-char string, an
 * array — is null ("no verdict").
 */
export function parseServed(body: unknown): Served | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { build, contract } = body as { build?: unknown; contract?: unknown };
  const stamp = readStamp(build);
  if (stamp === null) return null;
  if (typeof contract !== "number" || !Number.isSafeInteger(contract) || contract < 1) return null;
  return { build: stamp, contract };
}

export type VersionVerdict =
  | { kind: "current" }
  | { kind: "changed"; served: Served; incompatible: boolean }
  | { kind: "unknown" };

/**
 * Own null (a stampless bundle) or served null (no verdict) → unknown: a screen that cannot say
 * which build it is never calls itself stale. Equal builds → current. Else changed, and
 * `incompatible` when the served contract differs from this bundle's.
 */
export function versionVerdict(
  own: string | null,
  ownContract: number,
  served: Served | null,
): VersionVerdict {
  if (own === null || served === null) return { kind: "unknown" };
  if (served.build === own) return { kind: "current" };
  return { kind: "changed", served, incompatible: served.contract !== ownContract };
}
