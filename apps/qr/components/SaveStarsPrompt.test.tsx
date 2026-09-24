/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Phase 1c · account-star — the save-your-Stars card's WIRING (every decision and string is pinned as
 * a value in lib/save-stars.test.ts). What only a render can show: the CTA is a secondary link to
 * /account, the card adds no live region to /track, "Not now" puts focus somewhere sane before the
 * card leaves, and offline/outage withhold the CTA with a reason instead of a dead tap.
 */
const h = vi.hoisted(() => ({ navigate: vi.fn() }));
// The "router": a stand-in TransitionLink that records where a click would have gone. The blocked CTA
// must never reach it.
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        h.navigate(href);
      }}
    >
      {children}
    </a>
  ),
}));

const { SaveStarsPrompt } = await import("./SaveStarsPrompt");

afterEach(() => {
  cleanup();
  h.navigate.mockReset();
  // The connection hook keeps a module-level cache; put the browser back online for the next case.
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
});

const prompt = (o: Partial<{ receiptEmail: boolean; platformDown: boolean }> = {}) => {
  const onDismiss = vi.fn();
  const ui = (
    <SaveStarsPrompt
      stars={3}
      rewardJustUnlocked={false}
      receiptEmail={o.receiptEmail ?? false}
      platformDown={o.platformDown ?? false}
      onDismiss={onDismiss}
    />
  );
  return { ui, onDismiss };
};

const cta = () => screen.getByText("Save to an account").closest("a") as HTMLAnchorElement;

describe("the save card — a door, not a second flow", () => {
  it("the CTA is a SECONDARY link to /account", () => {
    // RED when the variant flips to primary (a filled pill out-ranking status and proof) or the
    // href changes.
    render(prompt().ui);
    expect(cta().getAttribute("href")).toBe("/account");
    expect(cta().classList.contains("ui-btn-secondary")).toBe(true);
    expect(cta().classList.contains("ui-btn-primary")).toBe(false);
    fireEvent.click(cta());
    expect(h.navigate).toHaveBeenCalledWith("/account");
  });

  it("adds no live region to /track", () => {
    // RED when role="status" (or alert / aria-live) is added — /track already has three.
    const { container } = render(prompt({ receiptEmail: true, platformDown: true }).ui);
    const section = container.querySelector("section.save-stars") as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    expect(section.getAttribute("role")).toBeNull();
    expect(section.hasAttribute("aria-live")).toBe(false);
  });

  it("is named by its heading, and the Burmese line is marked lang=my", () => {
    render(prompt().ui);
    const region = screen.getByRole("region", { name: /Keep your 3 Stars/ });
    const my = region.querySelector('[lang="my"]');
    expect(my?.textContent).toBe("ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်");
  });

  it("mentions the receipt email only when that control is on screen", () => {
    // RED when the receiptEmail gate is dropped.
    const off = render(prompt({ receiptEmail: false }).ui);
    expect(off.container.textContent).not.toContain("Emailing a receipt doesn’t save them.");
    off.unmount();
    const on = render(prompt({ receiptEmail: true }).ui);
    expect(on.container.textContent).toContain("Emailing a receipt doesn’t save them.");
  });
});

describe("Not now — focus lands before the card leaves", () => {
  function inTracker(onDismiss: () => void) {
    return render(
      <main>
        <a id="prev" href="#receipt">
          View & print
        </a>
        <SaveStarsPrompt
          stars={3}
          rewardJustUnlocked={false}
          receiptEmail={false}
          platformDown={false}
          onDismiss={onDismiss}
        />
        <a id="next" href="#back">
          Back to menu
        </a>
      </main>,
    );
  }

  it("moves focus to the PREVIOUS focusable element, then dismisses", () => {
    // RED when the focus move is removed (activeElement falls to <body> once the card unmounts) or
    // when it targets the NEXT element ("Back to menu" — one more Enter leaves the tracker).
    const onDismiss = vi.fn();
    inTracker(onDismiss);
    const notNow = screen.getByRole("button", { name: "Not now" });
    notNow.focus();
    fireEvent.click(notNow);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("prev");
  });

  it("does not move focus when focus was not in the card (a touch tap)", () => {
    const onDismiss = vi.fn();
    inTracker(onDismiss);
    const next = document.getElementById("next") as HTMLElement;
    next.focus();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("next");
  });

  it("falls back to the next focusable when nothing precedes the card", () => {
    const onDismiss = vi.fn();
    render(
      <main>
        <SaveStarsPrompt
          stars={3}
          rewardJustUnlocked={false}
          receiptEmail={false}
          platformDown={false}
          onDismiss={onDismiss}
        />
        <a id="next" href="#back">
          Back to menu
        </a>
      </main>,
    );
    const notNow = screen.getByRole("button", { name: "Not now" });
    notNow.focus();
    fireEvent.click(notNow);
    expect(document.activeElement?.id).toBe("next");
  });
});

describe("offline / outage — the CTA stays, disabled, with a reason", () => {
  it("offline: an href-less aria-disabled link described by the offline line; a click goes nowhere", () => {
    // RED when the blocked branch is removed (the live link stays under an offline diner).
    render(prompt().ui);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const blocked = cta();
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    expect(blocked.hasAttribute("href")).toBe(false);
    expect(blocked.getAttribute("role")).toBe("link");
    expect(blocked.tabIndex).toBe(0);
    const reason = document.getElementById(blocked.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("You look offline — saving needs a connection.");
    fireEvent.click(blocked);
    expect(h.navigate).not.toHaveBeenCalled();
    // "Not now" is local, so it stays live.
    expect(screen.getByRole("button", { name: "Not now" }).getAttribute("aria-disabled")).toBe(
      null,
    );
  });

  it("platform down: the we-down line instead", () => {
    render(prompt({ platformDown: true }).ui);
    const blocked = cta();
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(blocked.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(
      "Our system isn’t reachable right now — your Stars stay on this phone until you save.",
    );
  });
});
