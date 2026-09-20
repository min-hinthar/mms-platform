import type { StaffKey } from "./i18n/staff";
import type { ExpoErrCode } from "./expo-types";

/**
 * counter-6 / P2p — a refused lane action speaks the device language, said about the bag.
 *
 * P2p measured why the obvious one-line conversion was wrong: the subject of the sentence is
 * itself bilingual for a table ("စားပွဲ 7"), and `<Chrome>`'s slot rule would wrap the whole value
 * as Latin. So the SUBJECT is a shape, not a string: a table carries its number into a key whose
 * `{id}` slot is Latin-always (the tent card is printed in Latin), a named or coded bag carries its
 * identifier (never a word), and a scan-and-go basket carries who to verify. `sentence` is shown as
 * it is (through `OutageText`, which owns the write-outage twin); `signin` is not a message at all.
 */
export type ExpoSubject =
  | { kind: "table"; id: number }
  | { kind: "bag"; x: string }
  | { kind: "verify"; x: string };

export type ExpoMsg = { k: StaffKey; vars?: Record<string, string | number> } | string;

export type ExpoErrOutcome =
  | { kind: "leave"; href: "/staff/login" }
  | { kind: "show"; msg: ExpoMsg };

/** The "could not update" sentence for this subject — the thrown arm uses it too. */
export function expoFailedMsg(subject: ExpoSubject): ExpoMsg {
  switch (subject.kind) {
    case "table":
      return { k: "expo.err.bagTable", vars: { id: subject.id } };
    case "bag":
      return { k: "expo.err.bagFor", vars: { x: subject.x } };
    case "verify":
      return { k: "expo.err.verify", vars: { x: subject.x } };
  }
}

const subjectText = (s: ExpoSubject): string | number => (s.kind === "table" ? s.id : s.x);

export function expoErrOutcome(
  res: { error: string; code: ExpoErrCode },
  subject: ExpoSubject,
): ExpoErrOutcome {
  switch (res.code) {
    case "signin":
      return { kind: "leave", href: "/staff/login" };
    case "sentence":
      return { kind: "show", msg: res.error };
    case "invalid":
      return { kind: "show", msg: { k: "expo.err.invalid" } };
    case "stale":
      return {
        kind: "show",
        msg:
          subject.kind === "table"
            ? { k: "expo.err.staleTable", vars: { id: subject.id } }
            : { k: "expo.err.stale", vars: { x: subjectText(subject) } },
      };
    case "failed":
      return { kind: "show", msg: expoFailedMsg(subject) };
  }
}
