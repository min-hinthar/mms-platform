import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOIN_COPY,
  dineInMenuHref,
  tableChipAction,
  tableChipLabel,
  tableChipWord,
  tableGridOffered,
} from "./table-pick";

/**
 * Phase 3c-i (D18) — the table grid is a SECTION of the DoorSheet, offered only OFF a dine-in
 * session, and the dine-in menu href is built in ONE place. Every expected string below that the
 * app already shipped was PASTED from
 *   git grep -n "mode=dinein&door=dinein" HEAD -- apps/qr/components
 * at 48bc5da — never typed. The four shipped builders (TablePicker.tsx:38 · :49 · :74/:123 ·
 * HomeSessionCard.tsx:47 · JoinTable.tsx:28) must come out of `dineInMenuHref` byte-for-byte.
 */
describe("tableGridOffered — the grid is honest only off the table", () => {
  it("is NOT offered at a dine-in session: a `?table=N` claim mints a NEW session (useTableSession), orphaning this phone's drafts", () => {
    // MUTANT table-pick/grid-offered-at-table: `!== "dinein"` → `true` — red here.
    expect(tableGridOffered("dinein")).toBe(false);
  });
  it("is offered on the to-go menu and on the market", () => {
    expect(tableGridOffered("pickup")).toBe(true);
    expect(tableGridOffered("scango")).toBe(true);
  });
  it("an unknown mode falls where currentDoor falls (the market) — offered, never a third answer", () => {
    expect(tableGridOffered("")).toBe(true);
    expect(tableGridOffered("kiosk")).toBe(true);
  });
});

describe("tableChipAction — mine beats seated (the W5a code-wall bug, stated as a value)", () => {
  it("my own live table reads resume even though it is occupied", () => {
    // MUTANT table-pick/mine-loses-to-seated: occupied tested before mine → "join" — red here.
    expect(tableChipAction(true, true)).toBe("resume");
  });
  it("a stranger's seated table asks for the code — never a claim the mint would 409", () => {
    // MUTANT table-pick/seated-claims: "join" → "claim" — red here.
    expect(tableChipAction(false, true)).toBe("join");
  });
  it("an open table is a claim", () => {
    expect(tableChipAction(false, false)).toBe("claim");
  });
  it("mine-but-not-occupied cannot happen from the peek, but if it did it is still mine", () => {
    expect(tableChipAction(true, false)).toBe("resume");
  });
});

describe("tableChipWord / tableChipLabel — the K2 sentences, verbatim from TablePicker.tsx:93-96 · :111", () => {
  it("the chip's one word per state", () => {
    expect(tableChipWord("resume")).toBe("Your table");
    expect(tableChipWord("join")).toBe("Seated");
    expect(tableChipWord("claim")).toBe("Open");
  });
  it("the full sentence that names each button", () => {
    expect(tableChipLabel(7, "join")).toBe(
      "Table 7, someone is sitting here — join with the table code",
    );
    expect(tableChipLabel(3, "resume")).toBe("Table 3, your table — pick up where you left off");
    expect(tableChipLabel(12, "claim")).toBe("Table 12, open — sit here");
  });
});

describe("dineInMenuHref — the ONE builder, byte-for-byte the four shipped strings", () => {
  it("TablePicker.tsx:38 — a claim by number", () => {
    const n = 7;
    // MUTANT table-pick/href-drops-door: `door=dinein` omitted — red here.
    expect(dineInMenuHref({ table: n })).toBe(`/menu?mode=dinein&door=dinein&table=${n}`);
  });
  it("TablePicker.tsx:49 · JoinTable.tsx:28 — a join by code, encoded", () => {
    const c = "WX/Z 12&4";
    expect(dineInMenuHref({ join: c })).toBe(
      `/menu?mode=dinein&door=dinein&j=${encodeURIComponent(c)}`,
    );
  });
  it("TablePicker.tsx:74 · :123 — a bare host-start", () => {
    expect(dineInMenuHref({})).toBe("/menu?mode=dinein&door=dinein");
  });
  it("HomeSessionCard.tsx:47 — a resume, `&resume=1` THEN `&table=N` when known, in that ORDER", () => {
    const s = { tableNumber: 5 as number | null };
    expect(dineInMenuHref({ table: 5, resume: true })).toBe(
      `/menu?mode=dinein&door=dinein&resume=1${s.tableNumber != null ? `&table=${s.tableNumber}` : ""}`,
    );
    const none = { tableNumber: null as number | null };
    expect(dineInMenuHref({ resume: true })).toBe(
      `/menu?mode=dinein&door=dinein&resume=1${none.tableNumber != null ? `&table=${none.tableNumber}` : ""}`,
    );
  });
  it("every output enters through the dine-in door — the K0 tag the mint records on session_created", () => {
    for (const h of [
      dineInMenuHref({}),
      dineInMenuHref({ table: 1 }),
      dineInMenuHref({ join: "ABCD1234" }),
      dineInMenuHref({ table: 1, resume: true }),
    ]) {
      const u = new URL(h, "https://x.test");
      expect(u.pathname).toBe("/menu");
      expect(u.searchParams.get("mode")).toBe("dinein");
      expect(u.searchParams.get("door")).toBe("dinein");
    }
  });
});

describe("JOIN_COPY — the inline form's words, named once (TablePicker.tsx:136-176 verbatim)", () => {
  it("title · body · label · placeholder · button", () => {
    expect(JOIN_COPY.title(7)).toBe("Join Table 7");
    expect(JOIN_COPY.title(null)).toBe("Join a table");
    expect(JOIN_COPY.body(7)).toBe(
      "Someone is already sitting at Table 7. Enter the table code they share (or scan the table’s sticker) to order together.",
    );
    expect(JOIN_COPY.label).toBe("Table code");
    expect(JOIN_COPY.placeholder).toBe("e.g. WXYZ1234");
    expect(JOIN_COPY.button).toBe("Join");
  });
  it("the placeholder is SYNTHETIC — never an 8-char token shape a seeded table could carry", () => {
    // A real token in a "use client" bundle is a live join credential shipped to every browser.
    expect(JOIN_COPY.placeholder.startsWith("e.g. ")).toBe(true);
  });
  it("TablePicker's own (byte-identical) Sheet still carries the same words — the two cannot drift apart silently", () => {
    const src = readFileSync(path.join(__dirname, "..", "components", "TablePicker.tsx"), "utf8");
    expect(src).toContain(`placeholder="${JOIN_COPY.placeholder}"`);
    expect(src).toContain(`>\n            ${JOIN_COPY.label}\n`);
    expect(src).toContain("`Join Table ${seatedNum}`");
  });
});
