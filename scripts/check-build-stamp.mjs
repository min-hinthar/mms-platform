#!/usr/bin/env node
/* global process, console, Buffer -- a Node script; the root config lints for the browser */
/**
 * Phase 2i (P2bi) — proves a `next build` carries ONE build stamp in BOTH places a staff screen
 * compares: the prerendered `/api/version` body and the client bundle. Runs in CI right after
 * `pnpm turbo run lint typecheck build test` (it needs the build output, so it is NOT fast lane).
 *
 * Why it exists: the detector is only as good as the stamp. A build script that lost its
 * `NEXT_PUBLIC_BUILD_STAMP=…` assignment answers `{ build: null }` — every screen reads "no verdict"
 * and never learns of a deploy, silently, with every other check green. A `build-stamp.ts` that
 * stopped reading `process.env.NEXT_PUBLIC_BUILD_STAMP` the inlinable way (a destructure, a
 * computed key) ships `undefined` in the bundle while the route still answers a stamp — the same
 * silence from the other side.
 *
 * What it does NOT prove: that the WATCHER reads the stamp. Any client chunk carrying the literal
 * passes (`makeFetchServed`'s own default inlines it too), so a watcher whose default stopped being
 * `CLIENT_BUILD` stays green here. That wiring is pinned in `AppUpdateWatch.test.tsx` (the bare
 * `<AppUpdateWatch />` case, mutant `p2i-watch/default-unstamped`).
 *
 * It reads BUILD OUTPUT, never source text: the prerendered body is parsed with the app's own strict
 * reader (`parseServed`, transpiled from `apps/qr/lib/build-stamp.ts` — never a copy of its regex),
 * and that exact stamp must occur in at least one file under `.next/static/chunks/`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QR = path.join(ROOT, "apps", "qr");
export const VERSION_BODY = path.join(QR, ".next", "server", "app", "api", "version.body");
export const CHUNKS_DIR = path.join(QR, ".next", "static", "chunks");

/**
 * The decision, pure: `body` is the prerendered route's text (null when the file is missing),
 * `chunks` yields each client chunk's text, `parseServed` is the app's strict reader.
 * @param {{ body: string | null; chunks: Iterable<string>; parseServed: (b: unknown) => { build: string; contract: number } | null }} input
 * @returns {{ ok: true; stamp: string } | { ok: false; reason: string }}
 */
export function checkBuildStamp({ body, chunks, parseServed }) {
  if (body === null)
    return {
      ok: false,
      reason: "no prerendered /api/version body — is the route still force-static?",
    };
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: `/api/version's body is not JSON: ${body.slice(0, 120)}` };
  }
  const served = parseServed(parsed);
  if (served === null)
    return {
      ok: false,
      reason: `/api/version answers no build stamp (${body.slice(0, 120)}) — was NEXT_PUBLIC_BUILD_STAMP set by the build script?`,
    };
  for (const text of chunks)
    if (text.includes(served.build)) return { ok: true, stamp: served.build };
  return {
    ok: false,
    reason: `the stamp ${served.build} is in no client chunk — the client bundle cannot say which build it is`,
  };
}

/** Every file under `dir`, recursively (none when it does not exist). */
function* filesUnder(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* filesUnder(p);
    else yield p;
  }
}

/** The app's own `parseServed`, transpiled from TypeScript — the rule is imported, never copied. */
export async function loadParseServed() {
  const { default: ts } = await import("typescript");
  const src = readFileSync(path.join(QR, "lib", "build-stamp.ts"), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  return mod.parseServed;
}

async function main() {
  let body = null;
  try {
    body = readFileSync(VERSION_BODY, "utf8");
  } catch {
    body = null;
  }
  const chunks = (function* () {
    for (const f of filesUnder(CHUNKS_DIR)) if (f.endsWith(".js")) yield readFileSync(f, "utf8");
  })();
  const out = checkBuildStamp({ body, chunks, parseServed: await loadParseServed() });
  if (!out.ok) {
    console.error(`✗ build stamp: ${out.reason}`);
    process.exit(1);
  }
  console.log(`✓ build stamp ${out.stamp}: in /api/version's prerendered body and a client chunk`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
