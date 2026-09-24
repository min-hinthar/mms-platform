/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { DecodeHold } from "@/lib/camera-state";

/**
 * Phase 1c — the stream + decoder WIRING (the decisions are pure and pinned in
 * lib/camera-state.test.ts). jsdom has no camera, so mediaDevices, BarcodeDetector, play() and
 * requestAnimationFrame are stubbed per test; the clock is a hand-advanced `performance.now` so the
 * throttle's 1.5s window is exact. Each MUTATION was induced and watched go red.
 */

const { BarcodeScanner } = await import("./BarcodeScanner");

let now = 0;
let frameQ: FrameRequestCallback[] = [];
let inFrame: string | null = null;
let visibility: DocumentVisibilityState = "visible";
type Track = {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: () => void;
  removeEventListener: () => void;
};
let tracks: Track[] = [];
let getUserMedia: ReturnType<typeof vi.fn>;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

/** Run `n` animation frames `ms` apart — each one a detect() of whatever is `inFrame`. */
async function frames(n: number, ms = 16) {
  for (let i = 0; i < n; i++) {
    now += ms;
    const q = frameQ.splice(0);
    for (const cb of q) cb(now);
    await flush();
  }
}

beforeEach(() => {
  now = 0;
  frameQ = [];
  inFrame = null;
  visibility = "visible";
  tracks = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frameQ.push(cb);
    return frameQ.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  getUserMedia = vi.fn(async () => {
    const t: Track = { stop: vi.fn(), addEventListener: () => {}, removeEventListener: () => {} };
    tracks.push(t);
    return { getTracks: () => [t] };
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    detect = async () => (inFrame ? [{ rawValue: inFrame }] : []);
  };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
});

function mount(hold: DecodeHold = "none") {
  const onScan = vi.fn();
  const onState = vi.fn();
  const view = render(<BarcodeScanner onScan={onScan} onState={onState} hold={hold} attempt={1} />);
  const rerender = (p: { hold?: DecodeHold; onScan?: () => void; attempt?: number }) =>
    view.rerender(
      <BarcodeScanner
        onScan={p.onScan ?? onScan}
        onState={onState}
        hold={p.hold ?? hold}
        attempt={p.attempt ?? 1}
      />,
    );
  return { ...view, onScan, onState, rerender };
}

describe("the stream is keyed on the attempt and the page's visibility — nothing else", () => {
  it("a NEW onScan identity (the basket landing) never restarts the camera", async () => {
    // MUTATION: key the stream effect on `onScan` (the old `[onScan]`) → a second getUserMedia; red.
    const v = mount();
    await flush();
    v.rerender({ onScan: vi.fn() });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("changing the hold (the sheet opening) never restarts the camera", async () => {
    // MUTATION: `hold` in the stream effect's deps → a second getUserMedia; red.
    const v = mount("none");
    await flush();
    v.rerender({ hold: "swallow" });
    await flush();
    v.rerender({ hold: "none" });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("a hidden page stops every track; a visible one restarts without a tap", async () => {
    mount();
    await flush();
    expect(tracks).toHaveLength(1);
    visibility = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(tracks[0]!.stop).toHaveBeenCalled();
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});

describe("hold — sightings are RECORDED while paused, and only hold → none resets", () => {
  it("a jar in frame behind the sheet is never announced when the sheet closes", async () => {
    // MUTATION: return before storing the gate while paused (skip the record) → the jar looks new
    // the moment the sheet closes and onScan fires; red.
    const v = mount("swallow");
    await flush();
    inFrame = "299000000001";
    await frames(125); // 2s of dwell at 16ms
    v.rerender({ hold: "none" });
    await flush();
    await frames(30); // still in frame after the sheet closed
    expect(v.onScan).not.toHaveBeenCalled();
  });

  it("the jar already in frame when the basket lands adds exactly once", async () => {
    // MUTATION: no gate reset on hold → none → the held sighting stays "seen" and never announces;
    // red (0 calls). The throttle still swallows the continuing dwell, so it is exactly 1.
    const v = mount("hold");
    await flush();
    inFrame = "299000000002";
    await frames(20);
    expect(v.onScan).not.toHaveBeenCalled();
    v.rerender({ hold: "none" });
    await flush();
    await frames(30);
    expect(v.onScan).toHaveBeenCalledTimes(1);
    expect(v.onScan).toHaveBeenCalledWith("299000000002");
  });

  it("an announced sighting locks the reticle (beat one) before any verdict", async () => {
    const v = mount("none");
    await flush();
    inFrame = "299000000003";
    await frames(2);
    expect(v.onScan).toHaveBeenCalledTimes(1);
    expect(v.container.querySelector(".scan-reticle")?.hasAttribute("data-lock")).toBe(true);
  });
});

describe("state reports", () => {
  it("starting, then live on the video's first `playing`", async () => {
    const v = mount();
    await flush();
    expect(v.onState).toHaveBeenCalledWith("starting");
    expect(v.onState).not.toHaveBeenCalledWith("live");
    await act(async () => {
      v.container.querySelector("video")!.dispatchEvent(new Event("playing"));
    });
    expect(v.onState).toHaveBeenLastCalledWith("live");
  });

  it("a refusal is reported by name — NotAllowedError → denied", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    const v = mount();
    await flush();
    expect(v.onState).toHaveBeenLastCalledWith("denied");
  });

  it("a refused play() is a failure, never a silent ink slate", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("NotAllowed"));
    const v = mount();
    await flush();
    expect(v.onState).toHaveBeenLastCalledWith("failed");
  });

  it("adds no live region — the page's toast is the announcement", async () => {
    const v = mount();
    await flush();
    expect(v.container.querySelector('[role="alert"], [role="status"], [aria-live]')).toBeNull();
  });
});
