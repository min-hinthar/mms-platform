import { describe, expect, it } from "vitest";
import { KITCHEN_STAGES } from "@mms/ui";
import { t } from "./i18n";
import { STAFF } from "./i18n/staff";
import {
  DINER_STAGE_WORD,
  DINER_STATE_COPY,
  lineChipWord,
  removedReasons,
  removedWord,
  unavailableMarkKey,
} from "./line-state-copy";

/**
 * PD10 (m10 decision 2 · appendix C) — the guest's track words are the FAMILY's console words.
 *
 * What Thiri reads on her phone must be what Mom's board and Dad's table page say about the same
 * dish — and the TV's rows, which read the same keys. So every Burmese half of the diner's stage
 * vocabulary is pinned EQUAL to its staff source (`table.line.state.*`, `pad.group.unsent`), never
 * transcribed: a guest-only re-word — the retired "ရောက်ပါပြီ" ("it has arrived", a claim nothing
 * records) — is a red test, not a drift. The English stays the guest's own (`DINER_STATE_COPY`).
 */
describe("DINER_STAGE_WORD — one vocabulary, both tongues, on every diner surface", () => {
  it("covers every stage the track draws, and nothing else", () => {
    expect(Object.keys(DINER_STAGE_WORD).sort()).toEqual([...KITCHEN_STAGES].sort());
  });

  it("each Burmese half IS the console's word (the staff dictionary, read — never retyped)", () => {
    // MUTATION (line-state-copy/served-word-drifts): the served word re-typed as the retired
    // "ရောက်ပါပြီ" — the guest's phone claims the plate arrived while the board says ထုတ်ပြီး; red.
    expect(DINER_STAGE_WORD.served.my).toBe(STAFF["table.line.state.served"].my);
    expect(DINER_STAGE_WORD.cooking.my).toBe(STAFF["table.line.state.inProgress"].my);
    expect(DINER_STAGE_WORD.sent.my).toBe(STAFF["table.line.state.fired"].my);
    expect(DINER_STAGE_WORD.unsent.my).toBe(STAFF["pad.group.unsent"].my);
  });

  it("each English half is the GUEST's word — 'Sent to kitchen', never the console's clipped 'Sent'", () => {
    expect(DINER_STAGE_WORD.sent.en).toBe(DINER_STATE_COPY.fired);
    expect(DINER_STAGE_WORD.cooking.en).toBe(DINER_STATE_COPY.in_progress);
    expect(DINER_STAGE_WORD.served.en).toBe(DINER_STATE_COPY.served);
    expect(DINER_STAGE_WORD.unsent.en).toBe(DINER_STATE_COPY.draft);
    expect(DINER_STAGE_WORD.sent.en).not.toBe(STAFF["table.line.state.fired"].en);
  });

  it("inside the Send's grace the words are '-ing' — the cart's own `sending` pair (D3)", () => {
    expect(DINER_STAGE_WORD.sending).toEqual({ en: t("en", "sending"), my: t("my", "sending") });
  });
});

/**
 * Lifecycle audit (diner-live-status 6 · out-of-stock 2) — the dish card's chip word follows the ONE
 * TRACK, never the raw column, and a removed dish says why when staff said "We ran out".
 */
describe("lineChipWord — the chip reads the track", () => {
  it("inside the Send's grace a fired line reads 'Sending…'; inside Mom's undo window a served one 'Cooking'", () => {
    // MUTATION (lcb/line-copy/chip-reads-the-raw-state): key the word on `lineState` — "Sent to
    // kitchen" beside a live Undo, "Served" over a bump Mom can still take back; red.
    expect(lineChipWord({ lineState: "fired" }, "sending")).toBe(DINER_STAGE_WORD.sending.en);
    expect(lineChipWord({ lineState: "served" }, "cooking")).toBe("Cooking");
    expect(lineChipWord({ lineState: "fired" }, "sent")).toBe("Sent to kitchen");
    expect(lineChipWord({ lineState: "served" }, "served")).toBe("Served");
  });

  it("a removed line keeps its removal word, with the reason when the guest may hear it", () => {
    // MUTATION (lcb/line-copy/removed-reason-lost): drop the reason; red.
    expect(lineChipWord({ lineState: "voided", removedReason: "sold_out" }, null)).toBe(
      "Removed — we ran out",
    );
    expect(lineChipWord({ lineState: "voided", removedReason: null }, null)).toBe("Removed");
    expect(removedWord(undefined)).toBe("Removed");
  });

  it("a line with no stage (grocery) keeps its state's word", () => {
    expect(lineChipWord({ lineState: "draft" }, null)).toBe(DINER_STATE_COPY.draft);
  });
});

describe("removedReasons — an INCLUSION list: only 'we ran out' is told", () => {
  it("maps sold_out, hides every other code, and the newest row per line wins", () => {
    // MUTATION (lcb/line-copy/every-reason-told): pass every code through — "mistake" or "quality"
    // reaches a guest as a reason; red.
    const out = removedReasons([
      { line_id: "a", reason_code: "sold_out", created_at: "2026-10-13T10:00:00Z" },
      { line_id: "b", reason_code: "mistake", created_at: "2026-10-13T10:00:00Z" },
      { line_id: "c", reason_code: "quality", created_at: "2026-10-13T09:00:00Z" },
      { line_id: "c", reason_code: "sold_out", created_at: "2026-10-13T10:00:00Z" },
      { line_id: null, reason_code: "sold_out", created_at: "2026-10-13T10:00:00Z" },
    ]);
    expect(out.get("a")).toBe("sold_out");
    expect(out.get("b")).toBeNull();
    expect(out.get("c")).toBe("sold_out");
    expect(out.size).toBe(3);
  });
});

/**
 * #362 — the mark on an unsent dish the kitchen can no longer make: WHICH fact (blind pass 6 / Codex
 * round 1 — sold out, or no longer on the menu) and whether "remove it" is something THIS phone can do
 * (blind pass 2a — a guest looking at a tablemate's line, or a comp, cannot).
 */
describe("unavailableMarkKey — the words of the mark", () => {
  it("names the kind, and the way through only to a phone that can take it", () => {
    // MUTATION (lcb/mark/remove-it-to-everyone): ignore `mayRemove` — "remove it" on a tablemate's
    // dish the guest cannot touch, and on a comp; red.
    expect(unavailableMarkKey("sold_out", true)).toBe("soldOutRemoveIt");
    expect(unavailableMarkKey("sold_out", false)).toBe("soldOutMark");
    // MUTATION (lcb/mark/gone-reads-sold-out): one word for both kinds; red.
    expect(unavailableMarkKey("gone", true)).toBe("goneRemoveIt");
    expect(unavailableMarkKey("gone", false)).toBe("goneMark");
  });
});
