import { STAFF, type StaffKey } from "./i18n/staff";
import { fill } from "./i18n/fill";
import { STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY } from "./staff-outage";
import type { StaffWriteCode } from "./staff-add-outcome";
import type { NoticeKind, SlotNotice } from "./notice-slot";
import type { SendNotice } from "./staff-send-view";

/**
 * Phase 2c · pad — what an add's answer MEANS on the order pad, and the pad's ONE live region.
 *
 * `staffAddItem` codes every refusal by WHERE it happened (`lib/staff-add-outcome.ts`); this module
 * reads the code — never the message text (LEARNINGS #60) — into one of three verdicts:
 *
 *   • ok      — the add landed; its ghost waits for a read that started after it.
 *   • refused — a DEFINITE non-landing: the ghost goes, the dish is named, the settle cue plays.
 *   • unknown — the write may have committed (`unconfirmed`), or the action threw with its answer
 *               lost: the ghost STAYS and offers "Send again" under the SAME key — the ledger makes
 *               that a no-op if the first landed. Never "didn't go on", which invites a new tap and
 *               a new key: a second plate, cooked and charged.
 *
 * The region is the diner's arbitrated slot (`lib/notice-slot.ts`, shipped in Phase 1c), reused
 * unchanged: `padSlotNotice` renders each notice's EN and MY through the dictionary so
 * `admitNotice`/`purgesDeferred` compare and generalize them as TEXT, while the component renders
 * the kept `msg` through `<MsgText>` — marked, in the console's tongue, with no echo.
 *
 * Pure and client-safe (type imports only from the server modules).
 */

/** Structurally the staff `StaffMsg` (components/staff/StaffMsg.tsx): a key with its slots, or a
 *  server sentence `<OutageText>` passes through. */
export type PadMsg = { k: StaffKey; vars?: Record<string, string | number> } | string;

/** A slot notice plus what to RENDER for it (the family's, when the slot generalizes). */
export type PadNotice = SlotNotice & { msg: PadMsg; familyMsg?: PadMsg };

/** A named refusal and its unnamed family sentence. */
type AddErrKey = { key: StaffKey; family: StaffKey };

const ADD_ERR = {
  paying: { key: "pad.err.add.paying", family: "pad.err.add.paying.family" },
  soldOut: { key: "pad.err.add.soldOut", family: "pad.err.add.soldOut.family" },
  gone: { key: "pad.err.add.gone", family: "pad.err.add.gone.family" },
  closed: { key: "pad.err.add.closed", family: "pad.err.add.closed.family" },
  outage: { key: "pad.err.add.outage", family: "pad.err.add.outage.family" },
  failed: { key: "pad.err.add.failed", family: "pad.err.add.failed.family" },
  unconfirmed: { key: "pad.err.add.unconfirmed", family: "pad.err.add.unconfirmed.family" },
  offline: { key: "pad.err.add.offline", family: "pad.err.add.offline.family" },
} as const satisfies Record<string, AddErrKey>;

export type PadAddErrKey = (typeof ADD_ERR)[keyof typeof ADD_ERR]["key"];

/** Every code → its reading. A `Record` over the union, so a code added to `StaffWriteCode` without
 *  a reading here is a compile error, not a silent "try again". */
const CODE: Record<StaffWriteCode, "signin" | "sentence" | "unknown" | keyof typeof ADD_ERR> = {
  signin: "signin",
  sentence: "sentence",
  invalid: "failed",
  closed: "closed",
  "no-cart": "closed",
  paying: "paying",
  sold_out: "soldOut",
  gone: "gone",
  outage: "outage",
  failed: "failed",
  unconfirmed: "unknown",
};

export type PadAddRefusal =
  | { kind: "key"; key: PadAddErrKey; code: StaffWriteCode | undefined }
  | { kind: "signin" }
  | { kind: "sentence"; text: string };

export type PadAddVerdict =
  | { kind: "ok" }
  | { kind: "refused"; err: PadAddRefusal }
  | { kind: "unknown" };

export function padAddVerdict(
  res: { ok: true } | { ok: false; error: string; code?: StaffWriteCode } | "threw",
): PadAddVerdict {
  if (res === "threw") return { kind: "unknown" };
  if (res.ok) return { kind: "ok" };
  const reading = res.code === undefined ? "failed" : CODE[res.code];
  if (reading === "unknown") return { kind: "unknown" };
  if (reading === "signin") return { kind: "refused", err: { kind: "signin" } };
  if (reading === "sentence")
    return { kind: "refused", err: { kind: "sentence", text: res.error } };
  return { kind: "refused", err: { kind: "key", key: ADD_ERR[reading].key, code: res.code } };
}

const FAMILY: ReadonlyMap<StaffKey, StaffKey> = new Map(
  Object.values(ADD_ERR).map((e) => [e.key as StaffKey, e.family as StaffKey]),
);

/** A dictionary notice for the slot: both tongues rendered so the slot can compare them as text. */
export function padSlotNotice(
  kind: NoticeKind,
  key: StaffKey,
  vars?: Record<string, string | number>,
  opts: { family?: StaffKey; quiet?: boolean } = {},
): PadNotice {
  const v = vars ?? {};
  const fam = opts.family;
  return {
    text: fill(STAFF[key].en, v, "en"),
    my: fill(STAFF[key].my, v, "my"),
    quiet: opts.quiet ?? false,
    kind,
    family: fam ? { text: STAFF[fam].en, my: STAFF[fam].my } : undefined,
    msg: vars ? { k: key, vars } : { k: key },
    familyMsg: fam ? { k: fam } : undefined,
  };
}

/** A named add CORRECTION (a refusal, an offline tap, an unknown outcome) with its family, so two
 *  dishes refused for one cause become the family's unnamed sentence rather than the second
 *  erasing the first dish's retraction. */
export function padAddNotice(key: PadAddErrKey, dish: string): PadNotice {
  return padSlotNotice("correction", key, { x: dish }, { family: FAMILY.get(key) });
}

/** The reused send controller's line (`fireNotice`/`undoNotice`) into the pad's slot: ok → news,
 *  warn → a correction. The write-outage sentence keeps its authored Burmese twin. */
export function padSendNotice(n: SendNotice): PadNotice | "signin" {
  if (n === "signin") return "signin";
  const kind: NoticeKind = n.tone === "ok" ? "news" : "correction";
  if (typeof n.msg === "string")
    return {
      text: n.msg,
      my: n.msg === STAFF_WRITE_OUTAGE ? STAFF_WRITE_OUTAGE_MY : undefined,
      quiet: false,
      kind,
      msg: n.msg,
    };
  return padSlotNotice(kind, n.msg.k, n.msg.vars);
}

/** The server sentence a gate refusal carries, as a slot correction (rendered via `<OutageText>`). */
export function padSentenceNotice(text: string): PadNotice {
  return {
    text,
    my: text === STAFF_WRITE_OUTAGE ? STAFF_WRITE_OUTAGE_MY : undefined,
    quiet: false,
    kind: "correction",
    msg: text,
  };
}
