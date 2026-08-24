import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { secureTabInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { withinMutationRate } from "@/lib/rate";
import { getPostHogClient } from "@/lib/posthog-server";

// Secure-tab card-save (S3.2). Mints (or reuses) ONE ephemeral Stripe Customer per tab and a SetupIntent
// (usage 'off_session') so the diner can save a card now and settle the tab off-session at close. SAQ-A:
// no PAN touches the server — the card is collected in the Payment Element on the returned client_secret.
// Member-gated (the diner saves THEIR card from their phone); never charges (a SetupIntent only validates +
// stores). The webhook (setup_intent.succeeded) is what records the saved PaymentMethod + flips the tab to
// 'secure' — a route that returned "secured" eagerly would report a card the gateway hadn't accepted (T7).
export async function POST(req: NextRequest) {
  try {
    const { cartId } = secureTabInput.parse(await req.json());

    // Only a verified member of this cart's session may secure it (C3; IDOR by default otherwise). Also
    // enforces the cart is still open + the session active.
    const { sessionId, uid, mode } = await assertCartMember(cartId);

    // Per-seat flood guard (parity with create-intent) — bound Customer/SetupIntent minting. Fail-open.
    if (!(await withinMutationRate(uid)))
      return NextResponse.json(
        { error: "Too many attempts — wait a moment and try again." },
        { status: 429 },
      );

    // Tabs are a dine-in concept (pickup/grocery pay at checkout). Mirror mms_open_tab's guard.
    //
    // M116 — the mode comes off `assertCartMember` (M108), which read it from the SAME row that
    // proved the session active. This used to be a SECOND read of `table_sessions` whose `{ error }`
    // was discarded, and the discard is what made the sentence below a lie: on a failed read `sess`
    // was null, `sess?.mode` undefined, `undefined !== "dinein"` passed, and a diner sitting at a
    // real dine-in table was told their table is not one. The refusal was right and the DIAGNOSIS
    // was invented — the route stated a fact about their session it had never learned.
    //
    // Deleting the read is the fix, not handling its error: the window it opened was the gap between
    // authz's read and this one, so a blip landing in between turned a dine-in table into a pickup
    // one. There is no window left because there is no second read. An unreadable session now
    // surfaces as the 503 `assertCartMember` already raises for it (W10a — unknowable is never a
    // verdict), and this 400 is reached only when the mode was genuinely read and is genuinely not
    // dine-in. `route.test.ts` case 2 pins the old behaviour red.
    if (mode !== "dinein")
      return NextResponse.json({ error: "Tabs are for dine-in tables." }, { status: 400 });

    // One ephemeral Customer per tab (T10): reuse the recorded one, else mint + record it. The tokens
    // live in the service-role-only sidecar (mms_tab_secure), never on the realtime-fanned cart row.
    const db = serviceClient();
    const { data: existing } = await db
      .from("mms_tab_secure")
      .select("stripe_customer_id")
      .eq("cart_id", cartId)
      .maybeSingle();
    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await getStripe().customers.create({
        metadata: { cartId, sessionId },
        description: `MMS tab ${cartId}`,
      });
      customerId = customer.id;
      // ignoreDuplicates: if two saves raced, the first row wins and this one is a no-op — re-read it so
      // both requests converge on ONE Customer (the rare loser-created Customer is an empty orphan, harmless).
      await db
        .from("mms_tab_secure")
        .upsert(
          { cart_id: cartId, stripe_customer_id: customerId },
          { onConflict: "cart_id", ignoreDuplicates: true },
        );
      const { data: canonical } = await db
        .from("mms_tab_secure")
        .select("stripe_customer_id")
        .eq("cart_id", cartId)
        .maybeSingle();
      customerId = canonical?.stripe_customer_id ?? customerId;
    }

    const intent = await getStripe().setupIntents.create(
      {
        customer: customerId,
        usage: "off_session",
        automatic_payment_methods: { enabled: true },
        metadata: { cartId },
      },
      // Reuse one SetupIntent across re-opens of the secure sheet for this cart+customer.
      { idempotencyKey: `si_${cartId}_${customerId}` },
    );

    getPostHogClient().capture({
      distinctId: cartId,
      event: "tab_setup_intent_created",
      properties: { cart_id: cartId, session_id: sessionId },
    });

    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (e) {
    if (e instanceof AuthzError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as Error;
    if (err.name === "ZodError") return NextResponse.json({ error: err.message }, { status: 400 });
    // Never leak a raw SDK string (recon); the client shows a generic message, the real one is logged.
    console.error("[setup-intent] unexpected failure:", err);
    return NextResponse.json({ error: "Payment service error" }, { status: 500 });
  }
}
