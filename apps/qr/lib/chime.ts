/**
 * W22f — the diner's sound identity: what may play, when, and at what pitch.
 *
 * PURE by design (no WebAudio, no `window`), so every rule here is testable and mutable. The engine
 * that actually makes noise is `diner-sound.ts`; this module owns the decisions it is not allowed to
 * make for itself.
 *
 * ── Why this is not `kds-sound.ts` ───────────────────────────────────────────────────────────────
 * The KDS chime already synthesizes tones with the same mallet envelope, and reusing that ENGINE is
 * right. Reusing its POLICY would be wrong, because almost every policy inverts between the two:
 *
 *   | | KDS (`kds-sound.ts`) | diner (here) |
 *   | default | **0.8 — loud.** A cook must hear a ticket land across a hot line. | **OFF.** A phone in a quiet dining room must never chirp unless asked. |
 *   | device | the restaurant's, one operator, all shift | the guest's, in public, for twenty minutes |
 *   | arm | an explicit "Enable sound" tap at shift start | the preference toggle itself is the gesture |
 *   | if it fails | the visual channel still covers it (O-C) | nothing is lost; it was garnish |
 *
 * Two modules, one envelope — and since **M90** that envelope is literally one: both engines schedule
 * through `chime-core.ts`, which owns the oscillator and knows none of the policy above.
 *
 * ── The rules ────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Off by default, and off means silent.** `soundEnabled()` answers false for an unset preference
 *    and for every failure of the store (private mode, disabled storage). There is no "probably on".
 *
 * 2. **Sound is never the only feedback.** Exactly as `haptics.ts` states it: both moments here
 *    already own a visible half (the send beat's paper settle, PaySuccess's confetti and receipt),
 *    and a new moment must bring its own. A guest with sound off — which is everyone, by default —
 *    must lose nothing.
 *
 * 3. **Never on an error path.** There is no `error` moment and there must not be one. A sound that
 *    fires when something goes wrong turns a recoverable problem into a public one: the whole table
 *    looks over. Errors are read, not heard.
 *
 * 4. **Two moments, and they are the two the app already treats as ceremony.** Sending to the kitchen
 *    and being paid. Anything else — an add, a tap, a step — is traffic, not ceremony, and giving
 *    traffic a sound is how an app becomes a slot machine.
 */

/** The preference key. Per-device, like the KDS volume — a guest's phone, not an account setting. */
export const SOUND_KEY = "mms.sound";

/**
 * One scheduled note. Re-exported from `chime-core` rather than re-declared: a second structural
 * definition would let the two drift into silently-incompatible shapes while both still typecheck.
 */
export type { ChimeNote } from "./chime-core";
import type { ChimeNote } from "./chime-core";

/**
 * The two moments, and only these two (rule 4).
 *
 * `sent` is a rising two-note bell — the shopkeeper's counter bell, the sound of an order being
 * accepted. `paid` resolves DOWNWARD onto the same root the bell started on, so the pair reads as one
 * phrase opened and closed across the meal rather than two unrelated beeps. Both sit in the 5th–6th
 * octave where a phone speaker is actually audible without being shrill.
 */
export const CHIME: Record<"sent" | "paid", ChimeNote[]> = {
  sent: [
    { freq: 784, at: 0, dur: 0.16 }, // G5
    { freq: 1047, at: 0.14, dur: 0.28 }, // C6 — the lift
  ],
  paid: [
    { freq: 1047, at: 0, dur: 0.14 }, // C6 — picks up where the bell left off
    { freq: 880, at: 0.13, dur: 0.16 }, // A5
    { freq: 784, at: 0.28, dur: 0.4 }, // G5 — resolves home
  ],
};

export type ChimeMoment = keyof typeof CHIME;

/**
 * The peak gain for a diner moment.
 *
 * Deliberately quieter than the KDS default (0.8): that is a working device in a loud kitchen, this
 * is someone's phone at a table with other people at it. Loud enough to be heard by the person
 * holding it, quiet enough not to announce their dinner to the room.
 */
export const CHIME_LEVEL = 0.22;

/**
 * Is sound on? Reads the store SYNCHRONOUSLY, and fails toward silence.
 *
 * The synchronous read is the same rule `haptics.ts` follows and for the same reason: a hook that
 * seeds a default before its effect resolves would play the first sound of the session against the
 * diner's actual preference, and a sound cannot be un-played.
 */
export function soundEnabled(store: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    return store?.getItem(SOUND_KEY) === "1";
  } catch {
    // A disabled or partitioned store is not consent. Rule 1.
    return false;
  }
}

/**
 * The whole gate, in one place: may this moment make a sound right now?
 *
 * `armed` is whether a real AudioContext is running. It is separate from `enabled` because they fail
 * for different reasons and a future edit must not collapse them — a diner can have sound ON while
 * the context was never unlocked (they toggled it in a previous session, or the resume was refused),
 * and that must be SILENCE. Not because collapsing them would throw (it would not: the engine returns
 * on a null context and wraps its body) but because notes scheduled into a suspended context are
 * played when that context is eventually resumed — a bell ringing minutes late, on an unrelated tap,
 * for an order already eaten. A chime out of its moment is worse than no chime.
 */
export function mayChime(opts: { enabled: boolean; armed: boolean }): boolean {
  return opts.enabled && opts.armed;
}
