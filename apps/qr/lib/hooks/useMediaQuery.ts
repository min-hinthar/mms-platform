import { useCallback, useSyncExternalStore } from "react";

/**
 * P7·3 — a media query as an external store: `false` on the server and on the first client render
 * (so a query cannot split hydration), the live answer after. A device with no `matchMedia` (an old
 * WebView) answers `false` for good.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia(query);
      // Older iOS Safari has only the legacy addListener API — the ThemeSync guard, verbatim.
      if (mq.addEventListener) {
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
      }
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
