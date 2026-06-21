import { NextRequest, NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { getPostHogClient } from "@/lib/posthog-server";

// Node runtime: Svix signature verification uses node:crypto (HMAC). Webhooks are signed, public
// endpoints — the middleware matcher already skips /api, so nothing else gates this route.
export const runtime = "nodejs";

/**
 * Resend webhook (email events: sent / delivered / bounced / complained / opened / clicked / …).
 * Resend signs callbacks with **Svix**: `base64(HMAC_SHA256(secret, "{id}.{timestamp}.{body}"))`,
 * where the secret is the base64 after the `whsec_` prefix, and the `svix-signature` header is a
 * space-separated list of `v{n},<sig>`. We verify the signature + a timestamp tolerance (replay
 * guard) BEFORE trusting anything, then act:
 *   • bounced / complained → flag in server logs (the actionable signal — a staff invite that didn't
 *     land) + a PII-free analytics event;
 *   • everything else → a PII-free analytics event (deliverability tracking).
 * Recipient addresses are PII: they never go to analytics, and server logs carry only a MASKED
 * address + the opaque `email_id` (look up the full address in the Resend dashboard if needed).
 * Idempotent + fail-safe: handling a duplicate is harmless, and a processing hiccup still returns 200
 * (we've verified the sender) so Resend doesn't retry a non-actionable error forever.
 */
const SIG_TOLERANCE_S = 300; // ±5 min, matching Svix's default replay window

function verifySvix(
  key: Buffer,
  id: string,
  timestamp: string,
  body: string,
  sigHeader: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  for (const part of sigHeader.split(" ")) {
    const sig = part.split(",")[1]; // "v1,<sig>" → "<sig>"
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    // timingSafeEqual throws on length mismatch — guard first.
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf))
      return true;
  }
  return false;
}

/** Mask a recipient for operational logs — keeps a hint without logging the full PII address. */
function maskEmail(e: unknown): string {
  if (typeof e !== "string" || !e.includes("@")) return "(redacted)";
  const [user, domain] = e.split("@");
  return `${(user ?? "").slice(0, 1)}***@${domain}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_SIGNING_SECRET;
  if (!secret) {
    // Config error, not a bad request → 500 so Resend redelivers once the secret is wired.
    console.error("[resend webhook] RESEND_SIGNING_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  // `whsec_<base64>` → raw key bytes (accept a bare base64 secret too). A secret that doesn't decode
  // to a key would make EVERY signature mismatch (silent 401 stream); surface it as a config 500 so a
  // misconfigured secret is diagnosable instead of invisibly dropping every event.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) {
    console.error(
      "[resend webhook] RESEND_SIGNING_SECRET did not decode (expected base64, optionally whsec_-prefixed)",
    );
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 500 });
  }

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature)
    return NextResponse.json({ error: "Missing svix signature headers" }, { status: 400 });

  // Replay guard: reject a stale timestamp before spending an HMAC on it.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SIG_TOLERANCE_S)
    return NextResponse.json({ error: "Timestamp outside tolerance" }, { status: 400 });

  const body = await req.text();
  if (!verifySvix(key, id, timestamp, body, signature))
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  // Verified — parse + act. Past this point we always 200 (a processing hiccup isn't worth a retry).
  try {
    const event = JSON.parse(body) as {
      type?: string;
      data?: { email_id?: string; id?: string; to?: unknown };
    };
    const type = event.type ?? "unknown";
    const emailId = event.data?.email_id ?? event.data?.id ?? null;
    const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;

    if (type === "email.bounced" || type === "email.complained") {
      // The actionable signal: a staff invite/notice that didn't land. Server log only (operational),
      // masked recipient + opaque id — never the raw address, never to analytics.
      console.warn(`[resend webhook] ${type}`, { email_id: emailId, to: maskEmail(to) });
    }

    getPostHogClient().capture({
      distinctId: emailId ?? "resend",
      event: type.replace("email.", "email_"), // e.g. email_delivered, email_bounced
      properties: { provider: "resend", email_id: emailId, type }, // PII-free (no recipient)
    });
  } catch (e) {
    console.error("[resend webhook] handling failed (verified event)", (e as Error).message);
  }

  // Drain analytics after the response (Next `after`) — never couple the 200 ack to a PostHog flush.
  after(async () => {
    try {
      await getPostHogClient().flush();
    } catch {
      /* analytics drain is best-effort */
    }
  });

  return NextResponse.json({ received: true });
}
