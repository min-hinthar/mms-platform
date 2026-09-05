import type { ReactNode } from "react";
import { StaffLangProvider } from "@/components/staff/StaffLangProvider";
import { readStaffLang } from "@/lib/staff-lang-server";

/**
 * P2 — the first `/staff` layout. It does exactly two things: read the device language once, and
 * provide it.
 *
 * It renders NO chrome of its own — no header, no nav, no auth, no language switch. Thirteen of the
 * fifteen staff pages compose their own `<main>` and their own back-link
 * (`find app/staff -name page.tsx | xargs grep -l '<main' | wc -l`), and several are measured surfaces (the
 * KDS is `min-height: 100dvh` and P4 counts how many tickets fit on the real 15.6" tablet). A layout
 * that added even a 52px strip would silently subtract it from exactly the thing being measured. The
 * switch is mounted per surface instead, and `check-staff-lang.mjs` rule 4 is the ratchet over that:
 * it holds the two converted surfaces (`/staff/login` and the KDS, which mounts it one hop down in
 * `KdsBoard`) and NAMES the 13 that are still un-converted, so the count can only go one way. It
 * does not yet prove that no staff page forgets it — 13 currently do, and PR B (OPEN-ITEMS P2c)
 * takes them.
 *
 * `force-dynamic` because it reads a cookie; every page beneath it already is.
 */
export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const lang = await readStaffLang();
  return <StaffLangProvider lang={lang}>{children}</StaffLangProvider>;
}
