import { CLIENT_BUILD, STAFF_CONTRACT } from "@/lib/build-stamp";

/**
 * Phase 2i (P2bi) — which build this deployment serves, for a staff screen to compare with the
 * build it is running (`lib/build-stamp.ts`). `{ build, contract }`: the stamp `next build` was given
 * (`apps/qr/scripts/build-stamp.mjs`, inlined here exactly as into the client bundle) and the staff
 * contract number a deploy bumps when old screens would misread new answers.
 *
 * ⚠️ FORCE-STATIC: prerendered once per build into a file the CDN serves per deployment — no function
 * invocation for the one GET a minute every staff screen makes, and the answer flips with the
 * deployment, atomically. `scripts/check-build-stamp.mjs` reads that prerendered body in CI and
 * refuses a build whose body has no stamp or whose stamp reached no client chunk.
 *
 * `/api/*` bypasses the proxy matcher and the service worker (documents and `/api` are never
 * cached there), and the client asks with `cache: "no-store"` and no credentials.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({ build: CLIENT_BUILD, contract: STAFF_CONTRACT });
}
