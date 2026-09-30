"use client";
import { Chrome, OutageText } from "./Chrome";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P7·2 — what a staff surface may put in its live region.
 *
 * Either a dictionary key with its slots — authored copy, rendered through `<Chrome>` so the Burmese
 * arrives marked — or a server sentence passed through `<OutageText>`, which swaps in the one twin
 * that exists and shows every other sentence verbatim. A `string` state that held both shapes was
 * how the PIN failures stayed English under a Burmese switch (OPEN-ITEMS P2m): the region could only
 * ever render text, so nothing could hand it a key.
 *
 * No echo — this renders inside `role="status"`, and a bilingual announcement says everything
 * twice (the `<Chrome>` echo policy) — with ONE exception, and it is a shape, not a flag on any key.
 *
 * P2e (review, A3) — `{ k, both: true }` is the LANGUAGE surfaces' failure, which speaks BOTH
 * tongues on every device: the person a language write failed for may be exactly the one who cannot
 * read the device's mode, so its visible line is `<Chrome lang="my" … keepEcho>` — and the region
 * that stands in for that line (the Profile card's, whose line is `aria-hidden`) must say what the
 * line says. Rendered from the key in both tongues — Burmese marked, then the English — rather than
 * through `keepEcho`, which check:staff-lang rule 6 holds to the language surfaces' own JSX. The type
 * admits only a `shell.lang.*` key, rule 6's key rule, so no other message can become bilingual here.
 */
export type StaffMsg =
  | { k: StaffKey; vars?: Record<string, string | number> }
  | { k: Extract<StaffKey, `shell.lang.${string}`>; both: true }
  | string;

export function MsgText({ lang, msg }: { lang: StaffLang; msg: StaffMsg }) {
  if (typeof msg === "string") return <OutageText lang={lang} error={msg} />;
  if ("both" in msg)
    return (
      <>
        <Chrome lang="my" k={msg.k} />
        {" · "}
        <Chrome lang="en" k={msg.k} />
      </>
    );
  return <Chrome lang={lang} k={msg.k} vars={msg.vars} />;
}
