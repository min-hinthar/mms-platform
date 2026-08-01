import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff";
import { getKitchenQueue } from "@/lib/kitchen";
import { KdsBoard } from "@/components/staff/KdsBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Kitchen — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The KDS — kitchen display (S2.1b, rebuilt by W3 to SPEC-KDS). Same verified-staff gate as the floor
 * (requireStaffPage). FULL-BLEED: no page chrome, no width cap — the board owns the whole display
 * (K1; a 15.6" screen at the pass has no room for a website around the tickets) and forces the Night
 * theme itself (glare + burn-in). The fire queue is the server-rendered initial snapshot, kept live
 * client-side (KdsBoard: postgres_changes + 5s poll). The poll gate discriminant can only trip here
 * on a lock/session race between requireStaffPage and the read — send it to the honest surface.
 */
export default async function KitchenPage() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL — the outage shell's retry re-enters right here, so the
  // kitchen tablet is one tap from its board the moment the platform returns.
  if (!caller) return <StaffOutageShell what="the kitchen board" />;
  const res = await getKitchenQueue();
  if (!res.ok) {
    if (res.reason === "outage") return <StaffOutageShell what="the kitchen board" />;
    redirect(res.reason === "locked" ? "/staff/lock" : "/staff/login");
  }

  return (
    <main>
      <KdsBoard initial={res.queue} />
    </main>
  );
}
