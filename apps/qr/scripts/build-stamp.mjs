#!/usr/bin/env node
/**
 * Phase 2i (P2bi) — mints this `next build`'s stamp: `${Date.now().toString(36)}-${8 hex}`, the
 * shape `lib/build-stamp.ts`'s STAMP_RE accepts. The package `build` script assigns it to
 * `NEXT_PUBLIC_BUILD_STAMP` in the task's OWN shell, so turbo's strict env mode never strips it and
 * it is never a turbo hash input; a cache hit replays `.next/**` with the stamp and Next's build id
 * baked in together. Next inlines it into the client bundle AND the force-static `/api/version`, and
 * a staff screen compares the two (`scripts/check-build-stamp.mjs` proves both carry it).
 *
 * A random per BUILD, never the commit SHA: a same-commit redeploy rotates Next's build id and the
 * action key without changing the SHA.
 */
import { randomBytes } from "node:crypto";

process.stdout.write(`${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`);
