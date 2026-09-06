import type { CSSProperties, ReactNode } from "react";
import { StaffLangSwitch } from "./StaffLangSwitch";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P2 — a full-viewport staff surface with the language control in its top-right, IN FLOW.
 *
 * ⚠️ THIS EXISTS BECAUSE THE OBVIOUS SHAPE OVERFLOWED THE SCREEN, TWICE. Both `/staff/login` (PR A)
 * and `/staff/lock` (PR B) stacked a `12px 16px 0` strip holding a 44px-min button ABOVE a component
 * whose own root is `min-height: 100dvh` — so the page was ~56px taller than the viewport, the
 * centred card slid down, and "Forgot PIN? Sign out" could fall below the fold on a narrow staff
 * device. Found by a pre-merge blind pass on the lock screen; the login screen had shipped with it.
 *
 * `app/staff/layout.tsx` argues for mounting the control per surface precisely so that a strip is
 * never "silently subtracted from exactly the thing being measured" — and then two surfaces
 * subtracted it anyway. So the arithmetic is stated ONCE, here: this shell owns the `100dvh`, the
 * strip is a `flex-shrink: 0` row inside it, and the content below gets whatever is left. The two
 * components' own roots become `flex: 1` rather than a second, competing `100dvh`.
 *
 * Deliberately NOT `position: absolute` on the strip: taking it out of flow fixes the height and
 * introduces an overlap instead — on a short viewport the centred card rises under the button.
 */
export function StaffLangShell({ lang, children }: { lang: StaffLang; children: ReactNode }) {
  return (
    <div style={shell}>
      <div style={strip}>
        <StaffLangSwitch lang={lang} />
      </div>
      {children}
    </div>
  );
}

const shell: CSSProperties = { minHeight: "100dvh", display: "flex", flexDirection: "column" };
const strip: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  padding: "12px 16px 0",
  flexShrink: 0,
};
