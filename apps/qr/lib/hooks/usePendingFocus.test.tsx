/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePendingFocus } from "./usePendingFocus";
import { freshBasketLanding } from "../grocery-focus";

/**
 * PD4 (Codex on #329's head ff29547) — "Start a fresh basket" on the Scan door: the pressed button
 * leaves with the banner and the new stage mounts a render later. Focus must land on THAT stage,
 * never on <body>. Each MUTATION is a row in scripts/verify-slice.mjs (`pending-focus/…`).
 */
const pick = () =>
  freshBasketLanding({
    field: document.getElementById("grocery-search"),
    stage: document.getElementById("scan-stage"),
    panelTitle: document.getElementById("scan-panel-title"),
  });

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(id: string, tag = "div") {
  const el = document.createElement(tag);
  el.id = id;
  el.tabIndex = -1;
  document.body.appendChild(el);
  return el;
}

describe("usePendingFocus — a fresh basket's focus lands on the NEW stage, not <body>", () => {
  it("the Scan door: nothing to take focus at the tap; the stage mounts a render later and takes it", () => {
    // The banner's button, focused and about to leave.
    const fresh = mount("fresh", "button");
    fresh.focus();
    const { result, rerender } = renderHook(() => usePendingFocus(pick));
    act(() => result.current());
    // The banner leaves (focus falls to <body>) and the stage mounts in the same commit.
    fresh.remove();
    const stage = mount("scan-stage");
    // MUTATION: no retry after the commit (only the tap's attempt) → focus stays on <body>; red.
    rerender();
    expect(document.activeElement).toBe(stage);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("the Browse door: the field exists at the tap and takes focus at once", () => {
    const field = mount("grocery-search", "input");
    const { result } = renderHook(() => usePendingFocus(pick));
    act(() => result.current());
    expect(document.activeElement).toBe(field);
  });

  it("a shopper who moved on keeps their focus — a late stage never pulls it back", () => {
    const { result, rerender } = renderHook(() => usePendingFocus(pick));
    act(() => result.current());
    const elsewhere = mount("elsewhere", "button");
    elsewhere.focus();
    // MUTATION: ignore where focus went → the stage steals it when it finally mounts; red.
    rerender();
    mount("scan-stage");
    rerender();
    expect(document.activeElement).toBe(elsewhere);
  });
});
