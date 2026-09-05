/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/kds-sound", () => ({ KdsChime: class {} }));

const { ReadyBoard } = await import("./ReadyBoard");

/**
 * P2 · G12 — the wall TV.
 *
 * Two rules this suite exists for:
 *
 * 1. **Both tongues are ALWAYS on the wall.** The dining room is mixed and the screen cannot choose
 *    for it; `lang` decides only which one leads. A conversion that renders `ts(lang, …)` alone
 *    would look right on whichever language the author tested and silently drop the other half.
 * 2. **A refusal renders OUR copy, keyed on the reason** — never the server's English sentence
 *    translated, which is impossible, and never a Burmese sentence invented for a reason this client
 *    has not learned. An English sentence that is true beats a Burmese one that is guessed.
 */
afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ orders: [] }) })),
  );
});

const PREPARING_MY = "ပြင်ဆင်နေသည်";
const READY_MY = "ယူသွားနိုင်ပါပြီ";

async function renderBoard(lang: "en" | "my", refusal?: { status: number; body: unknown }) {
  if (refusal)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: refusal.status,
        ok: false,
        json: async () => refusal.body,
      })),
    );
  const out = render(<ReadyBoard token="t" lang={lang} />);
  return out;
}

describe("the two column headings", () => {
  /**
   * The rule both cases below share, and the defect they were rewritten for: the `<h2>` carries
   * BOTH tongues, so it must carry NO `lang` of its own, and each half must be marked for what IT
   * contains. The first cut put `lang="my"` on the heading itself under a Burmese board, which
   * nested the English echo inside a Burmese element — Padauk type and a Burmese announcement for an
   * English word, the very thing `Chrome`'s rule 2 forbids. Asserted in BOTH directions so the fix
   * cannot regress into the mirror-image bug.
   */
  function halves(h2: HTMLElement) {
    const small = h2.querySelector("small")!;
    const lead = [...h2.children].find((c) => c !== small) as HTMLElement;
    return { lead, small };
  }

  it("English leads, Burmese follows — and BOTH are present", async () => {
    const { container } = await renderBoard("en");
    const heads = [...container.querySelectorAll("h2")];
    expect(heads).toHaveLength(2);
    expect(heads[0]!.textContent).toContain("Preparing");
    expect(heads[0]!.textContent).toContain(PREPARING_MY);
    expect(heads[1]!.textContent).toContain("Ready");
    expect(heads[1]!.textContent).toContain(READY_MY);
    const { lead, small } = halves(heads[0]!);
    expect(lead.textContent).toBe("Preparing");
    expect(lead.hasAttribute("lang")).toBe(false); // English is the document's ambient tongue
    expect(small.getAttribute("lang")).toBe("my");
    expect(heads[0]!.hasAttribute("lang")).toBe(false);
  });

  it("Burmese leads, English follows — and BOTH are still present", async () => {
    const { container } = await renderBoard("my");
    const heads = [...container.querySelectorAll("h2")];
    // The heading spans two tongues, so it carries neither mark; the CSS companion reaches the
    // Burmese half through a DESCENDANT selector and gives that half — and only it — Padauk.
    expect(heads[0]!.hasAttribute("lang")).toBe(false);
    const first = halves(heads[0]!);
    expect(first.lead.getAttribute("lang")).toBe("my");
    expect(first.lead.textContent).toBe(PREPARING_MY);
    expect(first.small.textContent).toBe("Preparing");
    expect(first.small.hasAttribute("lang")).toBe(false);
    const second = halves(heads[1]!);
    expect(second.lead.getAttribute("lang")).toBe("my");
    expect(second.lead.textContent).toBe(READY_MY);
    expect(second.small.textContent).toBe("Ready");
    expect(second.small.hasAttribute("lang")).toBe(false);
  });

  it('no English text ever sits inside a lang="my" element, in either direction', async () => {
    // The rule stated as a property rather than a shape, so a future heading refactor is held to it
    // too: everything under a Burmese mark must be Myanmar script.
    for (const lang of ["en", "my"] as const) {
      cleanup();
      const { container } = await renderBoard(lang);
      const marked = [...container.querySelectorAll('[lang="my"]')];
      expect(marked.length).toBeGreaterThan(0);
      for (const el of marked) expect(el.textContent ?? "").not.toMatch(/[A-Za-z]/);
    }
  });
});

describe("a refusal renders our copy, keyed on the reason", () => {
  it("a DENIED board says so in Burmese", async () => {
    await renderBoard("my", { status: 401, body: { reason: "denied", error: "Unauthorized" } });
    const p = await screen.findByText((t) => t.includes("ခွင့်မပြု"));
    expect(p.getAttribute("lang")).toBe("my");
    // Not the server's English sentence.
    expect(p.textContent).not.toContain("Unauthorized");
  });

  it("an UNCONFIGURED board says something different — the two refusals need different actions", async () => {
    await renderBoard("my", { status: 503, body: { reason: "not_configured" } });
    const p = await screen.findByText((t) => t.includes("မပြင်ဆင်ရသေး"));
    expect(p).toBeTruthy();
  });

  it("renders OUR sentence, not the server's — even in English", async () => {
    // The server's `error` is its own wording for an operator reading logs; the screen has its own
    // copy for the room. There is deliberately no third branch: `readBoardRefusal` yields a verdict
    // only for a (status, reason) pair this client knows, so a reason invented later is a `retry`
    // and never reaches this screen at all.
    await renderBoard("en", { status: 401, body: { reason: "denied", error: "Custom refusal" } });
    await waitFor(() =>
      expect(
        screen.getByText("This screen isn’t authorized for the order-ready board."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Custom refusal")).toBeNull();
  });
});

describe("the status line", () => {
  it("speaks one language only — a bilingual live region says everything twice", async () => {
    const { container } = await renderBoard("my");
    await waitFor(() => {
      const status = container.querySelector('.orb-status[role="status"]')!;
      expect(status.getAttribute("lang")).toBe("my");
    });
    // Exactly one polite region on the page.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0);
  });
});
