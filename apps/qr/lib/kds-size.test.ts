import { describe, expect, it } from "vitest";
import { KDS_SIZES, KDS_SIZE_DEFAULT, KDS_SIZE_KEY, kdsPageSize, parseKdsSize } from "./kds-size";

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
