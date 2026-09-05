import type { ReactNode } from "react";
import { StaffLangProvider } from "@/components/staff/StaffLangProvider";
import { readStaffLang } from "@/lib/staff-lang-server";

/**
 * P2 — the first `/staff` layout. It does exactly two things: read the device language once, and
 * provide it.
 *
 * It renders NO chrome of its own — no header, no nav, no auth, no language switch. Eleven staff
 * pages compose their own `<main>` and their own back-link, and several are measured surfaces (the
 * KDS is `min-height: 100dvh` and P4 counts how many tickets fit on the real 15.6" tablet). A layout
 * that added even a 52px strip would silently subtract it from exactly the thing being measured. The
 * switch is mounted per surface instead, with an AST guard proving no staff page forgets it.
 *
 * `force-dynamic` because it reads a cookie; every page beneath it already is.
 */
export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const lang = await readStaffLang();
  return <StaffLangProvider lang={lang}>{children}</StaffLangProvider>;
}
