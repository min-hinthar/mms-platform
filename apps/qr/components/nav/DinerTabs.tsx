"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { browserClient } from "@mms/db";
import { Icon, type IconName } from "@mms/ui";
import { TransitionLink as Link, useJourneyRouter } from "./TransitionNav";
import { useActiveOrder } from "../ActiveOrderProvider";
import { useActiveOrderStatus } from "../useActiveOrderStatus";
import { getRewardsBadge } from "@/lib/rewards";
import { dinerTabs, dinerTabsHidden, tabsMode, type DinerTabKey } from "@/lib/diner-tabs";

/**
 * Phase 3a (D1) → 3b (D7 · D8) — the diner spine: a persistent bottom tab bar of three PLACES
 * (Menu · Order · Account) on every diner route. Decisions live in `lib/diner-tabs.ts` (pure,
 * pinned); this draws them. The Order tab follows the order (open cart → live order → the bare
 * slip) and wears the receipt in every state; the threshold lights nothing.
 *
 * It is mounted ONCE in the root layout, like the header, and carries its own
 * `view-transition-name` so it never re-animates on a route change — the page moves under it. It
 * self-hides where the chrome is not the diner's (staff · the wall TV · the kiosk · the kit).
 *
 * The Star count is the rewards badge the header carried until 3a: fetched on mount and on a route
 * change (the webhook may stamp a Star after the diner leaves /track), and again on an auth change
 * (the anon→account upgrade flips it without a full reload) — two effects, as the header had them,
 * so a route change never re-subscribes the auth listener. A transient failure leaves the plain
 * label.
 *
 * The Order tab's dot is the wayfinding store's live order — and ONLY while it is live. The store
 * keeps an order until its owner on the route reads it terminal and retires it (`useActiveOrderStatus`
 * in the header, the home card, the tracker), and /account had no owner: the header's pill is off
 * there, so a finished order lingered in the store and this bar kept a dot and an "in progress"
 * name for it (blind pass on #312, critical 2). The bar therefore subscribes on /account alone —
 * still one realtime channel per route — and trusts the store's owner everywhere else.
 *
 * Labels are English (D2): four 12px labels at a 44px target cannot carry a stacked Burmese pair;
 * every surface under a tab stays bilingual. `aria-current="page"` is the lit tab's one claim; the
 * count badge is decorative to the ear (the link's accessible name carries it).
 */
const ICON: Record<DinerTabKey, IconName> = {
  menu: "grid",
  order: "receipt",
  account: "star",
};

export function DinerTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params?.toString() ?? "";
  // Where the diner IS, query included — a lit tab with nothing else to open links back here.
  const here = pathname ? `${pathname}${qs ? `?${qs}` : ""}` : null;
  const hidden = dinerTabsHidden(pathname);
  const { cartId, cartCount, mode, order, drain } = useActiveOrder();
  const journey = useJourneyRouter();
  // Codex round 3 on #312 (P1) — the Order tab is the one door to /cart beside CartBar, and it gets
  // CartBar's W21 rule: an add may still be in flight when the tab is tapped (the optimistic count
  // shows before the write lands), and /cart's first read or its create-intent lock could miss or
  // refuse it. The click is intercepted, the cart provider's lent `settled()` barrier awaited
  // (resolves at once where nothing is pending — the ordinary tap stays instant), then the journey
  // pushes. One navigation at a time while the drain runs; `aria-busy` narrates the rare beat.
  const [leaving, setLeaving] = useState(false);
  // /account is the one diner route with no other subscriber to the live order (the header's pill
  // is off there), so this bar reads the status itself there — and retires a finished order.
  const { isDone } = useActiveOrderStatus(!hidden && pathname === "/account");
  const live = order && !isDone ? order : null;
  const [stars, setStars] = useState<number | null>(null);

  // The count: on mount and on a route change (a Star may be stamped after the diner leaves /track).
  useEffect(() => {
    if (hidden) return;
    let active = true;
    getRewardsBadge()
      .then((b) => {
        if (active) setStars(b ? b.stars : null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hidden, pathname]);

  // The count, again, on an auth change — the upgrade flips it without a full reload.
  useEffect(() => {
    if (hidden) return;
    let active = true;
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED")
        getRewardsBadge()
          .then((b) => {
            if (active) setStars(b ? b.stars : null);
          })
          .catch(() => {});
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hidden]);

  if (hidden) return null;
  const tabs = dinerTabs({
    pathname,
    here,
    mode,
    cartId,
    cartCount,
    order: live ? { paymentIntent: live.paymentIntent, cartId: live.cartId } : null,
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
            aria-busy={t.key === "order" && leaving ? true : undefined}
            data-tab={t.key}
            onClick={
              t.key === "order"
                ? (e) => {
                    // A modified or middle click opens the link as the link it is.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault(); // the push below is the navigation
                    if (leaving) return;
                    setLeaving(true);
                    void drain().finally(() => {
                      setLeaving(false);
                      journey.push(t.href);
                    });
                  }
                : undefined
            }
          >
            <span className="diner-tab-icon" aria-hidden>
              {/* In the market the first tab wears the bag, not the grid. */}
              <Icon
                name={
                  t.key === "menu" && tabsMode(pathname, mode) === "scango" ? "bag" : ICON[t.key]
                }
                size={22}
              />
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
