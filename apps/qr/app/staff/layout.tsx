import type { ReactNode } from "react";
import { StaffLangProvider } from "@/components/staff/StaffLangProvider";
import { readStaffLangMode } from "@/lib/staff-lang-server";
import { echoesShown, scriptOf } from "@/lib/staff-lang";

/**
 * P2 — the first `/staff` layout. It does exactly two things: read the device language once, and
 * provide it.
 *
 * P2e — what it reads is the device's MODE (Burmese only · Both · English); what it provides is the
 * SCRIPT every staff component has always taken, plus whether the chrome draws English echoes
 * (`echoes`, false only for Burmese only). Both is the default and renders what "my" rendered.
 *
 * It renders NO chrome of its own — no header, no nav, no auth, no language control. Thirteen of
 * the fifteen staff pages compose their own `<main>` and their own back-link
 * (`find app/staff -name page.tsx | xargs grep -l '<main' | wc -l`), and several are measured surfaces (the
 * KDS is `min-height: 100dvh` and P4 counts how many tickets fit on the real 15.6" tablet). A layout
 * that added even a 52px strip would silently subtract it from exactly the thing being measured.
 * The control lives in four places instead (P2e, owner decision 2): the front doors' pill (the
 * sign-in form, the lock, the outage shell, the error screen — each through its bar's `trailing`
 * slot), the Help sheet's Language row on the kitchen and the counter, the Profile's language card,
 * and a Language tile last in the doors' More. `check-staff-lang.mjs` rule 4 is what makes that
 * safe: no bar mounts one (4a), the four doors each do (4b), a page reaches at most one hosting
 * module (4c), and a page that reaches none has a wordless way up on every bar (4d) — the Screens
 * circle or a Back pill, each resolved to the page it opens (the `href` and any split-width
 * `paneHref`, evaluated, never matched), which must itself reach a control or lead up the same way
 * to one that does, with no circle. "Reach a control" is 4c's module walk — a presence check over
 * the JSX a page's modules return, not a runtime proof — so the `/staff` doors view, whose control
 * is the More tile rather than Help, is held by `StaffDoors.test` / `staff-more.test` instead.
 *
 * (The drained `SWITCH_TODO` ratchet that once named the pages with no control is deleted with P2e's
 * rule-4 rewrite: a page with no control is now a DESIGN — 4d proves its way up — not a TODO.)
 *
 * `force-dynamic` because it reads a cookie; every page beneath it already is.
 */
export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const mode = await readStaffLangMode();
  return (
    <StaffLangProvider lang={scriptOf(mode)} echoes={echoesShown(mode)}>
      {children}
    </StaffLangProvider>
  );
}
