"use client";
import { ts } from "@/lib/i18n/staff";
import type { WhatKey } from "@/lib/staff-outage";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";

/**
 * counter-9 — the one line a `loading.tsx` skeleton announces, in the console's tongue. A client
 * component on purpose: the skeleton is a Suspense FALLBACK, and a fallback that awaits `cookies()`
 * is no longer a static, prefetchable boundary (the blind pass asked whether an async `loading.tsx`
 * is still instant on a client navigation, and source cannot settle it). The tongue is already in
 * scope — every staff `loading.tsx` renders inside `app/staff/layout.tsx`'s `StaffLangProvider` —
 * so reading it here keeps the boundary synchronous and the announcement the dictionary's.
 */
export function LoadingLine({ what }: { what: WhatKey }) {
  const lang = useStaffLang();
  return (
    <span className="sr-only">
      <Chrome lang={lang} k="shell.loading" vars={{ what: ts(lang, what) }} />
    </span>
  );
}
