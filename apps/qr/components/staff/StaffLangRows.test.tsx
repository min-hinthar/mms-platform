/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("inside the view's ONE region: a failure is spoken there, the visible line is aria-hidden, no second region", async () => {
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    const { container } = render(<Profile mode="both" />);
    fireEvent.click(row("English"));
    await waitFor(() => expect(container.querySelector(".staff-lang-msg")).not.toBeNull());
    const line = container.querySelector(".staff-lang-msg")!;
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.hasAttribute("role")).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // The line itself: both tongues whatever the device.
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
  });

  it("with NO view provider the line is the role=alert itself", async () => {
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    render(<Profile mode="en" withView={false} />);
    fireEvent.click(row("မြန်မာ English"));
    const alert = await screen.findByRole("alert");
    expect(alert.className).toBe("staff-lang-msg");
    expect(alert.querySelector('[lang="my"]')).not.toBeNull(); // both tongues under English
  });
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
