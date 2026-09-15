/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneFocus } from "./ZoneFocus";

/**
 * A4·5 — the one zone-focus rule, pinned where it is written. The three boards that used to carry
 * their own copy keep their own arrival tests; this suite holds the SERVER-rendered shape (the
 * heading is plain markup, the hook finds it by id) and the two edges every copy had to get right:
 * another zone's fragment is not ours, and a page opened without a fragment keeps its focus.
 */
function Zone() {
  return (
    <section aria-labelledby="z-h">
      <h2 id="z-h" tabIndex={-1}>
        Zone
      </h2>
      <button id="z-b" type="button">
        A control
      </button>
      <ZoneFocus id="z-h" />
    </section>
  );
}

const jump = (hash: string) =>
  act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("ZoneFocus", () => {
  it("takes focus on the heading on arrival at its fragment, and again on a same-page jump", async () => {
    window.location.hash = "#z-h";
    render(<Zone />);
    const h2 = document.getElementById("z-h")!;
    expect(document.activeElement).toBe(h2);
    document.getElementById("z-b")!.focus();
    expect(document.activeElement).not.toBe(h2);
    await jump("#other");
    expect(document.activeElement).not.toBe(h2); // another zone's fragment is not ours
    await jump("#z-h");
    expect(document.activeElement).toBe(h2);
  });

  it("does NOT steal focus when the page was opened without the fragment", () => {
    render(<Zone />);
    expect(document.activeElement).toBe(document.body);
  });

  it("holds its listener for as long as the zone is mounted, then detaches THAT one", () => {
    // A bare "removeEventListener was called with 'hashchange' at some point" would also pass for a
    // hook that attached and detached in the same breath, or that detached a fresh closure and left
    // the real listener on the window for the page's life. Both are counted here.
    const on = vi.spyOn(window, "addEventListener");
    const off = vi.spyOn(window, "removeEventListener");
    const hash = (c: unknown[]) => String(c[0]) === "hashchange";
    const { unmount } = render(<Zone />);
    const added = on.mock.calls.filter(hash);
    expect(added).toHaveLength(1);
    expect(off.mock.calls.filter(hash)).toHaveLength(0); // still listening while mounted
    unmount();
    const removed = off.mock.calls.filter(hash);
    expect(removed).toHaveLength(1);
    expect(removed[0]![1]).toBe(added[0]![1]); // the same handler, not a look-alike
    on.mockRestore();
    off.mockRestore();
  });
});
