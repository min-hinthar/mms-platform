import { KioskShell } from "@/components/kiosk/KioskShell";

export const metadata = {
  title: "Order — Mandalay Morning Star",
  robots: { index: false }, // a device bookmark, never a search destination (the /board pattern)
};
export const dynamic = "force-dynamic";

/**
 * The self-serve kiosk (W6b — S5, M6·P6.1). Bookmarked on the lobby device as `/kiosk?k=<token>`.
 * The page is UNGATED — the kiosk server actions verify the token (the /board "API is the gate"
 * pattern), so a tokenless visit renders a shell whose first order attempt lands on the honest
 * not-configured state rather than leaking anything.
 */
export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  const { k } = await searchParams;
  return <KioskShell token={k ?? ""} />;
}
