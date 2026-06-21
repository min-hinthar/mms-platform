import { redirect } from "next/navigation";
import { getStaffAuth } from "@/lib/staff";
import { StaffLogin } from "@/components/staff/StaffLogin";

export const metadata = { title: "Staff sign-in — Mandalay Morning Star" };

// The login surface establishes its OWN session (magic-link / OTP), so it must not be statically
// prerendered with a baked nonce — the root layout already forces dynamic; keep parity here.
export const dynamic = "force-dynamic";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const auth = await getStaffAuth();
  // Already a staff member? Skip the form. Signed in but NOT staff (or sent here with ?denied)? Show
  // the form WITH a clear reason + a way out (sign out), so a wrong account can recover, not loop.
  if (auth.kind === "staff") redirect("/staff");
  const denied = auth.kind === "not_staff" || (await searchParams).denied === "1";
  return <StaffLogin denied={denied} />;
}
