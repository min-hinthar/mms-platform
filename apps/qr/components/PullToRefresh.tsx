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
 * ── A gesture may never be the ONLY way to reach a function ──────────────────────────────────────
 * WCAG 2.5.1 (Pointer Gestures) and 2.1.1 (Keyboard). The pull is a path-based, multi-point-in-time
 * gesture: unreachable by keyboard, by switch access, and — because VoiceOver claims single-finger
 * drags for explore-by-touch while `onStart` requires exactly one touch — unreachable under a screen
 * reader too. A browser reload is NOT the equivalent, by this file's own argument above (it discards
 * the last-good catalog). So the component ships a real `<button>` that calls the same `fire()`, and
 * the gesture is the shortcut rather than the mechanism.
 *
 * ── The arm signal is NOT the lit-gold cap ───────────────────────────────────────────────────────
 * `docs/DESIGN-LANGUAGE.md` reserves the gold cap for chosen, PERSISTED selections. Handing it to a
 * transient gesture state would dilute the one selection vocabulary the design language protects.
 * The label carries the state; the ✦'s rotation is the only continuous signal, and it is
 * reduced-motion escorted.
 */

/**
 * Did the DINER ask? `asked` is a pull or a tap of the button — a question, which is always owed an
 * answer. `ambient` is the wake re-read, which nobody requested; it may only speak when it has news.
 * The caller decides what that means; this component only reports which one fired.
 */
export type RefreshReason = "asked" | "ambient";

export function PullToRefresh({
  onRefresh,
  onSettled,
  disabled = false,
}: {
  /** Called SYNCHRONOUSLY, immediately before `router.refresh()`. The caller uses it to snapshot the
   *  render stamp as it stands at fire time — the only value a settle can honestly be compared
   *  against (see `onSettled`). */
  onRefresh: (reason: RefreshReason) => void;
  /** Called after the refresh transition settles, so the caller can prove (via its own render
   *  stamp) whether a server render actually landed and announce the honest outcome. This component
   *  never composes the sentence — that lives in `lib/catalog-freshness`. */
  onSettled: (reason: RefreshReason) => void;
  /** Suppress the gesture (an `ItemSheet` is open). ⚠️ NOT for the catalog outage: see `fire`. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [travel, setTravel] = useState(0);
  const { shouldAnimate } = useAnimationPreference();
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const armedRef = useRef(false);
  // Which path fired the in-flight refresh, read back when the transition drains, then cleared. A
  // ref, not state: it must not re-render, and it is only ever written immediately before `pending`
  // goes true. `null` means nothing is in flight.
  const inFlight = useRef<RefreshReason | null>(null);

  // ⚠️ NEVER gate this on the catalog being stale. The first draft suppressed the whole component
  // when `catalogStale` was true, which is precisely backwards: `catalogStale` says the LAST read
  // failed, not that the next one will — and since the wake effect was suppressed too, a diner who
  // hit one blip was stranded on the last-good copy with no path back short of a hard reload, which
  // is the one action that throws the last-good copy away. Honesty about a failing read belongs in
  // the SENTENCE (`catalogFreshness`'s `trusted` arm), not in removing the retry.
  const fire = useCallback(
    (reason: RefreshReason) => {
      // An `asked` refresh already in flight OWNS the answer. A wake landing on top of it (the phone
      // regains focus a beat after the pull — a dismissed notification, a share sheet closing) would
      // otherwise overwrite the reason and downgrade a question the diner asked into a notice the
      // caller is allowed to swallow, so the pull would silently say nothing.
      if (inFlight.current === "asked" && reason === "ambient") return;
      inFlight.current = reason;
      onRefresh(reason);
      startTransition(() => {
        router.refresh();
      });
    },
    [router, onRefresh],
  );

  // The refresh has settled the moment the transition drains. `router.refresh()` returns void, so
  // this is the ONLY signal that anything happened at all — the caller turns it into a claim.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      const reason = inFlight.current ?? "ambient";
      inFlight.current = null;
      onSettled(reason);
    }
    wasPending.current = pending;
  }, [pending, onSettled]);

  // ── The gesture ────────────────────────────────────────────────────────────────────────────────
  // Non-passive touchmove, because at scrollTop 0 with a downward drag we `preventDefault()` to take
  // the gesture from the browser's own pull-to-refresh (which would reload the document and lose the
  // last-good catalog). Everywhere else the listener does nothing at all and native scrolling is
  // untouched — the deadzone and the axis test below are what keep an ordinary scroll or a rail
  // flick from being claimed.
  useEffect(() => {
    if (disabled) return;
    const DEADZONE = 8;
    const reset = () => {
      startY.current = null;
      armedRef.current = false;
      setTravel(0);
    };
    const onStart = (e: TouchEvent) => {
      // Only arm at the very top, and only for a single finger (a pinch is not a pull; a two- or
      // three-finger drag is how VoiceOver/TalkBack scroll, and must reach the page untouched).
      const t = e.touches[0];
      startY.current = window.scrollY <= 0 && e.touches.length === 1 ? (t?.clientY ?? null) : null;
      startX.current = t?.clientX ?? 0;
      armedRef.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const t = e.touches[0];
      const dy = (t?.clientY ?? 0) - startY.current;
      const dx = (t?.clientX ?? 0) - startX.current;
      // ⚠️ AXIS DOMINANCE, before anything else can preventDefault. `/menu` stacks four horizontal
      // rails (`.menu-rail`, `.start-here-rail`, `.taste-rail`, the favorites rail) at the very top
      // of the page — exactly where this gesture arms. A thumb arc across a rail drifts 10-30px
      // vertically (far more with tremor or limited dexterity), and `preventDefault` on a touchmove
      // cancels the browser's scroll for that touch on BOTH axes: without this test the rail simply
      // would not move, and carrying the arc through would fire a refresh the diner never asked for.
      if (Math.abs(dx) >= Math.abs(dy)) {
        startY.current = null;
        setTravel(0);
        return;
      }
      // The compositor has already claimed this pan (it went non-cancelable mid-gesture), so the
      // page is scrolling natively no matter what we do. Running the pull in parallel would arm,
      // buzz and fire alongside a native scroll — two responses to one drag. Hand it back.
      if (!e.cancelable) {
        startY.current = null;
        setTravel(0);
        return;
      }
      if (dy <= DEADZONE) {
        // An upward drag (or a jitter) is a scroll — hand it straight back, and stop tracking so a
        // long scroll that later passes back through the top does not spring the indicator open.
        if (dy < 0) startY.current = null;
        // ⚠️ DISARM. `armedRef` used to survive a drag back under the deadzone, so a diner who
        // pulled past the threshold, thought better of it and dragged back to the top — watching
        // the indicator disappear — still fired a refresh on release. The UI said cancelled and the
        // code said armed.
        armedRef.current = false;
        setTravel(0);
        return;
      }
      if (window.scrollY > 0) {
        startY.current = null;
        setTravel(0);
        return;
      }
      // ⚠️ THE preventDefault COMES BEFORE THE `pending` BAIL, and that ordering is the whole point.
      // This app declines `overscroll-behavior-y` app-wide (the shorthand would claim the horizontal
      // axis the rails need), so this call is the ONLY thing stopping Chrome-Android's native
      // pull-to-refresh from RELOADING THE DOCUMENT — which discards the last-good catalog, the
      // exact loss this component exists to prevent. Bailing out early while a refresh is in flight
      // handed the browser the second pull, i.e. the pull a diner is most likely to make, on the
      // slow connection where it costs the most.
      e.preventDefault();
      if (pending) return; // gesture claimed, but a refresh is already running — no second one
      const travelled = pullTravel(dy - DEADZONE);
      setTravel(travelled);
      if (!armedRef.current && pullArmed(travelled)) {
        armedRef.current = true;
        // `pick`, not `commit`: arming is reversible — lift without releasing past the threshold and
        // nothing happens. The vocabulary's whole point is that the thumb can tell those apart.
        haptic("pick");
      }
    };
    const onEnd = () => {
      const shouldFire = startY.current != null && armedRef.current;
      reset();
      if (shouldFire) fire("asked");
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
  // `lib/useLiveOrders.ts` already calls "the J3 pattern", so the two wakes are one refetch. It
  // fires as `ambient`, and the caller keeps it SILENT unless something really changed: the J3
  // pattern it copies re-fetches without speaking, and `announce` here is a single-slot VISIBLE
  // toast — an unrequested "Menu is up to date." on every app switch would overwrite the "Added
  // Mohinga" confirmation of the thing the diner just tapped.
  useEffect(() => {
    if (disabled) return;
    let wake: ReturnType<typeof setTimeout> | undefined;
    const onWake = () => {
      if (document.visibilityState !== "visible" || wake) return;
      wake = setTimeout(() => {
        wake = undefined;
        fire("ambient");
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

  return (
    <>
      {/* The pointer-gesture alternative (WCAG 2.5.1 / 2.1.1) — see the header. Deliberately a plain
          button in the header's flow: it is the mechanism, and the pull is the shortcut. No live
          region of its own; the outcome speaks through the page's single announcer. */}
      <button
        type="button"
        className="ptr-btn"
        onClick={() => fire("asked")}
        disabled={pending}
        aria-label="Check the menu for updates"
      >
        <span aria-hidden className={pending && shouldAnimate ? "ptr-star-spin" : undefined}>
          ✦
        </span>{" "}
        {pending ? "Checking…" : "Check the menu"}
      </button>
      {(shown > 0 || pending) && (
        // Decorative + inert: the OUTCOME is announced through the page's existing single live
        // region (the provider's `announce`), never from here — a second live region on the menu
        // would break the one-per-view rule (QA-CHECKLIST §A).
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
      )}
    </>
  );
}
