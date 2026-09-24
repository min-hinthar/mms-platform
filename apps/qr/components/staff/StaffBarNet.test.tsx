/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { StaffBarNet } = await import("./StaffBarNet");
const { STAFF } = await import("@/lib/i18n/staff");
const { NET_SHOW_MS } = await import("@/lib/live-connection");

/**
 * Phase 2b · feedback — the feedless page's OFFLINE ROW and the bar's ONE height publisher.
 *
 *   - the row shows only after `NET_SHOW_MS` of SUSTAINED offline, never on the raw event, and
 *     hides the moment the device is back (no dwell);
 *   - a soft navigation (the bar remounts per page) keeps the outage's clock — it neither restarts
 *     the sustain nor blinks the row out;
 *   - a bfcache restore (`pageshow`) re-reads `navigator.onLine` instead of trusting a missed event;
 *   - a FEED page never draws the row (its slot says Offline);
 *   - `--staff-bar-h` is the header's measured height, and leaves with the bar.
 */
let onLine = true;
beforeEach(() => {
  onLine = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  onLine = true;
  window.dispatchEvent(new Event("online"));
});

const bar = (feed = false) => (
  <header className="staff-bar">
    <h1>Menu</h1>
    <StaffBarNet lang="en" feed={feed} />
  </header>
);
const row = (c: HTMLElement) => c.querySelector(".staff-net");
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const fire = (type: string) =>
  act(async () => {
    window.dispatchEvent(new Event(type));
  });

describe("the offline row", () => {
  it("a device offline at mount shows the row only after the sustain — as a note, in flow", async () => {
    vi.useFakeTimers();
    onLine = false;
    const { container } = render(bar());
    // MUTATION: key the row on the raw `navigator.onLine` — it is here at once, red.
    expect(row(container)).toBeNull();
    await tick(NET_SHOW_MS - 1);
    expect(row(container)).toBeNull();
    await tick(1);
    const r = row(container)!;
    expect(r.getAttribute("role")).toBe("note");
    expect(r.textContent).toBe(STAFF["shell.net.offline"].en);
    // In flow: a child of the header, never a fixed overlay over a control.
    expect(r.parentElement?.classList.contains("staff-bar")).toBe(true);
  });

  it("a blip shorter than the sustain never shows it", async () => {
    vi.useFakeTimers();
    const { container } = render(bar());
    onLine = false;
    await fire("offline");
    await tick(1500);
    onLine = true;
    await fire("online");
    await tick(NET_SHOW_MS * 3);
    expect(row(container)).toBeNull();
  });

  it("back online hides it at once — no dwell", async () => {
    vi.useFakeTimers();
    onLine = false;
    const { container } = render(bar());
    await tick(NET_SHOW_MS);
    expect(row(container)).not.toBeNull();
    onLine = true;
    await fire("online");
    expect(row(container)).toBeNull();
  });

  it("a soft navigation keeps the outage's clock — the remounted bar neither restarts nor blinks", async () => {
    vi.useFakeTimers();
    onLine = false;
    const first = render(bar());
    await tick(1500);
    first.unmount();
    const { container } = render(bar());
    // MUTATION `the-row-shows-on-a-blip` (the verdict ignores the sustain): a bar remounted 1.5 s
    // into an outage shows the row at once, red.
    expect(row(container)).toBeNull();
    await tick(NET_SHOW_MS - 1500);
    // MUTATION: a per-mount clock — the remount restarts the sustain and this is still null, red.
    expect(row(container)).not.toBeNull();
    cleanup();
    const again = render(bar());
    // Already sustained: the next page's bar draws the row on its FIRST render.
    expect(row(again.container)).not.toBeNull();
  });

  it("a bfcache restore re-reads the device instead of trusting a missed event", async () => {
    vi.useFakeTimers();
    const { container } = render(bar());
    // The outage began while the page sat in bfcache: no `offline` event ever reached it.
    onLine = false;
    await fire("pageshow");
    await tick(NET_SHOW_MS);
    expect(row(container)).not.toBeNull();
  });

  it("a FEED page never draws the row — its status slot already says Offline", async () => {
    vi.useFakeTimers();
    onLine = false;
    const { container } = render(bar(true));
    await tick(NET_SHOW_MS * 2);
    // MUTATION: drop the `!feed` gate — the KDS head is pushed down under the cook's finger, red.
    expect(row(container)).toBeNull();
  });
});

describe("--staff-bar-h — the bar's ONE height publisher", () => {
  it("publishes the header's measured height through a ResizeObserver, and removes it on unmount", () => {
    const observed: Element[] = [];
    let notify: () => void = () => {};
    let disconnected = false;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {
          disconnected = true;
        }
      },
    );
    let h = 76;
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ height: h }) as DOMRect);
    const root = document.documentElement;
    const { container, unmount } = render(bar());
    expect(observed).toEqual([container.querySelector("header")]);
    expect(root.style.getPropertyValue("--staff-bar-h")).toBe("76px");
    h = 127.4; // the offline row wrapped in — the observer re-publishes, rounded UP
    notify();
    expect(root.style.getPropertyValue("--staff-bar-h")).toBe("128px");
    unmount();
    expect(disconnected).toBe(true);
    expect(root.style.getPropertyValue("--staff-bar-h")).toBe("");
    spy.mockRestore();
  });

  it("the probe it measures through takes no layout — `hidden`, so no flex item and no gap", () => {
    const { container } = render(bar());
    const header = container.querySelector("header")!;
    const probe = header.lastElementChild as HTMLElement;
    expect(probe.hidden).toBe(true);
    expect(probe.childNodes).toHaveLength(0);
  });
});
