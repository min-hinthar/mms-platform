import { redirect } from "next/navigation";
import { getStaffAuth } from "@/lib/staff";
import { safeNext } from "@/lib/safe-next";
import { StaffLogin } from "@/components/staff/StaffLogin";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Staff sign-in — Mandalay Morning Star" };

// The login surface establishes its OWN session (magic-link / OTP), so it must not be statically
// prerendered with a baked nonce — the root layout already forces dynamic; keep parity here.
export const dynamic = "force-dynamic";

export default async function StaffLoginPage({
  searchParams,
}: {
  // `next` is typed as it ACTUALLY arrives, not as it is usually written: Next hands a REPEATED
  // query parameter (`?next=/board&next=/kiosk`) through as a `string[]`. The narrow `string` type
  // was a claim about the URL that a caller controls, and `safeNext` now rejects the array itself —
  // this signature just stops the lie (Codex round 2, P2).
  searchParams: Promise<{ denied?: string; next?: string | string[] }>;
}) {
  const auth = await getStaffAuth();
  const params = await searchParams;
  // VALIDATED here, once, before it can reach a redirect or the magic link (`?next=` arrives from a
  // URL and later rides into a mailbox — `safeNext` rejects off-origin and non-sign-in destinations).
  const next = safeNext(params.next);
  // Already a staff member? Skip the form — and land on the surface this sign-in was for, so a
  // bookmarked `/staff/login?next=/kiosk` on the lobby iPad is idempotent. Signed in but NOT staff
  // (or sent here with ?denied)? Show the form WITH a clear reason + a way out (sign out), so a
  // wrong account can recover, not loop.
  if (auth.kind === "staff") redirect(next);
  const denied = auth.kind === "not_staff" || params.denied === "1";
  // P2 — the language control belongs HERE above all other staff surfaces: this is the first screen
  // the kitchen tablet shows, before anyone is signed in. It is also why `setStaffLang` is ungated —
  // a `staffGate` on the writer would make this control inert on exactly this page. The form's own
  // copy stays English this slice (OPEN-ITEMS P2c); the control does not have to wait for it.
  const lang = await readStaffLang();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px 0" }}>
        <StaffLangSwitch lang={lang} />
      </div>
      <StaffLogin denied={denied} next={next} />
    </>
  );
}
