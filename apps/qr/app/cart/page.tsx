import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { getCartView } from "@/lib/cart";
import { getPrepMinutes, getPickupAsapOk } from "@/lib/pickup";
import { getSplitContext, type SplitContext } from "@/lib/split";
import { Checkout } from "@/components/Checkout";
import { menuHref, menuLinkText } from "@/lib/menu-href";

// Cart + checkout. The cartId comes from the URL (the cart bar links here with the server-issued
// id); `getCartView` authorizes the viewer against the cart (member-gated — a non-member can't read
// another table's order) and returns the SERVER-AUTHORITATIVE lines + totals for the initial render.
export default async function Cart({ searchParams }: { searchParams: Promise<{ cart?: string }> }) {
  const { cart } = await searchParams;
  let view: Awaited<ReturnType<typeof getCartView>> | null = null;
  if (cart) {
    try {
      view = await getCartView(cart);
    } catch {
      view = null; // not a member / no session / unknown cart → placeholder below
    }
  }

  if (!cart || !view)
    return (
      <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: "var(--fs-h1)" }}>Your order</h1>
        <p style={{ color: "var(--t2)" }}>
          This order isn’t available on this device. Start from the menu.
        </p>
        {/* W9a — the exit used to be a bare `/menu`, which defaults to scan-&-go: a diner who
            back-navigated here from /track was dropped into a grocery session. With no readable cart
            there is no mode to carry, so route to the door picker. Promoted from an inline-styled
            ~20px link to the shared `nav-link-strong` primitive (≥44px, QA §A). */}
        <Link href={menuHref(null)} className="nav-link-strong">
          <span aria-hidden className="nav-arrow nav-arrow-back">
            ←
          </span>{" "}
          {menuLinkText(null)}
        </Link>
      </main>
    );

  // Group context for the dine-in split (members + the viewer's role/seat). Best-effort — a solo
  // cart or a transient failure just renders the plain checkout (Checkout no-ops when not a group).
  let split: SplitContext | null = null;
  try {
    split = await getSplitContext(cart);
  } catch {
    split = null;
  }

  // S4.2: the configured prep estimate for the to-go "ready in ~X min" copy (honest config value, not a
  // live countdown). Best-effort with a sane fallback so the cart always renders.
  const prepMinutes = await getPrepMinutes().catch(() => 12);

  // W5e: can the kitchen take an ASAP pickup right now (open + capacity)? Gates the checkout ASAP pill so
  // it never offers what the pay boundary would reject. Only read for pickup carts; fail-closed elsewhere.
  // Pass the cart so its own slot hold is excluded from the capacity check.
  const asapAvailable =
    split?.mode === "pickup" ? await getPickupAsapOk(cart).catch(() => false) : false;

  // W5e: seed the checkout ASAP↔scheduled control. A cart with a slot but NULL fire_at is an ASAP SNAP
  // placeholder (mms_pickup_asap sets pickup_slot for capacity + fire_at=null to fire now), NOT an
  // intentional schedule (mms_set_pickup_slot always writes fire_at = slot - prep). Treat that as ASAP so
  // a reload/retry shows "⚡ ASAP", not the snapped slot mislabeled "Scheduled".
  const initialPickupSlot = view.pickupSlot != null && view.fireAt == null ? null : view.pickupSlot;

  // A settling cart with NO split context is unwinnable in the plain flow: the cart is frozen
  // table-wide, so "Continue to payment" 409s ("pay your share on the split screen") but the board
  // can't render without the context. Rather than strand the payer in that loop on a transient read
  // miss, surface an honest retry (reload re-runs getSplitContext server-side).
  if (view.settling && !split)
    return (
      <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: "var(--fs-h1)" }}>Your order</h1>
        <p style={{ color: "var(--t2)" }}>
          Your table is splitting the bill — we couldn’t load the split just now.
        </p>
        {/* `replace`, not push (J1): same-URL self-refresh must not stack a duplicate history entry —
            see the /track Refresh link for the back-press freeze this avoids. */}
        <Link
          href={`/cart?cart=${encodeURIComponent(cart)}`}
          replace
          style={{ color: "var(--ac)", fontWeight: 700 }}
        >
          Reload the split
        </Link>
      </main>
    );

  return (
    <Checkout
      cartId={cart}
      initialItems={view.items}
      initialTotals={view.totals}
      splitContext={split}
      initialSettling={view.settling}
      // W9b — the pay-window lock reaches the checkout at last. `getCartView` has returned both since
      // P3.2 and this was the last hop: without them a diner whose tablemate is checking out saw every
      // stepper snap silently back, with nothing on screen saying why.
      initialLocked={view.locked}
      initialLockedBy={view.lockedBy}
      initialTabType={view.tabType}
      canTab={split?.mode === "dinein"}
      prepMinutes={prepMinutes}
      initialPickupSlot={initialPickupSlot}
      asapAvailable={asapAvailable}
    />
  );
}
