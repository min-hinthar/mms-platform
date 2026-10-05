/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { CounterZoneStrip } from "./CounterZoneStrip";
import { StaffLangProvider } from "./StaffLangProvider";

/**
 * Phase 3a (D5) — the counter home's map. What is worth pinning: every chip is a REAL anchor to the
 * zone's own heading id (a `<Link>` to a same-page fragment changes the URL without a `hashchange`
 * — Codex round 1 on #283), each chip says what its heading says (the same dictionary key), the
 * strip is a named landmark in the device language, and exactly one chip is current.
 *
 * Deep pass on #312 added the measuring rules: a hidden column (the pane open below 48em puts the
 * strip under `display: none`) is never read, the end of a scrollable page lights the last present
 * zone, a chip tap lights its zone at once, and the lit chip is kept inside the strip's own
 * viewport. jsdom lays nothing out — every rect is zeros and the page has no scroll height, which
 * the strip reads as "hidden" and "unscrollable" — so each mount gives the strip a visible box and
 * a tall, unscrolled page, then takes one read.
 */
const HEADINGS = ["start-h", "floor-h", "expo-h"] as const;
afterEach(() => {
  cleanup();
  // Teardown lives HERE, not at the end of a test body: a failing assertion used to leave the
  // stubbed headings in the document and flip the next case's answer.
  for (const id of HEADINGS) document.getElementById(id)?.remove();
  window.location.hash = "";
});

const zones = [
  { id: "start-h", k: "floor.zone.start" as const },
  { id: "floor-h", k: "floor.tables.title" as const },
  { id: "expo-h", k: "expo.title" as const },
];

const rect = (top: number, height = 30, width = 100) =>
  ({
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top,
    toJSON() {},
  }) as DOMRect;
function heading(id: string, top: number) {
  const h = document.getElementById(id) ?? document.createElement("h2");
  h.id = id;
  h.getBoundingClientRect = () => rect(top);
  if (!h.isConnected) document.body.appendChild(h);
}
function page({ scrollHeight = 3000, scrollY = 0 } = {}) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: scrollY });
}
async function read() {
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}
function strip() {
  return document.querySelector<HTMLElement>(".staff-zone-strip")!;
}
function show(visible: boolean) {
  const s = strip();
  s.getBoundingClientRect = () => (visible ? rect(0, 44, 390) : rect(0, 0, 0));
  Object.defineProperty(s, "clientWidth", { configurable: true, value: 390 });
}
async function mount(lang: "my" | "en", { visible = true } = {}) {
  page();
  const r = render(
    <StaffLangProvider lang={lang} echoes>
      <CounterZoneStrip lang={lang} zones={zones} />
    </StaffLangProvider>,
  );
  show(visible);
  await read();
  return r;
}
const lit = () =>
  screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current"))
    .map((a) => a.getAttribute("href"));

describe("CounterZoneStrip", () => {
  it("renders one native fragment link per zone, named by the zone heading's own words", async () => {
    await mount("my");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#start-h", "#floor-h", "#expo-h"]);
    expect(links[1]!.textContent).toContain(STAFF["floor.tables.title"].my);
    // The chip speaks the device language — English on an English device.
    cleanup();
    await mount("en");
    expect(screen.getAllByRole("link")[1]!.textContent).toBe(STAFF["floor.tables.title"].en);
  });
  it("is a landmark named in the device language", async () => {
    await mount("my");
    expect(screen.getByRole("navigation", { name: STAFF["floor.a11y.zones"].my })).toBeTruthy();
  });
  it("lights exactly one chip — the zone whose heading has passed the strip's edge", async () => {
    // start-h scrolled off above, floor-h just under the strip, expo-h far below.
    heading("start-h", -400);
    heading("floor-h", 4);
    heading("expo-h", 900);
    await mount("my");
    expect(lit()).toEqual(["#floor-h"]);
    expect(screen.getAllByRole("link")[1]!.getAttribute("aria-current")).toBe("location");
  });
  it("with no heading in the document yet, the first zone is current", async () => {
    await mount("my");
    expect(lit()).toEqual(["#start-h"]);
  });
  it("a HIDDEN column is never measured — the last honest reading stands (deep pass on #312)", async () => {
    // Below 48em with a table pane open, `.staff-split-main` is display:none: every rect reads 0,
    // so a naive read lit the LAST zone and the lie survived the pane's close until the next scroll.
    heading("start-h", -400);
    heading("floor-h", 4);
    heading("expo-h", 900);
    await mount("my");
    expect(lit()).toEqual(["#floor-h"]);
    show(false);
    for (const id of HEADINGS) heading(id, 0);
    await read();
    expect(lit()).toEqual(["#floor-h"]);
  });
  it("at the END of a scrollable page the last present zone is current, even if its heading never reaches the edge (deep pass on #312)", async () => {
    heading("start-h", -400);
    heading("floor-h", 4);
    heading("expo-h", 300); // below the edge — a short last zone can never climb to it
    await mount("my");
    expect(lit()).toEqual(["#floor-h"]);
    page({ scrollHeight: 1000, scrollY: 1000 - window.innerHeight });
    await read();
    expect(lit()).toEqual(["#expo-h"]);
  });
  it("a chip tap lights its zone at once — the page may be too short to scroll it to the edge (deep pass on #312)", async () => {
    await mount("my");
    expect(lit()).toEqual(["#start-h"]);
    window.location.hash = "#expo-h";
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(lit()).toEqual(["#expo-h"]);
  });
  it("keeps the lit chip inside the strip's own viewport (deep pass on #312)", async () => {
    await mount("my");
    const chips = screen.getAllByRole("link");
    const boxes = [
      [0, 120],
      [140, 150],
      [310, 160],
    ] as const;
    boxes.forEach(([left, width], i) => {
      Object.defineProperty(chips[i]!, "offsetLeft", { configurable: true, value: left });
      Object.defineProperty(chips[i]!, "offsetWidth", { configurable: true, value: width });
    });
    expect(strip().scrollLeft).toBe(0);
    window.location.hash = "#expo-h";
    fireEvent(window, new HashChangeEvent("hashchange"));
    // right edge 310 + 160 + 20 of padding = 490 against a 390px rail → scrolled by 100.
    expect(strip().scrollLeft).toBe(100);
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
