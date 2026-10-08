import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Test support for the stylesheet contracts in this package — a comment-stripping declaration walker
 * that binds every `prop: value` to its selector and to the `@media` / `@keyframes` block wrapping
 * it, and a `tokens.css` reader that resolves `var()` aliases. The same shape as
 * `apps/qr/lib/css-declarations.ts`, which this package cannot import (deps run apps → packages,
 * never back). Guards PARSE, never scan (LEARNINGS #60): a substring is satisfied by a comment or a
 * dead rule; a declaration bound to its block is not.
 */
export const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

export type CssDecl = {
  media: string | null;
  selector: string;
  prop: string;
  value: string;
  i: number;
};

export function cssDeclarations(css: string): CssDecl[] {
  const code = stripCssComments(css);
  if (/(["'])(?:(?!\1)[^\n])*[{}](?:(?!\1)[^\n])*\1/.test(code))
    throw new Error("a brace inside a quoted string — the brace walk would be ambiguous");
  const out: CssDecl[] = [];
  const stack: string[] = [];
  let buf = "";
  const flush = () => {
    const text = buf.trim();
    buf = "";
    const colon = text.indexOf(":");
    if (colon < 0 || stack.length === 0) return;
    const head = stack[stack.length - 1]!;
    if (head.startsWith("@")) return;
    const media = stack.length > 1 ? (stack[stack.length - 2] ?? null) : null;
    out.push({
      media,
      selector: head.replace(/\s+/g, " "),
      prop: text.slice(0, colon).trim(),
      // Prettier wraps a long value across lines; the value is one string either way.
      value: text
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim(),
      i: out.length,
    });
  };
  for (const ch of code) {
    if (ch === "{") {
      stack.push(buf.trim().replace(/\s+/g, " "));
      buf = "";
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") {
      flush();
    } else buf += ch;
  }
  return out;
}

/** The comma members of a selector list, trimmed — a lookup matches members, never the joined string. */
export const members = (selector: string) => selector.split(",").map((s) => s.trim());

/** Every `var(--name)` reference in a value (fallbacks included). */
export const varRefs = (value: string) =>
  [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!);

export const PASS_CSS = readFileSync(
  fileURLToPath(new URL("../pass.css", import.meta.url)),
  "utf8",
);
export const TOKENS_CSS = readFileSync(
  fileURLToPath(new URL("../tokens.css", import.meta.url)),
  "utf8",
);

/** The FIRST `selector { … }` block of tokens.css as a map (its `:root` and `.dark` hold no nested
 *  braces, and the main blocks precede the reduced-motion override). */
export function tokenBlock(selector: string): Record<string, string> {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const body = (re.exec(TOKENS_CSS)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map[m[1]!] = m[2]!.trim();
  return map;
}

/** Resolve a token through up to five `var()` hops; refuse anything that is not a hex. */
export function tokHex(map: Record<string, string>, name: string): string {
  let v = map[name] ?? "";
  for (let i = 0; i < 5 && v.startsWith("var("); i++) {
    const ref = v.slice(4, -1).trim();
    const next = map[ref];
    if (next === undefined) break;
    v = next.trim();
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v))
    throw new Error(`tokens.css: ${name} did not resolve to a 6-digit hex (got ${v || "nothing"})`);
  return v;
}

// ── WCAG sRGB contrast core (the contrast audit's own math) ──
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** `color-mix(in srgb, <fg> N%, <bg>)` over opaque colours → the effective hex. */
export function mixSrgb(fgHex: string, pct: number, bgHex: string): string {
  const [fr, fg, fb] = hexToRgb(fgHex);
  const [br, bg, bb] = hexToRgb(bgHex);
  const a = pct / 100;
  const mix = (f: number, b: number) => Math.round(f * a + b * (1 - a));
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(fr, br))}${to2(mix(fg, bg))}${to2(mix(fb, bb))}`;
}
