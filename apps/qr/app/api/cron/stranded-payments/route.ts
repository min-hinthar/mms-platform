import { NextRequest, NextResponse } from "next/server";
import { cronAuthVerdict } from "@/lib/cron-auth";
import { sweepStrandedPayments } from "@/lib/payment-recovery";

/**
 * M160(b) · owner ruling #13 — the unattended half of the stranded-paid-cart recovery: a paid card
 * whose webhook never landed, and nobody on /track or at the table to ask.
 *
 * GET because that is what Vercel Cron sends. Guarded by `Authorization: Bearer ${CRON_SECRET}` and
 * FAIL-CLOSED: with the secret unset (today, until the owner adds it — ENV.md) every call is refused
 * with a 503 and a log line naming the missing variable, never run unauthenticated.
 *
 * NOT YET SCHEDULED, deliberately. Ruling #13 orders it: M160 merges, the owner adds `CRON_SECRET`
 * in Vercel Production, and the follow-up registers the schedule in `apps/qr/vercel.json` (`crons`;
 * this repo has no Vercel cron yet — its scheduled work so far is pg_cron in Supabase). Registering
 * it here before the secret exists would only fill the logs with 503s.
 *
 * verify:slice-exempt — glue: the door is `cronAuthVerdict` (lib/cron-auth.ts, mutated) and the
 * sweep is `sweepStrandedPayments` (lib/payment-recovery.ts, mutated); this handler only maps their
 * answers to a status and counts. No money decision lives here.
 */
export const dynamic = "force-dynamic";
// The sweep reads up to five Stripe pages and recovers at most 25 intents; give it room.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const verdict = cronAuthVerdict(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (verdict === "unconfigured") {
    console.error("[cron stranded-payments] refused — CRON_SECRET is not set (or too short)");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (verdict === "denied") {
    console.error("[cron stranded-payments] refused — bad or missing Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await sweepStrandedPayments();
    if ((summary.answers.recorded ?? 0) > 0 || (summary.answers.refund_needed ?? 0) > 0)
      console.error("[cron stranded-payments] the sweep found stranded paid carts", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[cron stranded-payments] sweep failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
