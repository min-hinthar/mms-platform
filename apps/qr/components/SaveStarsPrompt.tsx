"use client";
import { useId, useRef } from "react";
import { Button, buttonClass } from "@mms/ui";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import { useConnectionTruth } from "@/lib/useConnectionTruth";
import { saveStarsBlockedReason, saveStarsCopy } from "@/lib/save-stars";

/** What the browser can move focus to. `[tabindex="-1"]` is programmatic-only and excluded. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where focus goes when the card leaves: the previous focusable element in the tracker's <main>
 * (normally the receipt's "Email me this receipt" or "View & print"), else the next one. NEVER the
 * next one while an earlier target exists — during a to-go wait the next focusable is "Back to menu",
 * and one more Enter would leave the tracker.
 */
function neighbourOf(section: HTMLElement): HTMLElement | null {
  const scope = section.closest("main") ?? section.ownerDocument.body;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !section.contains(el) &&
      !el.contains(section) &&
      !el.closest('[hidden], [inert], [aria-hidden="true"]'),
  );
  let previous: HTMLElement | null = null;
  for (const el of candidates) {
    if (section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) previous = el;
  }
  return (
    previous ??
    candidates.find(
      (el) => !!(section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    ) ??
    null
  );
}

/**
 * Phase 1c · account-star — the save-your-Stars ask on the /track success moment.
 *
 * A DOOR, not a second flow: the one action navigates to /account, where the existing
 * AccountUpgrade card (every save path, every merge/carry rule) now sits directly under the live
 * row. The decision of WHETHER this renders is `saveStarsOffer` + `successRewardsDoor`
 * (lib/save-stars.ts); every string is `saveStarsCopy`. This component only lays them out.
 *
 * Inline and quiet by design (§9 warm host, never a nag): never fixed, never a sheet or a toast,
 * never takes focus on mount, never scrolls the page. The CTA is SECONDARY — the success screen
 * exists for status and proof, and a filled pill here would out-rank both.
 *
 * ⚠️ NO live region — no role="status", no role="alert", no aria-live. /track already carries three
 * (the tracker's status line, ReceiptActions' form, FeedbackPrompt), and one per view is the rule
 * (QA-CHECKLIST §A). This card is glanceable content that arrives below the receipt, not news; the
 * tracker's own status already announced the payment.
 *
 * Offline / outage (§7: stays rendered, disabled, with a reason). The CTA is an `<a>` WITHOUT href
 * — role=link, aria-disabled, focusable, described by the reason line — not a TransitionLink with a
 * swallowed click, whose view-transition handler would still stamp a direction and start a
 * transition. "Not now" stays live: it is local. Dismiss is an INSTANT cut (the kit has no exit idiom
 * for inline cards, and an animationend-driven unmount is a strand risk), so it moves focus first.
 */
export function SaveStarsPrompt({
  stars,
  rewardJustUnlocked,
  receiptEmail,
  platformDown,
  onDismiss,
}: {
  /** The server total after attribution (`progress.stars`). */
  stars: number;
  /** The same `rewardJustUnlocked()` binding PaySuccess reads. */
  rewardJustUnlocked: boolean;
  /** ReceiptActions reported its email capture is ON — only then may the copy mention it. */
  receiptEmail: boolean;
  /** OrderTracker's existing `weDown` (the W10c gate on its own /account link). */
  platformDown: boolean;
  onDismiss: () => void;
}) {
  const headingId = useId();
  const reasonId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const { truth } = useConnectionTruth();
  const copy = saveStarsCopy(stars, rewardJustUnlocked, receiptEmail);
  const reason = saveStarsBlockedReason({ offline: truth === "you-offline", platformDown });

  function dismiss() {
    // Focus moves BEFORE the removal, and only if it was inside the card (a touch tap on iOS does
    // not focus, so touch users see no jump). preventScroll: the page must not move under them.
    const section = sectionRef.current;
    if (section && section.contains(section.ownerDocument.activeElement)) {
      neighbourOf(section)?.focus({ preventScroll: true });
    }
    onDismiss();
  }

  return (
    <section
      ref={sectionRef}
      className="save-stars surface-vellum mms-rise print-hide"
      aria-labelledby={headingId}
    >
      <span className="save-stars-medallion" aria-hidden>
        ✦
      </span>
      <h2 id={headingId} className="save-stars-h">
        {copy.heading}
        <span lang="my">{copy.headingMy}</span>
      </h2>
      <p className="save-stars-body">
        {copy.body}
        {copy.receiptNote ? <span className="save-stars-note"> {copy.receiptNote}</span> : null}
      </p>
      <div className="save-stars-actions">
        {reason ? (
          // Same classes, no href: nothing to follow, nothing to transition. Focusable so the reason
          // is reachable (aria-describedby) — the §17 aria-disabled rule, applied to a link.
          <a
            role="link"
            aria-disabled="true"
            tabIndex={0}
            aria-describedby={reasonId}
            className={buttonClass({ variant: "secondary" })}
          >
            {copy.cta}{" "}
            <span aria-hidden className="ui-btn-arrow-fwd">
              →
            </span>
          </a>
        ) : (
          <Link href="/account" className={buttonClass({ variant: "secondary" })}>
            {copy.cta}{" "}
            <span aria-hidden className="ui-btn-arrow-fwd">
              →
            </span>
          </Link>
        )}
        <Button variant="quiet" onClick={dismiss}>
          {copy.dismiss}
        </Button>
      </div>
      {reason ? (
        <p id={reasonId} className="save-stars-reason">
          {reason}
        </p>
      ) : null}
    </section>
  );
}
