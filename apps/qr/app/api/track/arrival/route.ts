import { NextRequest, NextResponse } from "next/server";
import { stampArrival } from "@/lib/arrival";

/**
 * PD3 (m3 §E, §F, §G) — the pickup "I’m here" over a URL.
 *
 * Why a ROUTE beside the Server Action: a tap inside its 6-second take-back must still reach Dad
 * when the guest closes the tab inside the window. On a real document teardown the only request
 * that survives is `navigator.sendBeacon`, which needs a URL — a Server Action started in
 * `pagehide` dies with the page (the release-lock precedent, app/api/cart/release-lock). The same
 * URL serves the reconcile: a pending record in `localStorage` (lib/arrival-pending.ts) is posted
 * here on the order's next /track mount, and the write is idempotent on the order, so a beacon, a
 * reconcile and a second tab never record two arrivals.
 *
 * The answer is what the client clears the pending record on (§G2), so its status codes mean
 * exactly this: 200 carries a DECIDED answer (`ok` true, or false with its reason — success, "no
 * longer takes an arrival", a plain refusal: all clear the record); 400 is a malformed body (never
 * going to succeed: decided too); 429 and 5xx are NOT answers — the next visit retries. The beacon
 * discards its response either way, which is why the record exists.
 *
 * No Origin check, deliberately (the release-lock reasoning): the session cookie is `SameSite=Lax`,
 * so a cross-site POST carries no session, and `stampArrival` answers it the decided `unauthorized`
 * (a 200) before the flood guard or any order read — the cookie is the CSRF guard. Only an identity
 * service that is DOWN is `failed` (a 500, kept for a retry). And a refusal is a plain `ok:false`
 * here, not a distinct 401/403: the reason set is the same ONE "unauthorized" for no session,
 * unknown and not-yours, so the route is no more of an existence oracle than the action.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    // sendBeacon can't set headers, so the body arrives as whatever Blob type we gave it; parse the
    // text rather than trusting a Content-Type we didn't get to negotiate.
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 400 });
  }
  const orderId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { orderId?: unknown }).orderId === "string"
      ? (body as { orderId: string }).orderId
      : "";
  try {
    const r = await stampArrival({ orderId }, Date.now());
    if (!r.ok && r.reason === "rate") return NextResponse.json(r, { status: 429 });
    if (!r.ok && r.reason === "failed") return NextResponse.json(r, { status: 500 });
    return NextResponse.json(r, { status: 200 });
  } catch (e) {
    // A thrown read (auth transport down, the DB unreachable) is not an answer.
    console.error("[arrival] route failed", e);
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 500 });
  }
}
