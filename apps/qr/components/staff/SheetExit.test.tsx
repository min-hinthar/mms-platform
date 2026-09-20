/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "@mms/ui";
import { STAFF } from "@/lib/i18n/staff";
import { sheetCloseLabel } from "./SheetCloseLabel";

/**
 * The shared sheet's two primitive-level changes from the manager rails' audit, pinned where a
 * jsdom render can falsify them:
 *  - M76 — the EXIT: a closing sheet stays mounted until its CSS exit animation ends. Radix's
 *    Presence reads that animation off the ref each portal child forwards, so the guard is against
 *    the structure (a provider between the portal and the content, or a content that does not
 *    forward its ref, unmounts instantly) — jsdom runs no stylesheet, so the computed animation is
 *    stubbed to follow `data-state` exactly as globals.css declares it, and the CSS itself is
 *    parsed below (the closed selectors ship an animation whose keyframes exist, and the
 *    reduced-motion block names them).
 *  - manager-9 — the ✕ is named by the caller's sr-only dictionary text, never an English literal.
 */

/** Radix Presence compares `event.animationName` through `CSS.escape`; jsdom has no `CSS`. */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };

/** What a real stylesheet gives Radix: the computed `animationName` follows `data-state`. Other
 *  elements keep jsdom's real answer (react-remove-scroll and aria-hidden read styles too). */
function stubComputedStyle() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    const node = el as HTMLElement;
    if (!node.classList?.contains("mms-sheet") && !node.classList?.contains("mms-scrim"))
      return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "animationName") {
          const closed = node.getAttribute("data-state") === "closed";
          return node.classList.contains("mms-sheet")
            ? closed
              ? "sheetDown"
              : "up"
            : closed
              ? "fadeOut"
              : "fade";
        }
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  });
}

function animationEnd(el: Element, animationName: string) {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: animationName });
  el.dispatchEvent(ev);
}

function Host({ open, busy = false }: { open: boolean; busy?: boolean }) {
  return (
    <Sheet
      open={open}
      onOpenChange={() => {}}
      busy={busy}
      title="Settle in cash"
      closeLabel={sheetCloseLabel("my")}
    >
      <p>body</p>
    </Sheet>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("M76 — the exit", () => {
  it("a closing sheet stays mounted, `data-state=closed`, until BOTH its exit animations end", async () => {
    stubComputedStyle();
    const { rerender } = render(<Host open />);
    const dialog = screen.getByRole("dialog");
    const scrim = document.querySelector(".mms-scrim");
    expect(scrim).not.toBeNull();
    await act(async () => {
      rerender(<Host open={false} />);
    });
    // MUTATION: move `DomMaxProvider` back inside `Dialog.Portal` (or drop `ref` from
    // `SheetContent`) — the portal's Presence is handed no node, the dialog is gone here, red.
    expect(document.querySelector(".mms-sheet")).not.toBeNull();
    expect(dialog.getAttribute("data-state")).toBe("closed");
    expect(document.querySelector(".mms-scrim")?.getAttribute("data-state")).toBe("closed");
    await act(async () => {
      animationEnd(dialog, "sheetDown");
    });
    // The scrim's own animation has not ended: it is still there, the sheet is not.
    expect(document.querySelector(".mms-sheet")).toBeNull();
    expect(document.querySelector(".mms-scrim")).not.toBeNull();
    await act(async () => {
      animationEnd(scrim!, "fadeOut");
    });
    expect(document.querySelector(".mms-scrim")).toBeNull();
  });

  it("without an exit animation (reduced motion) a closing sheet unmounts at once", async () => {
    // jsdom's real computed style: no stylesheet, `animationName` empty → Radix reads "none".
    const { rerender } = render(<Host open />);
    await act(async () => {
      rerender(<Host open={false} />);
    });
    expect(document.querySelector(".mms-sheet")).toBeNull();
    expect(document.querySelector(".mms-scrim")).toBeNull();
  });

  // The stylesheet, parsed with a brace walker (comments stripped) — never a regex over the whole
  // file, so a block nested in a media query is attributed to THAT query (LEARNINGS #60).
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  type Block = { prelude: string; body: string };
  function blocksOf(src: string): Block[] {
    const out: Block[] = [];
    let depth = 0;
    let prelude = "";
    let body = "";
    for (const ch of src) {
      if (ch === "{") {
        depth += 1;
        if (depth === 1) continue;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push({ prelude: prelude.trim(), body });
          prelude = "";
          body = "";
          continue;
        }
      }
      if (depth === 0) prelude += ch;
      else body += ch;
    }
    return out;
  }
  const selectors = (b: Block) => b.prelude.split(",").map((s) => s.trim());
  const declaration = (b: Block, prop: string) =>
    b.body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.startsWith(`${prop}:`))
      .map((d) => d.slice(prop.length + 1).trim());
  const top = blocksOf(css);
  const keyframes = new Set(
    top.filter((b) => b.prelude.startsWith("@keyframes ")).map((b) => b.prelude.slice(11).trim()),
  );
  const CLOSED = ['.mms-sheet[data-state="closed"]', '.mms-scrim[data-state="closed"]'];

  it.each(CLOSED)("%s ships exactly one top-level animation, and its keyframes exist", (sel) => {
    const owners = top.filter(
      (b) => selectors(b).includes(sel) && declaration(b, "animation").length,
    );
    // MUTATION: delete the `.mms-sheet[data-state="closed"]` rule — no owner, red.
    expect(owners, `${sel} declares its exit once`).toHaveLength(1);
    const [anim] = declaration(owners[0]!, "animation");
    const name = anim!.split(/\s+/)[0]!;
    // MUTATION: rename `@keyframes sheetDown` — the shipped literal names nothing, red.
    expect([...keyframes], `${sel}: ${anim}`).toContain(name);
    expect(name).not.toBe("none");
    expect(anim).toMatch(/var\(--dur-sheet\)/);
  });

  it("the reduced-motion block names both closed selectors with `animation: none`", () => {
    const rm = top.filter((b) => b.prelude === "@media (prefers-reduced-motion: reduce)");
    expect(rm.length).toBeGreaterThan(0);
    for (const sel of CLOSED) {
      const inner = rm.flatMap((m) => blocksOf(m.body)).filter((b) => selectors(b).includes(sel));
      // MUTATION: drop the closed selectors from the reduced-motion block — the attribute
      // selector out-specifies `.mms-sheet`, so the exit would run under reduced motion; red.
      expect(inner, `${sel} inside prefers-reduced-motion`).toHaveLength(1);
      expect(declaration(inner[0]!, "animation")).toEqual(["none"]);
    }
  });
});

describe("manager-9 — the ✕'s name", () => {
  it("is the caller's sr-only text (Burmese under `my`; the busy twin while busy), with no aria-label competing", () => {
    const { rerender } = render(<Host open />);
    const x = screen.getByRole("button", { name: STAFF["shell.close"].my });
    // MUTATION: keep the English `aria-label` beside the text — an aria-label wins over content,
    // the name is "Close", the query above throws; red.
    expect(x.getAttribute("aria-label")).toBeNull();
    expect(x.querySelector(".sr-only")?.textContent).toBe(STAFF["shell.close"].my);
    rerender(<Host open busy />);
    const busy = screen.getByRole("button", { name: STAFF["shell.closeBusy"].my });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
  });

  it("stays the English default when no label is supplied (the diner sheets)", () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Mohinga">
        <p>body</p>
      </Sheet>,
    );
    expect(screen.getByRole("button", { name: "Close" }).getAttribute("aria-label")).toBe("Close");
  });
});
