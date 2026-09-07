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
 * No echo, ever: this renders inside `role="status"`, and a bilingual announcement says everything
 * twice (the `<Chrome>` echo policy).
 */
export type StaffMsg = { k: StaffKey; vars?: Record<string, string | number> } | string;

export function MsgText({ lang, msg }: { lang: StaffLang; msg: StaffMsg }) {
  if (typeof msg === "string") return <OutageText lang={lang} error={msg} />;
  return <Chrome lang={lang} k={msg.k} vars={msg.vars} />;
}
