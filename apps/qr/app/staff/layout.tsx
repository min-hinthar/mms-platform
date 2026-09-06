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
 * switch is mounted per surface instead, and `check-staff-lang.mjs` rule 4 is what makes that safe:
 * every staff page must reach a live `<StaffLangSwitch>`, in its own JSX or in a component it
 * transitively imports.
 *
 * ⚠️ THE RATCHET THAT STOOD IN THIS PARAGRAPH IS GONE, BECAUSE IT IS DRAINED. It read "it holds the
 * two converted surfaces … and NAMES the 13 that are still un-converted — 13 currently do, and PR B
 * (OPEN-ITEMS P2c) takes them" until PR B took them: `SWITCH_TODO` is now empty and the guard
 * reports 15/15. Left as written it would tell the next reader that thirteen staff screens still
 * have no language control — a stale claim in code, which is the shape this repo keeps paying for.
 *
 * `force-dynamic` because it reads a cookie; every page beneath it already is.
 */
export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const lang = await readStaffLang();
  return <StaffLangProvider lang={lang}>{children}</StaffLangProvider>;
}
