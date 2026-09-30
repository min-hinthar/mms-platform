/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { echoesShown, scriptOf, type StaffLangMode } from "@/lib/staff-lang";

const setStaffLang = vi.fn();
const refresh = vi.fn();
const haptic = vi.fn();
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: (v: unknown) => setStaffLang(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/haptics", () => ({ haptic: (k: unknown) => haptic(k) }));

const { StaffLangRows, StaffLangSection } = await import("./StaffLangSwitch");
const { useLangModeWrite } = await import("./useLangModeWrite");
const { StaffLangProvider } = await import("./StaffLangProvider");
const { ViewStatusProvider } = await import("./ViewStatus");
const { STAFF } = await import("@/lib/i18n/staff");

/**
 * P2e — the three language rows (the Help sheet's view, the Profile's card) and the Profile's card.
 *
 * The rows are a pure VIEW over a host's `useLangModeWrite`; `Harness` below is the smallest host.
 * Names are the autonyms (exact — "မြန်မာ English" needs the literal space between the two block
 * spans, or the computed name runs together); the description rides `aria-describedby`; the tick
 * and the lit cap say which is on; nothing is ever disabled. The write is the same chain the pill
 * rides (moves at the tap, reverts to confirmed, one refresh), and the three tap outcomes are what
 * the Help sheet's close decision reads.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  setStaffLang.mockReset();
  refresh.mockReset();
  haptic.mockReset();
  setStaffLang.mockImplementation(async (v: { mode: StaffLangMode }) => ({
    ok: true,
    mode: v.mode,
  }));
});

const Host = ({ mode, children }: { mode: StaffLangMode; children: ReactNode }) => (
  <StaffLangProvider lang={scriptOf(mode)} echoes={echoesShown(mode)}>
    {children}
  </StaffLangProvider>
);
const settled = vi.fn();
const sameConfirmed = vi.fn();
function Harness({ focusOnMount = false }: { focusOnMount?: boolean }) {
  const write = useLangModeWrite({ onSettled: settled });
  return (
    <>
      <StaffLangRows write={write} focusOnMount={focusOnMount} onSameConfirmed={sameConfirmed} />
      {write.alert && (
        <p role="alert" className="staff-lang-msg">
          failed
        </p>
      )}
    </>
  );
}
const mount = (mode: StaffLangMode = "both", focusOnMount = false) =>
  render(
    <Host mode={mode}>
      <Harness focusOnMount={focusOnMount} />
    </Host>,
  );
const row = (name: string) => screen.getByRole("button", { name });
const pressedName = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.getAttribute("data-mode"));
function held<T>() {
  let release!: (v: T) => void;
  const p = new Promise<T>((r) => {
    release = r;
  });
  return { p, release };
}
beforeEach(() => {
  settled.mockReset();
  sameConfirmed.mockReset();
});

describe("StaffLangRows — names, order, state", () => {
  it("three rows, Burmese · Both · English, named by their AUTONYMS exactly", () => {
    const { container } = mount("both");
    const rows = [...container.querySelectorAll(".staff-lang-row")];
    expect(rows.map((r) => r.getAttribute("data-mode"))).toEqual(["my-only", "both", "en"]);
    expect(row("မြန်မာ").getAttribute("data-mode")).toBe("my-only");
    expect(row("မြန်မာ English").getAttribute("data-mode")).toBe("both");
    expect(row("English").getAttribute("data-mode")).toBe("en");
    // The Both row's LABEL carries a literal space between its two samples. jsdom's name
    // computation pads element boundaries by itself (measured: the query above passes with the
    // space deleted), so the DOM text is the assertion that can fail — a browser computing the name
    // from inline runs would read "မြန်မာEnglish".
    const both = row("မြန်မာ English");
    expect(document.getElementById(both.getAttribute("aria-labelledby")!)!.textContent).toBe(
      "မြန်မာ English",
    );
  });

  it("each row is DESCRIBED by its plain line, in the device's own mode", () => {
    mount("en");
    const d = (name: string) =>
      document.getElementById(row(name).getAttribute("aria-describedby")!)!.textContent;
    expect(d("မြန်မာ")).toBe(STAFF["shell.lang.mode.myOnly"].en);
    expect(d("မြန်မာ English")).toBe(STAFF["shell.lang.mode.both"].en);
    expect(d("English")).toBe(STAFF["shell.lang.mode.en"].en);
  });

  it.each(["my-only", "both", "en"] as const)(
    "under %s exactly that row is pressed, with its tick",
    (mode) => {
      const { container } = mount(mode);
      expect(pressedName()).toEqual([mode]);
      const on = container.querySelector('.staff-lang-row[aria-pressed="true"]')!;
      expect(on.querySelector(".staff-lang-tick")).not.toBeNull();
    },
  );

  it("the group is named — by the sr-only device name when the host has no heading", () => {
    mount("en");
    expect(screen.getByRole("group", { name: "This device’s language" })).toBeTruthy();
  });

  it("no literal aria-label anywhere — the visible text is the name", () => {
    const { container } = mount("both");
    expect(container.querySelector("[aria-label]")).toBeNull();
  });
});

describe("StaffLangRows — the write", () => {
  it("another row: the cap moves BEFORE the write lands, one buzz, one write, one refresh, one settle", async () => {
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    mount("both");
    fireEvent.click(row("English"));
    expect(pressedName()).toEqual(["en"]);
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("pick");
    await act(async () => w.release({ ok: true, mode: "en" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }]]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls).toEqual([[{ wrote: true, alert: false, confirmed: "en" }]]);
  });

  it("the pick yields to the server once the provider catches up", async () => {
    const { rerender } = mount("both");
    fireEvent.click(row("မြန်မာ"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <Host mode="my-only">
        <Harness />
      </Host>,
    );
    expect(pressedName()).toEqual(["my-only"]);
    rerender(
      <Host mode="en">
        <Harness />
      </Host>,
    );
    expect(pressedName()).toEqual(["en"]);
  });

  it("a tap on the CONFIRMED row with nothing in flight: no write, no buzz, and the host hears it", async () => {
    mount("both");
    fireEvent.click(row("မြန်မာ English"));
    await Promise.resolve();
    expect(setStaffLang).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
    expect(sameConfirmed).toHaveBeenCalledTimes(1);
  });

  it("a second tap on the PENDING row: no write, no buzz, and the host is NOT told to close", async () => {
    const w = held<{ ok: false; error: string }>();
    setStaffLang.mockReturnValue(w.p);
    mount("both");
    fireEvent.click(row("English"));
    fireEvent.click(row("English"));
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(sameConfirmed).not.toHaveBeenCalled();
    await act(async () => w.release({ ok: false, error: "nope" }));
    expect(screen.getByRole("alert")).toBeTruthy(); // the outcome still lands where it can be seen
  });

  it.each([
    ["a refusal", () => setStaffLang.mockResolvedValue({ ok: false, error: "nope" })],
    ["a rejection", () => setStaffLang.mockRejectedValue(new Error("offline"))],
  ] as const)(
    "%s: the cap reverts to confirmed, no refresh, the host's line shows",
    async (_, arm) => {
      arm();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      mount("both");
      fireEvent.click(row("English"));
      await screen.findByRole("alert");
      expect(pressedName()).toEqual(["both"]);
      expect(refresh).not.toHaveBeenCalled();
      expect(settled.mock.calls).toEqual([[{ wrote: false, alert: true, confirmed: "both" }]]);
      spy.mockRestore();
    },
  );

  it("a 15 s hang: the cap reverts at 15 000, not before", async () => {
    vi.useFakeTimers();
    setStaffLang.mockReturnValue(new Promise(() => {}));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mount("both");
    fireEvent.click(row("English"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(pressedName()).toEqual(["en"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pressedName()).toEqual(["both"]);
    expect(screen.getByRole("alert")).toBeTruthy();
    spy.mockRestore();
  });

  it("in flight: the GROUP is busy, no row is disabled or aria-disabled, focus stays on the tapped row", async () => {
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    mount("both");
    const target = row("English");
    target.focus();
    fireEvent.click(target);
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("true");
    for (const b of screen.getAllByRole("button")) {
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    }
    expect(document.activeElement).toBe(target);
    await act(async () => w.release({ ok: true, mode: "en" }));
    expect(screen.getByRole("group").hasAttribute("aria-busy")).toBe(false);
  });

  it("a provider change landing MID-WRITE never moves the cap off the pick in flight", async () => {
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    const { rerender } = mount("both");
    fireEvent.click(row("English"));
    // An earlier write's refresh (or another tab) lands while this write is out.
    rerender(
      <Host mode="my-only">
        <Harness />
      </Host>,
    );
    expect(pressedName()).toEqual(["en"]);
    await act(async () => w.release({ ok: true, mode: "en" }));
    expect(pressedName()).toEqual(["en"]); // the cap is what the chain KNOWS the server holds
    rerender(
      <Host mode="en">
        <Harness />
      </Host>,
    );
    expect(pressedName()).toEqual(["en"]);
  });

  it("a STALE provider mode landing mid-chain never becomes the chain's confirmed value", async () => {
    const { rerender } = mount("both");
    // Chain 1 writes English; its refresh has not landed (the provider still says Both).
    fireEvent.click(row("English"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Chain 2: Burmese only, corrected to Both while it is out.
    const w2 = held<{ ok: true; mode: StaffLangMode }>();
    const w3 = held<{ ok: false; error: string }>();
    setStaffLang.mockReturnValueOnce(w2.p).mockReturnValueOnce(w3.p);
    fireEvent.click(row("မြန်မာ"));
    fireEvent.click(row("မြန်မာ English"));
    await act(async () => w2.release({ ok: true, mode: "my-only" }));
    expect(setStaffLang.mock.calls.at(-1)).toEqual([{ mode: "both" }]);
    // Chain 1's refresh lands NOW, mid-chain: English, already outdated by write 2.
    rerender(
      <Host mode="en">
        <Harness />
      </Host>,
    );
    await act(async () => w3.release({ ok: false, error: "nope" }));
    // The server holds Burmese only (write 2) — never the stale English the refresh carried.
    expect(pressedName()).toEqual(["my-only"]);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("a chain that wrote NOTHING adopts the provider's mid-chain word: the server already holds the wish → no line", async () => {
    const w = held<{ ok: false; error: string }>();
    setStaffLang.mockReturnValue(w.p);
    const { rerender } = mount("both");
    fireEvent.click(row("English"));
    // Another tab sets English while this write is out; its refresh lands mid-chain.
    rerender(
      <Host mode="en">
        <Harness />
      </Host>,
    );
    await act(async () => w.release({ ok: false, error: "nope" }));
    expect(pressedName()).toEqual(["en"]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(settled.mock.calls).toEqual([[{ wrote: false, alert: false, confirmed: "en" }]]);
  });

  // What can fail here is the effect's DEPS: without `[focusOnMount]` every render re-focuses the
  // pressed row, and this rerender pulls focus off the row the person moved to.
  // (See also "review C1" below: the write the 15 s timeout abandons.)
  it("focusOnMount lands on the PRESSED row, not the first — and a rerender does not re-focus", () => {
    const { rerender } = mount("en", true);
    expect(document.activeElement).toBe(row("English"));
    row("မြန်မာ").focus();
    rerender(
      <Host mode="en">
        <Harness focusOnMount />
      </Host>,
    );
    expect(document.activeElement).toBe(row("မြန်မာ"));
  });
});

/**
 * P2e review C1 — the write the 15 s timeout gives up on is NOT cancelled: a Server Action cannot
 * be, and its own response re-renders the page with the cookie it set (Next 16.2.9's
 * server-action-reducer, measured — see useLangModeWrite's docblock). Every earlier 15 s case used a
 * promise that never settles, so the landing itself was never exercised. These let it LAND after
 * `advanceTimersByTimeAsync(15_000)` and pin the invariant: the last mode the person picked is what
 * the cookie ends on, or a failure line that is true says it is not.
 */
describe("StaffLangRows — review C1: a write abandoned at 15 s that LANDS later", () => {
  const spy = () => vi.spyOn(console, "error").mockImplementation(() => {});
  const giveUp = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

  it("it carried the person's pick: the failure line it outdated goes, and the cap and page follow", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p);
    mount("both");
    fireEvent.click(row("English"));
    await giveUp();
    expect(screen.getByRole("alert")).toBeTruthy(); // true at 15 s: nothing confirmed
    expect(pressedName()).toEqual(["both"]);
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(screen.queryByRole("alert")).toBeNull(); // the cookie IS English now — no stale line
    expect(pressedName()).toEqual(["en"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls.at(-1)).toEqual([{ wrote: true, alert: false, confirmed: "en" }]);
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    e.mockRestore();
  });

  it("the auditor's case: English, corrected to Both, English hangs past 15 s then lands — Both is written again", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p);
    mount("both");
    fireEvent.click(row("English"));
    fireEvent.click(row("မြန်မာ English")); // the correction, while English is out
    await giveUp();
    // Nothing to say yet: the device IS on Both, the person's pick.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }]]);
    // English lands (its own response turns the console English) — the chain answers it.
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "both" }]]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pressedName()).toEqual(["both"]);
    e.mockRestore();
  });

  it("after the line, a tap on the mode the device holds IS the latest pick: the late English is corrected", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p);
    mount("both");
    fireEvent.click(row("English"));
    await giveUp();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(row("မြန်မာ English")); // "fine, keep Both" — no write, the line answered
    expect(sameConfirmed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "both" }]]);
    e.mockRestore();
  });

  it("the correction is on the cap while it is out — even as the late write's own re-render lands", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    const w2 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p).mockReturnValueOnce(w2.p);
    const { rerender } = mount("both");
    fireEvent.click(row("English"));
    fireEvent.click(row("မြန်မာ English"));
    await giveUp();
    await act(async () => w1.release({ ok: true, mode: "en" }));
    // English's response re-rendered the page in English while Both goes out again.
    rerender(
      <Host mode="en">
        <Harness />
      </Host>,
    );
    expect(pressedName()).toEqual(["both"]);
    await act(async () => w2.release({ ok: true, mode: "both" }));
    expect(pressedName()).toEqual(["both"]);
    e.mockRestore();
  });

  it("the correction refused: the device sits on the mode they left, and the line says so", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang
      .mockReturnValueOnce(w1.p)
      .mockResolvedValueOnce({ ok: false, error: "nope" } as never);
    mount("both");
    fireEvent.click(row("English"));
    fireEvent.click(row("မြန်မာ English"));
    await giveUp();
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(setStaffLang).toHaveBeenCalledTimes(2);
    // The provider here has not caught up (still Both) — the chain must judge against the English
    // it KNOWS landed, not the provider's stale word.
    expect(screen.getByRole("alert")).toBeTruthy();
    e.mockRestore();
  });

  it("a late landing that is no longer the NEWEST write decides nothing — the newer one lands after it", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    const w2 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p).mockReturnValueOnce(w2.p);
    mount("both");
    fireEvent.click(row("English"));
    await giveUp();
    fireEvent.click(row("မြန်မာ")); // a new chain: Next sends it only after English settles
    expect(setStaffLang).toHaveBeenCalledTimes(2);
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(setStaffLang).toHaveBeenCalledTimes(2); // no third write chasing a stale landing
    await act(async () => w2.release({ ok: true, mode: "my-only" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "my-only" }]]);
    expect(pressedName()).toEqual(["my-only"]);
    expect(screen.queryByRole("alert")).toBeNull();
    e.mockRestore();
  });

  it("…and across HOSTS: a card's abandoned write never overrides the pick another control wrote since", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    const w2 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p).mockReturnValueOnce(w2.p);
    render(
      <Host mode="both">
        <div data-testid="a">
          <Harness />
        </div>
        <div data-testid="b">
          <Harness />
        </div>
      </Host>,
    );
    const a = within(screen.getByTestId("a"));
    const b = within(screen.getByTestId("b"));
    fireEvent.click(a.getByRole("button", { name: "English" }));
    fireEvent.click(a.getByRole("button", { name: "မြန်မာ English" }));
    await giveUp();
    fireEvent.click(b.getByRole("button", { name: "မြန်မာ" }));
    await act(async () => w1.release({ ok: true, mode: "en" }));
    // Host A's latest pick was Both, but Burmese only went out after it: A writes nothing.
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "my-only" }]]);
    await act(async () => w2.release({ ok: true, mode: "my-only" }));
    expect(setStaffLang).toHaveBeenCalledTimes(2);
    e.mockRestore();
  });

  it("a late REFUSAL changed nothing: no write, no refresh, no line", async () => {
    vi.useFakeTimers();
    const e = spy();
    const w1 = held<{ ok: false; error: string }>();
    setStaffLang.mockReturnValueOnce(w1.p);
    mount("both");
    fireEvent.click(row("English"));
    fireEvent.click(row("မြန်မာ English"));
    await giveUp();
    await act(async () => w1.release({ ok: false, error: "nope" }));
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    e.mockRestore();
  });
});

// ── the Profile's card ──────────────────────────────────────────────────────────────────────────
function Profile({ mode, withView = true }: { mode: StaffLangMode; withView?: boolean }) {
  const lang = scriptOf(mode);
  const section = <StaffLangSection />;
  return (
    <Host mode={mode}>
      {withView ? <ViewStatusProvider lang={lang}>{section}</ViewStatusProvider> : section}
    </Host>
  );
}

describe("StaffLangSection — the Profile's language card", () => {
  it.each(["en", "my-only"] as const)(
    "under %s the heading and the scope are BOTH tongues; the note follows the device",
    (mode) => {
      const { container } = render(<Profile mode={mode} />);
      const h2 = screen.getByRole("heading", { level: 2 });
      expect(h2.id).toBe("lang-h");
      expect(h2.querySelector('[lang="my"]')?.textContent).toBe(STAFF["shell.lang.row"].my);
      expect(h2.querySelector(".chrome-en")?.textContent).toBe(STAFF["shell.lang.row"].en);
      const scope = container.querySelector(".entry-note")!;
      expect(scope.querySelector('[lang="my"]')?.textContent).toBe(STAFF["shell.lang.scope"].my);
      expect(scope.querySelector(".chrome-en")?.textContent).toBe(STAFF["shell.lang.scope"].en);
      const note = container.querySelector(".staff-lang-note")!;
      expect(note.textContent).toBe(
        mode === "en" ? STAFF["shell.lang.note"].en : STAFF["shell.lang.note"].my,
      );
      // The card's group is named by its visible heading.
      expect(screen.getByRole("group").getAttribute("aria-labelledby")).toBe("lang-h");
    },
  );

  // The failure line's `keepEcho` only CHANGES anything on a Burmese-only device (English and Both
  // draw the echo anyway), so each failure case runs there too — review found the line's English
  // could be dropped with every suite green.
  it.each(["both", "my-only"] as const)(
    "under %s, inside the view's ONE region: a failure is spoken there, the visible line is aria-hidden and both tongues, no second region",
    async (mode) => {
      setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
      const { container } = render(<Profile mode={mode} />);
      fireEvent.click(row("English"));
      await waitFor(() => expect(container.querySelector(".staff-lang-msg")).not.toBeNull());
      const line = container.querySelector(".staff-lang-msg")!;
      expect(line.getAttribute("aria-hidden")).toBe("true");
      expect(line.hasAttribute("role")).toBe(false);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      // The line itself: both tongues whatever the device — the English half EXACTLY.
      expect(line.querySelector('[lang="my"]')?.textContent).toBe(STAFF["shell.lang.failed"].my);
      expect(line.querySelector(".chrome-en")?.textContent).toBe(STAFF["shell.lang.failed"].en);
      const region = container.querySelector('[role="status"]')!;
      expect(region.textContent).toBe(STAFF["shell.lang.failed"].my);
      // The next tap answers it — the region clears with the line.
      setStaffLang.mockImplementation(async (v: { mode: StaffLangMode }) => ({
        ok: true,
        mode: v.mode,
      }));
      fireEvent.click(row("English"));
      expect(region.textContent).toBe("");
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(container.querySelector(".staff-lang-msg")).toBeNull();
    },
  );

  it("review C1 — a write abandoned at 15 s that then LANDS the pick clears the view's region too", async () => {
    vi.useFakeTimers();
    const e = vi.spyOn(console, "error").mockImplementation(() => {});
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p);
    const { container } = render(<Profile mode="both" />);
    fireEvent.click(row("English"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    const region = container.querySelector('[role="status"]')!;
    expect(region.textContent).toBe(STAFF["shell.lang.failed"].my);
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(container.querySelector(".staff-lang-msg")).toBeNull();
    expect(region.textContent).toBe(""); // no stale "Couldn't save that" left for a reader to find
    e.mockRestore();
  });

  it.each(["en", "my-only"] as const)(
    "under %s with NO view provider the line is the role=alert itself, both tongues",
    async (mode) => {
      setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
      render(<Profile mode={mode} withView={false} />);
      fireEvent.click(row("မြန်မာ English"));
      const alert = await screen.findByRole("alert");
      expect(alert.className).toBe("staff-lang-msg");
      expect(alert.querySelector('[lang="my"]')?.textContent).toBe(STAFF["shell.lang.failed"].my);
      expect(alert.querySelector(".chrome-en")?.textContent).toBe(STAFF["shell.lang.failed"].en);
    },
  );
});

/**
 * LEARNINGS #101 — every rule globals.css writes against the rows, their samples, descriptions,
 * tick, failure line, note and card must match a rendered card in SOME state (at rest · in flight
 * · failed); pseudo-classes are stripped. And the pressed row declares no fill of its own (the one
 * lit cap is KdsBoard.test's), while its description takes the cap's ink.
 */
describe("the rows' CSS matches the DOM they render", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sels: m[1]!
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    body: m[2]!,
  }));
  const ROWS = /\.staff-lang-(?:rows?|sample|auto|desc|tick|msg|note|card)(?![-\w])/;
  const selectors = [...new Set(rules.flatMap((r) => r.sels).filter((sel) => ROWS.test(sel)))]
    .filter((sel) => !sel.startsWith("@"))
    .map((sel) => sel.replace(/:(?:focus-visible|hover|active)/g, ""));

  it("names the rows, the samples, the description, the tick, the line, the note and the card", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(15);
  });

  it.each(selectors)("%s matches a rendered card in some state", async (sel) => {
    const hits: string[] = [];
    let r = render(<Profile mode="both" withView={false} />);
    if (r.container.querySelector(sel)) hits.push("rest");
    cleanup();
    setStaffLang.mockReturnValue(new Promise(() => {}));
    r = render(<Profile mode="both" withView={false} />);
    fireEvent.click(row("English"));
    if (r.container.querySelector(sel)) hits.push("busy");
    cleanup();
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    r = render(<Profile mode="both" withView={false} />);
    fireEvent.click(row("English"));
    await screen.findByRole("alert");
    if (r.container.querySelector(sel)) hits.push("failed");
    expect(hits, `${sel} matched no rendered state`).not.toEqual([]);
  });

  it("the pressed row's description takes the cap's ink; no pressed-row fill outside the shared cap", () => {
    const desc = rules.find((r) =>
      r.sels.includes('.staff-lang-row[aria-pressed="true"] .staff-lang-desc'),
    );
    expect(desc?.body).toMatch(/color:\s*inherit/);
    const fills = rules.filter(
      (r) =>
        r.sels.some((sel) => /\.staff-lang-row\[aria-pressed="true"\]$/.test(sel)) &&
        /background:/.test(r.body),
    );
    expect(fills).toHaveLength(1);
    expect(fills[0]!.sels).toContain('.kds-chip[aria-pressed="true"]'); // the ONE lit cap
  });
});
