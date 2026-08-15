"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_STORAGE_KEY, t, type DictKey, type Locale } from "@/lib/i18n";
import { setLocalePref } from "@/lib/rewards";

/**
 * W5 (S2) — the app-wide locale. Root context (the ActiveOrderProvider pattern) seeded from the
 * SERVER (the layout's cookie read) — never from localStorage, so there is no EN→MY flash on a
 * Burmese-mode load. `setLocale` flips the ~95% of strings living in client leaves INSTANTLY
 * (cookie + mirror + `<html lang>` + `body.my` written synchronously), then `router.refresh()`
 * catches the Server-Component shells up, then the profile sync fires-and-forgets (signed-in
 * cross-device bonus; the cookie already carries anon diners).
 *
 * The flip is NOT a route change — no view transition, no animation (MOTION_AND_PERF: nothing to
 * reduced-motion-gate because nothing moves).
 */

const LocaleCtx = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: "en",
  setLocale: () => {},
});

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);
  const [, startTransition] = useTransition();

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState((prev) => {
        if (prev === l) return prev;
        try {
          const secure = location.protocol === "https:" ? ";secure" : "";
          document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;samesite=lax${secure}`;
          localStorage.setItem(LOCALE_STORAGE_KEY, l);
        } catch {
          /* storage/cookies unavailable — the in-memory flip still works this session */
        }
        // WCAG 3.1.2 — the document language is real, not a comment: the layout.tsx promise,
        // finally kept. body.my swaps the Padauk face + the MY typographic reset (globals.css).
        document.documentElement.lang = l;
        document.body.classList.toggle("my", l === "my");
        return l;
      });
      // Server-Component shells re-render on the refreshed cookie; the profile sync + the
      // lang_change analytics ride the server action (fire-and-forget — a failed sync never
      // blocks the flip the diner already sees).
      startTransition(() => router.refresh());
      void setLocalePref(l).catch(() => {});
    },
    [router],
  );

  return <LocaleCtx.Provider value={{ locale, setLocale }}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  return useContext(LocaleCtx);
}

/** The render-site translator: `const tr = useT(); tr("yourOrder")`. */
export function useT(): (key: DictKey) => string {
  const { locale } = useContext(LocaleCtx);
  return useCallback((key: DictKey) => t(locale, key), [locale]);
}
