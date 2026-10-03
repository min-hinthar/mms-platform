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
  it("lights exactly one chip — the zone whose heading has passed the strip's edge", () => {
    // Real headings in the document, each with a stubbed rect (jsdom measures everything as 0,
    // which would make every heading "arrived"): start-h scrolled off above, floor-h just under
    // the strip, expo-h far below. The strip itself sits at the top (its rect is 0 → edge 8).
    for (const [id, top] of [
      ["start-h", -400],
      ["floor-h", 4],
      ["expo-h", 900],
    ] as const) {
      const h = document.createElement("h2");
      h.id = id;
      h.getBoundingClientRect = () =>
        ({ top, bottom: top + 30, left: 0, right: 0, width: 0, height: 30 }) as DOMRect;
      document.body.appendChild(h);
    }
    mount("my");
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]!.getAttribute("href")).toBe("#floor-h");
    expect(current[0]!.getAttribute("aria-current")).toBe("location");
    for (const id of ["start-h", "floor-h", "expo-h"]) document.getElementById(id)?.remove();
  });
  it("with no heading in the document yet, the first zone is current", () => {
    mount("my");
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current"));
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["#start-h"]);
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
