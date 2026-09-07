import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  KDS_SIZES,
  KDS_SIZE_DEFAULT,
  KDS_SIZE_KEY,
  KDS_SIZE_PX,
  kdsPageSize,
  parseKdsSize,
} from "./kds-size";

describe("kds-size — the per-device text dial", () => {
  it("parses exactly three values and defaults everything else to small", () => {
    expect(parseKdsSize("s")).toBe("s");
    expect(parseKdsSize("m")).toBe("m");
    expect(parseKdsSize("l")).toBe("l");
    for (const junk of ["M", " m", "large", "xl", "", "0"]) expect(parseKdsSize(junk)).toBe("s");
    expect(parseKdsSize(null)).toBe("s");
    expect(parseKdsSize(undefined)).toBe("s");
    expect(KDS_SIZE_DEFAULT).toBe("s");
  });
  it("pages eight at small and six at medium and large — one page is one screen", () => {
    expect(kdsPageSize("s")).toBe(8);
    expect(kdsPageSize("m")).toBe(6);
    expect(kdsPageSize("l")).toBe(6);
  });
  it("uses the storage-key convention and lists the sizes in dial order", () => {
    expect(KDS_SIZE_KEY).toBe("mms.kds.size");
    expect([...KDS_SIZES]).toEqual(["s", "m", "l"]);
  });
});

describe("P7·3 — the sizes the Help sheet quotes are the sizes the board renders", () => {
  // The pixel table is a TRANSCRIPTION of `globals.css`, which is the only place the dial actually
  // lives — so it is held to the stylesheet here, never trusted. The Burmese item line is the value
  // the sheet shows the sample word at: `--kfs-item-my` on `.kds-root` (small, the default) and on
  // the two `data-size` overrides. rem → px at the root 16px.
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const px = (selector: string) => {
    const block = css.match(new RegExp(`${selector.replace(/[.[\]"]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    const rem = block?.[1]?.match(/--kfs-item-my:\s*([\d.]+)rem/);
    expect(rem, `${selector} declares --kfs-item-my`).not.toBeUndefined();
    return Number(rem![1]) * 16;
  };
  it("small is the root's default, medium and large are the overrides", () => {
    expect(KDS_SIZE_PX.s).toBe(px(".kds-root"));
    expect(KDS_SIZE_PX.m).toBe(px('.kds-root[data-size="m"]'));
    expect(KDS_SIZE_PX.l).toBe(px('.kds-root[data-size="l"]'));
  });
  it("the '{n} across' the sheet quotes is the wide grid's column count at each size", () => {
    // The sheet derives "across" as kdsPageSize / 2 (a two-row envelope). The columns actually LIVE
    // in the 1200px media rules on `.kds-grid` — four at small, three under the m/l overrides — so
    // the derivation is held to the stylesheet: a column count changed in CSS alone would leave the
    // sheet quoting a layout the board no longer draws.
    const wide = (selectors: string) => {
      const block = css.match(
        new RegExp(`@media \\(min-width: 1200px\\)\\s*\\{\\s*${selectors}\\s*\\{([^}]*)\\}`),
      );
      const cols = block?.[1]?.match(/grid-template-columns:\s*repeat\((\d+), 1fr\)/);
      expect(cols, `wide columns for ${selectors}`).not.toBeUndefined();
      return Number(cols![1]);
    };
    const small = wide("\\.kds-grid");
    const large = wide(
      '\\.kds-root\\[data-size="m"\\] \\.kds-grid,\\s*\\.kds-root\\[data-size="l"\\] \\.kds-grid',
    );
    expect(small).toBe(kdsPageSize("s") / 2);
    expect(large).toBe(kdsPageSize("m") / 2);
    expect(large).toBe(kdsPageSize("l") / 2);
  });
  it("the sample word in the sheet is set at those same three sizes", () => {
    for (const sz of KDS_SIZES) {
      const block = css.match(
        new RegExp(`\\.help-size-sample\\[data-size="${sz}"\\][^{]*\\{([^}]*)\\}`),
      );
      const rem = block?.[1]?.match(/font-size:\s*([\d.]+)rem/);
      expect(rem, `.help-size-sample[data-size="${sz}"]`).not.toBeUndefined();
      expect(Number(rem![1]) * 16).toBe(KDS_SIZE_PX[sz]);
    }
  });
});
