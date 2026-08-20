import type { Metadata } from "next";
import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { OrderTracker } from "@/components/OrderTracker";
import { ReceiptCard } from "@/components/ReceiptCard";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import { getSplitOrderId } from "@/lib/order";
import { getReceiptEntry } from "@/lib/receipt-entry";
import { resolveReceiptOrder } from "@/lib/receipt-token";
import { reorderLink } from "@/lib/order-history-view";
import { menuHref, menuLinkText } from "@/lib/menu-href";
import { PaperAmbient } from "@/components/PaperAmbient";
import { awaitingManualCapture } from "@/lib/manual-capture-mode";

// /track — post-payment, live. Stripe appends `payment_intent` + `redirect_status` to the Payment
// Element return_url; for succeeded/processing we mount the Realtime <OrderTracker> (the order shows
// the moment the signature-verified webhook fulfills, no manual refresh). The kitchen lifecycle +
// ETA arrive with S2's KDS / M2.2 — the same subscription carries them.
const wrap = { padding: 24, maxWidth: 440, margin: "0 auto" } as const;

type SearchParams = Promise<{
  redirect_status?: string;
  cart?: string;
  payment_intent?: string;
  paid?: string; // set by the split-tender SettlementBoard redirect (no Stripe redirect params)
  /**
   * W22f — "I am a RESUME, not a fresh payment."
   *
   * `HomeResumeCard` links here with Stripe's own `payment_intent` + `redirect_status=succeeded`
   * shape, because that is what resolves the tracker — but the tap is someone checking on an order
   * they placed hours ago. Without this marker the page could not tell the two apart, so every
   * resume replayed the full arrival celebration: confetti, the celebrate haptic, "Payment
   * confirmed", and (once W22f wired it) the pay chime. The card is a link, not a document load, so
   * the resume was in fact the ONE path where that chime was reliably audible — a bell announcing a
   * payment that had happened long before, on a tap that moved no money at all.
   */
  resume?: string;
  /** W7a — the durable receipt bearer (`?r=<token>`): the session-less artifact view. */
  r?: string;
}>;

// Per-state tab title — after the Stripe redirect the tab would otherwise keep the Element's title.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { redirect_status: status, r } = await searchParams;
  // noindex (review MED): a durable, session-less page holding a diner's itemized order must
  // never become a search destination (the /board + /kiosk rule, and this page is more sensitive).
  if (r) return { title: "Your receipt", robots: { index: false } };
  const title =
    status === "succeeded"
      ? "Order confirmed"
      : status === "processing"
        ? "Confirming payment"
        : status
          ? "Payment unsuccessful"
          : "Track your order";
  return { title };
}

export default async function Track({ searchParams }: { searchParams: SearchParams }) {
  const {
    redirect_status: status,
    cart,
    payment_intent: paymentIntent,
    paid,
    resume,
    r,
  } = await searchParams;

  // W7a — the durable receipt (`?r=<token>`): the SESSION-LESS artifact view. The token is the
  // entire authorization (opaque, ≥256-bit, 90-day TTL — lib/receipt-token); no session is read
  // or minted, no live layer mounts. This is the copy that outlives the 4h anon TTL, a cleared
  // table, and the device itself — the receipt a diner emailed themselves or printed.
  if (r) {
    const orderId = await resolveReceiptOrder(r);
    const entry = orderId ? await getReceiptEntry(orderId) : null;
    if (!entry)
      return (
        <main style={wrap}>
          <PaperAmbient />
          <div className="card card-textured track-notice">
            <div className="track-notice-medallion" aria-hidden>
              🧾
            </div>
            {/* Honest-neutral (review MED): we can't tell an expired link from an unknown one, so
                the copy diagnoses neither — and never promises the account holds an order it may
                not (a refunded order isn't in the /account history today). */}
            <h1>We couldn’t open this receipt</h1>
            <p>
              The link may have expired — receipt links last 90 days from when they’re shared. If
              you signed in when you ordered, your orders live in your account.
            </p>
            <Link href="/account" className="nav-link-strong">
              My orders{" "}
              <span aria-hidden className="nav-arrow nav-arrow-fwd">
                →
              </span>
            </Link>
          </div>
        </main>
      );
    const again = reorderLink(entry);
    return (
      <main style={{ ...wrap, maxWidth: 480 }}>
        {/* W22a — screen-only ambient (print-hidden in CSS); the receipt keeps its clean paper. */}
        <PaperAmbient />
        <ReceiptCard entry={entry} />
        <div className="print-hide" style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <PrintReceiptButton />
          <Link href={again.href} className="nav-link">
            {again.kind === "market" ? "Shop the market again" : "Order this again"}{" "}
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </Link>
          <Link href="/account" className="nav-link">
            All your orders{" "}
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </Link>
        </div>
      </main>
    );
  }

  // Split-tender completion (M3·P3.3b): the SettlementBoard sends the whole table here with
  // `?cart=…&paid=1` once every share is captured. There's no Stripe `redirect_status`/`payment_intent`
  // (each payer has their own PI), so resolve the member-gated split order and render the SAME live
  // tracker single-pay gets. Until the order row is stamped (a brief post-capture race) show an honest
  // "payment received — finalizing" with a refresh, never the "no order yet" stub. The `paid` marker
  // distinguishes this from a stray direct visit to `/track?cart=…`.
  if (paid && cart) {
    const orderId = await getSplitOrderId(cart).catch(() => null);
    if (orderId)
      return <OrderTracker paymentIntent={null} orderId={orderId} processing={false} justPaid />;
    return (
      <main style={wrap}>
        <PaperAmbient />
        <div className="card card-textured track-notice">
          <div className="track-notice-medallion" aria-hidden>
            🫖
          </div>
          <h1>Payment received</h1>
          <p>Your share is in — we’re finalizing the table’s order. Check back in a moment.</p>
          {/* `replace`, not push (J1): a self-refresh to the SAME URL would stack a duplicate history entry —
              the view-transition library's popstate handler then freezes ~4s on the next browser-back
              (same-pathname pop → its route effect never re-fires → the transition promise hangs). */}
          <Link
            href={`/track?cart=${encodeURIComponent(cart)}&paid=1`}
            replace
            className="nav-link-strong"
          >
            Refresh
          </Link>
        </div>
      </main>
    );
  }

  if (status === "succeeded" || status === "processing") {
    // W23d — is this a MANUAL-CAPTURE pickup order? Under W23c the Payment Element still redirects
    // with `redirect_status=succeeded` when the PI has only reached `requires_capture`, so on this
    // path "succeeded" means AUTHORIZED, not charged — and the tracker must not celebrate money
    // that has not moved, nor rule out a hold that gets cancelled instead of captured.
    //
    // One read, and only when `PICKUP_MANUAL_CAPTURE` is on: with the flag off this is a synchronous
    // `false` and /track costs exactly what it costs today. It fails toward FALSE on any read
    // failure, so an automatic-capture diner can never lose "Paid — thank you!" to a blip.
    const awaitingCapture = await awaitingManualCapture(cart ?? null);
    // The PaymentIntent id keys the live subscription. Stripe always appends it; if it's somehow
    // absent, fall back to a static confirmation rather than a tracker that can never resolve.
    if (paymentIntent)
      return (
        <OrderTracker
          paymentIntent={paymentIntent}
          processing={status === "processing"}
          // A resume is not an arrival — see `resume` in SearchParams.
          justPaid={status === "succeeded" && resume !== "1"}
          awaitingCapture={awaitingCapture}
        />
      );
    return (
      <main style={wrap}>
        <PaperAmbient />
        <div className="card card-textured track-notice">
          <div className="track-notice-medallion" aria-hidden>
            {status === "processing" ? "⏳" : "🧾"}
          </div>
          <h1>{status === "processing" ? "Payment processing" : "Payment received"}</h1>
          <p>
            {status === "processing"
              ? "We’re still confirming your payment — check back shortly for your order."
              : "Your order’s in — the kitchen has it. Check back anytime for updates."}
          </p>
          {/* W9a — no order landed here (no PI on the redirect), so the mode is genuinely unknown:
              route to the DOOR PICKER rather than a bare `/menu`, which defaults to scan-&-go and
              would convert a dine-in or pickup diner into a grocery shopper. */}
          <Link href={menuHref(null)} className="nav-link">
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            {menuLinkText(null)}
          </Link>
        </div>
      </main>
    );
  }

  if (status)
    return (
      <main style={wrap}>
        <PaperAmbient />
        <div className="card card-textured track-notice">
          <div className="track-notice-medallion track-notice-medallion-warn" aria-hidden>
            ↺
          </div>
          <h1>Payment didn’t go through</h1>
          <p>No charge was made — you can try again from your order.</p>
          <Link
            href={cart ? `/cart?cart=${encodeURIComponent(cart)}` : menuHref(null)}
            className="nav-link-strong"
          >
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            Back to your order
          </Link>
        </div>
      </main>
    );

  // Direct visit (no payment redirect) — stub until an order exists.
  return (
    <main style={wrap}>
      <PaperAmbient />
      <div className="card card-textured track-notice">
        <div className="track-notice-medallion" aria-hidden>
          🍵
        </div>
        <h1>Track your order</h1>
        <p>Your order timeline and ETA will appear here once you’ve placed an order.</p>
        {/* W9a — a direct visit with no order: the door picker is the honest destination (and the
            only one that can send a grocery shopper to the market instead of the dish menu). */}
        <Link href={menuHref(null)} className="nav-link-strong">
          {menuLinkText(null, "browse")}{" "}
          <span aria-hidden className="nav-arrow nav-arrow-fwd">
            →
          </span>
        </Link>
      </div>
    </main>
  );
}
