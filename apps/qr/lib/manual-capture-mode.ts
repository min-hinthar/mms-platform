import "server-only";
import { serviceClient } from "@mms/db/server";
import { manualCaptureMode } from "./manual-capture";

/**
 * W23d — is THIS checkout a manual-capture one? (registry M71)
 *
 * The same two conditions `create-intent` uses to choose `capture_method: "manual"`, asked again on
 * /track so the arrival screen knows whether `redirect_status=succeeded` means CHARGED or merely
 * AUTHORIZED. Re-derived rather than carried in the URL for the obvious reason: a query parameter
 * the client controls must never decide what a money surface claims.
 *
 * FAIL TOWARD FALSE, and this is the load-bearing property. `false` is today's behaviour exactly —
 * the celebration, the Stars pill, the cancellation poll off. A blip on this read therefore costs an
 * automatic-capture diner nothing, while the alternative (defaulting true) would strip "Paid —
 * thank you!" off a payment that really did go through. The one thing it can cost is a manual-
 * capture diner briefly seeing the old copy, which the ~30s fallback corrects.
 *
 * The flag check comes FIRST so that with `PICKUP_MANUAL_CAPTURE` off this is a synchronous false
 * and /track does no extra work at all.
 */
export async function awaitingManualCapture(cartId: string | null): Promise<boolean> {
  if (process.env.PICKUP_MANUAL_CAPTURE !== "1" || !cartId) return false;
  const { data, error } = await serviceClient()
    .from("qr_carts")
    .select("table_sessions(mode)")
    .eq("id", cartId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[manual-capture] mode read failed", error.message);
    return false;
  }
  // PostgREST types a to-one embed as an object; guard rather than cast, since a wrong shape here
  // would silently answer `true` for every mode.
  const sess = data.table_sessions as { mode?: string | null } | null;
  return manualCaptureMode(sess?.mode ?? "");
}
