"use client";
import { useEffect, useRef } from "react";
import { useCart } from "@/components/TableCartProvider";
import { DinerGuide, dinerGuideDeviceStore, markGuideSeenOnServer } from "@/components/DinerGuide";
import { useGuideFirstRun } from "@/lib/hooks/useGuideFirstRun";
import { guestListAtCap } from "@/lib/guest-list";
import {
  DINER_GUIDE_KEY,
  anyDialogOpen,
  dinerGuideAutoOpens,
  type DinerGuideFacts,
} from "@/lib/diner-guide";
import type { WelcomeBack } from "@/lib/rewards";

/** The menu's heading — where every exit from the first run lands (`MenuBrowser`'s `<h1
 *  tabIndex={-1} className="menu-title">`; the suite parses MenuBrowser to pin that it is still one). */
export const MENU_HEADING_SELECTOR = "h1.menu-title";

/**
 * PD11 — the guide's FIRST RUN, mounted by ArrivalBeat (one line, inside D1(a)'s scoped unfreeze;
 * MenuBrowser stays frozen). It opens the guide BY ITSELF at most once per phone, at the one moment
 * of decision: once the table session has answered — joined with its first view applied (so the
 * lock and the freeze it reads are the server's, never the defaults), or refused.
 *
 * The decision is `dinerGuideAutoOpens` (lib/diner-guide.ts, a mutant per clause) over what the
 * provider and the page say AT THAT MOMENT, and the shared first-run seam (`useGuideFirstRun`, PD12)
 * reads the mark, decides and — only when it opens — marks BEFORE it shows. A store that refuses
 * never opens it; a busy moment marks nothing, so the next quiet arrival may still open it. The
 * mark is also asked of the server (`/api/guide-seen`), whose cookie outlives Safari's seven-day
 * script storage, and the store reads it back.
 *
 * Every way out — Close, Esc, "Browse the menu" — lands on the menu's heading: the first run took
 * focus from nowhere a guest chose, so restoring "the opener" would restore <body>.
 */
export function DinerGuideFirstRun({
  mode,
  welcome,
}: {
  mode: string;
  welcome: WelcomeBack | null;
}) {
  const cart = useCart();
  // The arrival URL's reorder ("Order this again", from Account), read at MOUNT — MenuBrowser
  // strips it once the cart exists, and this child's effect runs before its parent's.
  const reorderAtArrival = useRef(false);
  useEffect(() => {
    reorderAtArrival.current = new URLSearchParams(window.location.search).has("reorder");
  }, []);
  // The provider's facts as of the latest commit, read by the claim's microtask (which runs after
  // every effect of the commit that armed it).
  const facts = useRef<Omit<DinerGuideFacts, "reorderLanding" | "dialogOpen">>({
    mode,
    joined: false,
    joinError: false,
    locked: false,
    settling: false,
    welcome,
  });
  useEffect(() => {
    facts.current = {
      mode,
      joined: cart.cartId !== null && cart.dbNow !== null,
      joinError: cart.error !== null,
      locked: cart.locked,
      settling: cart.settling,
      welcome,
    };
  });
  // The one moment of decision: the session has answered (joined and read, or refused).
  const answered = (cart.cartId !== null && cart.dbNow !== null) || cart.error !== null;
  const { shown, dismiss } = useGuideFirstRun(
    answered ? DINER_GUIDE_KEY : null,
    () =>
      dinerGuideAutoOpens({
        ...facts.current,
        reorderLanding: reorderAtArrival.current,
        dialogOpen: anyDialogOpen(document),
      }),
    dinerGuideDeviceStore,
  );
  useEffect(() => {
    if (shown) markGuideSeenOnServer();
  }, [shown]);
  return (
    <DinerGuide
      open={shown}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
      source="auto"
      tableNumber={cart.tableNumber}
      role={cart.role}
      atCap={guestListAtCap(cart.me, cart.members)}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        document.querySelector<HTMLElement>(MENU_HEADING_SELECTOR)?.focus({ preventScroll: true });
      }}
    />
  );
}
