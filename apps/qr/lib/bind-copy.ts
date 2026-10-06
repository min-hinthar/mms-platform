/**
 * Phase 3c-ii (D28) — the bind's sentences, named ONCE. Pure strings: the sheet reads them on the
 * client, `/api/session` and `bindTable` answer with them on the server, so the two can never drift.
 * `seated` and `unavailable` are the mint's own refusals, byte-identical to what `/api/session` has
 * said since K2 (the route now imports them from here); the rest are new EN, ledgered for K15
 * (`kioskOrder` · `held` · `stickerTable` — J40 · J41 — EN only, no MY draft yet).
 */
export const BIND_COPY = {
  /** The table has a live party: join with their code (the inline form), or pick another. */
  seated: "That table was just seated — join with the party’s code, or pick another.",
  /** Not registered, retired, or gone from the registry between the read and the write. */
  unavailable: "That table isn’t available — pick another.",
  /** This session is already seated somewhere else; the order goes to THAT table. */
  alreadyBound: (m: number) => `You’re at Table ${m} — this order goes there.`,
  /** J40 — a kiosk order holds the table: no phone joins one (`/api/session` refuses), so no form. */
  kioskOrder: (n: number) =>
    `Table ${n} has a kiosk order in progress — ask a server, or pick another.`,
  /** J40 — a table a server started that is no longer untouched (`mms_shell_untouched`): a line, a
   *  name, a promo, a tab, a split, a pay attempt, an earlier order, or only a joiner. Said by the
   *  Send's bind AND by `/api/session`'s `?table=N` claim, whose diner may have no order at all — so
   *  it claims no order on the table and none to add: who holds the table, and the two ways out. */
  held: (n: number) =>
    `A server has Table ${n} open — ask them to seat you there, or pick another.`,
  /** J41 — this session started from another table's sticker, and binds only there. Worded for the
   *  diner who MOVED as well as the one who mis-tapped: no move-table tool exists (J38), so the
   *  honest options are that table, or a numberless send. */
  stickerTable: (t: number) =>
    `This order started from Table ${t}’s sticker — if you’re at Table ${t}, pick it; otherwise send anyway.`,
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
