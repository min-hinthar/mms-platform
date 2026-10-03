"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { browserClient } from "@mms/db";
import { Icon, type IconName } from "@mms/ui";
import { TransitionLink as Link } from "./TransitionNav";
import { useActiveOrder } from "../ActiveOrderProvider";
import { getRewardsBadge } from "@/lib/rewards";
import { dinerTabs, dinerTabsHidden, type DinerTabKey } from "@/lib/diner-tabs";

/**
 * Phase 3a (D1) — the diner spine: v7.2's persistent bottom tab bar, on every diner route.
 * Decisions live in `lib/diner-tabs.ts` (pure, pinned); this draws them.
 *
 * It is mounted ONCE in the root layout, like the header, and carries its own
 * `view-transition-name` so it never re-animates on a route change — the page moves under it. It
 * self-hides where the chrome is not the diner's (staff · the wall TV · the kiosk · the kit).
 *
 * The Star count is the rewards badge the header carried until 3a: fetched on mount, on a route
 * change (the webhook may stamp a Star after the diner leaves /track) and on an auth change (the
 * anon→account upgrade flips it without a full reload). A transient failure leaves the plain label.
 *
 * Labels are English (D2): four 12px labels at a 44px target cannot carry a stacked Burmese pair;
 * every surface under a tab stays bilingual. `aria-current="page"` is the lit tab's one claim; the
 * count badge is decorative to the ear (the link's accessible name carries it).
 */
const ICON: Record<DinerTabKey, IconName> = {
  menu: "grid",
  order: "receipt",
  track: "pin",
  account: "star",
};

export function DinerTabs() {
  const pathname = usePathname();
  const hidden = dinerTabsHidden(pathname);
  const { cartId, cartCount, mode, order } = useActiveOrder();
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    if (hidden) return;
    let active = true;
    const refresh = () => {
      getRewardsBadge()
        .then((b) => {
          if (active) setStars(b ? b.stars : null);
        })
        .catch(() => {});
    };
    refresh();
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED")
        refresh();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // `pathname` is a deliberate re-fetch poke (a route change may follow a stamped Star).
  }, [hidden, pathname]);

  if (hidden) return null;
  const tabs = dinerTabs({
    pathname,
    mode,
    cartId,
    cartCount,
    order: order ? { paymentIntent: order.paymentIntent, cartId: order.cartId } : null,
    stars,
  });

  return (
    <nav className="diner-tabs" aria-label="Primary">
      {tabs.map((t) => {
        const spoken =
          t.badge === "dot"
            ? `${t.label} — an order in progress`
            : typeof t.badge === "number"
              ? t.key === "account"
                ? `${t.label} — ${t.badge} ${t.badge === 1 ? "Star" : "Stars"}`
                : `${t.label} — ${t.badge} ${t.badge === 1 ? "item" : "items"}`
              : t.label;
        return (
          <Link
            key={t.key}
            href={t.href}
            className="diner-tab"
            aria-current={t.current ? "page" : undefined}
            aria-label={spoken}
            // In the market the first tab wears the bag, not the grid.
            data-tab={t.key}
          >
            <span className="diner-tab-icon" aria-hidden>
              <Icon name={t.key === "menu" && mode === "scango" ? "bag" : ICON[t.key]} size={22} />
              {t.badge === "dot" && <span className="diner-tab-dot" />}
              {typeof t.badge === "number" && (
                <span className="diner-tab-count">{t.badge > 99 ? "99+" : t.badge}</span>
              )}
            </span>
            <span className="diner-tab-label" aria-hidden>
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
