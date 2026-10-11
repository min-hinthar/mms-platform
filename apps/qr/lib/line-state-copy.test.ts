import { describe, expect, it } from "vitest";
import { KITCHEN_STAGES } from "@mms/ui";
import { t } from "./i18n";
import { STAFF } from "./i18n/staff";
import { DINER_STAGE_WORD, DINER_STATE_COPY } from "./line-state-copy";

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
