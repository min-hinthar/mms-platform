/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SHEET_EXIT_FAILSAFE_MS, useStageCover } from "./useStageCover";

/**
 * PD4 (Codex round 2 on #329) — the stage stays covered through a sheet's EXIT, not only while it is
 * open. Each MUTATION is a row in scripts/verify-slice.mjs (`stage-cover/…`), induced and watched go
 * red. The exit's length is the `--dur-sheet` token, READ from tokens.css (never transcribed): the
 * fail-safe must outlast it, or the camera wakes behind a scrim still on screen.
 */

/** The base `--dur-sheet`, from the TOP-LEVEL `:root` block (not the reduced-motion override inside
 *  an `@media`): blocks are walked by brace depth, comments stripped, so neither a comment nor a
 *  nested rule can stand in for the definition. */
function baseDurSheetMs(): number {
  const tokens = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../packages/ui/src/tokens.css",
  );
  const css = readFileSync(tokens, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const found: number[] = [];
  let depth = 0;
  let start = 0;
  let selector = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) selector = css.slice(start, i).trim();
      depth += 1;
      if (depth === 1) start = i + 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        if (selector === ":root") {
          const m = /--dur-sheet:\s*([\d.]+)ms\s*;/.exec(css.slice(start, i));
          if (m) found.push(Number(m[1]));
        }
        start = i + 1;
      }
    }
  }
  if (found.length !== 1)
    throw new Error(`expected ONE top-level :root --dur-sheet, found ${found.length}`);
  return found[0]!;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useStageCover — the cover lasts until the exit has finished", () => {
  it("covers while the sheet is open", () => {
    const { result } = renderHook(({ open }) => useStageCover(open), {
      initialProps: { open: true },
    });
    expect(result.current.covering).toBe(true);
  });

  it("the close START keeps covering — Radix still has the sheet and scrim on screen", () => {
    // MUTATION: `covering: open` → the hold lifts as the exit begins and a different jar in frame
    // is charged behind the scrim; red. MUTATION: never raise the cover on open → same; red.
    const { result, rerender } = renderHook(({ open }) => useStageCover(open), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    rerender({ open: false });
    expect(result.current.covering).toBe(true);
  });

  it("the exit end lifts the cover at once", () => {
    // MUTATION: an exit end that does nothing → the camera stays deaf until the fail-safe; red.
    const { result, rerender } = renderHook(({ open }) => useStageCover(open), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    act(() => result.current.exitEnd());
    expect(result.current.covering).toBe(false);
  });

  it("a stale exit end never uncovers a sheet that re-opened mid-exit", () => {
    const { result, rerender } = renderHook(({ open }) => useStageCover(open), {
      initialProps: { open: true },
    });
    rerender({ open: false }); // the first close starts its exit
    rerender({ open: true }); // re-opened mid-exit
    act(() => result.current.exitEnd()); // the FIRST exit's end, arriving late — stale
    rerender({ open: false }); // the re-opened sheet's OWN close starts its exit
    // Asserted HERE (blind pass 2 on #329): after the re-opened sheet's own close and before its
    // exit end, `open` is false and only the cover holds the stage — while the sheet was open the
    // old assertion read `open` and could not fail. MUTATION: the cover raised only on the open
    // EDGE (an effect on `open`) → the stale end lowered it under the open sheet and nothing raised
    // it again; red.
    expect(result.current.covering).toBe(true);
    act(() => result.current.exitEnd()); // its own exit end
    expect(result.current.covering).toBe(false);
  });

  it("with no exit signal, the cover outlasts the exit (--dur-sheet) and the fail-safe lifts it", () => {
    const durSheet = baseDurSheetMs();
    // The bound itself: above the exit, and never long enough to read as a broken scanner.
    expect(SHEET_EXIT_FAILSAFE_MS).toBeGreaterThan(durSheet);
    expect(SHEET_EXIT_FAILSAFE_MS).toBeLessThanOrEqual(2000);
    const { result, rerender } = renderHook(({ open }) => useStageCover(open), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    // MUTATION: a 0 ms fail-safe → uncovered while the exit is still running; red.
    act(() => {
      vi.advanceTimersByTime(durSheet);
    });
    expect(result.current.covering).toBe(true);
    // MUTATION: a minute-long fail-safe → a missed signal leaves the camera deaf; red.
    act(() => {
      vi.advanceTimersByTime(2000 - durSheet);
    });
    expect(result.current.covering).toBe(false);
  });
});
