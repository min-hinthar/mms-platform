import { NextResponse } from "next/server";

/**
 * W10a — the ONE health probe behind every "is it us or is it you?" decision. The app's failure
 * copy is only allowed to blame a diner's connection when `navigator.onLine === false`; for every
 * other failure the client asks THIS route, which checks whether OUR platform (Supabase REST — the
 * same origin auth + PostgREST share) is reachable from the server side.
 *
 * Deliberately DB-less in the success path's cost: a HEAD to the REST root with the anon key is
 * answered by PostgREST's router without touching a table, and a PAUSED project (the exact incident
 * this exists for — the free-tier idle pause, live-reproduced 2026-08-01) fails it immediately.
 * 2.5s timeout: the probe must be decisively faster than the failures it explains — a probe that
 * hangs is a second outage. Never cached (a stale "ok" would re-blame the diner).
 */
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 2500;

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Misconfiguration reads as DOWN, not ok — the copy this powers must fail toward honesty
  // ("we're having trouble"), never toward blaming the diner.
  if (!base || !key) return down("misconfigured");

  try {
    const res = await fetch(`${base}/rest/v1/`, {
      method: "HEAD",
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // A <500 HTTP answer means the platform is up and routing (401/404 included — those are
    // PostgREST answering). 5xx from the gateway AND transport failures/timeouts both read as
    // "down" — a gateway erroring on a HEAD to its root is not a healthy platform.
    return NextResponse.json(
      { db: res.status < 500 ? "ok" : "down" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return down("unreachable");
  }
}

function down(reason: string) {
  // 200, not 503 — the PROBE succeeded; "down" is its finding. (A 503 here would make edge/CDN
  // layers and fetch wrappers treat the probe itself as failed, collapsing the two truths.)
  return NextResponse.json(
    { db: "down" as const, reason },
    { headers: { "Cache-Control": "no-store" } },
  );
}
