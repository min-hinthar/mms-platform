import { NextRequest, NextResponse } from "next/server";
import { releaseAttemptInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { releasePayAttempt } from "@/lib/lock";
import { normalizeEra } from "@/lib/pay-attempt";
import { withinMutationRate } from "@/lib/rate";

/**
 * W9b — release the pay-window lock on page unload.
 *
 * Why a ROUTE and not the existing `releasePayLock` Server Action: on a real document teardown the
 * only request that survives is `navigator.sendBeacon`, which needs a URL — a Server Action started
 * in `pagehide` is cancelled with the document. (A SOFT navigation off the pay step unmounts without
 * any unload event; `Checkout` handles that case from its effect cleanup, through this same route so
 * both exits behave identically.)
 *
 * Why it matters: a diner who leaves /cart from the pay step keeps holding the lock that makes the
 * WHOLE TABLE read-only. The TTL frees it eventually; until then their tablemates watch every Add sit
 * disabled for a checkout nobody is doing.
 *
 * ⚠️ The caller — not this route — decides when NOT to release: never during a confirm, never on a
 * bfcache freeze (`pagehide` with `persisted`), and never on `visibilitychange` (that fires on every
 * app-switch to a wallet). Each of those would re-open the peer-mutation-mid-checkout hole the lock
 * exists to close.
 *
 * Authorization is the same as every mutation: the caller must be a verified member of the cart's
 * active session (`assertCartMember` reads the anon-auth cookie, which sendBeacon sends same-origin),
 * and `releasePayAttempt` is additionally scoped `.eq("locked_by", uid).eq("locked_at", era)` — so a
 * member can only ever drop their OWN lock, and only for the ATTEMPT this beacon was fired by.
 */
export async function POST(req: NextRequest) {
  // No Origin check here, deliberately. The session cookie is `SameSite=Lax`, so a cross-site POST
  // carries no session at all and `assertCartMember` refuses it — the cookie IS the CSRF guard. An
  // added `origin !== new URL(req.url).origin` comparison can disagree with the browser behind a proxy
  // that normalizes protocol/host, and because `sendBeacon` discards the response, that failure mode is
  // INVISIBLE: every release would 403 and nobody would ever learn. A guard nobody can watch fail is
  // worse than no guard (see the red-first rule in CLAUDE.md).
  let cartId: string;
  let attempt: string | undefined;
  try {
    // sendBeacon can't set headers, so the body arrives as whatever Blob type we gave it; parse the
    // text rather than trusting a Content-Type we didn't get to negotiate.
    ({ cartId, attempt } = releaseAttemptInput.parse(JSON.parse(await req.text())));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const { uid } = await assertCartMember(cartId);
    // Per-device flood guard (P3.4), consistent with `releasePayLock`. A rate-limited release just
    // no-ops — the TTL is the backstop, and this path must never throw at a page that's unloading.
    if (await withinMutationRate(uid)) {
      // M70 (Codex round 2, P1) — a successful create-intent mints no authorization, so a diner who
      // leaves the pay step abandons a pinned grant with nothing behind it and the next checkout's
      // pin is a no-op. The grant must go with the lock.
      // M124 — ONE era-scoped statement, replacing `mms_release_promo_grant_for_holder` + a bare
      // `releaseCartLock`. Both matched on `locked_by = uid` alone, and `acquireCartLock` lets the
      // SAME diner re-acquire with a fresh era — so this beacon, fired late by an abandoned tab,
      // used to clear the LIVE tab's pin and unfreeze its cart mid-checkout. Naming the attempt is
      // what separates them; `normalizeEra` re-emits it server-side so the value reaching the
      // filter is ours, and an absent or unparseable token releases NOTHING (fail-closed).
      const { error: relErr } = await releasePayAttempt(cartId, uid, normalizeEra(attempt));
      // Logged, never thrown: this page is unloading and `sendBeacon` discards the response.
      if (relErr)
        console.error("[cart] pay attempt not released", { cartId, error: relErr.message });
    }
  } catch (e) {
    // Every authorization outcome answers 204. There is nothing for the caller to do with a refusal —
    // `sendBeacon` discards the response and the page is gone — and a distinct 403 would turn this into
    // an oracle telling any authenticated diner whether a given cart UUID exists and is closed. A cart
    // that already closed genuinely has no lock left to release, which is the success case anyway.
    if (e instanceof AuthzError) return new NextResponse(null, { status: 204 });
    console.error("[cart] release-lock failed", e);
    return NextResponse.json({ error: "Release failed" }, { status: 500 });
  }
  // 204: nothing to read. The page issuing this is already gone.
  return new NextResponse(null, { status: 204 });
}
