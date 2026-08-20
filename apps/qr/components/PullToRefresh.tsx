"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnimationPreference } from "@mms/ui";
import { PULL_MAX_PX, pullArmed, pullTravel } from "@/lib/pull-refresh";
import { haptic } from "@/lib/haptics";

/**
 * W22c — pull-to-refresh, on the ONE surface with a real staleness problem.
 *
 * ── Why /menu and nowhere else ───────────────────────────────────────────────────────────────────
 * The catalog is the only diner-facing data with neither a push channel nor a wake re-read: the
 * four realtime channels carry orders, carts, shares and the floor — none carries `menu_items`. So
 * an 86 landing mid-service (W23a) never reaches a phone already sitting on the menu.
 *
 * ⚠️ THE COST OF STALENESS IS NOT A BAD CHARGE. `priceItem` re-reads `is_sold_out`/`is_active` on
 * EVERY add and refuses server-side, so a stale phone cannot pay for a dish that is gone. What it
 * can do is let a diner assemble a whole order around a dish they cannot have and meet the refusal
 * at the last tap — the same anti-pattern CLAUDE.md already names for the tip cap ("a bound
 * surfaces as a failed payment at the last tap"). That, not a money hole, is what this closes.
 *
 * Everywhere else the gesture is deliberately absent: /track and the cart are realtime, /account is
 * history (a receipt does not go stale), the grocery shopper is holding the item, and a wet-handed
 * cook pulling a KDS board is a hazard.
 *
 * ── router.refresh(), never location.reload() ────────────────────────────────────────────────────
 * The menu keeps a LAST-GOOD catalog behind a `DegradedStrip` (W10a: stale menu ≫ no menu). A
 * document reload on teahouse wifi discards that and hands the diner the service worker's synthetic
 * offline shell. An in-place RSC refetch fails soft: the menu stays, the strip appears. It is also
 * the rule `packages/ui`'s fallback already states — reload-as-retry loses state.
 *
 * ⚠️ THE PAGE MUST NOT TRANSFORM. `/menu`'s `<main>` hosts two `position: fixed` descendants —
 * `PaperAmbient` (z:-1) and `CartBar` (the primary CTA). A transform on an ancestor becomes their
 * containing block, so translating the page for the pull would drag the Add bar off-screen and crop
 * the ambient. Only this indicator moves; the content never does.
 *
 * ── The arm signal is NOT the lit-gold cap ───────────────────────────────────────────────────────
 * `docs/DESIGN-LANGUAGE.md` reserves the gold cap for chosen, PERSISTED selections. Handing it to a
 * transient gesture state would dilute the one selection vocabulary the design language protects.
 * The label carries the state; the ✦'s rotation is the only continuous signal, and it is
 * reduced-motion escorted.
 */
export function PullToRefresh({
  onSettled,
  disabled = false,
}: {
  /** Called after the refresh transition settles, so the caller can prove (via its own render
   *  stamp) whether a server render actually landed and announce the honest outcome. This component
   *  never composes the sentence — that lives in `lib/catalog-freshness`. */
  onSettled: () => void;
  /** Suppress the gesture entirely (a sheet is open, the catalog is already in its outage state). */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [travel, setTravel] = useState(0);
  const { shouldAnimate } = useAnimationPreference();
  const startY = useRef<number | null>(null);
  const armedRef = useRef(false);

  const fire = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // The refresh has settled the moment the transition drains. `router.refresh()` returns void, so
  // this is the ONLY signal that anything happened at all — the caller turns it into a claim.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onSettled();
    wasPending.current = pending;
  }, [pending, onSettled]);

  // ── The gesture ────────────────────────────────────────────────────────────────────────────────
  // Non-passive touchmove, because at scrollTop 0 with a downward drag we `preventDefault()` to take
  // the gesture from the browser's own pull-to-refresh (which would reload the document and lose the
  // last-good catalog). Everywhere else the listener does nothing at all and native scrolling is
  // untouched — the deadzone below is what keeps an ordinary downward scroll from being claimed.
  useEffect(() => {
    if (disabled) return;
    const DEADZONE = 8;
    const onStart = (e: TouchEvent) => {
      // Only arm at the very top, and only for a single finger (a pinch is not a pull).
      startY.current =
        window.scrollY <= 0 && e.touches.length === 1 ? (e.touches[0]?.clientY ?? null) : null;
      armedRef.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || pending) return;
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY.current;
      if (dy <= DEADZONE) {
        // An upward drag (or a jitter) is a scroll — hand it straight back, and stop tracking so a
        // long scroll that later passes back through the top does not spring the indicator open.
        if (dy < 0) startY.current = null;
        setTravel(0);
        return;
      }
      if (window.scrollY > 0) {
        startY.current = null;
        setTravel(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      const t = pullTravel(dy - DEADZONE);
      setTravel(t);
      if (!armedRef.current && pullArmed(t)) {
        armedRef.current = true;
        // `pick`, not `commit`: arming is reversible — lift without releasing past the threshold and
        // nothing happens. The vocabulary's whole point is that the thumb can tell those apart.
        haptic("pick");
      }
    };
    const onEnd = () => {
      if (startY.current != null && armedRef.current) fire();
      startY.current = null;
      armedRef.current = false;
      setTravel(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled, pending, fire]);

  // ── Freshness on WAKE, for the diner who never pulls ────────────────────────────────────────────
  // The realistic staleness window is a pocketed phone, not a deliberate gesture, and most diners
  // will never discover a pull. Coalesced visibilitychange + focus, 50ms — verbatim the shape
  // `lib/useLiveOrders.ts` already calls "the J3 pattern", so the two wakes are one refetch.
  useEffect(() => {
    if (disabled) return;
    let wake: ReturnType<typeof setTimeout> | undefined;
    const onWake = () => {
      if (document.visibilityState !== "visible" || wake) return;
      wake = setTimeout(() => {
        wake = undefined;
        fire();
      }, 50);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      if (wake) clearTimeout(wake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [disabled, fire]);

  const armed = pullArmed(travel);
  const shown = pending ? PULL_MAX_PX / 2 : travel;
  if (shown <= 0 && !pending) return null;

  return (
    // Decorative + inert: the OUTCOME is announced through the page's existing single live region
    // (the provider's `announce`), never from here — a second live region on the menu would break
    // the one-per-view rule (QA-CHECKLIST §A).
    <div
      className="ptr"
      aria-hidden
      style={{ transform: `translateY(${shown}px)`, opacity: Math.min(1, shown / 24) }}
    >
      <span
        className={`ptr-star${pending && shouldAnimate ? " ptr-star-spin" : ""}`}
        style={shouldAnimate && !pending ? { transform: `rotate(${shown * 4}deg)` } : undefined}
      >
        ✦
      </span>
      <span className="ptr-label">
        {pending ? "Checking the menu…" : armed ? "Release to check" : "Pull to check the menu"}
      </span>
    </div>
  );
}
