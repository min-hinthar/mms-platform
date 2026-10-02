/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reloadHolds } from "@/lib/reload-guard";
import type { LateAnswer, LostKind } from "@/lib/floor-pane";

/**
 * Phase 2i (P2bi) — the pane's lost-write line ("we couldn't confirm that payment") is unread money
 * news held in `CounterSplit`'s state, never stashed: an AUTOMATIC reload for a new version must wait
 * while it stands. The pane is stubbed so the line can be raised and answered directly — its own
 * rules (`nextLost`, `lostAfterLanded`, `lostOnSelect`) are pinned in `floor-pane.test.ts`.
 */
type PaneProps = {
  onLostWrite: (
    sessionId: string,
    hint: { counter: boolean; display: string },
    k: LostKind,
  ) => void;
  onLostLanded: (sessionId: string, how: LateAnswer) => void;
  onSelect: (id: string, hint: { counter: boolean; display: string }) => void;
};
vi.mock("./TablePane", () => ({
  TablePane: ({ onLostWrite, onLostLanded, onSelect }: PaneProps) => (
    <div>
      <button
        type="button"
        onClick={() => onLostWrite("s-4", { counter: false, display: "4" }, "settleUnknown")}
      >
        lose
      </button>
      <button type="button" onClick={() => onLostLanded("s-4", "started")}>
        started
      </button>
      <button type="button" onClick={() => onSelect("s-4", { counter: false, display: "4" })}>
        open
      </button>
    </div>
  ),
}));

const { CounterSplit } = await import("./CounterSplit");

afterEach(() => {
  cleanup();
});

const paneHolds = () =>
  reloadHolds()
    .filter((h) => h.reason === "paneLine")
    .map((h) => ({ kind: h.kind, subject: h.subject, survives: h.survives }));

describe("Phase 2i — the pane's lost-write line holds an automatic reload while it stands", () => {
  it("held from the moment the line stands; released when it is answered or the table is opened", async () => {
    render(
      <CounterSplit terminalReady={false}>
        <p>counter</p>
      </CounterSplit>,
    );
    expect(paneHolds()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "lose" }));
    // MUTATION (p2i-pane/lost-line-unheld): a reload for a new version drops "we couldn't confirm
    // that payment" from the pane, and the cashier takes the money a second time; red.
    expect(paneHolds()).toEqual([{ kind: "unread", subject: "s-4", survives: false }]);
    // A reader start's late "started" answers the unknown: the line goes, and so does the hold.
    fireEvent.click(screen.getByRole("button", { name: "started" }));
    expect(paneHolds()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "lose" }));
    expect(paneHolds()).toHaveLength(1);
    // Opening that table shows its own truth: the line is retired (`lostOnSelect`), the hold with it.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open" }));
    });
    expect(paneHolds()).toEqual([]);
  });
});
