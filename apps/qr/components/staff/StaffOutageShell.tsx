import type { CSSProperties } from "react";
import { OutageRefresh } from "@/components/OutageRefresh";
import { Chrome } from "@/components/staff/Chrome";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { readStaffLang } from "@/lib/staff-lang-server";

/** The `what.*` family — the nouns the two shell sentences interpolate. */
type WhatKey = Extract<StaffKey, `what.${string}`>;

/**
 * W10b — the staff entry-page outage shell. Rendered IN PLACE (the URL is kept) when
 * requireStaffPage returns null: the auth answer was UNKNOWABLE, so redirecting to login — the old
 * behavior — was a verdict the server never gave, and it cost the person their place mid-service.
 * Retry is a route refresh (OutageRefresh), so recovery is one tap and lands exactly where they
 * were. Explicit that the SIGN-IN is fine: the worst misread of an outage screen is "I've been
 * logged out".
 *
 * P2 · OPEN-ITEMS P2h — it now speaks the device language, and it MOUNTS THE LANGUAGE CONTROL.
 *
 * Both halves of that matter and the second is the point. This shell is a full-page takeover: it
 * REPLACES the page, so whatever control that page had is gone with it, on the fourteen pages that
 * render it, during the outage it exists to explain. It has the strongest claim on the switch of any
 * surface in the console — `setStaffLang` is deliberately UNGATED (see its docblock) precisely so it
 * still works when `getStaffAuth()` answers `unavailable`, and here nothing else on the screen does.
 *
 * `what` is a dictionary KEY, not a sentence. It was a free English string threaded from twenty-one
 * call sites; every one of them named a noun the `what.*` family already carries, and a key is the
 * only form the Burmese sentence can interpolate.
 *
 * The copy goes through `<Chrome>` rather than as plain strings, which is why `OutageState`'s three
 * copy props widened to `ReactNode`: a Burmese heading passed as a bare string would land in a `<p>`
 * with no `lang`, i.e. in the Latin face, tracked, at Latin leading, and announced as English — the
 * exact defect `check-staff-lang.mjs` rule 5 exists for. `titleMy` stays null: that prop is the
 * pre-P2 "English title + Padauk companion" shape, and `<Chrome>` already emits the pair, MY first.
 */
export async function StaffOutageShell({ what = "what.console" }: { what?: WhatKey }) {
  const lang = await readStaffLang();
  return (
    <main style={wrap}>
      <div style={switchRow}>
        <StaffLangSwitch lang={lang} />
      </div>
      <OutageRefresh
        focusOnMount
        headingLevel="h1"
        titleMy={null}
        title={<Chrome lang={lang} k="out.shell.title" echo="stack" />}
        body={
          <Chrome lang={lang} k="out.shell.body" vars={{ what: ts(lang, what) }} echo="stack" />
        }
        escalatedBody={<Chrome lang={lang} k="out.shell.escalated" echo="stack" />}
      />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "var(--s8) var(--s6)",
};
// Above the card, trailing edge: the control is the one thing on this screen that still works, and
// it must not sit between the focused heading and the retry the person came here to tap.
const switchRow: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: "var(--s4)",
};
