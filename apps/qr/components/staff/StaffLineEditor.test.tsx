/** @vitest-environment jsdom */
import { startTransition } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import { WRITE_UNCONFIRMED, WRITE_WAITING } from "@/lib/staff-outage";

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

// ── Phase 2c · review fixes · pad2 ──
describe("P12 — one name per row: every control names the dish as it renders", () => {
  const burmese = {
    ...line,
    qty: 1,
    sendable: true,
    nameMy: "မုန့်ဟင်းခါး",
    modifiers: [],
    modifiersMy: [],
    menuItemId: "m1",
    fulfillment: "dinein",
  } as unknown as TableLineView;
  const mountMy = (l: TableLineView) =>
    render(
      <StaffLangProvider lang="my">
        <ul>
          <StaffLineEditor sessionId="s1" line={l} disabled={false} onError={() => {}} />
        </ul>
      </StaffLangProvider>,
    );

  it("a draft's note button and note field name the dish in Burmese, like its Remove", async () => {
    mountMy(burmese);
    const note = screen.getByRole("button", { name: /မှတ်ချက်/ });
    // MUTATION: `subject: line.name` — the Remove says မုန့်ဟင်းခါး, the note button "Mohinga"; red.
    expect(note.getAttribute("aria-label")).toBe(
      `${STAFF["table.line.verb.addNote"].my} — မုန့်ဟင်းခါး`,
    );
    await act(async () => {
      fireEvent.click(note);
    });
    const field = document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!;
    expect(document.querySelector(`label[for="${field.id}"]`)?.textContent).toContain(
      "မုန့်ဟင်းခါး",
    );
  });

  it("a fired line's Remove-or-make-free names the dish in Burmese", () => {
    mountMy({ ...burmese, state: "fired", sendable: false } as TableLineView);
    const loss = screen.getByRole("button", { name: /ဖျက် \/ အခမဲ့/ });
    expect(loss.getAttribute("aria-label")).toBe(
      `${STAFF["table.line.verb.voidComp"].my} — မုန့်ဟင်းခါး`,
    );
  });
});

describe("P7 — a saved note hands focus back to its note button, never to <body>", () => {
  it("Save closes the editor and focus lands on the note button", async () => {
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Note — Mohinga" }));
    });
    fireEvent.change(document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!, {
      target: { value: "no peanuts" },
    });
    const save = screen.getByRole("button", { name: STAFF["table.line.save"].en });
    save.focus();
    await act(async () => {
      fireEvent.click(save);
    });
    // MUTATION: the editor closes under the finger — the input and Save unmount, focus to <body>; red.
    expect(save.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Note — Mohinga" }));
  });
});

/**
 * Phase 2h (P2fc) — the qty and note writes are NOT transitions any more, and are BOUNDED. A
 * transition's `pending` stays true until its raw action answers and entangles with every other
 * pending async transition on the tab (LEARNINGS #149 · #200), so one hung write — this row's or
 * another surface's — dimmed the stepper and the note's Save for as long as the queue was stuck.
 * The sentences ride the plain-string `onError` as `WRITE_WAITING` / `WRITE_UNCONFIRMED`, which
 * every renderer localizes (`OUTAGE_TWINS`).
 */
describe("StaffLineEditor — Phase 2h: bounded writes, said honestly, the late answer applied", () => {
  const settle: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(async () => {
    await act(async () => {
      for (const s of settle.splice(0)) s();
    });
    vi.useRealTimers();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function hung(fn: typeof staffSetQty) {
    let answer!: (v: WriteResult) => void;
    let fail!: (e: Error) => void;
    fn.mockReturnValueOnce(
      new Promise<WriteResult>((res, rej) => {
        answer = res;
        fail = rej;
      }),
    );
    return { answer: (v: WriteResult) => answer(v), fail: (e: Error) => fail(e) };
  }
  function row() {
    const onError = vi.fn();
    const onEditState = vi.fn();
    const onWaiting = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <ul>
          <StaffLineEditor
            sessionId="s1"
            line={{ ...line, sendable: true } as TableLineView}
            disabled={false}
            onError={onError}
            onEditState={onEditState}
            onWaiting={onWaiting}
          />
        </ul>
      </StaffLangProvider>,
    );
    return {
      onError,
      onWaiting,
      reload: () => screen.queryByRole("button", { name: STAFF["out.reload"].en }),
      writing: () => onEditState.mock.calls.at(-1)?.[1]?.writing as boolean,
      inc: () => screen.getByRole("button", { name: "Increase Mohinga quantity" }),
      digit: () => document.querySelector(".staff-qty")!.textContent,
    };
  }
  const tap = (el: HTMLElement) =>
    act(async () => {
      fireEvent.click(el);
    });

  it("a qty write with no answer frees the stepper AT the bound — beside an unrelated hung transition — keeps the figure, and says 'no answer yet'", async () => {
    // Another surface's async transition, never answered: under `useTransition` this row's
    // `pending` was entangled with it and the stepper stayed dimmed regardless of its own write.
    startTransition(async () => {
      await new Promise<void>((r) => settle.push(r));
    });
    hung(staffSetQty);
    const r = row();
    await tap(r.inc());
    expect(r.digit()).toBe("3×");
    expect(r.inc().getAttribute("aria-disabled")).toBe("true");
    expect(r.writing()).toBe(true);
    await flush(STAFF_HANG_MS - 1);
    expect(r.inc().getAttribute("aria-disabled")).toBe("true");
    // MUTATION (p2h-doors/line-qty-unbounded): the bound never fires — the stepper (and the Send's
    // drain-before-fire hold) stays held for as long as the queue is stuck; red.
    await flush(1);
    expect(r.inc().getAttribute("aria-disabled")).toBeNull();
    expect(r.writing()).toBe(false);
    // The person's own change stays shown: rolled back, it invites a second tap that changes it twice.
    expect(r.digit()).toBe("3×");
    // MUTATION (p2h-doors/line-qty-waiting-unsaid): said as "couldn't confirm", or not at all; red.
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_WAITING);
  });

  it("a write still unanswered offers the reload IN its row and reports it; a LATE success retracts it (S2 critic D1 · D2)", async () => {
    const h = hung(staffSetQty);
    const r = row();
    await tap(r.inc());
    await flush(STAFF_HANG_MS - 1);
    expect(r.reload()).toBeNull();
    expect(r.onWaiting).not.toHaveBeenCalled();
    await flush(1);
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_WAITING);
    // MUTATION (p2h-doors/line-reload-missing): WRITE_WAITING says "reload the page" on a console
    // with no browser reload, and nothing on screen does it; red.
    const reload = r.reload();
    expect(reload).not.toBeNull();
    expect(reload!.closest("li")).not.toBeNull(); // the row the person just tapped
    // MUTATION (p2h-doors/line-waiting-unreported): the renderer is never told a write waits — it
    // can neither offer its own reload nor know when "no answer yet" stops being true; red.
    expect(r.onWaiting).toHaveBeenCalledWith("l1", true);
    await act(async () => h.answer({ ok: true }));
    // MUTATION (p2h-doors/line-late-ok-never-retracts): a late success says nothing and reports
    // nothing — "No answer yet — that change may still be saved" stands over a saved change, above
    // the settle and frozen-board lines, until some other setter happens by; red.
    expect(r.onWaiting).toHaveBeenLastCalledWith("l1", false);
    expect(r.reload()).toBeNull();
    expect(r.onError).toHaveBeenCalledTimes(1); // a success adds no sentence of its own
  });

  it("two writes waiting on one row are ONE waiting edge each way — told 'no longer' only when the last answers", async () => {
    const qty = hung(staffSetQty);
    const note = hung(setLineNotes);
    const r = row();
    await tap(r.inc());
    await flush(STAFF_HANG_MS);
    await tap(screen.getByRole("button", { name: /note/i }));
    await act(async () => {
      fireEvent.change(document.querySelector('[data-note-for="l1"]')!, {
        target: { value: "no peanuts" },
      });
    });
    await tap(screen.getByRole("button", { name: STAFF["table.line.save"].en }));
    await flush(STAFF_HANG_MS);
    // MUTATION (p2h-doors/line-waiting-edge-repeats): every write re-reports the edge — the
    // renderer counts two "waiting" for one row, or is told "no longer" while a write is still out;
    // red.
    expect(r.onWaiting.mock.calls).toEqual([["l1", true]]);
    await act(async () => qty.answer({ ok: true }));
    expect(r.onWaiting.mock.calls).toEqual([["l1", true]]);
    expect(r.reload()).not.toBeNull();
    await act(async () => note.answer({ ok: true }));
    expect(r.onWaiting.mock.calls).toEqual([
      ["l1", true],
      ["l1", false],
    ]);
    expect(r.reload()).toBeNull();
  });

  it("a LATE qty refusal rolls the figure back to the server's and says the server's sentence", async () => {
    const h = hung(staffSetQty);
    const r = row();
    await tap(r.inc());
    await flush(STAFF_HANG_MS);
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_WAITING);
    // MUTATION (p2h-doors/line-qty-late-refusal-kept): the refused figure stays on the row as if it
    // were saved; red.
    await act(async () => h.answer({ ok: false, error: "That dish is sold out." }));
    expect(r.digit()).toBe("2×");
    expect(r.onError).toHaveBeenLastCalledWith("That dish is sold out.");
  });

  it("a LATE refusal never rolls back a NEWER write's figure", async () => {
    const first = hung(staffSetQty);
    hung(staffSetQty);
    const r = row();
    await tap(r.inc());
    await flush(STAFF_HANG_MS);
    await tap(r.inc());
    expect(staffSetQty).toHaveBeenCalledTimes(2);
    expect(r.digit()).toBe("4×");
    // MUTATION (p2h-doors/line-qty-late-rollback-over-newer): the older write's refusal wipes the
    // newer one's figure — the row reads 2 while 4 is still on its way; red.
    await act(async () => first.answer({ ok: false, error: "That dish is sold out." }));
    expect(r.digit()).toBe("4×");
    expect(r.onError).toHaveBeenLastCalledWith("That dish is sold out.");
  });

  it("a LATE qty throw rolls back and says it couldn't CONFIRM", async () => {
    const h = hung(staffSetQty);
    const r = row();
    await tap(r.inc());
    await flush(STAFF_HANG_MS);
    expect(r.digit()).toBe("3×");
    // MUTATION (p2h-doors/line-qty-late-throw-unsaid): the late lost answer keeps the unconfirmed
    // figure and says nothing more; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(r.digit()).toBe("2×");
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_UNCONFIRMED);
  });

  it("a THROWN qty write rolls back and says it couldn't CONFIRM — never 'couldn't update'", async () => {
    const h = hung(staffSetQty);
    const r = row();
    await tap(r.inc());
    // MUTATION (p2h-doors/line-qty-threw-says-failed): the old English "Couldn't update that —
    // check the connection and try again", a failure a lost answer cannot prove (and no twin); red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(r.digit()).toBe("2×");
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_UNCONFIRMED);
    expect(r.inc().getAttribute("aria-disabled")).toBeNull();
  });

  /** Open the note editor, type, and Save. */
  async function saveNote(text: string) {
    await tap(screen.getByRole("button", { name: /note/i }));
    const field = document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!;
    await act(async () => {
      fireEvent.change(field, { target: { value: text } });
    });
    const save = screen.getByRole("button", { name: STAFF["table.line.save"].en });
    await tap(save);
    return { field, save };
  }

  it("a note save with no answer frees Save at the bound and says 'no answer yet'; the LATE save closes an unchanged editor", async () => {
    const h = hung(setLineNotes);
    const r = row();
    const { save } = await saveNote("no peanuts");
    expect(save.getAttribute("aria-busy")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(save.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-doors/line-note-unbounded): "Saving…" holds — and the Send's drain hold with it
    // — for as long as the queue is stuck; red.
    await flush(1);
    expect(save.getAttribute("aria-busy")).toBeNull();
    expect(save.textContent).toBe(STAFF["table.line.save"].en);
    // MUTATION (p2h-doors/line-note-waiting-unsaid): said as "couldn't confirm"; red.
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_WAITING);
    await act(async () => h.answer({ ok: true }));
    expect(document.querySelector('[data-note-for="l1"]')).toBeNull();
  });

  it("a LATE save never throws away a draft typed since", async () => {
    const h = hung(setLineNotes);
    row();
    const { field } = await saveNote("no peanuts");
    await flush(STAFF_HANG_MS);
    await act(async () => {
      fireEvent.change(field, { target: { value: "no peanuts, no shrimp paste" } });
    });
    // MUTATION (p2h-doors/line-note-late-closes-a-newer-draft): the late save closes the editor
    // over a newer draft — "no shrimp paste", an allergy, is gone unsaved; red.
    await act(async () => h.answer({ ok: true }));
    const still = document.querySelector<HTMLInputElement>('[data-note-for="l1"]');
    expect(still?.value).toBe("no peanuts, no shrimp paste");
  });

  it("a LATE note throw says it couldn't CONFIRM, over the waiting line", async () => {
    const h = hung(setLineNotes);
    const r = row();
    await saveNote("no peanuts");
    await flush(STAFF_HANG_MS);
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_WAITING);
    // MUTATION (p2h-doors/line-note-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_UNCONFIRMED);
  });

  it("a THROWN note save says it couldn't CONFIRM — never 'couldn't save'", async () => {
    const h = hung(setLineNotes);
    const r = row();
    await saveNote("no peanuts");
    // MUTATION (p2h-doors/line-note-threw-says-failed): the old English "Couldn't save that note",
    // a failure a lost answer cannot prove; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(r.onError).toHaveBeenLastCalledWith(WRITE_UNCONFIRMED);
  });
});
