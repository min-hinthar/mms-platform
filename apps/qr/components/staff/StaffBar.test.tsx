/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setStaffLang = vi.fn();
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: (v: unknown) => setStaffLang(v) }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffBar } = await import("./StaffBar");
const { StaffLangSwitch } = await import("./StaffLangSwitch");
const { StaffLangProvider } = await import("./StaffLangProvider");
const { NET_SHOW_MS } = await import("@/lib/live-connection");
const { dispatchUpdate } = await import("@/lib/app-update");
const { monoNow } = await import("@/lib/bounded-write");
const { STAFF_CONTRACT } = await import("@/lib/build-stamp");
const { STAFF } = await import("@/lib/i18n/staff");

/**
 * P7·1b — the one chrome. What is worth pinning: the leading slot is a REAL link to the doors that
 * `resolveStaffHome` cannot override (`?doors=1`), or a static mark on the doors themselves, or a
 * back-up link whose accessible name is the dictionary's; the title is the page's h1 with the
 * Burmese marked `lang="my"`; the trailing group is named, carries NO language control (P2e — the
 * four front doors pass the pill through `trailing`), and carries Lock ONLY when asked (a PIN exists); and every selector globals.css writes against the
 * bar's title matches the DOM the bar renders (LEARNINGS #101 — dead CSS for a title is a title at
 * body size).
 */
afterEach(cleanup);

describe("StaffBar", () => {
  it("leads with the Screens circle — a real link, named, to the doors by name", () => {
    render(<StaffBar lang="my" title="kds.title" />);
    const screens = screen.getByRole("link", { name: "စခရင်များ" });
    expect(screens.getAttribute("href")).toBe("/staff?doors=1");
    expect(screens.className).toContain("staff-circ");
  });
  it("on the doors themselves the mark is static and hidden from assistive tech — never a dead control", () => {
    const { container } = render(
      <StaffBar lang="my" title="shell.screens" leading={{ kind: "here" }} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector(".staff-circ-here")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("a front door names its own place with a glyph — still static, still hidden from assistive tech", () => {
    const { container } = render(
      <StaffBar lang="my" title="entry.lock.title" leading={{ kind: "here", icon: "lock" }} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    const mark = container.querySelector(".staff-circ-here");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.querySelector("svg")?.getAttribute("class")).toMatch(/lock/);
    // Never Lock on a front door: the default is off, and neither page asks for it.
    expect(screen.queryByRole("button", { name: /လော့ခ်ချ/ })).toBeNull();
  });
  it("a sub-page leads with the way back UP, named by the dictionary, the arrow inside the label", () => {
    render(
      <StaffBar
        lang="my"
        title="browse.title.add"
        leading={{
          kind: "back",
          href: "/staff/table/s1",
          k: "browse.back.table",
          vars: { id: "7" },
        }}
      />,
    );
    const back = screen.getByRole("link");
    expect(back.getAttribute("href")).toBe("/staff/table/s1");
    expect(back.textContent).toMatch(/←/);
    expect(back.textContent).toContain("7");
  });
  it("the title is the page's h1, Burmese marked, the English echo beneath", () => {
    render(<StaffBar lang="my" title="kds.title" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.id).toBe("staff-bar-title");
    expect(h1.querySelector('[lang="my"]')?.textContent).toBe("မီးဖိုချောင်");
    expect(h1.querySelector(".chrome-en")?.textContent).toBe("Kitchen");
  });
  it("a real name replaces the dictionary title, and `after` rides inside the h1 — SEPARATED", () => {
    render(<StaffBar lang="en" titleNode={<span>Daw Aye</span>} after={<em>owner</em>} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    // The accessible name is built by adjacency; a flex gap alone yields "Daw Ayeowner" (the blind
    // pass caught the first draft pinning exactly that). The separator is sr-only text.
    expect(h1.textContent).toBe("Daw Aye, owner");
  });
  it("the h1 takes the page's id, ref and tabIndex — the KDS focuses its board here after a bump", () => {
    const ref = { current: null as HTMLHeadingElement | null };
    render(
      <StaffBar lang="en" title="kds.title" titleId="kds-h" titleRef={ref} titleTabIndex={-1} />,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.id).toBe("kds-h");
    expect(h1.tabIndex).toBe(-1);
    expect(ref.current).toBe(h1);
  });
  it("trailing order is a contract: page utilities, then Help, then Lock LAST", () => {
    const { container } = render(
      <StaffBar
        lang="my"
        title="kds.title"
        lock
        trailing={<span data-testid="tail">Aa</span>}
        help={<span data-testid="help">?</span>}
      />,
    );
    const tail = screen.getByTestId("tail");
    const help = screen.getByTestId("help");
    const lock = screen.getByRole("button", { name: "ဒီတက်ဘလက်ကို လော့ခ်ချ" });
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(tail, help)).toBe(true);
    expect(before(help, lock)).toBe(true);
    expect(lock.parentElement).toBe(container.querySelector(".staff-bar-tail"));
    expect(help.parentElement).toBe(container.querySelector(".staff-bar-tail"));
  });
  it("a page with no help door renders no help slot at all — never a parked control", () => {
    const { container } = render(<StaffBar lang="en" title="kds.title" />);
    expect(container.querySelector(".staff-circ-gold")).toBeNull();
  });
  it("Night: the bar's glass is the repo's ONE frosted-chrome pane, whose floor is pinned elsewhere", () => {
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
    const rule = css.match(/\.dark \.staff-bar \{([^}]*)\}/);
    expect(rule, ".dark .staff-bar rule").not.toBeNull();
    // `composite-contrast.test.ts` pins every Night text token AA over `--glass-chrome`; a custom
    // alpha here would be a second pane that no guard measures.
    expect(rule![1]).toMatch(/background:\s*var\(--glass-chrome\)/);
  });
  it("the trailing group is named, carries no language control, and Lock only when asked", () => {
    const { rerender } = render(<StaffBar lang="my" title="kds.title" />);
    const tools = screen.getByRole("group", { name: "စက် ကိရိယာများ" });
    expect(tools.querySelector(".staff-lang, .staff-lang-rows")).toBeNull();
    expect(screen.queryByRole("button", { name: /လော့ခ်ချ/ })).toBeNull();
    rerender(<StaffBar lang="my" title="kds.title" lock />);
    expect(screen.getByRole("button", { name: "ဒီတက်ဘလက်ကို လော့ခ်ချ" }).className).toContain(
      "staff-circ",
    );
  });
  it("middle and trailing slots render in their places", () => {
    render(
      <StaffBar
        lang="en"
        title="kds.title"
        middle={<span data-testid="mid">stations</span>}
        trailing={<span data-testid="tail">Aa</span>}
      />,
    );
    expect(screen.getByTestId("mid").closest(".staff-bar-mid")).not.toBeNull();
    expect(screen.getByTestId("tail").closest(".staff-bar-tail")).not.toBeNull();
  });
});

// ── Phase 2e · lang ──
describe("P2e — the language left the in-service bar", () => {
  it("NO prop combination mounts a language control — every leading, with and without the slots", () => {
    const leadings = [
      undefined,
      { kind: "screens" } as const,
      { kind: "here" } as const,
      { kind: "here", icon: "lock" } as const,
      { kind: "back", href: "/staff", k: "floor.back" } as const,
    ];
    for (const leading of leadings)
      for (const lock of [false, true])
        for (const slots of [false, true]) {
          const { container, unmount } = render(
            <StaffBar
              lang="my"
              title="kds.title"
              leading={leading}
              lock={lock}
              trailing={slots ? <span>Aa</span> : undefined}
              help={slots ? <span>?</span> : undefined}
              middle={slots ? <span>stations</span> : undefined}
              live={slots ? "live" : undefined}
            />,
          );
          expect(container.querySelectorAll(".staff-lang, .staff-lang-rows")).toHaveLength(0);
          unmount();
        }
  });

  it("a front door's pill rides TRAILING, and its failure lands BENEATH the tail's row — never inside the pill", async () => {
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    const { container } = render(
      <StaffLangProvider lang="my">
        <StaffBar
          lang="my"
          title="entry.lock.title"
          leading={{ kind: "here", icon: "lock" }}
          trailing={<StaffLangSwitch />}
        />
      </StaffLangProvider>,
    );
    const tail = container.querySelector(".staff-bar-tail")!;
    expect(tail.querySelectorAll(".staff-lang")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    const alert = await screen.findByRole("alert");
    expect(alert.parentElement).toBe(tail);
    expect(alert.className).toBe("staff-bar-msg");
    expect(alert.closest(".staff-lang")).toBeNull();
    const pill = tail.querySelector(".staff-lang")!;
    expect(pill.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the bar-title CSS matches the DOM the bar renders", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const selectors = [...css.matchAll(/([^{}]*\.staff-bar-title[^{}]*)\{/g)]
    .map((m) => m[1]!.trim())
    .filter((s) => !s.startsWith("@"));
  it("names at least the title, its Burmese and its echo", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(3);
  });
  it.each(selectors)("%s matches a rendered bar", (selector) => {
    const langs: ("my" | "en")[] = /\[lang="my"\]|\.chrome-/.test(selector) ? ["my"] : ["my", "en"];
    for (const lang of langs) {
      // Phase 2b · feedback — a selector through the head wrapper is held to a FEED bar: the
      // wrapper exists only there (a feedless bar keeps today's DOM).
      const live = /\.staff-bar-head/.test(selector) ? ("live" as const) : undefined;
      const { container, unmount } = render(<StaffBar lang={lang} title="kds.title" live={live} />);
      expect(container.querySelector(selector), `${selector} under lang=${lang}`).not.toBeNull();
      unmount();
    }
  });
  // P2e — Burmese ONLY drops the echo and keeps the pair: every title rule that is not about the
  // echo itself must still match, or a Burmese-only bar title loses its 30px (the one-child pair).
  it.each(selectors.filter((sel) => !/\.chrome-en\s*$/.test(sel)))(
    "%s still matches a Burmese-only bar",
    (selector) => {
      const live = /\.staff-bar-head/.test(selector) ? ("live" as const) : undefined;
      const { container } = render(
        <StaffLangProvider lang="my" echoes={false}>
          <StaffBar lang="my" title="kds.title" live={live} />
        </StaffLangProvider>,
      );
      expect(container.querySelector(selector), selector).not.toBeNull();
      expect(container.querySelector(".staff-bar-title .chrome-en")).toBeNull();
    },
  );
});

/**
 * Phase 2b · feedback — the same guard for the status slot and the offline row: every rule
 * globals.css writes against `.staff-bar-head`, `.staff-live*` or `.staff-net` must match a bar the
 * component actually renders, in SOME state (a pseudo-element is stripped — the element it hangs
 * off is what must exist). A selector no state matches is dead CSS: a slot drawn at no size, a row
 * with no ground.
 */
describe("the status-slot and offline-row CSS match the DOM the bar renders", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const selectors = [
    ...css.matchAll(/([^{}]*(?:\.staff-bar-head|\.staff-live|\.staff-net)[^{}]*)\{/g),
  ]
    .flatMap((m) => m[1]!.split(","))
    .map((sel) => sel.trim())
    .filter((sel) => sel !== "" && !sel.startsWith("@"));
  let onLine = true;
  it("names the head, the slot's three states and word, and the row", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(10);
  });
  it.each(selectors)("%s matches a bar in some state", async (selector) => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
    const bare = selector.replace(/::?(?:before|after)\b/g, "");
    const states: [string, () => ReturnType<typeof render>, boolean][] = [
      ["feed live", () => render(<StaffBar lang="en" title="kds.title" live="live" />), false],
      [
        "feed stale",
        () => render(<StaffBar lang="en" title="kds.title" live="not_updating" />),
        false,
      ],
      ["feed offline", () => render(<StaffBar lang="en" title="kds.title" live="live" />), true],
      ["feedless offline", () => render(<StaffBar lang="en" title="kds.title" />), true],
    ];
    const hits: string[] = [];
    for (const [name, mount, offline] of states) {
      vi.useFakeTimers();
      onLine = !offline;
      const { unmount } = mount();
      await act(async () => {
        window.dispatchEvent(new Event(offline ? "offline" : "online"));
        await vi.advanceTimersByTimeAsync(NET_SHOW_MS);
      });
      if (document.querySelector(bare)) hits.push(name);
      unmount();
      onLine = true;
      window.dispatchEvent(new Event("online"));
      vi.useRealTimers();
    }
    expect(hits, `${selector} matched no rendered state`).not.toEqual([]);
  });
});

// ── Phase 2i (P2bi) ──
describe("Phase 2i — the new-version row rides the bar, BEFORE the offline row", () => {
  it("renders inside the header, after the tail and the reader chip, with StaffBarNet's probe still LAST", () => {
    // MUTATION (p2i-bar/net-not-last): the row mounts after StaffBarNet — the offline row (and the
    // bar's height probe) is no longer the bar's last child, so the row sits BELOW the offline row
    // on a feedless page and the one-publisher contract's "always last" is broken; red.
    act(() =>
      dispatchUpdate({
        e: "verdict",
        v: {
          kind: "changed",
          served: { build: "kq1x2y3-0a1b2c3d", contract: STAFF_CONTRACT },
          incompatible: false,
        },
        now: monoNow(),
      }),
    );
    const { container } = render(<StaffBar lang="en" title="kds.title" />);
    const header = container.querySelector("header.staff-bar")!;
    const row = header.querySelector(":scope > .staff-update");
    expect(row, "the row is a direct child of the bar").not.toBeNull();
    expect(row!.textContent).toContain(STAFF["shell.version.ready"].en);
    const kids = [...header.children];
    const net = header.querySelector(":scope > .sr-only[role='status']")!;
    const probe = header.lastElementChild!;
    expect(probe.tagName).toBe("SPAN");
    expect(probe.hasAttribute("hidden")).toBe(true);
    expect(kids.indexOf(row!)).toBeLessThan(kids.indexOf(net));
    expect(kids.indexOf(header.querySelector(":scope > .staff-bar-tail")!)).toBeLessThan(
      kids.indexOf(row!),
    );
  });

  it("a current screen's bar carries no row — today's DOM", () => {
    const { container } = render(<StaffBar lang="en" title="kds.title" />);
    expect(container.querySelector(".staff-update")).toBeNull();
  });
});
