/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffLangProvider, useStaffLang } from "./StaffLangProvider";

afterEach(cleanup);

function Probe() {
  return <span data-testid="lang">{useStaffLang()}</span>;
}

/**
 * P2 · G5 — the provider carries the language, and the hook REFUSES to guess.
 *
 * The silent-default version of `useStaffLang` (`useContext(…) ?? "my"`) reads as defensive and is
 * the opposite: a staff component rendered on a diner route with no provider is a real wiring bug,
 * and the silent default expresses that bug as Burmese chrome appearing on a guest's phone. Throwing
 * puts it in front of whoever wired it, in development.
 */
describe("StaffLangProvider", () => {
  it.each(["en", "my"] as const)("hands %s down to a child", (lang) => {
    const { getByTestId } = render(
      <StaffLangProvider lang={lang}>
        <Probe />
      </StaffLangProvider>,
    );
    expect(getByTestId("lang").textContent).toBe(lang);
  });

  it("stamps data-lang, NOT lang, on its wrapper", () => {
    // `lang="my"` here would re-lead every Latin run beneath it and put `overflow-wrap: anywhere` on
    // every money figure — the global [lang="my"] rule sets both and both inherit, and the
    // [lang="en"] companion resets only the wrap. A data- attribute has no CSS inheritance at all.
    const { container } = render(
      <StaffLangProvider lang="my">
        <Probe />
      </StaffLangProvider>,
    );
    const root = container.querySelector(".stx-root")!;
    expect(root.getAttribute("data-lang")).toBe("my");
    expect(root.hasAttribute("lang")).toBe(false);
    expect(container.querySelector("[lang]")).toBeNull();
  });

  it("THROWS outside a provider — never a silent Burmese default", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useStaffLang/);
    spy.mockRestore();
  });
});
