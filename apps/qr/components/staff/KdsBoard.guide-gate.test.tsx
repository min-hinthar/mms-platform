/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KitchenQueue } from "@/lib/kitchen-types";
import { ticketKey } from "@/lib/kitchen-rounds";

/**
 * PD12 — the kitchen guide's gate, on the board AS SHIPPED (the blind pass on #345). `KdsBoard.test`
 * flips `staffGuideShips` file-wide to pin the host's wiring, so there the board's own consult of the
 * gate is deletable with every case green. This suite mounts the REAL board with the REAL
 * `staffGuideShips` and a signed-in person, and asks the shipped questions: the guide shows exactly
 * when its station ships (held today: OPEN-ITEMS M270 (1)), and the grid's focus catch-all is the
 * one `main` shipped — no `tabIndex` on the live list, focus that fell with a ticket goes to the
 * heading. `scripts/verify-slice.mjs` `pd12/kds-board/kitchen-gate-dropped` drops the consult.
 */
const NOW = "2026-09-20T18:00:00.000Z";
const STAFF_ID = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b";

const ticketQ = (): KitchenQueue => ({
  tickets: [
    {
      key: ticketKey({ cart_id: "cart-1", fire_batch: "batch-1", fire_at: null }),
      cartId: "cart-1",
      sessionId: "sess-1",
      fireBatch: "batch-1",
      round: { kind: "n", n: 1 },
      stampIso: NOW,
      channel: "dinein",
      label: "T4",
      tableNumber: 4,
      customerName: null,
      shortCode: null,
      pickupSlot: null,
      held: false,
      unpaid: false,
      firedAt: NOW,
      lines: [
        {
          id: "line-1",
          menuItemId: "mi-1",
          soldOut: false,
          name: "Mohinga",
          nameMy: null,
          qty: 1,
          modifiers: [],
          modifiersMy: [],
          notes: null,
          state: "fired",
          firedAt: NOW,
          fulfillment: "dinein",
          station: "wok",
        },
      ],
    },
  ],
  serverNow: NOW,
  thresholds: {
    dineinAmberMin: 8,
    dineinRedMin: 12,
    pickupAmberMin: 8,
    pickupRedMin: 12,
    rechimeSec: 60,
  },
  stats: { avgSecs: 0, servedToday: null },
  served: null,
});
const emptyQ = (): KitchenQueue => ({ ...ticketQ(), tickets: [] });
let currentQueue = emptyQ();
const getKitchenQueue = vi.fn(() => Promise.resolve({ ok: true as const, queue: currentQueue }));

// The board's outside world, stubbed as `KdsBoard.test` stubs it — and NOT `@/lib/staff-guide`.
vi.mock("@/lib/kitchen", () => ({
  getKitchenQueue: () => getKitchenQueue(),
  bumpTicket: () => Promise.resolve({ ok: true }),
  bumpLine: () => Promise.resolve({ ok: true }),
  fireTicketNow: () => Promise.resolve({ ok: true }),
  recallTicket: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/lib/menu-availability", () => ({
  setItemSoldOut: () => Promise.resolve({ ok: true, soldOut: true }),
}));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("@/lib/kds-sound", () => ({
  SOFT_LEVEL: 0.4,
  KDS_DEFAULT_VOLUME: 0.8,
  KdsChime: class {
    arm() {
      return Promise.resolve(false);
    }
    armWithin() {
      return this.arm();
    }
    get armed() {
      return false;
    }
    subscribe() {
      return () => {};
    }
    play() {}
  },
  getKdsSoundWanted: () => false,
  setKdsSoundWanted: () => {},
}));
vi.mock("./HelpButton", () => ({ HelpButton: () => null }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { KdsBoard } = await import("./KdsBoard");
const { ts } = await import("@/lib/i18n/staff");
const { staffGuideShips } = await import("@/lib/staff-guide");

afterEach(() => {
  cleanup();
  localStorage.clear();
  currentQueue = emptyQ();
  vi.useRealTimers();
});
const mount = (initial: KitchenQueue) =>
  render(
    <StaffLangProvider lang="en">
      <KdsBoard initial={initial} staffId={STAFF_ID} />
    </StaffLangProvider>,
  );
/** The kitchen guide's group — named by its first step's title, `kds.table` {11}. */
const guideGroup = () => screen.queryByRole("group", { name: "Table 11" });
const guideKeys = () => Object.keys(localStorage).filter((k) => k.startsWith("mms.guide.seen:"));

describe("KdsBoard as shipped — the kitchen guide follows its station's gate", () => {
  it("an empty board, a signed-in person, a first open: the guide shows exactly when the kitchen ships", async () => {
    const { container } = mount(emptyQ());
    await act(async () => {});
    // MUTATION pd12/kds-board/kitchen-gate-dropped: the board offers it although the station is
    // held — a guide whose fifth step teaches a card this board does not draw; red.
    expect(guideGroup() !== null).toBe(staffGuideShips("kitchen"));
    expect(guideKeys()).toHaveLength(staffGuideShips("kitchen") ? 1 : 0);
    if (!staffGuideShips("kitchen")) {
      // Held: the board's own empty state, exactly as shipped.
      expect(container.querySelector("#kds-empty-h")!.textContent).toBe(ts("en", "kds.empty"));
      expect(container.querySelector(".kds-guide")).toBeNull();
    }
  });

  it("the grid's focus catch-all is the shipped one: no tabIndex on the live list; focus that fell with a ticket goes to the heading", async () => {
    vi.useFakeTimers();
    currentQueue = ticketQ();
    const { container } = mount(ticketQ());
    await act(async () => {});
    const grid = container.querySelector("ul.kds-grid")!;
    expect(grid).not.toBeNull();
    expect(grid.hasAttribute("tabindex")).toBe(false);
    // A cook's focus on the ticket's bump; the ticket leaves the board (another tablet bumped it).
    const bump = container.querySelector<HTMLButtonElement>(".kds-bump")!;
    act(() => bump.focus());
    expect(document.activeElement).toBe(bump);
    currentQueue = emptyQ();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(container.querySelector(".kds-bump")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#kds-h"));
  });
});
