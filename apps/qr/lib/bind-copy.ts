/**
 * Phase 3c-ii (D28) — the bind's sentences, named ONCE. Pure strings: the sheet reads them on the
 * client, `/api/session` and `bindTable` answer with them on the server, so the two can never drift.
 * `seated` and `unavailable` are the mint's own refusals, byte-identical to what `/api/session` has
 * said since K2 (the route now imports them from here); the rest are new EN, ledgered for K15.
 */
export const BIND_COPY = {
  /** The table has a live party: join with their code (the inline form), or pick another. */
  seated: "That table was just seated — join with the party’s code, or pick another.",
  /** Not registered, retired, or gone from the registry between the read and the write. */
  unavailable: "That table isn’t available — scan its sticker or pick another.",
  /** This session is already seated somewhere else; the order goes to THAT table. */
  alreadyBound: (m: number) => `You’re at Table ${m} — this order goes there.`,
  /** Under a seated chip's join form, only while this cart holds drafts: joining moves the diner,
   *  not the dishes. */
  draftsNote: "Joining puts you on their order — the dishes you added here won’t come along.",
  /** The sheet's sub-line (the DoorSheet keeps its own: a sticker scan from /cart would drop the
   *  persisted key and mint a second session over the drafts about to be sent). */
  sub: "Pick where you’re sitting — your order goes to the kitchen right after.",
  // K15 draft (3c-ii)
  subMy: "ထိုင်နေတဲ့ စားပွဲကို ရွေးပါ — ရွေးပြီးတာနဲ့ အော်ဒါက မီးဖိုချောင်ဆီ ရောက်သွားပါမယ်။",
  /** The escape: a numberless ticket reads its code on the pass; a registry outage is never a dead end. */
  sendAnyway: "Not at a numbered table? Send anyway",
} as const;
