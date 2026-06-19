import Link from "next/link";
import { getCartView } from "@/lib/cart";
import { Checkout } from "@/components/Checkout";

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
        <h1 style={{ fontSize: 28 }}>Your order</h1>
        <p style={{ color: "var(--t2)" }}>
          This order isn’t available on this device. Start from the menu.
        </p>
        <Link href="/menu" style={{ color: "var(--ac)", fontWeight: 700 }}>
          ← Back to menu
        </Link>
      </main>
    );

  return <Checkout cartId={cart} initialItems={view.items} initialTotals={view.totals} />;
}
