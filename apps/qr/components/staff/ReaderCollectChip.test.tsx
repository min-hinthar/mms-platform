/** @vitest-environment jsdom */
import { useEffect, useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "@mms/ui";
import { PANE_QUERY, paneUrl } from "@/lib/floor-pane";
import { READER_UNRECORDED_MS, type ReaderStart } from "@/lib/reader-collect";

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
const { TerminalCollectPanel } = await import("./TerminalSettle");
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
const page = (extra: React.ReactNode = null, lang: "en" | "my" = "en") => (
  <StaffLangProvider lang={lang}>
    <ReaderCollectProvider>
      <Probe />
      <StaffBar lang={lang} title="kds.title" />
      {extra}
    </ReaderCollectProvider>
  </StaffLangProvider>
);
const chip = () => screen.queryByRole("group", { name: ts("en", "settle.a11y.readerPanel") });
const barTitle = () => document.getElementById("staff-bar-title");
const dismissName = (x: string) => tf("en", "settle.reader.chip.dismiss", { x });
const TABLE_7 = () => tf("en", "floor.table", { id: "7" });
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
    // A11Y-7 — the alert names the table (the View link sits outside it).
    expect(alert.textContent).toContain(TABLE_7());
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
    // A11Y-11 — the ✕ is named by its act AND its subject (the pane's ✕ is the bare "Close").
    const close = within(chip()!).getByRole("button", { name: dismissName(TABLE_7()) });
    close.focus();
    await act(async () => {
      fireEvent.click(close);
    });
    expect(chip()).toBeNull();
    expect(api.record).toBeNull();
    // MUTATION (p2g-fix-reader/chip-close-drops-focus): the ✕ unmounts under the finger and focus
    // falls to <body> — the next Tab starts over and nothing says the dismiss worked; red.
    expect(document.activeElement).toBe(barTitle());
  });

  it("a decline over its own table is the detail's to say: no chip, no alert anywhere in the bar", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    render(page(<Shows id="s-7" />));
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    expect(chip()).toBeNull();
    expect(document.querySelector("header")!.querySelector('[role="alert"]')).toBeNull();
  });

  it("sits in the bar before the offline row (the bar's last child stays the offline row)", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    const kids = [...document.querySelector("header")!.children];
    const at = kids.indexOf(chip()!);
    expect(at).toBeGreaterThan(-1);
    // StaffBarNet's hidden probe is ALWAYS the bar's last child.
    expect(kids.at(-1)!.hasAttribute("hidden")).toBe(true);
    expect(at).toBeLessThan(kids.length - 1);
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
    await tick(0);
    const c = chip()!;
    expect(c.textContent).toContain(`${ts("en", "settle.reader.paid")} · #A1B2C3`);
    expect(
      within(c).getByRole("link", {
        name: tf("en", "floor.pane.open", { x: ts("en", "floor.counter") }),
      }),
    ).toBeTruthy();
    expect(c.getAttribute("data-tone")).toBe("ok");
    // A11Y-5 — SAID once: the code the guest is waiting on, and whose it is.
    // MUTATION (p2g-fix-reader/landing-unsaid): the landing appears silently; red.
    expect(within(c).getByRole("alert").textContent).toBe(
      `${ts("en", "settle.reader.paid")} · #A1B2C3 · ${ts("en", "floor.counter")}`,
    );
    const close = within(c).getByRole("button", { name: dismissName(ts("en", "floor.counter")) });
    close.focus();
    await act(async () => {
      fireEvent.click(close);
    });
    expect(chip()).toBeNull();
    expect(api.landed).toEqual([]);
    expect(document.activeElement).toBe(barTitle());
  });

  it("a TABLE landing off screen: 'Paid · $42.10', its table's link, said once naming the table, and dismissible (PT-1)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    const c = chip()!;
    expect(c.textContent).toContain(`${ts("en", "settle.reader.paid")} · $42.10`);
    expect(c.textContent).not.toContain("#");
    expect(within(c).getByRole("alert").textContent).toBe(
      `${ts("en", "settle.reader.paid")} · $42.10 · ${TABLE_7()}`,
    );
    expect(within(c).getByRole("link", { name: tf("en", "floor.pane.open", { x: TABLE_7() }) }));
    await act(async () => {
      fireEvent.click(within(c).getByRole("button", { name: dismissName(TABLE_7()) }));
    });
    expect(chip()).toBeNull();
  });

  it("two landings off screen: the OLDEST first, each said once; closing one brings the next (M1 · PT-9)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    const counterA = { ...TABLE7, isCounter: true, name: { counter: true, display: "reg-a" } };
    render(page());
    await act(async () => api.start(counterA));
    await tick(0);
    await tick(0);
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00b2b2b2",
      totalCents: 1800,
    });
    await act(async () =>
      api.start({ ...counterA, sessionId: "s-8", paymentIntentId: "pi_8", totalCents: 1800 }),
    );
    await tick(0);
    await tick(0);
    expect(chip()!.textContent).toContain("#A1B2C3");
    await act(async () => {
      fireEvent.click(within(chip()!).getByRole("button", { name: /Dismiss/ }));
    });
    await tick(0);
    expect(chip()!.textContent).toContain("#B2B2B2");
    expect(within(chip()!).getByRole("alert").textContent).toContain("#B2B2B2");
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

  it("a charge never recorded: given up, it says not to take payment again — said once, and Close puts it away (C1)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    // Not dismissible while it still records — the panel's "Hide this" is the way to put it away.
    expect(within(chip()!).queryByRole("button")).toBeNull();
    await tick(READER_UNRECORDED_MS);
    await tick(0);
    const c = chip()!;
    expect(c.getAttribute("data-tone")).toBe("warn");
    expect(within(c).getByRole("alert").textContent).toContain(
      ts("en", "settle.reader.status.unrecorded"),
    );
    await act(async () => {
      fireEvent.click(within(c).getByRole("button", { name: dismissName(TABLE_7()) }));
    });
    expect(chip()).toBeNull();
    expect(api.record).toBeNull();
  });

  it("the chip's blind line points at the order, never at a Cancel it does not have (PT-8)", async () => {
    terminalStatus.mockResolvedValue(null);
    render(page());
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(2500);
    await tick(2500);
    expect(chip()!.textContent).toContain(ts("en", "settle.reader.chip.blind"));
    expect(chip()!.textContent).not.toContain(ts("en", "settle.reader.status.blind"));
  });
});

describe("ReaderCollectChip — what is SAID, and when it can be heard", () => {
  const declined = {
    ok: true,
    state: "failed",
    error: "The card was declined.",
  } as const;

  it("a decline while a modal Sheet hides the bar is kept PENDING — said the moment the Sheet closes (A11Y-1)", async () => {
    terminalStatus.mockResolvedValue(declined);
    const sheet = (open: boolean) => (
      <Sheet open={open} onOpenChange={() => {}} title="Oldest orders">
        <p>older</p>
      </Sheet>
    );
    const r = render(page(sheet(true)));
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    // Radix's `hideOthers` put the bar inside an aria-hidden subtree (the chip is there, unheard).
    const bare = () => document.querySelector<HTMLElement>(".staff-reader");
    expect(bare()).not.toBeNull();
    expect(bare()!.closest('[aria-hidden="true"]')).not.toBeNull();
    // MUTATION (p2g-fix-reader/chip-says-it-under-a-modal): said into the hidden subtree and marked
    // said — never heard, never said again; red.
    expect(api.alertSaid.has("pi_7:failed")).toBe(false);
    expect(document.querySelector('.staff-reader [role="alert"]')).toBeNull();
    r.rerender(page(sheet(false)));
    await tick(0);
    await tick(0);
    expect(chip()!.closest('[aria-hidden="true"]')).toBeNull();
    expect(within(chip()!).getByRole("alert").textContent).toContain(
      ts("en", "settle.reader.failedTitle"),
    );
    expect(api.alertSaid.has("pi_7:failed")).toBe(true);
  });

  it("a decline the table's own region already said is NOT said again when the table is left (A11Y-6)", async () => {
    terminalStatus.mockResolvedValue(declined);
    const onStatus = vi.fn();
    const onTable = (
      <>
        <Shows id="s-7" />
        <TerminalCollectPanel sessionId="s-7" onStatus={onStatus} />
      </>
    );
    const r = render(page(onTable));
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    expect(onStatus).toHaveBeenLastCalledWith({ tone: "warn", msg: "The card was declined." });
    // "← Floor" without "Back to payment": the table is no longer shown, the chip takes over.
    r.rerender(page());
    await tick(0);
    await tick(0);
    expect(chip()!.textContent).toContain(ts("en", "settle.reader.failedTitle"));
    // MUTATION (p2g-fix-reader/panel-never-marks-said): the floor's chip says the same decline a
    // second time, assertively, over the arrival; red.
    expect(within(chip()!).queryByRole("alert")).toBeNull();
  });

  it("the alert is echo-free and names the table in the device tongue; the visible row is never live and is hidden from the ear while it stands (A11Y-7)", async () => {
    terminalStatus.mockResolvedValue(declined);
    render(page(null, "my"));
    await act(async () => api.start(TABLE7));
    await tick(0);
    await tick(0);
    const group = document.querySelector<HTMLElement>(".staff-reader")!;
    const alert = within(group).getByRole("alert");
    // MUTATION (p2g-fix-reader/chip-alert-echoes): the K15-HIGH title keeps its English echo inside
    // the alert — the announcement says the title twice; red.
    expect(alert.querySelector(".chrome-en")).toBeNull();
    expect(alert.textContent).toContain(ts("my", "settle.reader.failedTitle"));
    // MUTATION (p2g-fix-reader/chip-alert-nameless): the alert does not say whose payment failed; red.
    expect(alert.textContent).toContain(tf("my", "floor.table", { id: "7" }));
    const visible = group.querySelector(".staff-reader-text")!;
    expect(visible.getAttribute("role")).toBeNull();
    expect(visible.querySelector("[role]")).toBeNull();
    // MUTATION (p2g-fix-reader/chip-said-twice-in-browse): the visible row stays exposed beside the
    // sr-only alert — a browse pass reads the outcome twice; red.
    expect(visible.getAttribute("aria-hidden")).toBe("true");
  });
});
