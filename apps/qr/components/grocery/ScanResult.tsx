"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { Button, Icon } from "@mms/ui";
import type { ScanSlot } from "@/lib/scan-notice";
import { t } from "@/lib/i18n";
import { t as kioskT, type KioskStringKey } from "@/lib/kiosk/strings";

/**
 * Phase 1c — the in-stage result bar: what the last scan came to, drawn INSIDE the viewfinder where
 * the shopper is looking (a miss used to be a 1.8s toast and nothing else). Deliberately NOT a live
 * region — the toast is the view's announcement; this is what persists. Re-keyed per outcome by the
 * caller so each new one arrives (`.mms-rise`, RM-gated).
 *
 *   · chip — M186's second-copy path, unchanged in behaviour: the name, what the basket holds, and
 *     "Add another" (the ONE deliberate way to buy a second of something already charged).
 *   · notice — a catalog miss the shopper can act on. Never a price. `weighed` / `unavailable` read
 *     the kiosk's SHIPPED bilingual copy (named once, no new Burmese); `unknown` offers the search.
 *
 * The re-key is a REMOUNT, and a remount removes the focused node — so a keyboard or screen-reader
 * shopper who activates "Add another" would land on <body> after every add. `focusHandoffRef` carries
 * focus across the bar's own remount, and only then: the leaving bar marks the hand-off in its
 * layout-effect CLEANUP (it runs before React removes the DOM, while `activeElement` is still inside);
 * the arriving bar, mounted in the SAME commit, takes it and focuses its first action. A hand-off
 * nobody takes (the ✕, a switch to a hidden chip) expires in a microtask, so a bar that arrives LATER
 * never pulls focus from wherever the shopper went.
 */
const KIOSK_COPY: Record<"weighed" | "unavailable", KioskStringKey> = {
  weighed: "scanWeighed",
  unavailable: "scanUnavailable",
};

export function ScanResult({
  slot,
  chip,
  onSearch,
  onDismiss,
  focusHandoffRef,
}: {
  slot: NonNullable<ScanSlot>;
  /** The chip's content — named from the BASKET by the page, never from the scan's own response. */
  chip: {
    name: string;
    /** `In your basket ×{qty}` or `Waiting to sync`. */
    meta: string;
    busy: boolean;
    onAddAnother: () => void;
  } | null;
  onSearch: () => void;
  /** Clears the slot; the caller returns focus to the stage box. */
  onDismiss: () => void;
  /** One flag per page, shared by every bar the page mounts (see the docblock). */
  focusHandoffRef: RefObject<boolean>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (focusHandoffRef.current) {
      focusHandoffRef.current = false;
      root?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    }
    return () => {
      if (!root || !root.contains(document.activeElement)) return;
      focusHandoffRef.current = true;
      queueMicrotask(() => {
        focusHandoffRef.current = false;
      });
    };
  }, [focusHandoffRef]);

  if (slot.kind === "chip") {
    if (!chip) return null;
    return (
      <div ref={rootRef} className="scan-result mms-rise">
        <span className="scan-result-text">
          <span className="scan-result-name">{chip.name}</span>
          <span className="scan-result-meta">{chip.meta}</span>
        </span>
        <Button
          variant="primary"
          size="sm"
          className="scan-on-ink"
          disabled={chip.busy}
          aria-label={`Add another ${chip.name}`}
          onClick={chip.onAddAnother}
        >
          Add another
        </Button>
      </div>
    );
  }

  const { kind } = slot.notice;
  const en = kind === "unknown" ? t("en", "noticeUnknown") : kioskT("en", KIOSK_COPY[kind]);
  const my = kind === "unknown" ? t("my", "noticeUnknown") : kioskT("my", KIOSK_COPY[kind]);
  return (
    <div ref={rootRef} className="scan-result mms-rise">
      <span className="scan-result-text">
        <span className="scan-result-title">{en}</span>
        <span className="scan-result-my" lang="my">
          {my}
        </span>
      </span>
      {kind === "unknown" && (
        <Button
          variant="primary"
          size="sm"
          className="scan-on-ink scan-btn-bi"
          aria-label="Search by name"
          onClick={onSearch}
        >
          <Icon name="search" size={16} />
          Search
        </Button>
      )}
      <button
        type="button"
        className="scan-result-dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
