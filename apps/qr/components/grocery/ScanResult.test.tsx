/** @vitest-environment jsdom */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ScanSlot } from "@/lib/scan-notice";
import { ScanResult, type ScanChip } from "./ScanResult";

/**
 * Phase 1c → PD4 — the in-stage result: the TAG (a miss) and the DISC (in your basket).
 *
 * The page re-keys the result bar on EVERY scan outcome (so each one arrives). A re-key is a
 * remount, and a remount removes the focused node: a keyboard or screen-reader shopper who
 * activates "Add another" — the one deliberate way to buy a second copy (M186) — lands on <body>
 * after every add. The bar hands focus across its own remount, and ONLY when focus was inside it.
 *
 * PD4 adds the tag's shape (one primary, the quiet line, NO ✕), the arm after a sheet close
 * (correction 15: the action slot refuses until `armed`), and the in-slot Undo whose label follows
 * the write ("Undo" → "Removing…"). Each MUTATION was induced and watched go red.
 */
afterEach(cleanup);

const chipSlot = (key: number): NonNullable<ScanSlot> => ({ kind: "chip", key });
const notice = (
  key: number,
  kind: "unknown" | "weighed" | "unavailable" = "unknown",
): NonNullable<ScanSlot> => ({ kind: "notice", key, notice: { kind, barcode: "0123456789012" } });
const chip = (over: Partial<ScanChip> = {}): ScanChip => ({
  name: "Jasmine rice",
  nameMy: null,
  meta: "In your basket ×1",
  queued: false,
  action: "add-another",
  busy: false,
  armed: true,
  onAddAnother: () => {},
  undo: null,
  ...over,
});

function Harness({
  slot,
  chipOver,
}: {
  slot: NonNullable<ScanSlot>;
  chipOver?: Partial<ScanChip>;
}) {
  const handoffRef = useRef(false);
  return (
    <div>
      <button type="button">elsewhere</button>
      <ScanResult
        key={slot.key}
        slot={slot}
        chip={slot.kind === "chip" ? chip(chipOver) : null}
        onSearch={() => {}}
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

  it("a chip that turns into a tag hands focus to the tag's one primary", () => {
    const { rerender } = render(<Harness slot={chipSlot(1)} />);
    screen.getByRole("button", { name: "Add another Jasmine rice" }).focus();
    rerender(<Harness slot={notice(2)} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Search by name နာမည်နဲ့ ရှာမယ်" }),
    );
  });

  it("a chip that turns into a WEIGHED tag (no button) hands focus to the tag itself, never <body>", () => {
    const { rerender } = render(<Harness slot={chipSlot(1)} />);
    screen.getByRole("button", { name: "Add another Jasmine rice" }).focus();
    rerender(<Harness slot={notice(2, "weighed")} />);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.className).toContain("scan-tag");
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
    function Toggle({ show, k }: { show: boolean; k: number }) {
      const handoffRef = useRef(false);
      return (
        <div>
          <button type="button">elsewhere</button>
          {show ? (
            <ScanResult
              key={k}
              slot={chipSlot(k)}
              chip={chip()}
              onSearch={() => {}}
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

describe("PD4 — the tag: one primary, the quiet line, no ✕", () => {
  it("an unknown code: the headline, 'Search by name' as a dialog opener, and the quiet counter line", () => {
    const onSearch = vi.fn();
    const handoffRef = { current: false };
    render(
      <ScanResult slot={notice(1)} chip={null} onSearch={onSearch} focusHandoffRef={handoffRef} />,
    );
    expect(screen.getByText("This code isn’t in the app yet.")).toBeTruthy();
    // The button's accessible name IS its visible bilingual text (WCAG 2.5.3) — no aria-label.
    const btn = screen.getByRole("button", { name: "Search by name နာမည်နဲ့ ရှာမယ်" });
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(btn);
    expect(onSearch).toHaveBeenCalledTimes(1);
    // The quiet line is NOT interactive, and there is no ✕ (the next outcome replaces the tag).
    expect(screen.getByText("Or ask at the counter").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("a weighed item: the kiosk's shipped sentence, no search (search excludes it), no quiet line", () => {
    render(
      <ScanResult
        slot={notice(1, "weighed")}
        chip={null}
        onSearch={() => {}}
        focusHandoffRef={{ current: false }}
      />,
    );
    expect(
      screen.getByText("That one needs the scale — please bring it to the counter."),
    ).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("Or ask at the counter")).toBeNull();
  });

  it("an unavailable item: the shipped sentence, no search, but the quiet line stays (B8 — never a dead end)", () => {
    render(
      <ScanResult
        slot={notice(1, "unavailable")}
        chip={null}
        onSearch={() => {}}
        focusHandoffRef={{ current: false }}
      />,
    );
    expect(screen.getByText("That item isn’t available today.")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Or ask at the counter")).toBeTruthy();
  });
});

describe("PD4 — the disc chip: the arm, the Undo slot, the queued ring", () => {
  it("inside the same-gesture window the action refuses (aria-disabled, never native disabled)", () => {
    const onAddAnother = vi.fn();
    render(<Harness slot={chipSlot(1)} chipOver={{ armed: false, onAddAnother }} />);
    const btn = screen.getByRole("button", { name: "Add another Jasmine rice" });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAddAnother).not.toHaveBeenCalled();
  });

  it("armed, 'Add another' takes the tap", () => {
    const onAddAnother = vi.fn();
    render(<Harness slot={chipSlot(1)} chipOver={{ onAddAnother }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add another Jasmine rice" }));
    expect(onAddAnother).toHaveBeenCalledTimes(1);
  });

  it("while the Undo window is open it takes the action slot — 'Undo · ပြန်ဖျက်' with an aria-hidden seconds leaf", () => {
    const onUndo = vi.fn();
    render(
      <Harness
        slot={chipSlot(1)}
        chipOver={{
          action: "undo",
          undo: { secondsLeft: 4, removing: false, onUndo, onHold: () => {} },
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Add another/ })).toBeNull();
    const undo = screen.getByRole("button", { name: "Undo ပြန်ဖျက်" });
    expect(undo.getAttribute("aria-describedby")).toBe("scan-chip-subject");
    expect(undo.querySelector("[aria-hidden]")?.textContent).toBe("4s");
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("the Undo refuses inside the arm, and reads 'Removing…' while the write is in flight", () => {
    const onUndo = vi.fn();
    const { rerender } = render(
      <Harness
        slot={chipSlot(1)}
        chipOver={{
          armed: false,
          action: "undo",
          undo: { secondsLeft: 6, removing: false, onUndo, onHold: () => {} },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo ပြန်ဖျက်" }));
    expect(onUndo).not.toHaveBeenCalled();
    rerender(
      <Harness
        slot={chipSlot(1)}
        chipOver={{
          action: "undo",
          undo: { secondsLeft: 5, removing: true, onUndo, onHold: () => {} },
        }}
      />,
    );
    const removing = screen.getByRole("button", { name: "Removing… ဖျက်နေပါတယ်…" });
    expect(removing.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(removing);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("the slot draws exactly what `action` names — 'none' draws no control (a chip reached through a pairing)", () => {
    render(<Harness slot={chipSlot(1)} chipOver={{ action: "none" }} />);
    expect(screen.queryByRole("button", { name: /Add another/ })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(1); // only the harness's "elsewhere"
  });

  it("a queued code wears the dashed ring and, unknown to the cache, offers no 'Add another'", () => {
    render(
      <Harness
        slot={chipSlot(1)}
        chipOver={{
          name: "A saved scan",
          nameMy: "သိမ်းထားတဲ့ စကင်",
          meta: "Waiting for a connection",
          queued: true,
          action: "none",
        }}
      />,
    );
    expect(document.querySelector(".scan-disc-queued")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(1); // only the harness's "elsewhere"
    expect(screen.getByText("A saved scan")).toBeTruthy();
    expect(screen.getByText("သိမ်းထားတဲ့ စကင်").getAttribute("lang")).toBe("my");
  });
});
