"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ts } from "@/lib/i18n/staff";
import { setStaffLang } from "@/lib/staff-lang-actions";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P2 — the staff device's language control.
 *
 * TWO BUTTONS, BOTH ALWAYS VISIBLE, never one toggling button. `မြန်မာ` alone is ambiguous between
 * "you are reading Burmese" and "switch to Burmese", and that ambiguity is unrecoverable for the
 * person who cannot read the other label — which is exactly the person this control exists for. Two
 * buttons with `aria-pressed` say both things at once, and because the visible autonym IS the
 * accessible name, WCAG 2.5.3 holds by construction.
 *
 * THE LABELS ARE COMPONENT CONSTANTS, NOT DICTIONARY KEYS. `english.my = "English"` would redden the
 * Myanmar-script guard, and more importantly a native-check pass must never be able to "correct" one
 * autonym into the other language: that single edit makes the control unusable. The kiosk carries
 * the same pair as its only two `my === en` entries, for the same reason.
 *
 * The failure notice is a plain `role="alert"` mounted only on failure — deliberately NOT a live
 * region, so every staff view keeps its ONE.
 */
export function StaffLangSwitch({ lang }: { lang: StaffLang }) {
  const router = useRouter();
  const groupId = useId();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function choose(next: StaffLang) {
    if (next === lang || pending) return;
    setFailed(false);
    startTransition(async () => {
      const res = await setStaffLang({ lang: next });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      // The cookie is httpOnly, so the new language arrives only by re-rendering on the server.
      // `refresh()` keeps the DOM node, so focus stays on the button that was tapped.
      router.refresh();
    });
  }

  return (
    <div className="staff-lang" role="group" aria-labelledby={groupId} aria-busy={pending}>
      <span id={groupId} className="sr-only" lang={lang === "my" ? "my" : undefined}>
        {ts(lang, "shell.lang.group")}
      </span>
      <button
        type="button"
        className="staff-lang-btn"
        aria-pressed={lang === "my"}
        disabled={pending}
        onClick={() => choose("my")}
        lang="my"
      >
        မြန်မာ
      </button>
      <button
        type="button"
        className="staff-lang-btn"
        aria-pressed={lang === "en"}
        disabled={pending}
        onClick={() => choose("en")}
      >
        English
      </button>
      {failed && (
        <span role="alert" className="staff-lang-err" lang={lang === "my" ? "my" : undefined}>
          {ts(lang, "shell.lang.failed")}
        </span>
      )}
    </div>
  );
}
