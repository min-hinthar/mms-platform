/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { MsgText } from "./StaffMsg";
import { ReloadButton, ReloadOffer } from "./ReloadOffer";
import { autoBlock, reloadHolds, type GuardInput } from "@/lib/reload-guard";
import { NET_SHOW_MS } from "@/lib/live-connection";

/** A guard input with nothing but the holds refusing: online, quiet, nothing saving. */
const QUIET: GuardInput = {
  online: true,
  holds: [],
  youngWrite: false,
  stalledWrite: false,
  ownWait: false,
  msSinceWriteSettled: null,
  msSinceInput: Number.MAX_SAFE_INTEGER,
  dialogOpen: false,
  typing: false,
  visible: true,
  retired: false,
};

/**
 * Phase 2h (decision 9d) — the reload offer and its button. What only a render can see: that the
 * Reload is a real DOCUMENT reload (the one escape a stuck action queue cannot hold — a soft
 * navigation queues behind it), that the line is a live region only in the shape that owns one, and
 * that every word is the dictionary's in the device's tongue.
 */
const reload = vi.fn();
beforeEach(() => {
  // jsdom's `location.reload` is unforgeable (spyOn cannot redefine it); stub the whole object.
  vi.stubGlobal("location", { ...window.location, reload });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  reload.mockReset();
});

const MYANMAR = /[က-႟]/;
const live = (root: ParentNode) =>
  root.querySelectorAll('[role="alert"],[role="status"],[aria-live]');

describe("ReloadOffer — the one way out of a stuck tablet, for a site with no region", () => {
  it("says why in ONE alert and reloads the DOCUMENT on its button", () => {
    // MUTATION (p2h-core/reload-offer-never-reloads): the button does nothing (or a soft refresh,
    // which queues behind the stuck action) — the cashier taps the only way out and stays trapped;
    // red.
    const { container } = render(<ReloadOffer lang="en" reason="stalled" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(STAFF["out.stalled"].en);
    expect(live(container)).toHaveLength(1);
    const btn = screen.getByRole("button", { name: STAFF["out.reload"].en });
    // The kit's Button: the 44px floor lives on `.ui-btn` (primitives.css), never a hand-rolled one.
    expect(btn.classList.contains("ui-btn")).toBe(true);
    expect(btn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(btn);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("speaks Burmese on a Burmese tablet — the line and the button", () => {
    const { container } = render(<ReloadOffer lang="my" reason="stalled" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(STAFF["out.stalled"].my);
    // An alert speaks once: no English echo inside the live region.
    expect(alert.textContent).not.toContain(STAFF["out.stalled"].en);
    const btn = container.querySelector("button")!;
    expect(btn.textContent).toMatch(MYANMAR);
    expect(btn.querySelector('[lang="my"]')?.textContent).toBe(STAFF["out.reload"].my);
  });

  it("a block offer spans its container (a sheet's footer)", () => {
    render(<ReloadOffer lang="en" reason="stalled" block />);
    expect(screen.getByRole("button").classList.contains("ui-btn-block")).toBe(true);
  });
});

describe("ReloadButton — the button ALONE, for a site that already owns its view's one region (F1)", () => {
  it("draws no line and no live role — and still reloads the document", () => {
    // MUTATION (p2h-core/reload-offer-second-region): the button carries a live role of its own —
    // inside a sheet whose `role="status"` already says the refusal, the stall is announced twice
    // (QA-CHECKLIST §A); red.
    const { container } = render(<ReloadButton lang="en" />);
    expect(live(container)).toHaveLength(0);
    expect(container.textContent).not.toContain(STAFF["out.stalled"].en);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    const btn = screen.getByRole("button", { name: STAFF["out.reload"].en });
    expect(btn.classList.contains("ui-btn")).toBe(true);
    fireEvent.click(btn);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("composes with a sheet's own region: the sentence is said ONCE, in the device's tongue", () => {
    // The wiring the guarded sheets use (S1): the sheet's always-mounted `role="status"` says the
    // refusal through `<MsgText>`, and the button sits beside it — one region, one sentence, one
    // reload. A waiting arm is the same shape with its own `*.waiting` key.
    const { container } = render(
      <form>
        <p role="status">
          <MsgText lang="my" msg={{ k: "out.stalled" }} />
        </p>
        <ReloadButton lang="my" block />
      </form>,
    );
    expect(live(container)).toHaveLength(1);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe(STAFF["out.stalled"].my);
    expect(container.textContent!.split(STAFF["out.stalled"].my)).toHaveLength(2);
    const btn = screen.getByRole("button");
    expect(btn.classList.contains("ui-btn-block")).toBe(true);
    expect(btn.querySelector('[lang="my"]')?.textContent).toBe(STAFF["out.reload"].my);
  });
});

// ── Phase 2i (P2bi) ──
describe("Phase 2i — the offer holds the automatic reload, and never reloads offline", () => {
  let onLine = true;
  beforeEach(() => {
    onLine = true;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
  });
  afterEach(() => {
    onLine = true;
  });

  it("registers ONE standing hold while on screen, released when it leaves", () => {
    // MUTATION (p2i-offer/hold-unregistered): no hold — the automatic reload for a new build reloads
    // the tablet out from under a "no answer yet — reload" line a person is reading; red.
    const { unmount } = render(<ReloadButton lang="en" />);
    expect(reloadHolds()).toHaveLength(1);
    expect(reloadHolds()[0]).toMatchObject({ kind: "standing", reason: "reloadOffer" });
    expect(autoBlock({ ...QUIET, holds: reloadHolds() })).toEqual({
      kind: "hold",
      reason: "reloadOffer",
    });
    unmount();
    expect(reloadHolds()).toHaveLength(0);
  });

  it("two offers on one screen hold twice — each its own token", () => {
    const { unmount } = render(
      <>
        <ReloadButton lang="en" />
        <ReloadOffer lang="en" reason="stalled" />
      </>,
    );
    const subjects = reloadHolds().map((h) => h.subject);
    expect(subjects).toHaveLength(2);
    expect(new Set(subjects).size).toBe(2);
    unmount();
    expect(reloadHolds()).toHaveLength(0);
  });

  it("a tap while the device is offline does NOT reload — read at the tap, before any sustain", () => {
    // MUTATION (p2i-offer/offline-reloads): the tap reloads offline — the tablet lands on the
    // worker's offline page and the screen it was working from is gone; red.
    // MUTATIONS: (p2i-offer/blip-unsaid) the refused tap changes nothing on screen — during a stall
    // the cure reads as a dead control; (p2i-offer/blip-stuck) the refusal outlives the outage — the
    // button stays refused after the network is back; red.
    render(<ReloadButton lang="en" />);
    onLine = false; // no event, no render: only the tap can see it
    fireEvent.click(screen.getByRole("button", { name: STAFF["out.reload"].en }));
    expect(reload).not.toHaveBeenCalled();
    // Said at once, on the button — before the outage is "sustained".
    const refused = screen.getByRole("button", { name: STAFF["out.reload.offline"].en });
    expect(refused.getAttribute("aria-disabled")).toBe("true");
    expect(refused.hasAttribute("disabled")).toBe(false);
    onLine = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    fireEvent.click(screen.getByRole("button", { name: STAFF["out.reload"].en }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a sustained outage says so ON the button and refuses it (aria-disabled, never native)", async () => {
    // MUTATION (p2i-offer/offline-unsaid): the button still reads "Reload the page" offline — a
    // person taps it and nothing happens, with no reason given; red.
    vi.useFakeTimers();
    render(<ReloadButton lang="en" />);
    onLine = false;
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(NET_SHOW_MS);
    });
    const btn = screen.getByRole("button", { name: STAFF["out.reload.offline"].en });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(btn);
    expect(reload).not.toHaveBeenCalled();
    onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("button", { name: STAFF["out.reload"].en })).toBeTruthy();
    vi.useRealTimers();
  });
});
