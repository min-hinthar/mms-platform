/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import { STAFF } from "@/lib/i18n/staff";

/**
 * manager-2 (K35) — the drill-down's line controls are §17 through the shared `Stepper` primitive:
 * a tapped stepper button is `aria-disabled` while the write is in flight, never natively disabled
 * (which dropped keyboard/AT focus to <body> on every qty tap), and refuses a second tap; the note
 * save says a stated word while it saves, never "…" (its content IS its accessible name).
 */
type WriteResult = { ok: true } | { ok: false; error: string };
const staffSetQty = vi.fn((): Promise<WriteResult> => Promise.resolve({ ok: true }));
const setLineNotes = vi.fn((): Promise<WriteResult> => Promise.resolve({ ok: true }));
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: (...a: unknown[]) => staffSetQty(...(a as [])),
  setLineNotes: (...a: unknown[]) => setLineNotes(...(a as [])),
}));
/** The loss sheet is a stand-in that REPORTS what the editor hands it: `open`, and an instance
 *  number (a fresh instance per open is the freshness the old mount-while-open shape gave). */
const counters = vi.hoisted(() => ({ loss: 0 }));
vi.mock("./LossActionSheet", async () => {
  const React = await import("react");
  return {
    LossActionSheet: (p: { open: boolean; onOpenChange: (o: boolean) => void }) => {
      const [instance] = React.useState(() => ++counters.loss);
      return (
        <div data-testid="loss" data-open={String(p.open)} data-instance={instance}>
          <button type="button" onClick={() => p.onOpenChange(false)}>
            close-loss
          </button>
        </div>
      );
    },
  };
});

const { StaffLangProvider } = await import("./StaffLangProvider");
const { StaffLineEditor } = await import("./StaffLineEditor");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "l1",
  name: "Mohinga",
  qty: 2,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
} as unknown as TableLineView;

function mount() {
  render(
    <StaffLangProvider lang="en">
      <ul>
        <StaffLineEditor sessionId="s1" line={line} disabled={false} onError={() => {}} />
      </ul>
    </StaffLangProvider>,
  );
  return {
    inc: () =>
      screen.getByRole("button", { name: "Increase Mohinga quantity" }) as HTMLButtonElement,
    dec: () =>
      screen.getByRole("button", { name: "Decrease Mohinga quantity" }) as HTMLButtonElement,
  };
}

describe("StaffLineEditor — §17 through the stepper", () => {
  it("a qty tap leaves BOTH stepper buttons aria-disabled, never native, and refuses a second tap mid-flight", async () => {
    let release: ((r: WriteResult) => void) | null = null;
    staffSetQty.mockReturnValueOnce(
      new Promise<WriteResult>((r) => {
        release = r;
      }),
    );
    const { inc, dec } = mount();
    inc().focus();
    await act(async () => {
      fireEvent.click(inc());
    });
    expect(staffSetQty).toHaveBeenCalledTimes(1);
    // MUTATION: `disabled={disabled}` back on the primitive's buttons — `disabled` reads true, red.
    for (const b of [inc(), dec()]) {
      expect(b.disabled).toBe(false);
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    expect(document.activeElement).toBe(inc());
    await act(async () => {
      fireEvent.click(inc());
    });
    expect(staffSetQty).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true });
    });
    expect(inc().getAttribute("aria-disabled")).toBeNull();
  });

  it("the note save says a stated word while it saves — never an ellipsis — and is aria-busy", async () => {
    let release: ((r: WriteResult) => void) | null = null;
    setLineNotes.mockReturnValueOnce(
      new Promise<WriteResult>((r) => {
        release = r;
      }),
    );
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /note/i }));
    });
    const save = screen.getByRole("button", {
      name: STAFF["table.line.save"].en,
    }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(save);
    });
    expect(setLineNotes).toHaveBeenCalledTimes(1);
    // MUTATION: `{notePending ? "…" : …}` — the name is "…" and this reddens.
    expect(save.textContent).toBe(STAFF["table.line.saving"].en);
    expect(save.disabled).toBe(false);
    expect(save.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(save);
    });
    expect(setLineNotes).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true });
    });
  });
});

describe("M76 — the loss sheet is HELD through its exit, and each open is a fresh instance", () => {
  const fired = { ...line, state: "fired" } as unknown as TableLineView;
  it("closing hands the sheet open=false and keeps it mounted; the next open is a new instance", () => {
    render(
      <StaffLangProvider lang="en">
        <ul>
          <StaffLineEditor sessionId="s1" line={fired} disabled={false} onError={() => {}} />
        </ul>
      </StaffLangProvider>,
    );
    const loss = () => screen.queryByTestId("loss");
    expect(loss()).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(STAFF["table.line.verb.voidComp"].en) }),
    );
    expect(loss()?.getAttribute("data-open")).toBe("true");
    const first = loss()!.getAttribute("data-instance");
    fireEvent.click(screen.getByRole("button", { name: "close-loss" }));
    // MUTATION: mount it as `{sheetOpen && …}` again — gone at once, nothing left to slide; red.
    expect(loss()?.getAttribute("data-open")).toBe("false");
    expect(loss()!.getAttribute("data-instance")).toBe(first);
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(STAFF["table.line.verb.voidComp"].en) }),
    );
    expect(loss()?.getAttribute("data-open")).toBe("true");
    // MUTATION: `key={line.id}` instead of `key={loss.key}` — the same instance, its PIN and
    // reason still filled from last time; red.
    expect(loss()!.getAttribute("data-instance")).not.toBe(first);
  });
});

// ── Phase 2a · send ──
describe("Phase 2a · send — what the line says about the kitchen, and what it reports up", () => {
  const renderLine = (l: TableLineView, lang: "en" | "my" = "en", onEditState = vi.fn()) => {
    render(
      <StaffLangProvider lang={lang}>
        <ul>
          <StaffLineEditor
            sessionId="s1"
            line={l}
            disabled={false}
            onError={() => {}}
            onEditState={onEditState}
          />
        </ul>
      </StaffLangProvider>,
    );
    return onEditState;
  };

  it("a sendable draft says 'Not sent'; a to-go draft and a fired line do not", () => {
    renderLine({ ...line, sendable: true } as TableLineView);
    expect(screen.getByRole("listitem").textContent).toContain(STAFF["table.line.notSent"].en);
    cleanup();
    renderLine({ ...line, sendable: false } as TableLineView);
    expect(screen.getByRole("listitem").textContent).not.toContain(STAFF["table.line.notSent"].en);
    cleanup();
    renderLine({ ...line, state: "fired", sendable: false } as TableLineView);
    expect(screen.getByRole("listitem").textContent).not.toContain(STAFF["table.line.notSent"].en);
  });

  it("a fired line speaks its state in the device language — no English 'Sent' under Burmese", () => {
    renderLine({ ...line, state: "fired", sendable: false } as TableLineView, "my");
    const text = screen.getByRole("listitem").textContent ?? "";
    expect(text).toContain(STAFF["table.line.state.fired"].my);
    expect(text).not.toContain(STAFF["table.line.state.fired"].en);
    cleanup();
    renderLine({ ...line, state: "in_progress", sendable: false } as TableLineView);
    expect(screen.getByRole("listitem").textContent).toContain(
      STAFF["table.line.state.inProgress"].en,
    );
    cleanup();
    renderLine({ ...line, state: "served", sendable: false } as TableLineView);
    expect(screen.getByRole("listitem").textContent).toContain(STAFF["table.line.state.served"].en);
  });

  it("an unsaved note reports noteDirty up, and a save clears it (drain before fire)", async () => {
    const report = renderLine({ ...line, sendable: true } as TableLineView);
    const last = () => report.mock.calls.at(-1)!;
    expect(last()).toEqual([
      "l1",
      { lineId: "l1", name: "Mohinga", noteDirty: false, writing: false, sendable: true },
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /note/i }));
    });
    const field = document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!;
    expect(field).not.toBeNull();
    await act(async () => {
      fireEvent.change(field, { target: { value: "no peanuts" } });
    });
    expect(last()[1]).toMatchObject({ noteDirty: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.line.save"].en }));
    });
    expect(setLineNotes).toHaveBeenCalledWith("s1", { cartItemId: "l1", notes: "no peanuts" });
    expect(last()[1]).toMatchObject({ noteDirty: false, writing: false });
  });

  it("a line that leaves the list withdraws its report", () => {
    const report = renderLine({ ...line, sendable: true } as TableLineView);
    cleanup();
    expect(report.mock.calls.at(-1)).toEqual(["l1", null]);
  });
});

// ── Phase 2c · pad ──
describe("Phase 2c · pad — the line on the order pad's ticket", () => {
  const burmese = {
    ...line,
    qty: 1,
    sendable: true,
    nameMy: "မုန့်ဟင်းခါး",
    modifiers: ["Egg", "Extra spicy"],
    modifiersMy: ["ကြက်ဥ", null],
    menuItemId: "m1",
    fulfillment: "dinein",
  } as unknown as TableLineView;

  function mountMany(
    lines: { l: TableLineView; props?: Record<string, unknown> }[],
    lang: "en" | "my",
  ) {
    return render(
      <StaffLangProvider lang={lang}>
        <ul>
          {lines.map(({ l, props }, i) => (
            <StaffLineEditor
              key={i}
              sessionId="s1"
              line={l}
              disabled={false}
              onError={() => {}}
              {...props}
            />
          ))}
        </ul>
      </StaffLangProvider>,
    );
  }

  it("two editors of ONE line never share a note id (the id is minted, the hold finds data-note-for)", async () => {
    mountMany([{ l: burmese }, { l: burmese }], "en");
    for (const b of screen.getAllByRole("button", { name: /note/i }))
      await act(async () => {
        fireEvent.click(b);
      });
    const fields = [...document.querySelectorAll<HTMLInputElement>('[data-note-for="l1"]')];
    expect(fields).toHaveLength(2);
    // MUTATION: `id={`note-${line.id}`}` — two fields, one id, and each label names the first; red.
    expect(fields[0]!.id).not.toBe(fields[1]!.id);
    for (const f of fields) expect(document.querySelector(`label[for="${f.id}"]`)).not.toBeNull();
  });

  it("the stepper's names come from the dictionary, naming the dish as it renders (Burmese)", () => {
    mountMany([{ l: burmese }], "my");
    const names = [...document.querySelectorAll(".mms-stepper-btn")].map((b) =>
      b.getAttribute("aria-label"),
    );
    // MUTATION: the English literal / the primitive's defaults — an English name on a Burmese
    // console; red.
    expect(names).toEqual(["“မုန့်ဟင်းခါး” ဖျက်", "မုန့်ဟင်းခါး တစ်ခု ထပ်ထည့်"]);
  });

  it("on a Burmese console the dish and its options lead in Burmese, the English echoes", () => {
    mountMany([{ l: burmese }], "my");
    const name = document.querySelector<HTMLElement>("[data-line-name]")!;
    expect(name.tabIndex).toBe(-1);
    expect(name.querySelector('[lang="my"]')?.textContent).toBe("မုန့်ဟင်းခါး");
    expect(name.querySelector('.staff-line-echo[lang="en"]')?.textContent).toBe("Mohinga");
    const li = screen.getByRole("listitem");
    expect(li.querySelector('[lang="my"]:not([data-line-name] *)')).not.toBeNull();
    // The option with no Burmese stays English, marked — never set in Padauk.
    expect([...li.querySelectorAll('[lang="en"]')].map((e) => e.textContent)).toContain(
      "Extra spicy",
    );
  });

  it("an English console with no Burmese renders the bare name, exactly as before", () => {
    mountMany([{ l: { ...line, nameMy: null, modifiersMy: [] } as TableLineView }], "en");
    const name = document.querySelector<HTMLElement>("[data-line-name]")!;
    expect(name.innerHTML).toBe("Mohinga");
  });

  it("with onRemove, the Remove hands the removal to the ticket and writes nothing itself", async () => {
    const onRemove = vi.fn();
    mountMany([{ l: burmese, props: { onRemove } }], "en");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Mohinga" }));
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(staffSetQty).not.toHaveBeenCalled();
    // A qty CHANGE still writes here.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase Mohinga quantity" }));
    });
    expect(staffSetQty).toHaveBeenCalledWith("s1", { cartItemId: "l1", qty: 2 });
  });

  it("a ghost row never writes and fades with the house removal idiom", async () => {
    mountMany([{ l: burmese, props: { leaving: true, rowProps: { "data-line-id": "l1" } } }], "en");
    const li = screen.getByRole("listitem");
    expect(li.className).toContain("mms-remove");
    expect(li.getAttribute("data-line-id")).toBe("l1");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase Mohinga quantity" }));
    });
    expect(staffSetQty).not.toHaveBeenCalled();
  });

  it("the qty digit pops when the qty CHANGES — never on first paint", async () => {
    const { rerender } = mountMany([{ l: burmese }], "en");
    const digit = () => document.querySelector(".staff-qty")!;
    expect(digit().className).not.toContain("mms-pop");
    rerender(
      <StaffLangProvider lang="en">
        <ul>
          <StaffLineEditor
            key={0}
            sessionId="s1"
            line={{ ...burmese, qty: 2 } as TableLineView}
            disabled={false}
            onError={() => {}}
          />
        </ul>
      </StaffLangProvider>,
    );
    expect(digit().className).toContain("mms-pop");
    expect(digit().textContent).toBe("2×");
  });
});
