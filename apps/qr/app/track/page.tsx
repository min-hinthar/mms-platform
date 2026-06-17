// STUB — live order tracker. M1: subscribe to order status (Supabase Realtime) and render
// the placed → kitchen → ready → served timeline. Dine-in: refill bell. Pickup: "I'm here".
export default function Track() {
  return (
    <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
      <h1>Track</h1>
      <p style={{ color: "var(--t2)" }}>
        Order timeline + ETA. Wire to the orders table via Realtime in M1.
      </p>
    </main>
  );
}
