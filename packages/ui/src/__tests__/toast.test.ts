import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Toast, TOAST_LEAVE_MS, type SilentToastMessage, type ToastMessage } from "../toast";

/**
 * Phase 1c — the Toast's QUIET variant: spoken through the one region, drawn nowhere.
 *
 * Node env, static markup: the proposition is about what the primitive RENDERS for each message
 * shape, which needs no DOM. The region itself must be identical either way — a quiet line rides the
 * view's one live region and never needs (or gets) a second.
 */

/** The PILL's class token exactly — `ui-toast-region` and `ui-toast-quiet` share its prefix, so a
 *  substring test would be satisfied by the region the pill sits in. */
const PILL = /class="ui-toast(?:"| )/;

const render = (message: ToastMessage | null) =>
  renderToStaticMarkup(createElement(Toast, { message }));

const QUIET: ToastMessage = {
  key: 1,
  text: "Mohinga added",
  my: "ထည့်ပြီးပါပြီ",
  quiet: true,
};

describe("Toast — quiet: spoken, not drawn", () => {
  it("renders the visually-hidden line with its Burmese half, and no pill or button", () => {
    const html = render(QUIET);
    expect(html).toContain('class="ui-toast-quiet"');
    expect(html).toContain("Mohinga added");
    expect(html).toContain('lang="my"');
    expect(html).toContain("ထည့်ပြီးပါပြီ");
    expect(html).not.toMatch(PILL);
    expect(html).not.toContain("<button");
  });

  it("drops an action on a quiet line — there is nothing drawn to press", () => {
    const html = render({ ...QUIET, action: { label: "Undo", onAction: () => {} } });
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Undo");
  });

  it("keeps the ONE always-mounted polite region, quiet or not", () => {
    for (const message of [QUIET, { ...QUIET, quiet: undefined }, null]) {
      const html = render(message);
      expect(html).toMatch(/^<div role="status" aria-live="polite" aria-atomic="true"/);
      expect(html.match(/role="status"/g)).toHaveLength(1);
    }
  });

  it("the same message WITHOUT quiet still draws the pill", () => {
    const html = render({ key: 1, text: "Mohinga added", my: "ထည့်ပြီးပါပြီ" });
    expect(html).toMatch(PILL);
    expect(html).not.toContain("ui-toast-quiet");
  });
});

// ── Phase 2b · feedback ──
/**
 * The staff lane's thumb-zone Undo: the first caller with an action, and the first whose view
 * already SPEAKS the fact (the lane's own region announces the pick). What the primitive owes it:
 *
 *   - `live={false}` — no role, no aria-live, no aria-atomic: one voice per fact;
 *   - the action's NAME is its visible label (a ReactNode, marked by the caller) — no aria-label
 *     channel at all, so the staff-language guard's attribute rules keep seeing every name;
 *   - a `disabled` or `shield`ed action REFUSES the tap (aria-disabled, label kept);
 *   - `onHold` fires on a KEYBOARD focus only (`:focus-visible`), and blur always releases;
 *   - the drain draws the caller's REAL window and pauses while held;
 *   - an xl pill takes pointer events over its whole visible body, and a LEAVING one takes none —
 *     except under reduced motion, where the leaving pill is still visible.
 *
 * Node env: markup through `renderToStaticMarkup`, handlers by walking the element tree `Toast`
 * returns (it is a plain function component — no hooks, no DOM needed to reach its props).
 */
type AnyProps = { children?: ReactNode; [k: string]: unknown };
function findEl(
  node: ReactNode,
  pred: (el: ReactElement<AnyProps>) => boolean,
): ReactElement<AnyProps> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findEl(n, pred);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement<AnyProps>(node)) return null;
  if (pred(node)) return node;
  return findEl(node.props.children, pred);
}
const MY = createElement("span", { lang: "my", className: "chrome-my" }, "ပြန်ဖျက်");
const xlMessage = (over: Partial<SilentToastMessage> = {}): SilentToastMessage => ({
  key: 7,
  text: "Table 7 picked up",
  action: { label: MY, onAction: () => {} },
  drainMs: 6000,
  ...over,
});
const silentXl = (
  message: SilentToastMessage,
  extra: { shield?: boolean; leaving?: boolean } = {},
) => renderToStaticMarkup(createElement(Toast, { live: false, size: "xl", message, ...extra }));
const actionOf = (tree: ReactNode) => findEl(tree, (el) => el.type === "button")!;

describe("Toast — the staff lane's silent xl pill", () => {
  it("live={false} renders no role, aria-live or aria-atomic — the view's own region speaks the fact", () => {
    const html = silentXl(xlMessage());
    expect(html).toMatch(/^<div class="ui-toast-region"/);
    expect(html).not.toMatch(/role=|aria-live|aria-atomic/);
    // …and the default is untouched: the diner callers keep their one polite region.
    expect(render(xlMessage())).toMatch(
      /^<div role="status" aria-live="polite" aria-atomic="true"/,
    );
  });

  it("a quiet line cannot be silent — the type refuses it, and the render draws and speaks nothing", () => {
    // A quiet message is SPOKEN through the region; a live={false} region speaks nothing, so the
    // pair is a message nobody receives. `tsc` holds the refusal (the directive fails if it stops).
    const el = createElement(Toast, {
      live: false,
      // @ts-expect-error — `quiet` is `never` on a silent toast's message
      message: { key: 1, text: "Mohinga added", quiet: true },
    });
    const html = renderToStaticMarkup(el);
    expect(html).not.toContain("ui-toast-quiet");
    expect(html).not.toContain("Mohinga added");
  });

  it("the xl pill carries its size class; a leaving one says so", () => {
    expect(silentXl(xlMessage())).toMatch(/class="ui-toast ui-toast-xl"/);
    expect(silentXl(xlMessage(), { leaving: true })).toMatch(
      /class="ui-toast ui-toast-xl ui-toast-leaving"/,
    );
  });

  it("a ReactNode label renders its marked span, and the action has NO aria-label — its name is what it shows", () => {
    const html = silentXl(xlMessage());
    const button = /<button[^>]*>(.*?)<\/button>/.exec(html);
    expect(button).not.toBeNull();
    expect(button![1]).toBe('<span lang="my" class="chrome-my">ပြန်ဖျက်</span>');
    expect(button![0]).not.toContain("aria-label");
  });

  it("the drain draws the caller's REAL window, is hidden from assistive tech, and pauses while held", () => {
    const running = silentXl(xlMessage());
    expect(running).toMatch(
      /<span class="ui-toast-drain" aria-hidden="true" style="--toast-drain:6000ms"/,
    );
    expect(running).not.toContain("data-held");
    expect(silentXl(xlMessage({ held: true }))).toMatch(
      /class="ui-toast ui-toast-xl" data-held="true"/,
    );
    // A pill with no window draws no drain.
    expect(silentXl(xlMessage({ drainMs: undefined }))).not.toContain("ui-toast-drain");
  });

  it("a disabled or shielded action refuses the tap — aria-disabled, the label kept", () => {
    const onAction = vi.fn();
    for (const [message, shield] of [
      [xlMessage({ action: { label: MY, onAction, disabled: true } }), false],
      [xlMessage({ action: { label: MY, onAction } }), true],
    ] as const) {
      const tree = Toast({ live: false, size: "xl", message, shield });
      const btn = actionOf(tree);
      expect(btn.props["aria-disabled"]).toBe(true);
      (btn.props.onClick as () => void)();
      expect(silentXl(message, { shield })).toMatch(/<button[^>]*aria-disabled="true"[^>]*>/);
      expect(silentXl(message, { shield })).toContain("ပြန်ဖျက်");
    }
    // MUTATION: drop the refusal — the shield's second tap (a double-tapped Undo) lands, red.
    expect(onAction).not.toHaveBeenCalled();
    const live = actionOf(
      Toast({ live: false, size: "xl", message: xlMessage({ action: { label: MY, onAction } }) }),
    );
    expect(live.props["aria-disabled"]).toBeUndefined();
    (live.props.onClick as () => void)();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("the shield is drawn on the pill — it stays VISIBLE while it refuses", () => {
    expect(silentXl(xlMessage(), { shield: true })).toMatch(
      /class="ui-toast ui-toast-xl" data-shield="true"/,
    );
  });

  it("onHold fires for a KEYBOARD focus only, and a blur always releases", () => {
    const onHold = vi.fn();
    const btn = actionOf(
      Toast({
        live: false,
        size: "xl",
        message: xlMessage({ action: { label: MY, onAction: () => {}, onHold } }),
      }),
    );
    const focus = btn.props.onFocus as (e: {
      currentTarget: { matches: (q: string) => boolean };
    }) => void;
    const blur = btn.props.onBlur as () => void;
    // A tap's focus (Android focuses on tap) never stalls the write.
    focus({ currentTarget: { matches: () => false } });
    expect(onHold).not.toHaveBeenCalled();
    // An engine that cannot parse `:focus-visible` reads as a tap — never a hold.
    focus({
      currentTarget: {
        matches: () => {
          throw new SyntaxError("unsupported");
        },
      },
    });
    expect(onHold).not.toHaveBeenCalled();
    const asked: string[] = [];
    focus({ currentTarget: { matches: (q) => (asked.push(q), true) } });
    expect(asked).toEqual([":focus-visible"]);
    expect(onHold).toHaveBeenLastCalledWith(true);
    blur();
    expect(onHold).toHaveBeenLastCalledWith(false);
  });

  it("TOAST_LEAVE_MS is the leave animation's own duration (--dur-fast)", () => {
    const tokens = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");
    const fast = /--dur-fast:\s*(\d+)ms/.exec(tokens);
    expect(Number(fast?.[1])).toBe(TOAST_LEAVE_MS);
  });
});

describe("Toast — the xl pill's hit area, in the stylesheet", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../primitives.css", import.meta.url)),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  /** Every `@media <query> { … }` block's body, brace-walked (the LockButton.test pattern). */
  function mediaBlocks(query: string): string[] {
    const out: string[] = [];
    let i = css.indexOf(query);
    while (i !== -1) {
      const open = css.indexOf("{", i);
      let depth = 0;
      let j = open;
      for (; j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}" && --depth === 0) break;
      }
      out.push(css.slice(open + 1, j));
      i = css.indexOf(query, j);
    }
    return out;
  }
  const rule = (src: string, sel: string) =>
    new RegExp(`(?:^|[}\\s])${sel.replace(/[.[\]()"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(src)?.[1];
  const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

  it("a showing xl pill takes pointer events over its WHOLE body — a missed Undo lands on the pill", () => {
    expect(rule(outside, ".ui-toast-xl")).toMatch(/pointer-events:\s*auto/);
  });
  it("a LEAVING xl pill takes none — an invisible pill never eats a tap", () => {
    expect(rule(outside, ".ui-toast-xl.ui-toast-leaving")).toMatch(/pointer-events:\s*none/);
  });
  it("under reduced motion the leaving pill is still VISIBLE, so it takes them back; the drain is not drawn", () => {
    const rm = mediaBlocks("@media (prefers-reduced-motion: reduce)").join("\n");
    expect(rule(rm, ".ui-toast-xl.ui-toast-leaving")).toMatch(/pointer-events:\s*auto/);
    expect(rule(rm, ".ui-toast-drain")).toMatch(/display:\s*none/);
  });
  it("the drain pauses while the pill is held", () => {
    expect(rule(outside, ".ui-toast[data-held] .ui-toast-drain")).toMatch(
      /animation-play-state:\s*paused/,
    );
  });
});
