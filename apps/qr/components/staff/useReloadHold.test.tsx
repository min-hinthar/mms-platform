/** @vitest-environment jsdom */
import { StrictMode, useLayoutEffect, type ReactNode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { reloadHolds } from "@/lib/reload-guard";
import { useReloadHold } from "./useReloadHold";

/**
 * Phase 2i (P2bi) — the hook every board registers its reload holds through. `active` gates the
 * registration, a change of `survives` re-registers, and Strict Mode's double setup leaves exactly
 * one hold.
 */
afterEach(() => {
  cleanup();
});

type P = { active: boolean; survives?: boolean };
const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe("useReloadHold", () => {
  it("holds only while active, and releases on unmount", () => {
    // MUTATION (p2i-hold/inactive-registers): an inactive hook still holds — a KDS with its sound
    // OFF refuses the automatic reload forever; red.
    const { rerender, unmount } = renderHook(
      (p: P) => useReloadHold("sound", "kdsSound", "kds", p.active),
      {
        initialProps: { active: false },
      },
    );
    expect(reloadHolds()).toEqual([]);
    rerender({ active: true });
    expect(reloadHolds().map((h) => [h.kind, h.reason, h.subject])).toEqual([
      ["sound", "kdsSound", "kds"],
    ]);
    rerender({ active: false });
    expect(reloadHolds()).toEqual([]);
    rerender({ active: true });
    // MUTATION (p2i-hold/never-released): the cleanup is dropped — an unmounted board's hold
    // outlives it; red.
    unmount();
    expect(reloadHolds()).toEqual([]);
  });

  it("Strict Mode's double setup leaves ONE hold", () => {
    renderHook(() => useReloadHold("unsent", "kitchenUndo", "kds", true), { wrapper: strict });
    expect(reloadHolds()).toHaveLength(1);
  });

  it("a change of `survives` re-registers with the new value", () => {
    // MUTATION (p2i-hold/survives-stale): the hold keeps its first `survives` — the lane's stash
    // succeeding never relaxes a retired screen; red.
    const { rerender } = renderHook(
      (p: P) => useReloadHold("unsent", "pick", "lane", p.active, p.survives),
      { initialProps: { active: true, survives: false } },
    );
    expect(reloadHolds()[0]!.survives).toBe(false);
    rerender({ active: true, survives: true });
    expect(reloadHolds()).toHaveLength(1);
    expect(reloadHolds()[0]!.survives).toBe(true);
  });

  it("is registered before the next event can be delivered (a layout effect)", () => {
    // MUTATION (p2i-hold/passive-effect): a passive effect leaves a window after commit where a tap
    // meets no hold. Read synchronously right after the render commits; red.
    let seen = -1;
    function Probe() {
      useReloadHold("unsent", "kitchenUndo", "kds", true);
      return null;
    }
    function Reader() {
      // Runs in a layout effect AFTER Probe's (siblings commit in order): a passive hold is not
      // registered yet here.
      useLayoutEffect(() => {
        seen = reloadHolds().length;
      }, []);
      return null;
    }
    renderHook(() => null, {
      wrapper: ({ children }) => (
        <>
          <Probe />
          <Reader />
          {children}
        </>
      ),
    });
    expect(seen).toBe(1);
  });
});
