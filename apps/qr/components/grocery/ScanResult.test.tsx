/** @vitest-environment jsdom */
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ScanSlot } from "@/lib/scan-notice";
import { ScanResult } from "./ScanResult";

/**
 * The page re-keys the result bar on EVERY scan outcome (so each one arrives with `.mms-rise`). A
 * re-key is a remount, and a remount removes the focused node: a keyboard or screen-reader shopper
 * who activates "Add another" — the one deliberate way to buy a second copy (M186) — lands on
 * <body> after every add. The bar hands focus across its own remount, and ONLY when focus was
 * inside it: a new outcome must never pull focus from wherever the shopper is.
 */
afterEach(cleanup);

const chipSlot = (key: number): NonNullable<ScanSlot> => ({ kind: "chip", key });
const unknownSlot = (key: number): NonNullable<ScanSlot> => ({
  kind: "notice",
  key,
  notice: { kind: "unknown", barcode: "0000" },
});
const chip = {
  name: "Jasmine rice",
  meta: "In your basket ×1",
  busy: false,
  onAddAnother: () => {},
};

function Harness({ slot }: { slot: NonNullable<ScanSlot> }) {
  const handoffRef = useRef(false);
  return (
    <div>
      <button type="button">elsewhere</button>
      <ScanResult
        key={slot.key}
        slot={slot}
        chip={slot.kind === "chip" ? chip : null}
        onSearch={() => {}}
        onDismiss={() => {}}
        focusHandoffRef={handoffRef}
      />
    </div>
  );
}

describe("the result bar keeps focus across its own re-key", () => {
  it("a focused 'Add another' is focused again after the next outcome re-keys the bar", () => {
    // RED without the handoff: the remount drops focus to <body>.
    const { rerender } = render(<Harness slot={chipSlot(1)} />);
    screen.getByRole("button", { name: "Add another Jasmine rice" }).focus();
    rerender(<Harness slot={chipSlot(2)} />);
    const again = screen.getByRole("button", { name: "Add another Jasmine rice" });
    expect(document.activeElement).toBe(again);
  });

  it("a chip that turns into a notice hands focus to the notice's first action", () => {
    const { rerender } = render(<Harness slot={chipSlot(1)} />);
    screen.getByRole("button", { name: "Add another Jasmine rice" }).focus();
    rerender(<Harness slot={unknownSlot(2)} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search by name" }));
  });

  it("never pulls focus when it was elsewhere", () => {
    // RED if the new bar focuses itself unconditionally (a camera sighting would yank focus).
    const { rerender } = render(<Harness slot={chipSlot(1)} />);
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();
    rerender(<Harness slot={chipSlot(2)} />);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a handoff nobody takes expires — a LATER bar does not steal focus", async () => {
    // RED if the flag outlives its commit: the ✕ unmounts the bar with focus inside (the page moves
    // focus to the stage box), and a bar mounted later must not jump focus into itself.
    function Toggle({ show, k }: { show: boolean; k: number }) {
      const handoffRef = useRef(false);
      return (
        <div>
          <button type="button">elsewhere</button>
          {show ? (
            <ScanResult
              key={k}
              slot={chipSlot(k)}
              chip={chip}
              onSearch={() => {}}
              onDismiss={() => {}}
              focusHandoffRef={handoffRef}
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Toggle show k={1} />);
    screen.getByRole("button", { name: "Add another Jasmine rice" }).focus();
    rerender(<Toggle show={false} k={1} />);
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();
    await Promise.resolve();
    rerender(<Toggle show k={2} />);
    expect(document.activeElement).toBe(elsewhere);
  });
});
