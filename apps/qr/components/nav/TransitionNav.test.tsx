/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navEpoch } from "@/lib/nav-epoch";

/**
 * Codex round 2 on 3b (#312) — the ONE navigation grammar records that a navigation has STARTED,
 * synchronously, through every one of its doors: a `TransitionLink` click, a `useJourneyRouter`
 * push, the browser's Back. Continuations that queued a push behind a write barrier compare epochs
 * and drop theirs when anything else moved first.
 */
const pathname = "/menu";
const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next-view-transitions", () => ({
  Link: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    [k: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...(rest as object)}>
      {children}
    </a>
  ),
  useTransitionRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

const { TransitionLink, useJourneyRouter, NavDirectionSync } = await import("./TransitionNav");

afterEach(cleanup);

describe("the navigation grammar bumps the epoch when a navigation STARTS", () => {
  it("a plain click on a TransitionLink bumps; a modified click (a new tab) does not", () => {
    render(<TransitionLink href="/cart">Order</TransitionLink>);
    const a = navEpoch.current();
    fireEvent.click(screen.getByRole("link"));
    expect(navEpoch.current()).toBe(a + 1);
    fireEvent.click(screen.getByRole("link"), { metaKey: true });
    expect(navEpoch.current()).toBe(a + 1);
  });
  it("a journey push bumps BEFORE the router is asked", () => {
    let seenAtPush = -1;
    routerPush.mockImplementation(() => {
      seenAtPush = navEpoch.current();
    });
    function Pusher() {
      const j = useJourneyRouter();
      return (
        <button type="button" onClick={() => j.push("/cart")}>
          go
        </button>
      );
    }
    render(<Pusher />);
    const a = navEpoch.current();
    fireEvent.click(screen.getByRole("button"));
    expect(routerPush).toHaveBeenCalledWith("/cart");
    expect(seenAtPush).toBe(a + 1); // the bump is synchronous and precedes the push
  });
  it("the browser's Back (popstate) bumps", () => {
    render(<NavDirectionSync />);
    const a = navEpoch.current();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(navEpoch.current()).toBe(a + 1);
  });
});
