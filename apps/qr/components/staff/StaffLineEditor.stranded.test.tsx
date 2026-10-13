/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import type { StaffKeyMsg } from "@/lib/staff-send-view";
import { STAFF } from "@/lib/i18n/staff";

/**
 * P2ar (lifecycle residuals) — a server's half-typed note must not vanish. The line under an open
 * note leaves draft (the host's phone sent the round; the table page's 5 s re-read lands before
 * Save) and the editor swaps to its post-fire branch. Before: the typed text was dropped without a
 * word and focus fell to <body> with the field. Now: the text stays, READ-ONLY, the ONE region is
 * told once, and focus lands on the kept text — never a vanished field. `setLineNotes` is
 * draft-guarded, so nothing can save it any more (the server-side signal stays filed, P2ar).
 * verify:slice mutants: `lcr/line-editor/*`.
 */
const setLineNotes = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: () => Promise.resolve({ ok: true }),
  setLineNotes: () => setLineNotes(),
  staffSetLineFulfillment: () => Promise.resolve({ ok: true }),
}));
vi.mock("./LossActionSheet", () => ({ LossActionSheet: () => null }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { StaffLineEditor } = await import("./StaffLineEditor");
const { MsgText } = await import("./StaffMsg");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const draft: TableLineView = {
  id: "l1",
  name: "Mohinga",
  nameMy: "မုန့်ဟင်းခါး",
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  sendable: true,
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  modifiersMy: [],
  refundedCents: 0,
  menuItemId: "m1",
  fulfillment: "dinein",
  createdAt: null,
  stage: "unsent",
} as unknown as TableLineView;
const fired = { ...draft, state: "fired", sendable: false, stage: "sent" } as TableLineView;

/** The table page's shape: one region the row's notices land in, and the list. */
function Page({ line, lang = "en" }: { line: TableLineView; lang?: "en" | "my" }) {
  const [msg, setMsg] = useState<StaffKeyMsg | null>(null);
  return (
    <StaffLangProvider lang={lang}>
      <ul>
        <StaffLineEditor
          sessionId="s1"
          line={line}
          disabled={false}
          onError={() => {}}
          onNotice={setMsg}
        />
      </ul>
      <button type="button">elsewhere</button>
      <p role="status">{msg ? <MsgText lang={lang} msg={msg} /> : null}</p>
    </StaffLangProvider>
  );
}

const STRANDED = STAFF["table.line.noteStranded"].en.replace("{x}", "Mohinga");

function typeANote(text: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Note — Mohinga/ }));
  const field = screen.getByRole("textbox");
  field.focus();
  fireEvent.change(field, { target: { value: text } });
  return field;
}

describe("StaffLineEditor — the note that missed its dish (P2ar)", () => {
  it("keeps the typed text read-only, tells the ONE region, and lands focus on it", () => {
    const r = render(<Page line={draft} />);
    const field = typeANote("no peanuts — allergy");
    expect(document.activeElement).toBe(field);

    // The host's phone sent the round; the re-read lands before Save.
    r.rerender(<Page line={fired} />);

    // The field is gone; the text is NOT — read-only, quoted, with what to do.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("“no peanuts — allergy”")).toBeTruthy();
    expect(screen.getByText(STAFF["table.line.noteStranded.tag"].en)).toBeTruthy();
    // Said once, in the page's one region.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(STRANDED);
    // Focus is on the kept text, never <body> (the field vanished under the person).
    const kept = screen.getByRole("group", { name: STAFF["table.line.noteStranded.tag"].en });
    expect(document.activeElement).toBe(kept);
    expect(setLineNotes).not.toHaveBeenCalled();
  });

  it("Got it lets it go, and focus lands on the dish's NAME — never a control that acts", () => {
    const r = render(<Page line={draft} />);
    typeANote("extra chili");
    r.rerender(<Page line={fired} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it — Mohinga" }));
    expect(screen.queryByText("“extra chili”")).toBeNull();
    expect((document.activeElement as HTMLElement).hasAttribute("data-line-name")).toBe(true);
  });

  it("focus the person MOVED elsewhere is never yanked; the region is still told", () => {
    const r = render(<Page line={draft} />);
    typeANote("no egg");
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();
    r.rerender(<Page line={fired} />);
    expect(document.activeElement).toBe(elsewhere);
    expect(screen.getByRole("status").textContent).toBe(STRANDED);
  });

  it("an open editor with nothing typed is no stranded note: no block, no word", () => {
    const r = render(<Page line={draft} />);
    fireEvent.click(screen.getByRole("button", { name: /^Note — Mohinga/ }));
    r.rerender(<Page line={fired} />);
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("a Burmese console says it in Burmese, naming the dish as the row does", () => {
    const r = render(<Page line={draft} lang="my" />);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded"))!);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "မြေပဲ မထည့်ရ" } });
    r.rerender(<Page line={fired} lang="my" />);
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["table.line.noteStranded"].my.replace("{x}", "မုန့်ဟင်းခါး"),
    );
  });
});
