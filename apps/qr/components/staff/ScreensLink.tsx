import Link from "next/link";
import { Icon } from "@mms/ui";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * P7 — the way back to the DOORS from any staff screen. `?doors=1` is the explicit "show me the map":
 * `resolveStaffHome` honours it over a remembered door, so a kitchen tablet can always leave its
 * board. A 44px chip; `echo={false}` (the default) because two scripts cannot legibly stack in a chip.
 * The glyph is decorative — the visible word is the name.
 */
export function ScreensLink({ lang, kds = false }: { lang: StaffLang; kds?: boolean }) {
  return (
    <Link href="/staff?doors=1" className={kds ? "kds-chip kds-chip-link" : "staff-screens"}>
      <Icon name="grid" size={18} />
      <Chrome lang={lang} k="shell.screens" />
    </Link>
  );
}
