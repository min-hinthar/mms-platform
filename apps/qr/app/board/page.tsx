import { ReadyBoard } from "@/components/ReadyBoard";

export const metadata = {
  title: "Order ready board — Mandalay Morning Star",
  robots: { index: false, follow: false }, // a device URL, never a search destination
};
export const dynamic = "force-dynamic";

/**
 * W3e: the order-ready board — /board on any smart-TV browser. Preparing | Ready, first name + short
 * code, gold flash on the ready transition. The device token in the URL (?k=…) authorizes the SANITIZED
 * /api/board poll; the page itself renders nothing sensitive (a missing/wrong token just shows the
 * board's honest "not linked" state — the API is the gate, not this shell). Takeout + grocery only;
 * dine-in status stays on the diner's phone.
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  const { k } = await searchParams;
  return (
    <main>
      <ReadyBoard token={k ?? ""} />
    </main>
  );
}
