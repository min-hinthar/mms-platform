import { NextRequest, NextResponse } from "next/server";
import { cartViewInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { releaseCartLock } from "@/lib/lock";
import { withinMutationRate } from "@/lib/rate";

/**
 * W9b — release the pay-window lock on page unload.
 *
 * Why a ROUTE and not the existing `releasePayLock` Server Action: the only unload event a browser
 * reliably delivers is `pagehide`, and the only request that survives it is `navigator.sendBeacon`,
 * which needs a real URL. A Server Action call started in `pagehide` is cancelled with the document.
 *
 * Why it matters: a diner who leaves /cart from the pay step (closes the tab, hits Back out of the
 * app, gets a phone call) keeps holding the lock that makes the WHOLE TABLE read-only. The TTL frees
 * it eventually; until then their tablemates watch every Add sit disabled for a checkout nobody is
 * doing. This is the cheap, immediate release.
 *
 * ⚠️ NOT wired to `visibilitychange` — that fires every time a diner app-switches to their wallet to
 * approve Apple/Google Pay, and dropping the lock there would re-open the peer-mutation-mid-checkout
 * hole the lock exists to close (the cart could be edited out from under a live PaymentIntent).
 *
 * Authorization is the same as every mutation: the caller must be a verified member of the cart's
 * active session (`assertCartMember` reads the anon-auth cookie, which sendBeacon sends same-origin),
 * and `releaseCartLock` is additionally scoped `.eq("locked_by", uid)` so a member can only ever drop
 * their OWN lock, never a tablemate's.
 */
export async function POST(req: NextRequest) {
  // Defense in depth against a cross-site POST. The blast radius is small — an attacker would need a
  // cart UUID, and the worst outcome is a member's own advisory, TTL-backed lock ending early — but a
  // state-changing endpoint should still refuse a request that plainly came from another origin. A
  // browser that sends no Origin at all is allowed through rather than breaking the release.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  let cartId: string;
  try {
    // sendBeacon can't set headers, so the body arrives as whatever Blob type we gave it; parse the
    // text rather than trusting a Content-Type we didn't get to negotiate.
    ({ cartId } = cartViewInput.parse(JSON.parse(await req.text())));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const { uid } = await assertCartMember(cartId);
    // Per-device flood guard (P3.4), consistent with `releasePayLock`. A rate-limited release just
    // no-ops — the TTL is the backstop, and this path must never throw at a page that's unloading.
    if (await withinMutationRate(uid)) await releaseCartLock(cartId, uid);
  } catch (e) {
    // A cart that already closed (paid) has no lock left to release — that's the success case, not a
    // failure. Everything else is a genuine refusal.
    if (e instanceof AuthzError && e.code === "cart_closed")
      return new NextResponse(null, { status: 204 });
    if (e instanceof AuthzError) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    console.error("[cart] release-lock failed", e);
    return NextResponse.json({ error: "Release failed" }, { status: 500 });
  }
  // 204: nothing to read. The page issuing this is already gone.
  return new NextResponse(null, { status: 204 });
}
