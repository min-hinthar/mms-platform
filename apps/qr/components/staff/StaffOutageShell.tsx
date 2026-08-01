import type { CSSProperties } from "react";
import { OutageRefresh } from "@/components/OutageRefresh";

/**
 * W10b — the staff entry-page outage shell. Rendered IN PLACE (the URL is kept) when
 * requireStaffPage returns null: the auth answer was UNKNOWABLE, so redirecting to login — the old
 * behavior — was a verdict the server never gave, and it cost the person their place mid-service.
 * Retry is a route refresh (OutageRefresh), so recovery is one tap and lands exactly where they
 * were. Staff-voiced and English-only (`titleMy={null}` — the console's convention), and explicit
 * that the SIGN-IN is fine: the worst misread of an outage screen is "I've been logged out".
 */
export function StaffOutageShell({ what = "the console" }: { what?: string }) {
  return (
    <main style={wrap}>
      <OutageRefresh
        focusOnMount
        headingLevel="h1"
        titleMy={null}
        title="We can’t reach the ordering system"
        body={`Your sign-in is fine — the system is unreachable, so ${what} can’t load right now. Take new orders on paper; everything already recorded is safe.`}
        escalatedBody="Still down — keep running on paper. Nothing recorded is lost; this screen comes back the moment the system does."
      />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "var(--s8) var(--s6)",
};
