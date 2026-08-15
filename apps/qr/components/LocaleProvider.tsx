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
  // Review MED-1 — reconcile when the SERVER re-renders with a DIFFERENT cookie value (another
  // tab flipped the locale, then any router.refresh() in this tab — Checkout refreshes after
  // every cart edit — re-rendered the layout). The layout already patched <html lang>/body.my;
  // without this the client leaves keep rendering the stale tongue under the new one's font.
  // Render-phase derived state (the sanctioned setState-during-render pattern), not an effect.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setLocaleState(initial);
  }
  const [, startTransition] = useTransition();

  const setLocale = useCallback(
    (l: Locale) => {
      if (l === locale) return; // no-op tap: no writes, no refresh, no analytics
      // Review LOW-8 — side effects live OUT here in the event handler, not inside the setState
      // updater (updaters must be pure; StrictMode double-invokes them).
      try {
        const secure = location.protocol === "https:" ? ";secure" : "";
        document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;samesite=lax${secure}`;
        // Write-only by design today: the cookie is the carrier the server reads; the mirror
        // exists for a future offline/PWA restore path and for parity with the handover
        // exemption in lib/device-session.ts.
        localStorage.setItem(LOCALE_STORAGE_KEY, l);
      } catch {
        /* storage/cookies unavailable — the in-memory flip still works this session */
      }
      // WCAG 3.1.2 — the document language is real, not a comment: the layout.tsx promise,
      // finally kept. body.my swaps the Padauk face + the MY typographic reset (globals.css).
      document.documentElement.lang = l;
      document.body.classList.toggle("my", l === "my");
      setLocaleState(l);
      // Server-Component shells re-render on the refreshed cookie; the profile sync + the
      // lang_change analytics ride the server action (fire-and-forget — a failed sync never
      // blocks the flip the diner already sees).
      startTransition(() => router.refresh());
      void setLocalePref(l).catch(() => {});
    },
    [router, locale],
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
