import type { Appearance, CustomFontSource } from "@stripe/stripe-js";

/**
 * Phase 1c (F17) — Stripe's card iframe as a MIRROR of our tokens. Pure: `stripe-client.ts` is the
 * DOM adapter that resolves each token and hands it in through `read`, so every mapping below is
 * falsified by a value in `stripe-appearance.test.ts`.
 *
 * The iframe cannot read a custom property, so it gets resolved values — and it cannot parse `rem`,
 * `max()` or `calc()` either, so `read` returns LENGTH tokens (`STRIPE_LENGTH_TOKENS`) already
 * resolved to px (`--fs-field` is `max(1rem, var(--fs-body))`). Colours and weights are read raw.
 *
 * The card form therefore looks like the Field primitive (§20): the same 16px floor (M78 — iOS never
 * zooms inside the iframe either), the same label size/weight/gap, the same --s3/--s4 padding, the
 * same hairline and the same 1px-gap + 2.5px --ac focus ring, drawn as the box-shadow ring Stripe's
 * frame already pads for. The selected payment-method tab is §2's lit cap FILL with ink-follows-the-
 * fill; the --ac edge supplies the 3:1 non-text contrast flat gold cannot give in light. Stripe rules
 * take no background-image, so the cap's gradient/sheen/glow cannot cross the iframe: flat gold is
 * the honest subset. What is NOT mirrored, stated rather than hidden: the Field's ink@6% inset shade
 * (Stripe takes no color-mix, and a hand-converted copy would be a second source).
 *
 * `FALLBACK` fires only when a custom property reads back empty — the reachable case is a stylesheet
 * that FAILED (a stale chunk 404 after a deploy), not a slow one (W22d). Every entry mirrors the
 * token in its comment and is pinned by `scripts/check-theme-parity.mjs` §4, per theme (`.dark`
 * overrides `:root`) and SHARED (theme-independent, checked against `:root`).
 */
export const FALLBACK = {
  light: {
    ac: "#a65f10", // = --ac
    cd: "#fffdf8", // = --cd
    tx: "#1b1714", // = --tx
    t2: "#6e6358", // = --t2
    t3: "#726859", // = --t3
    warn: "#a44b34", // = --warn
    ok: "#346e47", // = --ok
    oa: "#fffdf8", // = --oa
    bd: "rgba(58, 35, 23, 0.1)", // = --bd
    gold: "#e8a83c", // = --gold
  },
  dark: {
    ac: "#e7a53a", // = --ac
    cd: "#2b213c", // = --cd
    tx: "#f3ecdf", // = --tx
    t2: "#bcafc8", // = --t2
    t3: "#a69eb1", // = --t3
    warn: "#e0855f", // = --warn
    ok: "#5fb07e", // = --ok
    oa: "#130d1e", // = --oa
    bd: "rgba(243, 236, 223, 0.13)", // = --bd
    gold: "#f4c879", // = --gold
  },
  shared: {
    ink: "#1b1714", // = --ink (a CONSTANT: .dark never re-declares it)
    "fs-field": "16px", // = --fs-field (max(1rem, var(--fs-body)) at the 16px root)
    "fs-label": "14px", // = --fs-label (0.875rem)
    "lh-normal": "1.5", // = --lh-normal
    "fw-regular": "400", // = --fw-regular
    "fw-medium": "500", // = --fw-medium
    "fw-bold": "700", // = --fw-bold
    s1: "4px", // = --s1
    s2: "8px", // = --s2
    s3: "12px", // = --s3
    s4: "16px", // = --s4
    "r-sm": "12px", // = --r-sm
    "field-gap": "6px", // = --field-gap
    "focus-w": "2.5px", // = --focus-w
    "field-focus-offset": "1px", // = --field-focus-offset
  },
} as const;

type ThemeKey = keyof typeof FALLBACK.light;
type SharedKey = keyof typeof FALLBACK.shared;

/** The tokens `read` must hand back RESOLVED TO PX (Stripe parses no rem/max()/calc()). */
export const STRIPE_LENGTH_TOKENS: ReadonlySet<string> = new Set([
  "--fs-field",
  "--fs-label",
  "--s1",
  "--s2",
  "--s3",
  "--s4",
  "--r-sm",
  "--field-gap",
  "--focus-w",
  "--field-focus-offset",
]);

/** The CustomFontSource family — a LITERAL, never `--font-body` (next/font renames the page's
 *  family and appends a `Fallback` face the iframe cannot load). */
export const STRIPE_FONT_FAMILY = "Hanken Grotesk";
/** The byte-identical latin variable subset next/font ships, served first-party with CORS `*` and
 *  an immutable cache (next.config.ts); OFL-1.1 alongside. The name is versioned: never edit the
 *  file in place — a new cut gets a new name, or every cached iframe keeps the old one for a year. */
export const STRIPE_FONT_FILE = "/fonts/hanken-grotesk-latin-wght-v1.woff2";
const FONT_STACK = `"${STRIPE_FONT_FAMILY}", system-ui, sans-serif`;

/** A resolved token by its bare name (`"ac"` → `read("--ac")`), falling back per theme / shared. */
function reader(read: (token: string) => string, isDark: boolean) {
  const theme = isDark ? FALLBACK.dark : FALLBACK.light;
  return {
    c: (key: ThemeKey) => read(`--${key}`).trim() || theme[key],
    s: (key: SharedKey) => read(`--${key}`).trim() || FALLBACK.shared[key],
  };
}

export function buildStripeAppearance(
  read: (token: string) => string,
  { isDark, reducedMotion }: { isDark: boolean; reducedMotion: boolean },
): Appearance {
  const { c, s } = reader(read, isDark);
  const ac = c("ac");
  const cd = c("cd");
  const tx = c("tx");
  const t2 = c("t2");
  const bd = c("bd");
  const ink = s("ink");
  const offset = parseFloat(s("field-focus-offset"));
  const focusW = parseFloat(s("focus-w"));
  // The Field's focus: a 1px --cd gap, then the 2.5px --ac ring — outline-offset + outline, drawn
  // as one box-shadow ring (the frame pads for a shadow; an outline would be clipped or doubled).
  const ring = `0 0 0 ${offset}px ${cd}, 0 0 0 ${offset + focusW}px ${ac}`;
  const selectedTab = { backgroundColor: c("gold"), borderColor: ac, color: ink };
  return {
    theme: isDark ? "night" : "stripe",
    labels: "above",
    disableAnimations: reducedMotion,
    variables: {
      fontFamily: FONT_STACK,
      fontSizeBase: s("fs-field"),
      fontLineHeight: s("lh-normal"),
      fontWeightNormal: s("fw-regular"),
      fontWeightMedium: s("fw-medium"),
      fontWeightBold: s("fw-bold"),
      labelFontSize: s("fs-label"),
      labelFontWeight: s("fw-bold"),
      labelColorText: tx,
      labelSpacing: s("field-gap"),
      spacingUnit: s("s1"),
      gridRowSpacing: s("s3"),
      gridColumnSpacing: s("s3"),
      tabSpacing: s("s2"),
      borderRadius: s("r-sm"),
      buttonExpressCheckoutBorderRadius: s("r-sm"),
      colorPrimary: ac,
      colorBackground: cd,
      colorText: tx,
      colorTextSecondary: t2,
      colorTextPlaceholder: c("t3"),
      colorDanger: c("warn"),
      colorSuccess: c("ok"),
      accessibleColorOnColorPrimary: c("oa"),
      iconColor: t2,
      tabIconColor: t2,
      iconHoverColor: tx,
      tabIconHoverColor: tx,
      tabIconSelectedColor: ink,
      // Gold is bright in BOTH themes, so a selected tab's logo is dark in both.
      tabLogoColor: isDark ? "light" : "dark",
      tabLogoSelectedColor: "dark",
      inputColorBorder: bd,
      inputFocusColorBorder: ac,
      inputBoxShadow: "none",
      inputFocusBoxShadow: ring,
      focusBoxShadow: ring,
      focusOutline: "none",
    },
    rules: {
      ".Input": { padding: `${s("s3")} ${s("s4")}` },
      ".Tab": { backgroundColor: cd, borderColor: bd, color: t2 },
      ".Tab:hover": { color: tx },
      ".Tab--selected": selectedTab,
      ".Tab--selected:hover": selectedTab,
      ".Tab--selected:focus": selectedTab,
      ".TabLabel--selected": { color: ink },
    },
  };
}

/** One CustomFontSource per weight token the appearance names — one variable file serves them all. */
export function buildStripeFonts(
  origin: string,
  read: (token: string) => string,
): CustomFontSource[] {
  const { s } = reader(read, false);
  return (["fw-regular", "fw-medium", "fw-bold"] as const).map((key) => ({
    family: STRIPE_FONT_FAMILY,
    src: `url(${origin}${STRIPE_FONT_FILE}) format("woff2")`,
    style: "normal",
    display: "swap",
    weight: s(key),
  }));
}

/** Apple Pay / Google Pay buttons: black on Night's --pg is 1.089:1, white is 19.290:1. */
export function expressButtonTheme(isDark: boolean): {
  applePay: "black" | "white";
  googlePay: "black" | "white";
} {
  const theme = isDark ? "white" : "black";
  return { applePay: theme, googlePay: theme };
}
