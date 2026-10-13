import { describe, expect, it } from "vitest";
import { noteAfterChanged, noteChangedNotice, noteOnLiveChange, noteSaveState } from "./note-edit";

/**
 * #362 (blind pass 1, CRITICAL) — the ⋯ sheet's note field and the note on the order. The sheet seeded
 * its field once and the save never compared, so a staff allergy note written while the sheet was
 * open was overwritten on Save — or, with the field untouched, ERASED (the button became "Remove the
 * note"). The field now tracks what it was seeded from (`seen`, sent as the write's compare-and-swap)
 * and follows the order while the diner has not touched it.
 */
describe("noteOnLiveChange — the order's note moved while the sheet was open", () => {
  it("an UNTOUCHED field re-seeds from the order — never offering to erase the new note", () => {
    // MUTATION (lcb/note-edit/untouched-field-not-reseeded): keep the stale seed — Save becomes
    // "Remove the note" over a staff allergy note the diner never saw; red.
    const d = noteOnLiveChange({ note: "", seen: "", underneath: null }, "No peanuts — allergy");
    expect(d).toEqual({
      note: "No peanuts — allergy",
      seen: "No peanuts — allergy",
      underneath: null,
    });
    expect(noteSaveState(d)).toEqual({ unchanged: true, removes: false });
  });

  it("a TOUCHED field keeps the diner's words, shows the change, and keeps its seed (the save will be refused)", () => {
    // MUTATION (lcb/note-edit/touched-field-overwritten): re-seed a touched field too — the diner's
    // typing vanishes under them; red. MUTATION (lcb/note-edit/touched-seed-moves): move `seen` to
    // the new note — the next Save overwrites it unread; red.
    const d = noteOnLiveChange({ note: "Extra spicy", seen: "", underneath: null }, "No peanuts");
    expect(d).toEqual({ note: "Extra spicy", seen: "", underneath: "No peanuts" });
  });

  it("the order moving BACK to the seed clears the shown change", () => {
    expect(
      noteOnLiveChange({ note: "Extra spicy", seen: "", underneath: "No peanuts" }, ""),
    ).toEqual({ note: "Extra spicy", seen: "", underneath: null });
  });
});

describe("noteAfterChanged — the save met someone else's note", () => {
  it("re-seeds from the note now on the order", () => {
    expect(noteAfterChanged("No peanuts — allergy")).toEqual({
      note: "No peanuts — allergy",
      seen: "No peanuts — allergy",
      underneath: null,
    });
    expect(noteAfterChanged(null)).toEqual({ note: "", seen: "", underneath: null });
  });
});

describe("noteSaveState — what Save would do, against the SEED (never the live line)", () => {
  it("unchanged against the seed; 'remove' only when there was a note to remove", () => {
    expect(noteSaveState({ note: " No egg ", seen: "No egg", underneath: null })).toEqual({
      unchanged: true,
      removes: false,
    });
    expect(noteSaveState({ note: "", seen: "No egg", underneath: null })).toEqual({
      unchanged: false,
      removes: true,
    });
    expect(noteSaveState({ note: "", seen: "", underneath: null }).removes).toBe(false);
  });
});

describe("noteChangedNotice — said in both tongues, through the view's one region", () => {
  it("names the dish and that nothing was saved", () => {
    const n = noteChangedNotice("Mohinga", "No peanuts — allergy");
    expect(n.en).toBe(
      "The note on Mohinga was just changed — it now reads “No peanuts — allergy”. Your change wasn’t saved.",
    );
    expect(n.my).toContain("Mohinga");
    const cleared = noteChangedNotice("Mohinga", null);
    expect(cleared.en).toBe("The note on Mohinga was just removed. Your change wasn’t saved.");
  });
});
