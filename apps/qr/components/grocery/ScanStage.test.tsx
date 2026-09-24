/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Phase 1c — the camera state machine's WIRING: what opens without a tap, what never does, where
 * focus lands, and that no live region is added. The decisions themselves are pinned in
 * lib/camera-state.test.ts. jsdom has no camera, so `navigator.mediaDevices`,
 * `navigator.permissions.query`, `BarcodeDetector`, `play()` and rAF are stubbed per test. Each
 * MUTATION was induced and watched go red.
 */

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const { ScanStage } = await import("./ScanStage");

const INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.108";

let getUserMedia: ReturnType<typeof vi.fn>;
type Status = { state: string; onchange: null | (() => void) };

const named = (name: string) => Object.assign(new Error(name), { name });
const liveStream = () => ({
  getTracks: () => [{ stop: vi.fn(), addEventListener: () => {}, removeEventListener: () => {} }],
});
const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

function setPermission(status: Status | null) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: status ? { query: () => Promise.resolve(status) } : undefined,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  getUserMedia = vi.fn(async () => liveStream());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  setPermission(null);
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    detect = async () => [];
  };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
});

function mount(result: React.ReactNode = null) {
  return render(
    <ScanStage onScan={vi.fn()} cartReady sheetOpen={false} result={result} onSearch={vi.fn()} />,
  );
}

const noLiveRegion = (root: HTMLElement) =>
  expect(root.querySelector('[role="alert"], [role="status"], [aria-live]')).toBeNull();

describe("the camera prompt follows a tap, or a grant already given", () => {
  it("no permissions API and nothing remembered → the primer, and no camera before the tap", async () => {
    // MUTATION: treat the primer opening as auto (`go("starting")` for it) → getUserMedia fires on
    // mount; red.
    const v = mount(<div data-testid="result" />);
    await flush();
    expect(screen.getByRole("heading", { name: "Scan as you shop" })).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
    // The result bar is a live-stage thing only.
    expect(screen.queryByTestId("result")).toBeNull();
    noLiveRegion(v.container);
    // One tap → the camera.
    fireEvent.click(screen.getByRole("button", { name: /Start scanning/ }));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("result")).toBeTruthy();
    expect(document.activeElement?.id).toBe("scan-stage");
  });

  it("permission already granted → the camera starts with no tap", async () => {
    setPermission({ state: "granted", onchange: null });
    const v = mount(<div data-testid="result" />);
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("result")).toBeTruthy();
    noLiveRegion(v.container);
  });

  it("'prompt' plus a grant remembered on this device → auto (iOS reports prompt every load)", async () => {
    setPermission({ state: "prompt", onchange: null });
    window.localStorage.setItem("mms-grocery-cam", "1");
    mount();
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("'prompt' with nothing remembered → the primer", async () => {
    setPermission({ state: "prompt", onchange: null });
    mount();
    await flush();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Start scanning/ })).toBeTruthy();
  });
});

describe("a refusal is a recoverable panel, with focus on its heading", () => {
  it("an instant refusal after Start → the denied panel, heading focused, settings help open", async () => {
    // MUTATIONS: drop the focus effect → focus falls to <body>; drop `setHelpOpen(true)` → the help
    // stays shut; each red.
    getUserMedia.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(named("NotAllowedError")), 50)),
    );
    const v = mount();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Start scanning/ }));
    await wait(80);
    await flush();
    const title = screen.getByRole("heading", { name: /The camera is off for this site/ });
    expect(title.id).toBe("scan-panel-title");
    expect(document.activeElement).toBe(title);
    const help = v.container.querySelector("details.scan-help") as HTMLDetailsElement;
    expect(help.open).toBe(true);
    expect(window.localStorage.getItem("mms-grocery-cam")).toBeNull();
    noLiveRegion(v.container);
  });

  it("the same refusal inside an in-app browser → the in-app panel", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(INSTAGRAM);
    getUserMedia.mockRejectedValueOnce(named("NotAllowedError"));
    mount();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Start scanning/ }));
    await flush();
    expect(
      screen.getByRole("heading", { name: /This app’s browser can’t use the camera/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("a permission granted in settings while a panel shows restarts the camera, focus kept off <body>", async () => {
    // MUTATION: drop the ambient focus rule (move focus on user-initiated changes only) → the
    // focused Try again unmounts and focus falls to <body>; red.
    const status: Status = { state: "prompt", onchange: null };
    setPermission(status);
    getUserMedia.mockRejectedValueOnce(named("NotReadableError"));
    mount();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Start scanning/ }));
    await flush();
    const retry = screen.getByRole("button", { name: /Try again/ });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    status.state = "granted";
    await act(async () => {
      status.onchange?.();
    });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(document.activeElement?.id).toBe("scan-stage");
  });
});
