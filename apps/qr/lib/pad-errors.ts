import { STAFF, type StaffKey } from "./i18n/staff";
import { fill } from "./i18n/fill";
import { STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY } from "./staff-outage";
import type { StaffWriteCode } from "./staff-add-outcome";
import { addAttemptOutcome, type AddAttemptOutcome } from "./staff-add-key";
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
 *               lost: the ghost STAYS and offers "Try again" under the SAME key — the ledger makes
 *               that a no-op if the first landed. Never "didn't go on", which invites a new tap and
 *               a new key: a second plate, cooked and charged.
 *
 * ok / unknown / definite is Phase 2a's rule (`addAttemptOutcome`, `lib/staff-add-key.ts` — the
 * add key's lifetime reads the same answer), READ here, never restated: this module only names
 * which sentence a definite refusal is.
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

/** A code `addAttemptOutcome` reads as DEFINITE — every code but the one that may have committed. */
type DefiniteCode = Exclude<StaffWriteCode, "unconfirmed">;

/** Every definite code → its reading. A `Record` over the union, so a code added to
 *  `StaffWriteCode` without a reading here is a compile error, not a silent "try again". */
const CODE: Record<DefiniteCode, "signin" | "sentence" | keyof typeof ADD_ERR> = {
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
};

export type PadAddRefusal =
  | { kind: "key"; key: PadAddErrKey; code: StaffWriteCode | undefined }
  | { kind: "signin" }
  | { kind: "sentence"; text: string };

export type PadAddVerdict =
  | { kind: "ok" }
  | { kind: "refused"; err: PadAddRefusal }
  | { kind: "unknown"; retry?: PadRetryErrKey };

type AddRefusal = { ok: false; error: string; code?: StaffWriteCode };

export function padAddVerdict(res: { ok: true } | AddRefusal | "threw"): PadAddVerdict {
  const outcome = addAttemptOutcome(res);
  if (outcome === "ok") return { kind: "ok" };
  if (outcome === "unknown") return { kind: "unknown" };
  // `addAttemptOutcome` says "definite" only of a refusal whose code is not `unconfirmed`.
  const fail = res as AddRefusal & { code?: DefiniteCode };
  const reading = fail.code === undefined ? "failed" : CODE[fail.code];
  if (reading === "signin") return { kind: "refused", err: { kind: "signin" } };
  if (reading === "sentence")
    return { kind: "refused", err: { kind: "sentence", text: fail.error } };
  return { kind: "refused", err: { kind: "key", key: ADD_ERR[reading].key, code: fail.code } };
}

/** What the add chain answers its caller: the verdict, or `unconfirmed` (15s with no answer), or
 *  `offline` (the tap never left the device). */
export type PadAddOutcome = PadAddVerdict["kind"] | "unconfirmed" | "offline";

/** The chain's answer in Phase 2a's words, for `heldAfter`: a key survives ONLY an outcome that may
 *  have committed — an answer that said so, or 15s of none. Offline sent nothing: definite. */
export function padAttemptOutcome(o: PadAddOutcome): AddAttemptOutcome {
  if (o === "ok") return "ok";
  return o === "unknown" || o === "unconfirmed" ? "unknown" : "definite";
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

// ── Phase 2c · review fixes · pad2 ──
/** Why a RETRY of an unknown add could not run — each sentence says the dish MAY already be on. */
const RETRY_ERR = {
  outage: "pad.err.retry.outage",
  paying: "pad.err.retry.paying",
  failed: "pad.err.retry.failed",
} as const satisfies Record<string, StaffKey>;

export type PadRetryErrKey = (typeof RETRY_ERR)[keyof typeof RETRY_ERR];

/**
 * The answer to a RETRY ("Try again", or the options sheet's same choice again) of an add whose
 * outcome was UNKNOWN. Every definite refusal `staffAddItem` can give is decided BEFORE the add-key
 * ledger (the gate, the cart read, the payment mutex, pricing) or by the insert's own "not open"
 * guard — so it is definite about the RETRY only and says nothing about the FIRST attempt, which may
 * have committed. Read as definite, the ghost went, the key was dropped and "{x} didn't go on"
 * invited a new tap under a new key: a second plate, cooked and charged. So the attempt stays
 * unknown (lost, same key) and the sentence says why the retry could not run and that the dish may
 * already be on. A sign-in ask stays what it is: the console leaves for the login page.
 */
export function padRetryVerdict(v: PadAddVerdict): PadAddVerdict {
  if (v.kind !== "refused" || v.err.kind === "signin") return v;
  const code = v.err.kind === "key" ? v.err.code : undefined;
  return {
    kind: "unknown",
    retry:
      code === "outage"
        ? RETRY_ERR.outage
        : code === "paying"
          ? RETRY_ERR.paying
          : RETRY_ERR.failed,
  };
}
