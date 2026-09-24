import { describe, expect, it } from "vitest";
import {
  FALLBACK,
  STRIPE_FONT_FAMILY,
  STRIPE_FONT_FILE,
  buildStripeAppearance,
  buildStripeFonts,
  expressButtonTheme,
} from "./stripe-appearance";

/**
 * Phase 1c (F17) — the Stripe iframe as a token mirror. `read` stands in for the DOM adapter in
 * `stripe-client.ts`; its values are deliberately NOT the fallbacks (and the dark inputs differ from
 * the light fallbacks), so a value that came from the wrong place cannot pass by coincidence.
 * `scripts/check-theme-parity.mjs` pins FALLBACK to tokens.css; this suite pins the MAPPING.
 */

// A Night document whose every value is distinguishable from BOTH fallback tables.
const DARK_DOC: Record<string, string> = {
  "--ac": "#e7a53b",
  "--cd": "#2b213d",
  "--tx": "#f3ecd0",
  "--t2": "#bcafc9",
  "--t3": "#a69eb2",
  "--warn": "#e0855e",
  "--ok": "#5fb07f",
  "--oa": "#130d1f",
  "--bd": "rgba(243, 236, 223, 0.14)",
  "--gold": "#f4c87a",
  "--ink": "#1b1715",
  "--fs-field": "17px",
  "--fs-body": "15px",
  "--fs-label": "13px",
  "--lh-normal": "1.55",
  "--fw-regular": "410",
  "--fw-medium": "510",
  "--fw-bold": "710",
  "--s1": "5px",
  "--s2": "9px",
  "--s3": "13px",
  "--s4": "17px",
  "--r-sm": "11px",
  "--field-gap": "7px",
  "--focus-w": "3px",
  "--field-focus-offset": "2px",
  "--font-body": '"Hanken Grotesk", "Hanken Grotesk Fallback", "Padauk", system-ui, sans-serif',
};
const readFrom = (doc: Record<string, string>) => (token: string) => doc[token] ?? "";
const EMPTY = () => "";

describe("Phase 1c — buildStripeAppearance mirrors the tokens", () => {
  it("each colour, type, spacing and radius variable equals read() when present", () => {
    const a = buildStripeAppearance(readFrom(DARK_DOC), { isDark: true, reducedMotion: false });
    expect(a.theme).toBe("night");
    expect(a.labels).toBe("above");
    expect(a.variables).toMatchObject({
      colorPrimary: DARK_DOC["--ac"],
      colorBackground: DARK_DOC["--cd"],
      colorText: DARK_DOC["--tx"],
      colorTextSecondary: DARK_DOC["--t2"],
      colorTextPlaceholder: DARK_DOC["--t3"],
      colorDanger: DARK_DOC["--warn"],
      colorSuccess: DARK_DOC["--ok"],
      accessibleColorOnColorPrimary: DARK_DOC["--oa"],
      iconColor: DARK_DOC["--t2"],
      tabIconColor: DARK_DOC["--t2"],
      iconHoverColor: DARK_DOC["--tx"],
      tabIconHoverColor: DARK_DOC["--tx"],
      tabIconSelectedColor: DARK_DOC["--ink"],
      inputColorBorder: DARK_DOC["--bd"],
      inputFocusColorBorder: DARK_DOC["--ac"],
      labelColorText: DARK_DOC["--tx"],
      fontLineHeight: DARK_DOC["--lh-normal"],
      fontWeightNormal: DARK_DOC["--fw-regular"],
      fontWeightMedium: DARK_DOC["--fw-medium"],
      fontWeightBold: DARK_DOC["--fw-bold"],
      labelFontSize: DARK_DOC["--fs-label"],
      labelFontWeight: DARK_DOC["--fw-bold"],
      labelSpacing: DARK_DOC["--field-gap"],
      spacingUnit: DARK_DOC["--s1"],
      gridRowSpacing: DARK_DOC["--s3"],
      gridColumnSpacing: DARK_DOC["--s3"],
      tabSpacing: DARK_DOC["--s2"],
      borderRadius: DARK_DOC["--r-sm"],
      buttonExpressCheckoutBorderRadius: DARK_DOC["--r-sm"],
      inputBoxShadow: "none",
      focusOutline: "none",
      tabLogoColor: "light",
      tabLogoSelectedColor: "dark",
    });
    expect(a.rules?.[".Input"]).toEqual({ padding: `${DARK_DOC["--s3"]} ${DARK_DOC["--s4"]}` });
    expect(a.rules?.[".Tab"]).toEqual({
      backgroundColor: DARK_DOC["--cd"],
      borderColor: DARK_DOC["--bd"],
      color: DARK_DOC["--t2"],
    });
    expect(a.rules?.[".Tab:hover"]).toEqual({ color: DARK_DOC["--tx"] });
  });

  it("each variable equals the theme's FALLBACK when read returns '' (dark fallbacks ≠ light)", () => {
    // MUTATION: use FALLBACK.light for dark — red.
    for (const isDark of [true, false]) {
      const fb = isDark ? FALLBACK.dark : FALLBACK.light;
      const a = buildStripeAppearance(EMPTY, { isDark, reducedMotion: false });
      expect(a.theme).toBe(isDark ? "night" : "stripe");
      expect(a.variables).toMatchObject({
        colorPrimary: fb.ac,
        colorBackground: fb.cd,
        colorText: fb.tx,
        colorTextSecondary: fb.t2,
        colorTextPlaceholder: fb.t3,
        colorDanger: fb.warn,
        colorSuccess: fb.ok,
        accessibleColorOnColorPrimary: fb.oa,
        inputColorBorder: fb.bd,
        tabIconSelectedColor: FALLBACK.shared.ink,
        fontSizeBase: FALLBACK.shared["fs-field"],
        labelFontSize: FALLBACK.shared["fs-label"],
        fontLineHeight: FALLBACK.shared["lh-normal"],
        labelSpacing: FALLBACK.shared["field-gap"],
        borderRadius: FALLBACK.shared["r-sm"],
        spacingUnit: FALLBACK.shared.s1,
        tabLogoColor: isDark ? "light" : "dark",
      });
    }
    // The fixture must be able to tell the themes apart, or the loop above proves nothing.
    expect(FALLBACK.dark.cd).not.toBe(FALLBACK.light.cd);
    expect(FALLBACK.dark.oa).not.toBe(FALLBACK.light.oa);
  });

  it('fontFamily starts with "Hanken Grotesk" and never carries next/font\'s Fallback face', () => {
    // MUTATION: revert to read('--font-body') — red.
    const a = buildStripeAppearance(readFrom(DARK_DOC), { isDark: true, reducedMotion: false });
    expect(a.variables?.fontFamily?.startsWith(`"${STRIPE_FONT_FAMILY}"`)).toBe(true);
    expect(a.variables?.fontFamily).not.toContain("Fallback");
    expect(a.variables?.fontFamily).not.toContain("Padauk");
  });

  it("fontSizeBase is read from --fs-field (px-resolved), never --fs-body", () => {
    // MUTATION: read --fs-body — red. 16px is the M78 floor, so iOS never zooms inside the iframe.
    const read = readFrom({ "--fs-field": "16px", "--fs-body": "15px" });
    expect(
      buildStripeAppearance(read, { isDark: false, reducedMotion: false }).variables?.fontSizeBase,
    ).toBe("16px");
  });

  it("disableAnimations === reducedMotion for both booleans", () => {
    // MUTATION: hardcode false — red.
    for (const reducedMotion of [true, false])
      expect(buildStripeAppearance(EMPTY, { isDark: false, reducedMotion }).disableAnimations).toBe(
        reducedMotion,
      );
  });

  it("the selected tab is the lit cap in BOTH themes (gold fill, --ac edge, ink label); the focus ring is offset + width", () => {
    // MUTATION: color --oa — red. MUTATION: drop borderColor ac — red. MUTATION: ring = focus-w only — red.
    for (const isDark of [true, false]) {
      const fb = isDark ? FALLBACK.dark : FALLBACK.light;
      const a = buildStripeAppearance(EMPTY, { isDark, reducedMotion: false });
      const sel = { backgroundColor: fb.gold, borderColor: fb.ac, color: FALLBACK.shared.ink };
      expect(a.rules?.[".Tab--selected"]).toEqual(sel);
      expect(a.rules?.[".Tab--selected:hover"]).toEqual(sel);
      expect(a.rules?.[".Tab--selected:focus"]).toEqual(sel);
      expect(a.rules?.[".TabLabel--selected"]).toEqual({ color: FALLBACK.shared.ink });
      // 1px --cd gap, then the 2.5px --ac ring: an outer extent of 3.5px.
      const ring = `0 0 0 1px ${fb.cd}, 0 0 0 3.5px ${fb.ac}`;
      expect(a.variables?.inputFocusBoxShadow).toBe(ring);
      expect(a.variables?.focusBoxShadow).toBe(ring);
    }
    // …and from a document: offset 2px + width 3px = 5px, in the document's own --ac.
    const doc = buildStripeAppearance(readFrom(DARK_DOC), { isDark: true, reducedMotion: false });
    expect(doc.variables?.inputFocusBoxShadow).toBe(
      `0 0 0 2px ${DARK_DOC["--cd"]}, 0 0 0 5px ${DARK_DOC["--ac"]}`,
    );
    expect(doc.rules?.[".Tab--selected"]).toEqual({
      backgroundColor: DARK_DOC["--gold"],
      borderColor: DARK_DOC["--ac"],
      color: DARK_DOC["--ink"],
    });
  });

  it("every weight the appearance names has a font entry (same family, first-party src); Express buttons invert on Night", () => {
    // MUTATION: drop the 700 entry — red. MUTATION: invert the theme — red.
    const origin = "https://qr.example";
    for (const read of [EMPTY, readFrom(DARK_DOC)]) {
      const a = buildStripeAppearance(read, { isDark: true, reducedMotion: false });
      const fonts = buildStripeFonts(origin, read);
      const weights = [
        a.variables?.fontWeightNormal,
        a.variables?.fontWeightMedium,
        a.variables?.fontWeightBold,
        a.variables?.labelFontWeight,
      ];
      for (const w of weights) {
        const f = fonts.find((x) => x.weight === w);
        expect(f, `a font entry for weight ${w}`).toBeTruthy();
        expect(f?.family).toBe(STRIPE_FONT_FAMILY);
        expect(f?.src.startsWith(`url(${origin}/fonts/`)).toBe(true);
        expect(f?.src).toBe(`url(${origin}${STRIPE_FONT_FILE}) format("woff2")`);
        expect(f?.style).toBe("normal");
        expect(f?.display).toBe("swap");
      }
    }
    expect(expressButtonTheme(true)).toEqual({ applePay: "white", googlePay: "white" });
    expect(expressButtonTheme(false)).toEqual({ applePay: "black", googlePay: "black" });
  });
});
