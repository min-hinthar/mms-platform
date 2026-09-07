/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffBar } = await import("./StaffBar");

/**
 * P7·1b — the one chrome. What is worth pinning: the leading slot is a REAL link to the doors that
 * `resolveStaffHome` cannot override (`?doors=1`), or a static mark on the doors themselves, or a
 * back-up link whose accessible name is the dictionary's; the title is the page's h1 with the
 * Burmese marked `lang="my"`; the trailing group is named, always carries the language control, and
 * carries Lock ONLY when asked (a PIN exists); and every selector globals.css writes against the
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
  it("a real name replaces the dictionary title, and `after` rides inside the h1", () => {
    render(<StaffBar lang="en" titleNode={<span>Daw Aye</span>} after={<em>owner</em>} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Daw Ayeowner");
  });
  it("the trailing group is named, always has the language control, and Lock only when asked", () => {
    const { rerender } = render(<StaffBar lang="my" title="kds.title" />);
    const tools = screen.getByRole("group", { name: "စက် ကိရိယာများ" });
    expect(tools.querySelector(".staff-lang")).not.toBeNull();
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
      const { container, unmount } = render(<StaffBar lang={lang} title="kds.title" />);
      expect(container.querySelector(selector), `${selector} under lang=${lang}`).not.toBeNull();
      unmount();
    }
  });
});
