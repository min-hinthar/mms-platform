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
