"use server";
// verify:slice-exempt — PD3: a thin Server Action over `stampArrival` (lib/arrival.ts, mutated),
// which holds every authority rule; this maps its answer to the card's one refusal sentence.
import { stampArrival, type ArrivalWrite } from "./arrival";
import { TRACK } from "./i18n/track";

/**
 * J5 → PD3 — the in-page "I’m here" commit (the window's end, or the page hiding inside it). The
 * `pagehide` beacon and the next-visit reconcile post the same write through
 * `app/api/track/arrival/route.ts`; all three are idempotent on the order.
 *
 * `reason` rides beside the sentence so the card can tell a decided refusal (clear the pending
 * record, return to the question) from the one transport failure (keep it for the next visit).
 */
export type AnnounceArrivalResult =
  | { ok: true }
  | { ok: false; error: string; reason: Extract<ArrivalWrite, { ok: false }>["reason"] };

export async function announceArrival(raw: { orderId: string }): Promise<AnnounceArrivalResult> {
  const r = await stampArrival(raw, Date.now());
  if (r.ok) return r;
  return { ok: false, error: TRACK.refused.en, reason: r.reason };
}
