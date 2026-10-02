/** @vitest-environment jsdom */
import { Component, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { echoesShown, scriptOf, type StaffLangMode } from "@/lib/staff-lang";
import { youngWrite } from "@/lib/bounded-write";

const setStaffLang = vi.fn();
const refresh = vi.fn();
const haptic = vi.fn();
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: (v: unknown) => setStaffLang(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/haptics", () => ({ haptic: (k: unknown) => haptic(k) }));

const { StaffLangSwitch } = await import("./StaffLangSwitch");
const { StaffLangProvider } = await import("./StaffLangProvider");
const { STAFF } = await import("@/lib/i18n/staff");

/**
 * P2 · P2e — the front doors' pill.
 *
 * ⚠️ THE CAP NOW MOVES AT THE TAP, and this suite used to pin the opposite ("pressed is derived from
 * the lang PROP"), because a local cap "claims a language the server never stored" when the write
 * fails. That worry is answered, not dropped: every failure path snaps the cap back to the value the
 * server is KNOWN to hold (`langChainOutcome`, §4.4), and the only time the cap leads the page is
 * after a tap, before its write and refresh land. The cases below pin exactly that — at the tap,
 * after an ok, after a refusal, a rejection and a 15 s hang, and after a correction mid-flight.
 *
 * The pill writes a MODE (`{ mode }`), resolved against the chain's BASE — the mode confirmed when
 * the chain began, or now between chains (review C2): tapping the script the device already reads
 * keeps its mode (Burmese-only stays Burmese-only, however often it is tapped mid-chain).
 *
 * (`@testing-library/jest-dom` and `user-event` are not dependencies here — assertions read
 * attributes directly and clicks go through `fireEvent`, matching `TicketText.test.tsx`.)
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
const mount = (mode: StaffLangMode = "both") =>
  render(
    <Host mode={mode}>
      <StaffLangSwitch />
    </Host>,
  );
const my = () => screen.getByRole("button", { name: "မြန်မာ" });
const en = () => screen.getByRole("button", { name: "English" });
const pressed = (b: HTMLElement) => b.getAttribute("aria-pressed");
/** A promise the test settles by hand — a write held in flight. */
function held<T>() {
  let release!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const p = new Promise<T>((r, j) => {
    release = r;
    fail = j;
  });
  return { p, release, fail };
}

class Boundary extends Component<{ children: ReactNode; onCatch: (e: unknown) => void }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    this.props.onCatch(e);
  }
  render() {
    return this.state.failed ? <p>boundary</p> : this.props.children;
  }
}

describe("StaffLangSwitch — the pill", () => {
  it.each([
    ["both", "true", "false"],
    ["my-only", "true", "false"],
    ["en", "false", "true"],
  ] as const)("under %s presses the device's SCRIPT", (mode, myPressed, enPressed) => {
    mount(mode);
    expect(pressed(my())).toBe(myPressed);
    expect(pressed(en())).toBe(enPressed);
  });

  it("marks the Burmese autonym and leaves the English one ambient — two buttons, always", () => {
    const { container } = mount("en");
    expect(my().getAttribute("lang")).toBe("my");
    expect(en().hasAttribute("lang")).toBe(false);
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("names the group by the DEVICE — the English now says what the Burmese always did", () => {
    mount("en");
    expect(screen.getByRole("group", { name: "This device’s language" })).toBeTruthy();
    expect(STAFF["shell.lang.group"].my).toBe("စက်၏ ဘာသာစကား");
  });

  it("mounts no POLITE region — each staff view keeps its one role=status", () => {
    const { container } = mount("both");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("under Both, English writes the mode `en` once and refreshes once", async () => {
    mount("both");
    fireEvent.click(en());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }]]);
    expect(haptic).toHaveBeenCalledWith("pick");
  });

  it("from English, မြန်မာ restores the DEFAULT, Both", async () => {
    mount("en");
    fireEvent.click(my());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "both" }]]);
  });

  it.each(["both", "my-only"] as const)(
    "under %s, a tap on the pressed segment does nothing — no write, no refresh, no buzz",
    async (mode) => {
      mount(mode);
      fireEvent.click(my());
      await Promise.resolve();
      expect(setStaffLang).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(haptic).not.toHaveBeenCalled();
    },
  );

  it("the cap moves AT THE TAP, before the write lands", async () => {
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    mount("both");
    fireEvent.click(en());
    expect(pressed(en())).toBe("true");
    expect(pressed(my())).toBe("false");
    await act(async () => w.release({ ok: true, mode: "en" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the language save in flight is a young WRITE — a reload for a new build is refused for it (Phase 2i)", async () => {
    setStaffLang.mockReturnValue(new Promise(() => {}));
    mount("both");
    expect(youngWrite()).toBe(false);
    fireEvent.click(en());
    await act(async () => {});
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    // MUTATION (p2i-kind/lang-write): the save's race labels it a read — a reload lands over a
    // language choice still being written; red.
    expect(youngWrite()).toBe(true);
  });

  it("two taps inside ONE act write once — the latch is a ref, read at the tap", async () => {
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    mount("both");
    act(() => {
      fireEvent.click(en());
      fireEvent.click(en());
    });
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1);
    await act(async () => w.release({ ok: true, mode: "en" }));
  });

  it("a correction in flight is written AFTER, the last pick wins, and the page refreshes ONCE", async () => {
    const first = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(first.p);
    mount("both");
    fireEvent.click(en());
    fireEvent.click(my()); // the brushed "English", corrected at once
    expect(pressed(my())).toBe("true");
    await act(async () => first.release({ ok: true, mode: "en" }));
    await waitFor(() => expect(setStaffLang).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "both" }]]);
    expect(pressed(my())).toBe("true");
  });

  it("Burmese-only survives a mis-tap corrected while the English write is out", async () => {
    const first = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(first.p);
    mount("my-only");
    fireEvent.click(en());
    fireEvent.click(my()); // resolved against the CONFIRMED mode — still my-only
    await act(async () => first.release({ ok: true, mode: "en" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "my-only" }]]);
  });

  // Review C2 — the pill resolves its script against a base that cannot move mid-chain. After the
  // English write lands (confirmed = en) with Burmese only still to go, a THIRD tap on မြန်မာ used to
  // resolve against English → Both, and the device ended on Both after the person had tapped
  // Burmese twice.
  it("a repeated မြန်မာ during ONE chain never changes the pick — Burmese-only stays Burmese-only", async () => {
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    const w2 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p).mockReturnValueOnce(w2.p);
    mount("my-only");
    fireEvent.click(en());
    fireEvent.click(my()); // the correction
    await act(async () => w1.release({ ok: true, mode: "en" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "my-only" }]]);
    fireEvent.click(my()); // again, while Burmese-only is out
    expect(haptic).toHaveBeenCalledTimes(2); // same-pending: no buzz for a tap that changes nothing
    await act(async () => w2.release({ ok: true, mode: "my-only" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "en" }], [{ mode: "my-only" }]]);
    expect(pressed(my())).toBe("true");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the base is the mode confirmed when THIS chain began — never an older one", async () => {
    const w1 = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(w1.p);
    const { rerender } = mount("my-only");
    rerender(
      <Host mode="en">
        <StaffLangSwitch />
      </Host>,
    ); // another tab set this device to English
    fireEvent.click(my()); // from English: the default, Both
    fireEvent.click(en());
    fireEvent.click(my()); // still from English → Both, not the Burmese-only it once was
    await act(async () => w1.release({ ok: true, mode: "both" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "both" }]]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a refusal reverts the cap to CONFIRMED, never refreshes, and says so beneath", async () => {
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    mount("both");
    fireEvent.click(en());
    await screen.findByRole("alert");
    expect(refresh).not.toHaveBeenCalled();
    expect(pressed(my())).toBe("true");
    expect(pressed(en())).toBe("false");
  });

  it("a REJECTED action shows the line and throws NOTHING — the board is never replaced", async () => {
    // Red on the pre-P2e switch: an `await` inside an async transition is rethrown to the nearest
    // error boundary under React 19, which on the console is the whole screen.
    setStaffLang.mockRejectedValue(new Error("offline"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onCatch = vi.fn();
    render(
      <Host mode="both">
        <Boundary onCatch={onCatch}>
          <StaffLangSwitch />
        </Boundary>
      </Host>,
    );
    fireEvent.click(en());
    await screen.findByRole("alert");
    expect(onCatch).not.toHaveBeenCalled();
    expect(pressed(my())).toBe("true");
    spy.mockRestore();
  });

  it("a HUNG write gives up at 15 s — not at 14.999 — and never refreshes", async () => {
    vi.useFakeTimers();
    setStaffLang.mockReturnValue(new Promise(() => {}));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mount("both");
    fireEvent.click(en());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(pressed(my())).toBe("true");
    expect(screen.getByRole("group").hasAttribute("aria-busy")).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a failure the person ALREADY corrected back shows no line", async () => {
    const w = held<{ ok: false; error: string }>();
    setStaffLang.mockReturnValueOnce(w.p);
    mount("both");
    fireEvent.click(en());
    fireEvent.click(my()); // back to what the server holds, while the English write is out
    await act(async () => w.release({ ok: false, error: "nope" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(pressed(my())).toBe("true");
    expect(setStaffLang).toHaveBeenCalledTimes(1);
  });

  it("ok then fail: the page follows what WAS written, and the line says the rest did not land", async () => {
    const first = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValueOnce(first.p).mockResolvedValueOnce({ ok: false, error: "nope" });
    mount("both");
    fireEvent.click(en());
    fireEvent.click(my());
    await act(async () => first.release({ ok: true, mode: "en" }));
    await screen.findByRole("alert");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(pressed(en())).toBe("true");
  });

  it.each(["en", "my-only"] as const)(
    "under %s the failure line speaks BOTH tongues — Burmese marked, then the English echo",
    async (mode) => {
      setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
      mount(mode);
      fireEvent.click(mode === "en" ? my() : en());
      const alert = await screen.findByRole("alert");
      expect(alert.querySelector('[lang="my"]')?.textContent).toBe(STAFF["shell.lang.failed"].my);
      const echo = alert.querySelector(".chrome-en")!;
      expect(echo.textContent).toBe(STAFF["shell.lang.failed"].en);
      expect(echo.closest('[lang="my"]')).toBeNull();
      expect(alert.hasAttribute("aria-live")).toBe(false); // no redundant live on a role (QA §A)
    },
  );

  it("never disabled, never aria-disabled; the GROUP is busy and focus stays on the tapped button", async () => {
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    mount("both");
    const target = en();
    target.focus();
    fireEvent.click(target);
    for (const b of [my(), en()]) {
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    }
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(target);
    await act(async () => w.release({ ok: true, mode: "en" }));
    expect(screen.getByRole("group").hasAttribute("aria-busy")).toBe(false);
  });

  it("the pick YIELDS to the server — a later provider change wins over a stale local cap", async () => {
    const { rerender } = mount("both");
    fireEvent.click(en());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <Host mode="en">
        <StaffLangSwitch />
      </Host>,
    );
    expect(pressed(en())).toBe("true");
    rerender(
      <Host mode="both">
        <StaffLangSwitch />
      </Host>,
    ); // another tab wrote the cookie
    expect(pressed(my())).toBe("true");
  });
});

/**
 * LEARNINGS #101 — CSS written against the DOM. Every rule globals.css writes against the pill (or
 * the failure line's echo) must match a rendered pill in SOME state (at rest · a write in flight ·
 * a failure shown), inside the `.staff-bar-tail` the front doors put it in. A dead selector is a
 * rule nobody sees — the pre-P2e `.staff-lang-err` / `[aria-disabled]` pair would redden this.
 */
describe("the pill's CSS matches the DOM it renders", () => {
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
  const PILL = /\.staff-lang(?:-btn)?(?![-\w])|\.staff-bar-msg \.chrome-en/;
  const selectors = [...new Set(rules.flatMap((r) => r.sels).filter((sel) => PILL.test(sel)))]
    .filter((sel) => !sel.startsWith("@"))
    .map((sel) => sel.replace(/:focus-visible/g, ""));

  it("names the pill, its buttons, the busy dim, the inset ring and the echo ink", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(7);
  });

  it.each(selectors)("%s matches a rendered pill in some state", async (sel) => {
    const hits: string[] = [];
    const inTail = (mode: StaffLangMode) =>
      render(
        <Host mode={mode}>
          <div className="staff-bar-tail">
            <StaffLangSwitch />
          </div>
        </Host>,
      );
    // at rest
    let r = inTail("both");
    if (r.container.querySelector(sel)) hits.push("rest");
    cleanup();
    // in flight
    setStaffLang.mockReturnValue(new Promise(() => {}));
    r = inTail("both");
    fireEvent.click(en());
    if (r.container.querySelector(sel)) hits.push("busy");
    cleanup();
    // failed
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    r = inTail("both");
    fireEvent.click(en());
    await screen.findByRole("alert");
    if (r.container.querySelector(sel)) hits.push("failed");
    expect(hits, `${sel} matched no rendered state`).not.toEqual([]);
  });

  /** Every value `prop` takes across the rules whose selector list names `sel` EXACTLY. */
  const declared = (sel: string, prop: string) =>
    rules
      .filter((r) => r.sels.includes(sel))
      .flatMap((r) =>
        [...r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) =>
          m[1]!.trim(),
        ),
      );
  const tokenOf = (v: string) => /^var\((--[\w-]+)\)$/.exec(v)?.[1] ?? null;
  const PRESSED = '.staff-lang-btn[aria-pressed="true"]';

  // Phase 2e review (A1) — this pin used to check the OFFSET alone, and the ring it pinned was
  // invisible exactly where focus lands most: drawn inside the segment, in the global ring's --ac,
  // over the PRESSED segment's --ac fill (the tapped segment keeps focus; in the default Both the
  // pressed မြန်မာ is the first Tab stop). So the pressed + focused segment names its own ring
  // colour, and it is not the fill. The CONTRAST of both rings (≥3:1 on the fill, and the plain ring
  // on the track, both themes) is computed from these same rules in packages/ui's
  // composite-contrast.test.ts, which owns the WCAG maths.
  it("the pill clips (`overflow: hidden`), so its ring is drawn INSIDE — and over the pressed fill it takes another ink", () => {
    expect(declared(".staff-lang", "overflow")).toEqual(["hidden"]);
    const offset = declared(".staff-lang-btn:focus-visible", "outline-offset");
    expect(offset).toHaveLength(1);
    expect(offset[0]).toMatch(/^-\d/);
    const fill = declared(PRESSED, "background").map(tokenOf);
    expect(fill).toHaveLength(1);
    expect(fill[0]).not.toBeNull();
    const ring = declared(`${PRESSED}:focus-visible`, "outline-color").map(tokenOf);
    expect(ring).toHaveLength(1);
    expect(ring[0]).not.toBeNull();
    expect(ring[0]).not.toBe(fill[0]);
  });

  // Phase 2e review (A2) — the in-flight cue was `opacity: 0.7` on the pressed segment, which
  // dimmed its LABEL with it (light theme below 3:1). Busy is not disabled (the control never refuses
  // a tap), so the label keeps its full ink and the cue is a stripe over the fill; no rule keyed on
  // the busy group may fade or filter the segment. The stripe's contrast is composite-contrast's.
  it("in flight the pressed segment keeps its label's ink — a stripe over the fill, never a dim", () => {
    const busy = rules.filter((r) =>
      r.sels.some((sel) => sel.startsWith('.staff-lang[aria-busy="true"]')),
    );
    expect(busy.length).toBeGreaterThan(0);
    for (const r of busy) expect(r.body).not.toMatch(/(?:^|;)\s*(?:opacity|filter)\s*:/);
    expect(declared(`.staff-lang[aria-busy="true"] > ${PRESSED}`, "background-image")).toHaveLength(
      1,
    );
  });

  it("a refusal line's English echo takes the line's ink", () => {
    const echo = rules.find((r) => r.sels.includes(".staff-bar-msg .chrome-en"));
    expect(echo?.body).toMatch(/color:\s*inherit/);
  });
});
