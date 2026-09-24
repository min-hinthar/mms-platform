/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LiveBoardState } from "@/lib/live-connection";
import {
  LiveConnectionProvider,
  useLiveBoardState,
  useLiveConnection,
  useReportLive,
} from "./LiveConnection";

/**
 * Phase 2a · tablet — a board's report must LEAVE with the board. Before this, a board that had
 * reported `not_updating` and then unmounted (a pane closing, a route change inside the provider)
 * left its last word in the fold forever, so every help report filed from that screen afterwards
 * said `not_updating` about a board nobody could see.
 */
function Board({ name, state }: { name: string; state: LiveBoardState }) {
  useReportLive(name, state);
  return null;
}
const seen: (LiveBoardState | undefined)[] = [];
function Door() {
  const connection = useLiveConnection();
  // Recorded at EVERY render, so a transient drop of the key is caught, not just the end state.
  seen.push(useLiveBoardState("pane"));
  return <p data-testid="door">{connection ?? "none"}</p>;
}
const door = () => screen.getByTestId("door").textContent;

afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe("LiveConnection — a board's report leaves with the board", () => {
  it("an unmounted board that reported not_updating no longer holds the fold", () => {
    const tree = (pane: boolean) => (
      <LiveConnectionProvider>
        <Board name="floor" state="live" />
        {pane && <Board name="pane" state="not_updating" />}
        <Door />
      </LiveConnectionProvider>
    );
    const { rerender } = render(tree(true));
    expect(door()).toBe("not_updating");
    rerender(tree(false));
    expect(door()).toBe("live");
  });

  it("a live → not_updating → live flip keeps the key present at every render", () => {
    const tree = (state: LiveBoardState) => (
      <LiveConnectionProvider>
        <Board name="pane" state={state} />
        <Door />
      </LiveConnectionProvider>
    );
    const { rerender } = render(tree("live"));
    rerender(tree("not_updating"));
    expect(door()).toBe("not_updating");
    rerender(tree("live"));
    expect(door()).toBe("live");
    // The first render precedes any report (effects run after it); from the first report on, the
    // key never drops out — a remove-then-re-add on every state change would show an `undefined`.
    const firstReport = seen.indexOf("live");
    expect(firstReport).toBeGreaterThan(-1);
    expect(seen.slice(firstReport)).not.toContain(undefined);
  });

  it("outside a provider the hooks are inert", () => {
    render(
      <>
        <Board name="pane" state="not_updating" />
        <Door />
      </>,
    );
    expect(door()).toBe("none");
  });
});
