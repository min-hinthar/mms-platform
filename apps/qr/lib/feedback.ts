"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { submitFeedbackInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { getPostHogClient } from "./posthog-server";

// Feedback + UNGATED review triage (M4 P4.3; docs/M4_DESIGN R9/R10). Ask everyone, offer the public link
// to ALL raters, surface LOW ratings to staff for recovery — never gate the link by sentiment. One
// feedback per order, by the order's EARNER (the SSR-verified uid). Reads/writes service-role; the
// authorization decision is ours.

export type FeedbackState = {
  /** The caller is the order's earner (single-pay payer / split host) → may leave feedback. */
  canReview: boolean;
  /** Already left feedback for this order. */
  reviewed: boolean;
  /** The owner-configured public-review URL, shown to EVERY rater (ungated). null → no link shown. */
  googleReviewUrl: string | null;
};

export async function getFeedbackState(orderId: string): Promise<FeedbackState> {
  const none: FeedbackState = { canReview: false, reviewed: false, googleReviewUrl: null };
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return none;
  const db = serviceClient();
  const [{ data: order }, { data: existing }, { data: cfg }] = await Promise.all([
    db.from("qr_orders").select("earned_by,status").eq("id", orderId).maybeSingle(),
    db.from("mms_feedback").select("id").eq("order_id", orderId).maybeSingle(),
    db.from("mms_feedback_config").select("google_review_url").eq("id", true).maybeSingle(),
  ]);
  return {
    canReview: !!order && order.status === "paid" && order.earned_by === user.id,
    reviewed: !!existing,
    googleReviewUrl: cfg?.google_review_url ?? null,
  };
}

export type SubmitFeedbackReason =
  | "not_found"
  | "not_yours"
  | "not_paid"
  | "bad_rating"
  | "exists"
  | "error";
export type SubmitFeedbackResult = { ok: true } | { ok: false; reason: SubmitFeedbackReason };

export async function submitFeedback(
  orderId: string,
  rating: number,
  comment?: string,
): Promise<SubmitFeedbackResult> {
  const input = submitFeedbackInput.parse({ orderId, rating, comment });
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, reason: "not_yours" };
  const db = serviceClient();
  const { data, error } = await db.rpc("mms_submit_feedback", {
    p_order: input.orderId,
    p_user: user.id,
    p_rating: input.rating,
    p_comment: input.comment ?? "", // SQL nullif(btrim(...),'') maps empty → null in the row
  });
  if (error) {
    console.error("[feedback] mms_submit_feedback failed", error.message);
    return { ok: false, reason: "error" };
  }
  if (data !== "ok" && data !== "exists")
    return { ok: false, reason: (data ?? "error") as SubmitFeedbackReason };
  // Triage signal (R9 — internal routing only, never gates the diner): a low rating pings staff for
  // recovery. Fire only on a fresh submit (not a benign re-submit). Best-effort.
  if (data === "ok" && input.rating <= 3) {
    getPostHogClient().capture({
      distinctId: user.id,
      event: "feedback_low_rating",
      properties: { order_id: input.orderId, rating: input.rating },
    });
  }
  return { ok: true };
}

export type StaffFeedbackRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

/** Manager+ triage list — recent feedback, low ratings first surfaced by the caller. Owner-read RLS backs
 *  this; the service-role read is gated by requireStaff(manager) here. */
export async function getStaffFeedback(limit = 50): Promise<StaffFeedbackRow[]> {
  await requireStaff("manager");
  const lim = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const { data } = await serviceClient()
    .from("mms_feedback")
    .select("id,rating,comment,created_at")
    .order("created_at", { ascending: false })
    .limit(lim);
  return (data ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}
