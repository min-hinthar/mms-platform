/** @vitest-environment jsdom */
import { useEffect, useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANE_QUERY, paneUrl } from "@/lib/floor-pane";
import type { ReaderStart } from "@/lib/reader-collect";

/**
 * Phase 2g · reader — the bar's chip: the card reader's collect on every page NOT showing its table.
 * Driven through the real provider (the server actions mocked) and the real StaffBar, so what is
 * pinned is what a cashier meets: hidden over its own table, the way back to it (the table page on a
 * phone, the pane at split width — the split's own opener when the pane is on this screen), no way
 * in from the lock screen, the outcomes said once, and every control named.
 */
const terminalStatus = vi.fn();
vi.mock("@/lib/terminal", () => ({
  settleCard: vi.fn(),
  terminalStatus: (...a: unknown[]) => terminalStatus(...(a as [])),
  cancelTerminal: vi.fn(),
}));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
let pathname = "/staff/kitchen";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathname,
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
const { useReaderCollect } = await import("./ReaderCollectContext");
const { StaffBar } = await import("./StaffBar");
const { tf } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");

let api!: ReturnType<typeof useReaderCollect>;
function Probe() {
  const r = useReaderCollect();
  // Read after each commit (never a module write during render — react-hooks/globals).
  useLayoutEffect(() => {
    api = r;
  });
  return null;
}
function Shows({ id }: { id: string }) {
  const shownHere = useReaderCollect().shownHere;
  useLayoutEffect(() => shownHere(id), [id, shownHere]);
  return null;
}
/** The counter split's opener, as `CounterSplit` registers it. */
function Pane({ open }: { open: (id: string) => void }) {
  const registerPane = useReaderCollect().registerPane;
  useEffect(() => registerPane((id) => open(id)), [registerPane, open]);
  return null;
}

const TABLE7: ReaderStart = {
  sessionId: "s-7",
  paymentIntentId: "pi_7",
  totalCents: 4210,
  isCounter: false,
  name: { counter: false, display: "7" },
  sentEarly: false,
  cartId: "c-7",
};
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const page = (extra: React.ReactNode = null) => (
  <StaffLangProvider lang="en">
    <ReaderCollectProvider>
      <Probe />
      <StaffBar lang="en" title="kds.title" />
      {extra}
    </ReaderCollectProvider>
  </StaffLangProvider>
);
const chip = () => screen.queryByRole("group", { name: ts("en", "settle.a11y.readerPanel") });
let split = false;

beforeEach(() => {
  vi.useFakeTimers();
  pathname = "/staff/kitchen";
  split = false;
  window.matchMedia = ((q: string) => ({
    matches: split && q === PANE_QUERY,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  terminalStatus.mockReset();
  push.mockReset();
  sessionStorage.clear();
});

describe("ReaderCollectChip — in the bar, never over its own table", () => {
  it("nothing with no collect (and nothing with no provider: a bar mounted bare)", () => {
    render(page());
    expect(chip()).toBeNull();
    cleanup();
    render(<StaffBar lang="en" title="kds.title" />);
    expect(chip()).toBeNull();
  });

  it("collecting off its table: the amount, and a link named for its table — to the table page on a phone", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    const c = chip()!;
    expect(c).not.toBeNull();
    expect(c.closest("header")).not.toBeNull(); // a row of the bar
    expect(c.textContent).toContain(`${ts("en", "settle.reader.onReader")} · $42.10`);
    const link = within(c).getByRole("link", {
      name: tf("en", "floor.pane.open", { x: tf("en", "floor.table", { id: "7" }) }),
    });
    expect(link.getAttribute("href")).toBe("/staff/table/s-7");
    // NOT a live region: the bar's status belongs to the offline row.
    expect(c.querySelector('[role="status"]')).toBeNull();
    expect(c.getAttribute("role")).toBe("group");
  });

  it("hidden while its table is shown here — and back when the table is left", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const r = render(page(<Shows id="s-7" />));
    await act(async () => api.start(TABLE7));
    await tick(0);
    // MUTATION (p2g-reader/chip-shown-over-its-own-table): the bar repeats the panel beside it; red.
    expect(chip()).toBeNull();
    r.rerender(page(<Shows id="s-9" />));
    expect(chip()).not.toBeNull();
  });

  it("at split width the link opens the pane: the split's own opener on this screen, else a push to the pane URL", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    split = true;
    const open = vi.fn();
    const r = render(page(<Pane open={open} />));
    await act(async () => api.start(TABLE7));
    await tick(0);
    const link = () => within(chip()!).getByRole("link");
    await act(async () => {
      fireEvent.click(link());
    });
    // A same-page hash push fires no `hashchange` — the split must be asked directly.
    expect(open).toHaveBeenCalledWith("s-7");
    expect(push).not.toHaveBeenCalled();
    // Another page (no split mounted): the pane URL, a route change the split seeds from.
    r.rerender(page());
    await act(async () => {
      fireEvent.click(link());
    });
    expect(push).toHaveBeenCalledWith(paneUrl("s-7"));
  });

  it("no way in from the lock screen — the table is named, not linked", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    pathname = "/staff/lock";
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    // MUTATION (p2g-reader/chip-links-from-the-lock-screen): a link into the table before the PIN; red.
    expect(within(chip()!).queryByRole("link")).toBeNull();
    expect(chip()!.textContent).toContain(tf("en", "floor.table", { id: "7" }));
  });
});

describe("ReaderCollectChip — the outcomes", () => {
  it("declined: the title and the reason, SAID once through an alert — not again on the next page — and dismissed by a named Close", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    const r = render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    const alert = within(chip()!).getByRole("alert");
    expect(alert.textContent).toContain(ts("en", "settle.reader.failedTitle"));
    expect(alert.textContent).toContain("The card was declined.");
    // The next page: a NEW bar (the chip remounts) — shown, never said twice.
    r.rerender(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
          <main>
            <StaffBar lang="en" title="floor.door.counter" />
          </main>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    expect(chip()!.textContent).toContain(ts("en", "settle.reader.failedTitle"));
    expect(within(chip()!).queryByRole("alert")).toBeNull();
    await act(async () => {
      fireEvent.click(within(chip()!).getByRole("button", { name: ts("en", "shell.close") }));
    });
    expect(chip()).toBeNull();
    expect(api.record).toBeNull();
  });

  it("collecting is never said (nor is it dismissible): the title is the news, the panel the controls", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    expect(within(chip()!).queryByRole("alert")).toBeNull();
    expect(within(chip()!).queryByRole("button")).toBeNull();
  });

  it("a counter order landing off screen: 'Paid · #CODE', its table's link, and a Close that lets it go", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    render(page());
    await act(async () =>
      api.start({ ...TABLE7, isCounter: true, name: { counter: true, display: "reg-7f3a" } }),
    );
    await tick(0);
    const c = chip()!;
    expect(c.textContent).toContain(`${ts("en", "settle.reader.paid")} · #A1B2C3`);
    expect(
      within(c).getByRole("link", {
        name: tf("en", "floor.pane.open", { x: ts("en", "floor.counter") }),
      }),
    ).toBeTruthy();
    expect(c.getAttribute("data-tone")).toBe("ok");
    await act(async () => {
      fireEvent.click(within(c).getByRole("button", { name: ts("en", "shell.close") }));
    });
    expect(chip()).toBeNull();
    expect(api.landed).toBeNull();
  });

  it("charged but slow to record: 'Paid · $' and, past the bound, the honest line — said once", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    expect(chip()!.textContent).toContain(`${ts("en", "settle.reader.paid")} · $42.10`);
    expect(chip()!.textContent).toContain(ts("en", "settle.reader.status.recording"));
    expect(within(chip()!).queryByRole("alert")).toBeNull();
    await tick(20_001);
    await tick(0);
    expect(within(chip()!).getByRole("alert").textContent).toContain(
      ts("en", "settle.reader.status.recordingLong"),
    );
  });
});
