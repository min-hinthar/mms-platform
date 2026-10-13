/**
 * #362 (blind pass 1, CRITICAL · Codex D) — the ⋯ sheet's kitchen-note field, against the note on the
 * order. Pure, so the rules carry `verify:slice` mutants; `LineOptionsSheet` only feeds it.
 *
 * The shipped sheet seeded its field from the line ONCE and its save compared nothing, so a staff
 * allergy note written while the sheet was open was overwritten on Save — and with the field
 * untouched, "unchanged" was measured against the LIVE line, so Save turned into "Remove the note"
 * and erased it. Now:
 *
 *   • `seen` is the stored note the field was seeded from, and the write is a compare-and-swap on it
 *     (`setLineNote`'s `seen`): it lands only while the order still holds that note;
 *   • while the diner has not touched the field, it FOLLOWS the order (re-seeds);
 *   • once they have, their words stay, the change is SHOWN, and `seen` stays put — so a Save is
 *     refused as `changed` rather than overwriting a note the diner may not have read;
 *   • a `changed` refusal re-seeds the field from the note now on the order, and the view says so.
 *
 * Never a silent overwrite of the allergy channel.
 */
export type NoteDraft = {
  /** The field, as the diner is editing it. */
  note: string;
  /** The stored note the field was seeded from ("" for none) — the save's compare-and-swap. */
  seen: string;
  /** The order's note when it moved under a TOUCHED field (shown, not adopted), else null. */
  underneath: string | null;
};

/** The order's note is now `live` ("" for none). */
export function noteOnLiveChange(d: NoteDraft, live: string): NoteDraft {
  if (live === d.seen) return { ...d, underneath: null };
  if (d.note === d.seen) return { note: live, seen: live, underneath: null };
  return { ...d, underneath: live };
}

/** The save was refused as `changed`: re-seed from the note now on the order. */
export function noteAfterChanged(fresh: string | null): NoteDraft {
  const live = fresh ?? "";
  return { note: live, seen: live, underneath: null };
}

/** What Save would do — measured against the SEED, never against the live line. */
export function noteSaveState(d: NoteDraft): { unchanged: boolean; removes: boolean } {
  const next = d.note.trim();
  return { unchanged: next === d.seen.trim(), removes: next === "" && d.seen !== "" };
}

/**
 * The view's sentence for a `changed` refusal, in both tongues (the Burmese is a Claude-authored
 * draft — K15 · diner-changes in OPEN-ITEMS). The EN quotes the note now on the order so the diner
 * can read it before saving again; the MY says the fact and that nothing was saved.
 */
export function noteChangedNotice(name: string, fresh: string | null): { en: string; my: string } {
  return fresh
    ? {
        en: `The note on ${name} was just changed — it now reads “${fresh}”. Your change wasn’t saved.`,
        my: `${name} ရဲ့ မှတ်ချက်ကို အခုလေးတင် ပြောင်းထားပါတယ် — သင့်အပြောင်းအလဲကို မသိမ်းရသေးပါ။`,
      }
    : {
        en: `The note on ${name} was just removed. Your change wasn’t saved.`,
        my: `${name} ရဲ့ မှတ်ချက်ကို အခုလေးတင် ဖျက်ထားပါတယ် — သင့်အပြောင်းအလဲကို မသိမ်းရသေးပါ။`,
      };
}
