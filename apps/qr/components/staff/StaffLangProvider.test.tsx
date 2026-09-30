/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StaffLangProvider,
  useEchoesShown,
  useStaffLang,
  useStaffLangMode,
} from "./StaffLangProvider";

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

// ── Phase 2e · lang ──
function ModeProbe() {
  return (
    <>
      <span data-testid="script">{useStaffLang()}</span>
      <span data-testid="mode">{useStaffLangMode()}</span>
      <span data-testid="echoes">{String(useEchoesShown())}</span>
    </>
  );
}
function EchoProbe() {
  return <span data-testid="echoes">{String(useEchoesShown())}</span>;
}

/**
 * P2e — the prop stayed a SCRIPT and the one new fact rides `echoes`, so every existing
 * `<StaffLangProvider lang="my">` fixture still means Both. The three hooks read the one mode.
 */
describe("P2e — the mode behind the script", () => {
  it.each([
    ["en", true, "en", "en", "true"],
    ["en", false, "en", "en", "true"], // the impossible pair is English — nothing to drop
    ["my", true, "my", "both", "true"],
    ["my", false, "my", "my-only", "false"],
  ] as const)(
    "lang=%s echoes=%s → script %s · mode %s · echoes %s",
    (lang, echoes, script, mode, shown) => {
      const { getByTestId } = render(
        <StaffLangProvider lang={lang} echoes={echoes}>
          <ModeProbe />
        </StaffLangProvider>,
      );
      expect(getByTestId("script").textContent).toBe(script);
      expect(getByTestId("mode").textContent).toBe(mode);
      expect(getByTestId("echoes").textContent).toBe(shown);
    },
  );

  it("a fixture that never heard of echoes is Both — the default, byte-identical to before P2e", () => {
    const { getByTestId, container } = render(
      <StaffLangProvider lang="my">
        <ModeProbe />
      </StaffLangProvider>,
    );
    expect(getByTestId("mode").textContent).toBe("both");
    // Burmese-only still stamps the SCRIPT, never the mode, and never `lang`.
    expect(container.querySelector(".stx-root")!.getAttribute("data-lang")).toBe("my");
  });

  it("Burmese-only stamps the script on the wrapper, and still no `lang`", () => {
    const { container } = render(
      <StaffLangProvider lang="my" echoes={false}>
        <EchoProbe />
      </StaffLangProvider>,
    );
    const root = container.querySelector(".stx-root")!;
    expect(root.getAttribute("data-lang")).toBe("my");
    expect(root.hasAttribute("lang")).toBe(false);
  });

  it("useStaffLangMode THROWS outside a provider; useEchoesShown answers true (the wall TV)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function ModeOnly() {
      return <span>{useStaffLangMode()}</span>;
    }
    expect(() => render(<ModeOnly />)).toThrow(/useStaffLangMode/);
    spy.mockRestore();
    cleanup();
    const { getByTestId } = render(<EchoProbe />);
    expect(getByTestId("echoes").textContent).toBe("true");
  });
});
