/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanAddResult } from "@/lib/grocery";

/**
 * G25 — every charge this page makes ok-ed is RECORDED, so the camera can never bill it twice.
 *
 * M186's charge rule (`classifyScan`, lib/scan-gate.ts) refuses a camera sighting of a code the basket
 * already pays for, judged from three sources: the lines the server last showed, the offline queue,
 * and `billedRef` — what this session charged, the ONLY one that survives a failed post-write read
 * (`scanAdd` answering `lines: null`). A LIVE add always recorded it. The offline queue's REPLAY did
 * not: a replay delivered with `lines: null` left the queue (the drain's `syncPending()`) while the
 * list did not show it yet, so the next camera read of that jar classified `add` and charged a
 * second unit — until some later read applied.
 *
 * The decisions are pure and pinned elsewhere (`lib/scan-gate.test.ts`, `lib/grocery-queue.test.ts`);
 * this suite is the page's WIRING, which has nowhere else to live (T18): the real page, with the
 * server actions, the session and the camera stubbed. The stage stub hands back the page's own
 * `onScan` — what the camera calls on a decoded frame — so each row is a sighting, not a tap.
 * `check:scan-repeat` proposition 8 pins the same rule structurally (every ok charge records its
 * code); this suite pins the behaviour.
 */
const CART = "c-0000-g25";
const JAR = "012345678905";

const h = vi.hoisted(() => ({
  onScan: null as ((code: string) => void) | null,
  /** Every `scanAdd(cartId, barcode, scanId)` the page made, in order. */
  calls: [] as { cartId: string; barcode: string; scanId: string }[],
  /** The server's answer to the NEXT `scanAdd`, by call index (the last one repeats). */
  answers: [] as ScanAddResult[],
}));

vi.mock("@/lib/grocery", () => ({
  scanAdd: (cartId: string, barcode: string, scanId: string) => {
    const i = h.calls.push({ cartId, barcode, scanId }) - 1;
    return Promise.resolve(h.answers[Math.min(i, h.answers.length - 1)]);
  },
  // The basket the server shows has not caught up with the write — the window G25 lives in.
  getGroceryLines: () => Promise.resolve({ ok: true, lines: [] }),
  searchGroceryItems: () => Promise.resolve([]),
}));
vi.mock("@/lib/cart", () => ({ setQty: () => Promise.resolve() }));
vi.mock("@/lib/useTableSession", () => {
  const session = { cartId: "c-0000-g25", sessionId: "s-g25" };
  const revalidate = () => {};
  return { useTableSession: () => ({ session, error: null, revalidate }) };
});
vi.mock("next/navigation", () => {
  const router = { prefetch: () => {}, push: () => {}, replace: () => {}, back: () => {} };
  return {
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams("tab=scan"),
  };
});
vi.mock("@/components/nav/TransitionNav", () => {
  const journey = { push: () => {} };
  return {
    TransitionLink: (p: { href: string; children?: ReactNode }) => (
      <a href={p.href}>{p.children}</a>
    ),
    useJourneyRouter: () => journey,
  };
});
vi.mock("@/components/ActiveOrderProvider", () => {
  const publish = () => {};
  const register = () => {};
  return { usePublishCart: () => publish, useRegisterDrain: () => register };
});
vi.mock("posthog-js", () => ({ default: { capture: () => {} } }));
vi.mock("@/components/PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("@/components/DoorSheet", () => ({ DoorSheet: () => null }));
// The Browse door's aisles (their own catalog read) — not this suite's door.
vi.mock("@/components/grocery/GroceryBrowse", () => ({ GroceryBrowse: () => null }));
// The camera: the stage hands back the page's own `onScan`, and draws the result bar it is given.
vi.mock("@/components/grocery/ScanStage", () => ({
  ScanStage: (p: { onScan: (code: string) => void; result?: ReactNode }) => {
    h.onScan = p.onScan;
    return <div id="scan-stage">{p.result}</div>;
  },
}));

const { default: GroceryPage } = await import("./page");
const { enqueueScan, pendingFor } = await import("@/lib/grocery-queue");

const ok = (lines: null = null): ScanAddResult => ({
  ok: true,
  name: "Jasmine rice",
  unitPriceCents: 899,
  ebt: true,
  lines, // null: the post-write read failed — nothing on screen proves the charge
});

/** Let every pending promise (the mount read, a write's continuation) settle. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

/** Wait for an EVENT the page announces through its one live region — never for a moment: a row
 *  that read the page at a fixed tick could pass or fail by scheduling (LEARNINGS #248). Generous
 *  bounds: a loaded CI shard renders this page slowly, and a pass returns at the first match. */
const announced = (text: RegExp) =>
  waitFor(() => expect(screen.getByText(text)).toBeTruthy(), { timeout: 20_000 });
const ROW_MS = 30_000;

/** A camera sighting of `code`, through the page's own handler. A charge's `scanAdd` is called
 *  synchronously inside it (nothing is awaited before the write), so the count is readable at once. */
async function sight(code: string) {
  expect(h.onScan).not.toBeNull();
  await act(async () => {
    h.onScan!(code);
  });
}

const chargesOf = (code: string) => h.calls.filter((c) => c.barcode === code).length;

beforeEach(() => {
  // jsdom has no `matchMedia`; the page's scroll and motion hooks ask it. No preference, no match.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
  window.sessionStorage.clear();
  h.onScan = null;
  h.calls = [];
  h.answers = [ok()];
});
afterEach(() => {
  cleanup();
});

describe("the grocery page — an ok charge is recorded, so a re-read never bills it twice (G25 · M186)", () => {
  it(
    "a LIVE add whose post-write read failed: the jar re-read is refused, not charged again",
    async () => {
      render(<GroceryPage />);
      await settle();
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
      await announced(/Added Jasmine rice/); // the charge's continuation has run
      // MUTANT grocery-page/a-live-add-forgets-its-charge — the list shows nothing (the read failed),
      // nothing waits in the queue, and an unrecorded charge reads as a new item: a second unit.
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
      // …and the refusal is SAID, in the classifier's own words for a charge the view cannot prove.
      await announced(/Already added — your list is out of date/);
    },
    ROW_MS,
  );

  it(
    "a REPLAYED scan delivered with no view: the jar re-read is refused, not charged again",
    async () => {
      // A scan saved in a dead spot, replayed on mount (the drain's kick) with the radio back.
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000a1");
      render(<GroceryPage />);
      // The drain has answered: the summary is spoken in the same continuation that re-reads the
      // queue (`syncPending()`), so the entry has left it and the classifier no longer counts it.
      await announced(/added 1 saved scan/);
      await settle();
      expect(pendingFor(CART)).toEqual([]);
      expect(h.calls).toEqual([
        { cartId: CART, barcode: JAR, scanId: "00000000-0000-4000-8000-0000000000a1" },
      ]);
      // MUTANT grocery-page/a-replay-forgets-its-charge — G25: the queue no longer holds it, the list
      // does not show it yet, and the replay never said it charged — the camera bills a second unit.
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
      await announced(/Already added — your list is out of date/);
    },
    ROW_MS,
  );

  it(
    "a REFUSED replay charged nothing — the jar re-read still reaches the server",
    async () => {
      // The other direction: a replay the server refused (an unknown code) billed nothing, so it must
      // NOT be recorded — or the shopper's next read of that code is refused as a repeat of a charge
      // that never happened, and an item that later joins the catalog can never be scanned in.
      h.answers = [{ ok: false, reason: "unknown_barcode" }, ok()];
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000b2");
      render(<GroceryPage />);
      await announced(/couldn’t be added/);
      await settle();
      expect(pendingFor(CART)).toEqual([]);
      expect(chargesOf(JAR)).toBe(1);
      // MUTANT grocery-page/a-refused-replay-recorded-as-charged — refused as "Already added".
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(2);
    },
    ROW_MS,
  );
});
