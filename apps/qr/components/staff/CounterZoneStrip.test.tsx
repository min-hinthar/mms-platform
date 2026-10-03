/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { CounterZoneStrip } from "./CounterZoneStrip";
import { StaffLangProvider } from "./StaffLangProvider";

/**
 * Phase 3a (D5) — the counter home's map. What is worth pinning: every chip is a REAL anchor to the
 * zone's own heading id (a `<Link>` to a same-page fragment changes the URL without a `hashchange`
 * — Codex round 1 on #283), each chip says what its heading says (the same dictionary key), the
 * strip is a named landmark in the device language, and exactly one chip is current.
 */
afterEach(cleanup);

const zones = [
  { id: "start-h", k: "floor.zone.start" as const },
  { id: "floor-h", k: "floor.tables.title" as const },
  { id: "expo-h", k: "expo.title" as const },
];

function mount(lang: "my" | "en") {
  return render(
    <StaffLangProvider lang={lang} echoes>
      <CounterZoneStrip lang={lang} zones={zones} />
    </StaffLangProvider>,
  );
}

describe("CounterZoneStrip", () => {
  it("renders one native fragment link per zone, named by the zone heading's own words", () => {
    mount("my");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#start-h", "#floor-h", "#expo-h"]);
    expect(links[1]!.textContent).toContain(STAFF["floor.tables.title"].my);
    // The chip speaks the device language — English on an English device.
    cleanup();
    mount("en");
    expect(screen.getAllByRole("link")[1]!.textContent).toBe(STAFF["floor.tables.title"].en);
  });
  it("is a landmark named in the device language", () => {
    mount("my");
    expect(screen.getByRole("navigation", { name: STAFF["floor.a11y.zones"].my })).toBeTruthy();
  });
  it("lights exactly one chip — the first, at the top of the page", () => {
    mount("my");
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]!.getAttribute("href")).toBe("#start-h");
    expect(current[0]!.getAttribute("aria-current")).toBe("location");
  });
  it("draws nothing for no zones", () => {
    const { container } = render(
      <StaffLangProvider lang="my" echoes>
        <CounterZoneStrip lang="my" zones={[]} />
      </StaffLangProvider>,
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});
