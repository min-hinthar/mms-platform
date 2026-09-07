import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff";
import { getExpoQueue } from "@/lib/expo";
import { ExpoBoard } from "@/components/staff/ExpoBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { staffHasPin } from "@/lib/staff-pin";

export const metadata = { title: "Expo — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The expo / bagging station (S4.3a) — the takeaway counterpart to the KDS. Same verified-staff gate as
 * the floor + kitchen (requireStaffPage). The takeaway queue is the server-rendered initial
 * snapshot, kept live client-side (ExpoBoard) on the proven postgres_changes read path. The poll gate
 * discriminant can only trip here on a lock/session race — send it to the honest surface.
 */
export default async function ExpoPage() {
  const caller = await requireStaffPage();
  // W10b: outage keeps the URL — one tap of retry re-enters the expo the moment we're back.
  if (!caller) return <StaffOutageShell what="what.expo" />;
  const hasPin = await staffHasPin(caller.staffId);
  const res = await getExpoQueue();
  if (!res.ok) {
    if (res.reason === "outage") return <StaffOutageShell what="what.expo" />;
    redirect(res.reason === "locked" ? "/staff/lock" : "/staff/login");
  }

  return (
    <main className="staff-main">
      {/* The board owns the staff bar (its h1 is the board's focus + label target). */}
      <ExpoBoard initial={res.queue} hasPin={hasPin} role={caller.role} />
    </main>
  );
}
