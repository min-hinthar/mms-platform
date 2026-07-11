"use client";
import { useCallback, useEffect, type ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { Link as VTLink, useTransitionRouter } from "next-view-transitions";

/**
 * J1 continuity engine — the app's ONE navigation grammar (docs/JOURNEY_PLAN.md).
 *
 * Route changes ride the View Transitions API via `next-view-transitions` (stable-React-compatible —
 * Next 16's native `experimental.viewTransition` needs React's experimental `<ViewTransition>`, which
 * stable React 19.2 doesn't ship; browsers without the API just get today's instant cut). Direction is
 * a DATA ATTRIBUTE on <html> that globals.css turns into a subtle drift grammar: FORWARD (deeper into
 * the journey) drifts in from the right, BACK drifts in from the left, LATERAL cross-fades. Chrome
 * (AppHeader / CartBar / the toast region) carries its own `view-transition-name` so it stays put while
 * the page moves — the "one camera move" rule.
 *
 * Direction = journey depth, not URL shape: home(0) → menu/grocery(1) → cart(2) → track(3); /account and
 * /rewards sit at 2 (a "your stuff" side-room off any surface). Unknown routes (staff) are lateral.
 */
const JOURNEY_DEPTH: Record<string, number> = {
  "/": 0,
  "/menu": 1,
  "/grocery": 1,
  "/cart": 2,
  "/account": 2,
  "/rewards": 2,
  "/track": 3,
};

type NavDir = "forward" | "back" | "lateral";

function directionBetween(from: string, to: string): NavDir {
  const a = JOURNEY_DEPTH[from];
  const b = JOURNEY_DEPTH[to];
  if (a === undefined || b === undefined || a === b) return "lateral";
  return b > a ? "forward" : "back";
}

/** Stamp the direction the CSS grammar reads. Called synchronously BEFORE the transition starts (the
 *  attribute is read when the ::view-transition animations resolve, so pre-push is early enough). */
function stampDir(dir: NavDir) {
  document.documentElement.dataset.navDir = dir;
}

const pathnameOf = (href: string) => {
  // Relative hrefs only ever appear as absolute paths in this app; guard anyway.
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
};

/**
 * Drop-in `next/link` replacement for DINER surfaces: same props, plus the view transition + the
 * direction stamp. Staff surfaces keep plain next/link (ops tools don't need theater).
 */
export function TransitionLink(props: ComponentProps<typeof VTLink>) {
  const pathname = usePathname();
  const { onClick, href, ...rest } = props;
  return (
    <VTLink
      href={href}
      {...rest}
      onClick={(e) => {
        stampDir(directionBetween(pathname, pathnameOf(String(href))));
        onClick?.(e);
      }}
    />
  );
}

/** Programmatic navigation with the same grammar (CartBar's push, etc.). `prefetch` comes from the
 *  plain router — the transition router only changes how the *navigation itself* runs. */
export function useJourneyRouter() {
  const router = useTransitionRouter();
  const pathname = usePathname();
  const push = useCallback(
    (href: string) => {
      stampDir(directionBetween(pathname, pathnameOf(href)));
      router.push(href);
    },
    [router, pathname],
  );
  return { push };
}

/**
 * Browser back/forward: there's no click to stamp, so listen for popstate and stamp "back" — the common
 * case by far (a distinguishable forward-button press is rare and the lateral fallback is harmless).
 * Mounted once in the root layout.
 */
export function NavDirectionSync() {
  useEffect(() => {
    const onPop = () => stampDir("back");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return null;
}
