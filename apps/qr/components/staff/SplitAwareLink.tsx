"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { PANE_QUERY, opensInPane } from "@/lib/floor-pane";

/**
 * Phase 2d · split — a way back to a table that lands in the counter's PANE at split width: the
 * real `<Link href>` (a phone, a modified click, a new tab all get the full table page), whose plain
 * primary click at ≥48em — read at CLICK time, so SSR never guesses a width — pushes `paneHref`
 * instead (`/staff?floor=1#table-<id>`). No hooks beyond the router, so StaffBar stays hook-free.
 *
 * Phase 2g · reader — `onPane`: a pane ON THIS SCREEN to open in place. The push above is a route
 * change from every other staff page, but on the counter screen itself it changes only the hash, and
 * a router-driven fragment change fires no `hashchange` — the split would never select. The bar's
 * reader chip passes the split's own opener (through `ReaderCollectProvider`); `false` (no split
 * mounted) falls back to the push.
 */
export function SplitAwareLink({
  href,
  paneHref,
  className,
  onPane,
  children,
}: {
  href: string;
  paneHref: string;
  className?: string;
  /** Open the pane in place, if this screen has one — true when it did. */
  onPane?: () => boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        const split =
          typeof window.matchMedia === "function" && window.matchMedia(PANE_QUERY).matches;
        if (
          !opensInPane({
            split,
            button: e.button,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            defaultPrevented: e.defaultPrevented,
          })
        )
          return;
        e.preventDefault();
        if (onPane?.()) return;
        router.push(paneHref);
      }}
    >
      {children}
    </Link>
  );
}
