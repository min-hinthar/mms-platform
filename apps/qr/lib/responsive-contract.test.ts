import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * R1 — THE RESPONSIVE CONTRACT: one column knob, three tiers, and no page carrying a width of its own.
 *
 * Before R1 fourteen customer pages each wrote `maxWidth: 440; margin: 0 auto` on their own <main>,
 * nine as the literal and five as the token, and the sweep that measured every screen at eight
 * viewports found the consequence: a phone floating in a desktop, at every width. The fix is a
 * SYSTEM, not fourteen edits — `--w-page` is set per tier in ONE place and every page column reads
 * it (`.page-col`), with `.page-col-narrow` as the only other knob. A system is exactly the kind of
 * thing that decays one convenient inline style at a time, and nothing else can see it: tsc does
 * not know a column from a card, the linter does not read `style={{ maxWidth }}`, and the visual
 * sweep runs against a deployed build, weeks apart. So the contract is pinned here, twice:
 *
 *   · the STYLESHEET half parses globals.css (comments stripped, every declaration bound to the
 *     `@media` block it ships in — never a substring search a comment or a dead rule could satisfy)
 *     and asserts the three tiers, their order, the narrow cap, and the per-surface rules that
 *     exist only to spend the wider column;
 *   · the PAGES half parses every customer .tsx with the TypeScript AST and asserts that each
 *     <main> either IS the column (`page-col`) or is the centred outage shell (`placeItems`), that
 *     none declares a width or margin of its own, and that the narrow cap sits on exactly the money
 *     and status columns and on nothing else.
 *
 * RED-FIRST (each induced, watched fail, restored): `52rem` → `40rem` fails the ordering;
 * `maxWidth: 480` back on /account's <main> fails "no inline width"; dropping `page-col` from
 * /cart's <main> fails "is the column"; `63.98em` → `67.98em` fails the one-boundary rule.
 *
 * Floors, so a deleted page cannot make an assertion vacuously green (the W8 lesson): the counts
 * below were MEASURED on the R1 tree, never transcribed from a plan.
 */

const QR = join(__dirname, "..");
const CSS = readFileSync(join(QR, "app", "globals.css"), "utf8");
const TOKENS = readFileSync(join(QR, "..", "..", "packages", "ui", "src", "tokens.css"), "utf8");

/** Comments name selectors and values in prose; a guard a comment can satisfy reads the wrong thing. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Decl = { media: string | null; selector: string; prop: string; value: string };

/**
 * A declaration walker that binds every `prop: value` to the selector block it sits in AND to the
 * `@media` / `@supports` block wrapping that (one level, which is all this stylesheet uses). A
 * tokenizer on `{` `}` `;` is enough: prettier writes every declaration `prop: value;` on its own
 * line and closes every block, so there is no ambiguity to resolve — and where there would be
 * (a `{` inside a string), this file has none: assert it rather than guess.
 */
function declarations(css: string): Decl[] {
  const code = strip(css);
  // No brace inside a quoted string (one line, same quote): the brace walk below is then exact.
  expect(code).not.toMatch(/(["'])(?:(?!\1)[^\n])*[{}](?:(?!\1)[^\n])*\1/);
  const out: Decl[] = [];
  const stack: string[] = [];
  let buf = "";
  const flush = () => {
    const text = buf.trim();
    buf = "";
    const colon = text.indexOf(":");
    if (colon < 0 || stack.length === 0) return;
    const head = stack[stack.length - 1]!;
    if (head.startsWith("@")) return; // a declaration directly inside @media/@supports: not a rule
    const media = stack.length > 1 ? (stack[stack.length - 2] ?? null) : null;
    out.push({
      media,
      selector: head.replace(/\s+/g, " "),
      prop: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
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

const DECLS = declarations(CSS);
const rem = (v: string) => {
  const m = /^([\d.]+)rem$/.exec(v);
  expect(m, `${v} is not a rem length`).not.toBeNull();
  return Number(m![1]);
};
/** A declaration applies to every member of a comma list (`.mms-scrim, .mms-sheet { … }`), so a
 *  lookup matches members, never the joined string — else a shared rule reads as absent. */
const find = (selector: string, prop: string, media: string | null = null) =>
  DECLS.filter(
    (d) =>
      d.selector.split(",").some((s) => s.trim() === selector) &&
      d.prop === prop &&
      d.media === media,
  );
const one = (selector: string, prop: string, media: string | null = null) => {
  const hits = find(selector, prop, media);
  expect(hits, `${selector} { ${prop} } under ${media ?? "no media"}`).toHaveLength(1);
  return hits[0]!.value;
};

describe("the responsive contract — the stylesheet half", () => {
  const TABLET = "@media (min-width: 48em)";
  const DESKTOP = "@media (min-width: 64em)";
  const SHORT = "@media (max-height: 520px)";

  it("sets --w-page in exactly three tiers, in ascending order, from the content column up", () => {
    const tiers = DECLS.filter((d) => d.prop === "--w-page");
    expect(tiers.map((d) => [d.media, d.selector, d.value])).toEqual([
      [null, ":root", "var(--w-content)"],
      [TABLET, ":root", "46rem"],
      [DESKTOP, ":root", "52rem"],
    ]);
    const content = /--w-content:\s*([\d.]+rem)/.exec(strip(TOKENS));
    expect(content).not.toBeNull();
    const [phone, tablet, desktop] = [rem(content![1]!), rem("46rem"), rem("52rem")];
    expect(phone).toBeLessThan(tablet);
    expect(tablet).toBeLessThan(desktop);
  });

  it("gives the page column exactly one width source, and the narrow cap sits between the phone and tablet tiers", () => {
    expect(one(".page-col", "max-width")).toBe("var(--w-page)");
    expect(one(".page-col", "margin-inline")).toBe("auto");
    expect(one(".page-col-narrow", "max-width")).toBe("min(var(--w-page), 34rem)");
    // 34rem must actually CAP the tablet tier (else the class is decorative) and must not touch the
    // phone (else a phone column would grow past the shipped 440).
    expect(rem("34rem")).toBeGreaterThan(rem("27.5rem"));
    expect(rem("34rem")).toBeLessThan(rem("46rem"));
  });

  it("keeps the phone sheet on the content column, and makes it a centred 34rem dialog from the tablet tier", () => {
    expect(one(".mms-sheet", "max-width")).toBe("var(--w-content)");
    // The dialog shares the money column's measure — one number for "a reading column".
    expect(one(".mms-sheet", "max-width", TABLET)).toBe(
      one(".page-col-narrow", "max-width").match(/, (\d+rem)\)/)![1],
    );
    expect(one(".mms-sheet", "bottom", TABLET)).toBe("auto");
    expect(one(".mms-sheet", "translate", TABLET)).toBe("0 -50%");
    // The drag is handle-initiated, so hiding the handle IS what disables the swipe on a dialog.
    expect(one(".mms-grab-zone", "display", TABLET)).toBe("none");
    // The fade replaces the slide only where motion is allowed; the reduced-motion `none` stands.
    const fades = DECLS.filter(
      (d) => d.selector === ".mms-sheet" && d.prop === "animation" && /^fade /.test(d.value),
    );
    expect(fades.map((d) => d.media)).toEqual([
      "@media (min-width: 48em) and (prefers-reduced-motion: no-preference)",
    ]);
    expect(one(".mms-sheet", "animation", "@media (prefers-reduced-motion: reduce)")).toBe("none");
  });

  it("wraps the chip rails where a mouse cannot swipe them, on the same tiers as the rest", () => {
    expect(one(".menu-rail", "overflow-x")).toBe("auto");
    expect(one(".menu-rail", "flex-wrap", TABLET)).toBe("wrap");
    expect(one(".aisle-rail-scroll", "flex-wrap", DESKTOP)).toBe("wrap");
    expect(one(".table-grid", "grid-template-columns", TABLET)).toBe(
      "repeat(auto-fill, minmax(124px, 1fr))",
    );
  });

  it("keeps ONE selection vocabulary on the modifier rows and docks the toast on the published band height", () => {
    const chosen = DECLS.filter((d) => d.selector === ".item-opt:has(.item-opt-input:checked)");
    expect(chosen.find((d) => d.prop === "border-color")?.value).toBe("var(--ac)");
    expect(chosen.some((d) => /jade/.test(d.value))).toBe(false);
    expect(one(".grocery-toast", "bottom")).toContain("var(--cta-dock-h, 74px)");
  });

  it("spends the tablet width on the surfaces that earn it, and nowhere on a phone", () => {
    expect(one(".home-doors", "grid-template-columns", TABLET)).toBe("repeat(3, minmax(0, 1fr))");
    expect(one(".home-doors .door", "flex-direction", TABLET)).toBe("column");
    expect(one(".menu-list", "grid-template-columns", TABLET)).toBe("repeat(2, minmax(0, 1fr))");
    expect(one(".gcard-grid", "grid-template-columns")).toBe("1fr 1fr");
    expect(one(".gcard-grid", "grid-template-columns", TABLET)).toBe("repeat(3, minmax(0, 1fr))");
    expect(one(".gcard-grid", "grid-template-columns", DESKTOP)).toBe("repeat(4, minmax(0, 1fr))");
    // Nothing gives these a template on the phone (bare) that the tier rules would then override.
    expect(find(".home-doors", "grid-template-columns")).toHaveLength(0);
    expect(find(".menu-list", "grid-template-columns")).toHaveLength(0);
  });

  it("moves the ambient pause coin into the gutter from the tablet tier, keyed on the column width", () => {
    expect(one(".pa-pause", "left", TABLET)).toContain("var(--w-page)");
    expect(one(".pa-pause", "position")).toBe("fixed");
  });

  it("switches the aisle rail and the aisle fan on ONE boundary, at the desktop tier", () => {
    expect(one(".aisle-rail", "position", DESKTOP)).toBe("static");
    const hide = DECLS.filter(
      (d) => d.selector === ".aisle-fan" && d.prop === "display" && d.value === "none",
    );
    expect(hide).toHaveLength(1);
    const max = /^@media \(max-width: ([\d.]+)em\)$/.exec(hide[0]!.media ?? "");
    const min = /^@media \(min-width: ([\d.]+)em\)$/.exec(DESKTOP);
    expect(max).not.toBeNull();
    // 63.98em hides the fan up to the pixel the rail goes static: the two never coexist and never
    // both vanish. (Float compare on hundredths, which is what the stylesheet writes.)
    expect(Math.round((Number(min![1]) - Number(max![1])) * 100)).toBe(2);
    // The card controls' scroll-margin exists only while the rail is sticky — same boundary.
    const sm = DECLS.filter(
      (d) => d.prop === "scroll-margin-top" && d.selector.includes(".gcard-fab"),
    );
    expect(sm).toHaveLength(1);
    expect(sm[0]!.media).toBe(hide[0]!.media);
  });

  it("returns the menu toolbar to flow ONLY under the short (height-keyed) tier", () => {
    expect(one(".menu-toolbar", "position")).toBe("sticky");
    const statics = DECLS.filter(
      (d) => d.selector === ".menu-toolbar" && d.prop === "position" && d.value === "static",
    );
    expect(statics.map((d) => d.media)).toEqual([SHORT]);
  });
});

/* ── the pages half ─────────────────────────────────────────────────────────────────────────── */

/** Every customer surface that renders a <main>. Staff (`.staff-main`), the /board TV and the API
 *  are other systems; global-error.tsx renders outside the app shell with no stylesheet at all. */
function customerFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(QR, p).split(sep).join("/");
      if (/^app\/(staff|board|api)(\/|$)/.test(rel) || rel === "app/global-error.tsx") continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(rel);
    }
  };
  walk(join(QR, "app"));
  for (const c of ["Checkout", "TablePicker", "OrderTracker", "menu/MenuBrowser"])
    out.push(`components/${c}.tsx`);
  return out;
}

type Main = { file: string; classes: string[]; styleKeys: string[] };

/** Resolve `className={col}` / `style={wrap}` through a top-level `const` initializer (the /track
 *  page names both once); anything else the guard cannot read is a failure, never a pass. */
function mains(file: string): Main[] {
  const src = readFileSync(join(QR, file), "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
  }
  const resolve = (e: ts.Expression | undefined): ts.Expression | undefined => {
    if (!e) return e;
    if (ts.isAsExpression(e) || ts.isParenthesizedExpression(e)) return resolve(e.expression);
    if (ts.isJsxExpression(e)) return resolve(e.expression);
    if (ts.isIdentifier(e)) return resolve(consts.get(e.text));
    return e;
  };
  const out: Main[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sf) === "main"
    ) {
      let classes: string[] = [];
      let styleKeys: string[] = [];
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) {
          throw new Error(`${file}: a spread on <main> is unreadable to the guard`);
        }
        const name = attr.name.text;
        const init = attr.initializer
          ? ts.isStringLiteral(attr.initializer)
            ? attr.initializer
            : resolve(attr.initializer)
          : undefined;
        if (name === "className") {
          expect(
            init && ts.isStringLiteral(init),
            `${file}: className on <main> must be a string`,
          ).toBe(true);
          classes = (init as ts.StringLiteral).text.split(/\s+/).filter(Boolean);
        }
        if (name === "style") {
          expect(
            init && ts.isObjectLiteralExpression(init),
            `${file}: style on <main> must be an object literal (or a const holding one)`,
          ).toBe(true);
          styleKeys = (init as ts.ObjectLiteralExpression).properties.map((p) => {
            if (ts.isSpreadAssignment(p)) return "...";
            return p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
              ? p.name.text
              : "?";
          });
        }
      }
      out.push({ file, classes, styleKeys });
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return out;
}

describe("the responsive contract — the pages half", () => {
  const all = customerFiles().flatMap(mains);
  const columns = all.filter((m) => m.classes.includes("page-col"));
  const shells = all.filter((m) => m.styleKeys.includes("placeItems"));

  it("finds the surfaces it is supposed to be watching (floors, measured on the R1 tree)", () => {
    expect(all.length).toBeGreaterThanOrEqual(25);
    expect(columns.length).toBeGreaterThanOrEqual(21);
    expect(shells.length).toBeGreaterThanOrEqual(4);
  });

  it("makes every customer <main> either THE page column or the centred outage shell", () => {
    const strays = all.filter(
      (m) => !m.classes.includes("page-col") && !m.styleKeys.includes("placeItems"),
    );
    expect(strays.map((m) => m.file)).toEqual([]);
  });

  it("lets no customer <main> carry a width or a horizontal margin of its own", () => {
    const own = [
      "maxWidth",
      "width",
      "minWidth",
      "margin",
      "marginInline",
      "marginLeft",
      "marginRight",
      "...",
    ];
    const offenders = all.filter((m) => m.styleKeys.some((k) => own.includes(k)));
    expect(offenders.map((m) => `${m.file} {${m.styleKeys.join(",")}}`)).toEqual([]);
  });

  it("caps exactly the money and status columns (cart · track · account) and nothing else", () => {
    const narrowFiles = new Set(
      columns.filter((m) => m.classes.includes("page-col-narrow")).map((m) => m.file),
    );
    const wideFiles = new Set(
      columns.filter((m) => !m.classes.includes("page-col-narrow")).map((m) => m.file),
    );
    expect([...narrowFiles].sort()).toEqual(
      [
        "app/account/loading.tsx",
        "app/account/page.tsx",
        "app/cart/loading.tsx",
        "app/cart/page.tsx",
        "app/track/loading.tsx",
        "app/track/page.tsx",
        "components/Checkout.tsx",
        "components/OrderTracker.tsx",
      ].sort(),
    );
    // No file mixes the two: a page is a money column or it takes the tier.
    for (const f of narrowFiles)
      expect(wideFiles.has(f), `${f} mixes narrow and tier columns`).toBe(false);
    expect([...wideFiles].sort()).toEqual(
      [
        "app/(order)/dine-in/loading.tsx",
        "app/(order)/menu/loading.tsx",
        "app/grocery/loading.tsx",
        "app/grocery/page.tsx",
        "app/page.tsx",
        "components/TablePicker.tsx",
        "components/menu/MenuBrowser.tsx",
      ].sort(),
    );
  });
});
