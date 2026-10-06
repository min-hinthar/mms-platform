import { describe, expect, it } from "vitest";
import { BIND_COPY } from "./bind-copy";
import {
  JOIN_COPY,
  bindRefusalCopy,
  dineInMenuHref,
  seatedAnswer,
  sendNeedsTable,
  tableChipAction,
  tableChipLabel,
  tableChipWord,
  tableGridOffered,
  tablePlainLabel,
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
    // The empty submit's refusal, on the field (blind pass on 3c-i).
    expect(JOIN_COPY.missing).toBe("Enter the table code to join.");
  });
  it("the placeholder is SYNTHETIC — never an 8-char token shape a seeded table could carry", () => {
    // A real token in a "use client" bundle is a live join credential shipped to every browser.
    expect(JOIN_COPY.placeholder.startsWith("e.g. ")).toBe(true);
  });
  // The DoorSheet's inline form (TableSection) READS these (it imports `JOIN_COPY`), so there is no
  // second copy to drift — the source scan that used to stand here was a guard a comment could
  // satisfy (LEARNINGS #60). TablePicker's own Sheet retired with /dine-in's picker (3c-ii, D27).
});

/**
 * Phase 3c-ii (D27) — the table is asked ONCE, inside the first Send, and only when the question has
 * answers. `sendNeedsTable` is the gate `SendToKitchenButton` consults after the frozen refusal: a
 * dine-in session with no number yet AND a registry with at least one table. An EMPTY or failed
 * registry (`getDineInTables` → `[]`) never asks a question with no answers — the send proceeds
 * UNBOUND exactly as today (the KDS labels the ticket by its code, `kitchen.ts`).
 */
describe("sendNeedsTable — the Send's one question, asked only with answers (3c-ii, D27)", () => {
  const TABLES = [{ tableNumber: 2, occupied: false }];
  it("an UNBOUND dine-in session with a registry asks", () => {
    // MUTANT table-pick/send-skips-the-table-ask: the gate answers false for every state — the
    // sheet never opens and every dine-in send goes out numberless; red here.
    expect(sendNeedsTable({ isDineIn: true, tableNumber: null, tables: TABLES })).toBe(true);
  });
  it("a BOUND table (sticker · claim · staff-started · kiosk · after a bind) is never asked again", () => {
    // MUTANT table-pick/bound-table-asked-again: the `tableNumber === null` conjunct is dropped —
    // Table 7 is asked which table it is on every send; red here.
    expect(sendNeedsTable({ isDineIn: true, tableNumber: 7, tables: TABLES })).toBe(false);
  });
  it("an EMPTY registry (a failed read is []) never asks — the send proceeds unbound, as today", () => {
    // MUTANT table-pick/empty-registry-asks-anyway: `tables.length > 0` is dropped — a registry
    // outage opens a sheet with no chips, a dead end on the one control the host came to press.
    expect(sendNeedsTable({ isDineIn: true, tableNumber: null, tables: [] })).toBe(false);
  });
  it("to-go and the market have no table to ask about", () => {
    expect(sendNeedsTable({ isDineIn: false, tableNumber: null, tables: TABLES })).toBe(false);
  });
});

describe("tablePlainLabel — the escape under the grid, per host (3c-ii, D27 · D28)", () => {
  it("the Send sheet's escape SENDS — `BIND_COPY.sendAnyway`, never a Start that would navigate", () => {
    // MUTANT table-pick/send-sheet-says-start: the send sheet's button reads the DoorSheet's
    // "Start anyway" — a verb promising a navigation the sheet does not make; red here.
    expect(tablePlainLabel("send")).toBe(BIND_COPY.sendAnyway);
    expect(tablePlainLabel("send")).toBe("Not at a numbered table? Send anyway");
  });
  it("the /dine-in page and the DoorSheet keep the shipped sibling (TableGrid.tsx:143 at 97d2904)", () => {
    expect(tablePlainLabel("page")).toBe("Not at a numbered table? Start anyway");
    expect(tablePlainLabel("sheet")).toBe("Not at a numbered table? Start anyway");
  });
});

/**
 * D28 — every bind refusal names its recovery, and every sentence is READ from where it is named:
 * the bind's own three from `BIND_COPY` (the mint's `seated` / `unavailable`, byte-identical to
 * /api/session's), the five it shares with the send from the send's `reasonCopy` — PASSED IN, never
 * imported here: `useUndoGrace.ts:3` reaches `@/lib/cart` → `@mms/db/server:1` (`server-only`),
 * which would poison the suite of every importer of this module (DoorSheet.test, TableGrid.test).
 * So the record below is a FIXTURE whose sentences are distinct on purpose: the mapping is falsified
 * by which KEY each reason picks, and `Checkout.bind.test` pins the real sentence end to end.
 */
describe("bindRefusalCopy — a refusal that names its way out (3c-ii, D28)", () => {
  const SEND = {
    not_host: "send:not_host",
    locked: "send:locked",
    settling: "send:settling",
    rate_limited: "send:rate_limited",
    error: "send:error",
  };
  it("the bind's OWN three come from BIND_COPY, verbatim", () => {
    expect(bindRefusalCopy({ ok: false, reason: "seated" }, SEND)).toBe(BIND_COPY.seated);
    expect(bindRefusalCopy({ ok: false, reason: "unavailable" }, SEND)).toBe(BIND_COPY.unavailable);
    expect(bindRefusalCopy({ ok: false, reason: "already_bound", tableNumber: 3 }, SEND)).toBe(
      BIND_COPY.alreadyBound(3),
    );
    expect(bindRefusalCopy({ ok: false, reason: "already_bound", tableNumber: 3 }, SEND)).toBe(
      "You’re at Table 3 — this order goes there.",
    );
  });
  it("the five it shares with the send are the send's, by KEY — never a retyped sentence", () => {
    for (const reason of ["not_host", "locked", "settling", "rate_limited", "error"] as const)
      expect(bindRefusalCopy({ ok: false, reason }, SEND)).toBe(SEND[reason]);
  });
  it("an expired session (and a not-dine-in cart — neither reachable from the sheet) is the send's `error` sentence: the state the shipped send already answers with (SendToKitchenButton's catch arm)", () => {
    expect(bindRefusalCopy({ ok: false, reason: "session_expired" }, SEND)).toBe(SEND.error);
    expect(bindRefusalCopy({ ok: false, reason: "not_dinein" }, SEND)).toBe(SEND.error);
  });
  it("J40 · J41 — `kiosk`, `held` and `sticker_table` are BIND_COPY's own builders, each naming ITS table (never `seated`, which promises a code)", () => {
    expect(bindRefusalCopy({ ok: false, reason: "kiosk", tableNumber: 7 }, SEND)).toBe(
      BIND_COPY.kioskOrder(7),
    );
    expect(bindRefusalCopy({ ok: false, reason: "held", tableNumber: 7 }, SEND)).toBe(
      BIND_COPY.held(7),
    );
    expect(bindRefusalCopy({ ok: false, reason: "sticker_table", tableNumber: 4 }, SEND)).toBe(
      BIND_COPY.stickerTable(4),
    );
    // Each names the number it was given — a builder that ignored it would still match itself.
    expect(bindRefusalCopy({ ok: false, reason: "kiosk", tableNumber: 7 }, SEND)).toContain(
      "Table 7",
    );
    expect(bindRefusalCopy({ ok: false, reason: "held", tableNumber: 7 }, SEND)).toContain(
      "Table 7",
    );
    expect(bindRefusalCopy({ ok: false, reason: "sticker_table", tableNumber: 4 }, SEND)).toBe(
      "This order started from Table 4’s sticker — if you’re at Table 4, pick it; otherwise send anyway.",
    );
  });
});

describe("seatedAnswer — what a bind refusal does to its chip (J40)", () => {
  it("a party with a host → `join` (the form: the party's code joins it)", () => {
    expect(seatedAnswer({ ok: false, reason: "seated" })).toBe("join");
  });
  it("an order NO code joins — a kiosk order, a held staff table → `occupied` (Seated, no form)", () => {
    expect(seatedAnswer({ ok: false, reason: "kiosk", tableNumber: 7 })).toBe("occupied");
    expect(seatedAnswer({ ok: false, reason: "held", tableNumber: 7 })).toBe("occupied");
  });
  it("every other answer leaves the chip alone — including the sticker rule (the table is not taken)", () => {
    for (const r of [
      { ok: true, tableNumber: 5, already: false },
      { ok: false, reason: "locked" },
      { ok: false, reason: "unavailable" },
      { ok: false, reason: "error" },
      { ok: false, reason: "sticker_table", tableNumber: 4 },
      { ok: false, reason: "already_bound", tableNumber: 3 },
    ] as const)
      expect(seatedAnswer(r)).toBeNull();
  });
});
