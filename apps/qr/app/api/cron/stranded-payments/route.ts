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
 * SCHEDULED DAILY at 10:07 UTC (`apps/qr/vercel.json` `crons`), the order ruling #13 set: M160
 * merged, the owner added `CRON_SECRET` in Vercel Production (probed 2026-10-18: no header → 401, not
 * the unconfigured 503), then this schedule. Daily is the longest interval the sweep's window allows
 * (`SWEEP_SCHEDULE_INTERVAL_MS`) and the tightest every Vercel plan accepts; a plan that runs a daily
 * cron anywhere inside its hour stays covered by the window's one-hour overlap.
 *
 * verify:slice-exempt — glue: the door is `cronAuthVerdict` (lib/cron-auth.ts, mutated) and the
 * sweep is `sweepStrandedPayments` (lib/payment-recovery.ts, mutated); this handler only maps their
 * answers to a status and counts. No money decision lives here.
 */
export const dynamic = "force-dynamic";
// The sweep reads up to SWEEP_MAX_PAGES (10) expanded Stripe pages and attempts at most
// SWEEP_MAX_RECOVER (25) fulfillments. That worst case can outrun 60 s, so the sweep carries its own
// SWEEP_TIME_BUDGET_MS (45 s) — it stops early and logs what it did not reach, rather than being
// killed here mid-fulfillment with nothing said (lib/payment-recovery.ts).
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
