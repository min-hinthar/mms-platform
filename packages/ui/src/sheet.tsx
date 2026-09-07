"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { m, useDragControls } from "framer-motion";
import { DomMaxProvider } from "./dom-max-provider";
import { Icon } from "./icon";
import { mayDismiss, sheetDismiss } from "./sheet-dismiss";

/**
 * Accessible bottom sheet built on Radix Dialog — replaces the prototype's hand-rolled
 * focus-trap + inert. Radix handles: focus trap, Esc, aria-modal, and
 * scroll lock; focus restore is OURS (W9e — Radix's own restore targets a Dialog.Trigger this
 * primitive never renders, see onOpen/restoreFocus below). Always pass `title` so the dialog has an accessible name (fixes the v7.1
 * "every sheet announces 'Details'" finding).
 *
 * Richness R5b — **swipe-to-close**: the grab handle drags the sheet down (the iOS-native
 * expectation), symmetric with tap-scrim / Esc / the ✕ button. Drag is **handle-initiated**
 * (`useDragControls` + `dragListener={false}`) so the body's own `overflow-y:auto` scroll is
 * untouched — only the handle starts a drag. Needs framer `domMax` (drag), loaded lazily via the
 * nested `DomMaxProvider` (kept off the root chunk). A drag past a distance/velocity threshold closes.
 *
 * M82 — **`busy`**: while the body has an irreversible write in flight, none of the FOUR dismissal
 * vectors may close the sheet. The policy lives in `sheet-dismiss.ts` (pure, tested, and the place
 * the vector list is enumerated); this file is the wiring that consults it. See the `busy` prop.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  busy = false,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /**
   * M82 — an irreversible write is in flight; refuse every way of closing until it settles.
   *
   * Dismissing mid-write does not cancel anything. The refund still moves, the void still spends one
   * of the manager's five PIN attempts, the add still reaches the server — the only thing dismissal
   * changes is that nobody sees how it ended, usually on a tree that has already unmounted by the
   * time the answer lands. `RefundActionSheet` solved this locally in W22c; this prop is that rule
   * stated once, plus the honest affordance the local version could not give (the ✕ stays visible
   * and named but reads as unavailable, instead of looking live and silently doing nothing).
   *
   * **Pass a flag that SETTLES on the failure path too** — a `useTransition` pending, or a promise's
   * `finally`; never a bare boolean a branch can strand. All four exits are blocked while this is
   * true and the focus scope is `trapped`, so a `busy` that never clears is a permanent keyboard
   * trap (WCAG 2.1.2). The primitive cannot enforce that and does not pretend to; it is the one part
   * of this contract the caller owns.
   *
   * Do NOT pass it on a sheet that performs no irreversible write. Of the eleven callers today, only
   * three qualify — see `docs/DESIGN-LANGUAGE.md` §16.
   */
  busy?: boolean;
  /** Close-restore override. Since W9e the primitive restores the OPENER by default (it captures
   *  `document.activeElement` at mount — Radix would otherwise focus a `Dialog.Trigger` this
   *  primitive never renders and drop focus on <body>; J21). Pass this only when the default is
   *  wrong — e.g. the grocery basket sheet, whose trigger can unmount while it is open — and
   *  `e.preventDefault()` + focus your own stable element (WCAG 2.4.3). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    // THE choke point. Radix funnels Esc (`useEscapeKeydown` → `onDismiss`), the scrim
    // (`usePointerDownOutside` → `onDismiss`) and the ✕ (`Dialog.Close`'s composed `onClick`) all
    // into this ONE `onOpenChange` — the `"radix"` channel — which is what makes a complete guard
    // cheap here, and why there are deliberately no `onEscapeKeyDown` / `onPointerDownOutside`
    // handlers: parallel gates over the same decision are how one of them drifts, and adding one is
    // the only way to LOSE the scrim from this guard. The fourth vector, the drag, never enters
    // Radix and is gated at its own `onDragEnd` below.
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !sheetDismiss({ busy, via: "radix" })) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mms-scrim" />
        <DomMaxProvider>
          <SheetContent
            title={title}
            busy={busy}
            // Guarded at the DESCENT, not only at each consumer. Today `onDragEnd` is the sole
            // caller and it runs its own `sheetDismiss` — but handing the child a raw
            // `onOpenChange(false)` means the NEXT consumer is unguarded by construction, and the
            // adversarial pass showed exactly that shape sailing past the suite (a hand-rolled
            // `onClick` on the scrim, the defect W22c deleted from `RefundActionSheet`). Belt and
            // brace: two gates on one path is cheap, an ungated second path is the whole bug.
            onClose={() => {
              if (mayDismiss({ busy })) onOpenChange(false);
            }}
            onCloseAutoFocus={onCloseAutoFocus}
          >
            {children}
          </SheetContent>
        </DomMaxProvider>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Cross-sheet coordination for `--kb-inset` (module-scoped, client-only): a ref count so closing one of
// two (rarely) stacked sheets doesn't zero the inset while the other is still open + focused, and a
// last-written cache so the rapid VisualViewport `scroll`/`resize` stream skips no-op style writes.
let openSheetCount = 0;
let lastKbInset = -1;
function writeKbInset(px: number) {
  if (px === lastKbInset) return;
  lastKbInset = px;
  document.documentElement.style.setProperty("--kb-inset", `${px}px`);
}

// Separate component so the drag-controls hook runs UNDER the DomMaxProvider (where `m`/drag resolve).
function SheetContent({
  title,
  busy,
  onClose,
  children,
  onCloseAutoFocus,
}: {
  title: React.ReactNode;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const controls = useDragControls();
  // Keyboard-aware lift: while the sheet is mounted (open), track the on-screen keyboard via the
  // VisualViewport API and publish its height as `--kb-inset` on <html>, which `.mms-sheet` uses to sit
  // above the keyboard so a focused input + its submit button stay visible instead of buried behind it.
  // Works on iOS AND Android — both keep the LAYOUT viewport full-height on keyboard (resizes-visual), so
  // `innerHeight - vv.height` is the keyboard height on both, and a fixed bottom sheet would otherwise sit
  // behind it. No-op where VisualViewport is unavailable; ref-counted + reset to 0 when the last sheet
  // closes (unmount).
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    openSheetCount += 1;
    const sync = () => {
      const raw = window.innerHeight - vv.height - vv.offsetTop;
      // Threshold: only a real keyboard (always ≫ the ~60px iOS URL-bar) lifts the sheet — avoids a spurious
      // gap while the Safari toolbar animates in/out (that also shortens the visual viewport).
      writeKbInset(raw > 120 ? Math.round(raw) : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      openSheetCount -= 1;
      if (openSheetCount <= 0) {
        openSheetCount = 0;
        writeKbInset(0); // last sheet closed → clear the inset
      }
    };
  }, []);
  // W9e (closes OPEN-ITEMS J21) — the DEFAULT close-restore. Radix's modal content unconditionally
  // preventDefaults its own close event and focuses `Dialog.Trigger` — which this primitive never
  // renders — so with no handler EVERY sheet close dropped focus on <body> (verified in jsdom during
  // the W9d pre-merge review). Capture what was focused at open (the plain-button trigger every
  // caller uses) and restore it ourselves, exactly the FocusScope fallback the preventDefault skips.
  // A caller-provided handler wins outright (the grocery basket sheet re-parks when its trigger has
  // unmounted); the fallback also no-ops if the captured node has left the DOM.
  const openerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  // Records the opener + pins initial focus. ⚠️ The opener MUST be captured here, in the
  // open-autofocus event — it fires while focus is still on the trigger. A passive effect runs
  // after our own container-focus below and would capture the SHEET (a node that is unmounted by
  // close time, so the restore would silently no-op to <body>). The two guards make StrictMode's
  // double-dispatch safe: never overwrite a captured opener, never capture a node inside the sheet.
  const onOpen = (e: Event) => {
    e.preventDefault();
    const ae = document.activeElement;
    if (openerRef.current == null && ae instanceof HTMLElement && !contentRef.current?.contains(ae))
      openerRef.current = ae;
    contentRef.current?.focus();
  };
  const restoreFocus = (event: Event) => {
    if (onCloseAutoFocus) {
      onCloseAutoFocus(event);
      return;
    }
    event.preventDefault();
    if (openerRef.current?.isConnected) openerRef.current.focus();
  };
  return (
    <Dialog.Content
      asChild
      aria-describedby={undefined}
      // A STATE, not an announcement: it tells assistive tech this region is mid-update and to hold
      // off re-reading it. Deliberately not a live region — QA §A P1 allows exactly ONE polite
      // region per view and four Sheet callers already render a `role="status"` in the body, so a
      // second here would double-announce every transactional message in those sheets.
      aria-busy={busy || undefined}
      onCloseAutoFocus={restoreFocus}
      // W9e — pin INITIAL focus to the sheet container (announces the dialog + its title), not the
      // first tabbable. Moving the ✕ into the sticky head put it FIRST in the DOM, so Radix's
      // default open-autofocus would land every sheet on "Close" — announcing an exit as the first
      // thing a SR user hears (pre-PR review). Container-focus is the standard sheet pattern: Tab
      // reaches the ✕ next, then the content in visual order. Also records the opener — see onOpen.
      onOpenAutoFocus={onOpen}
    >
      <m.div
        ref={contentRef}
        tabIndex={-1}
        className="mms-sheet"
        // Handle-initiated drag only (dragListener=false): the body keeps its native scroll; the grab
        // handle's onPointerDown starts the drag. Downward-elastic, snaps back unless the release clears
        // the threshold. The CSS `up` entrance animation (.mms-sheet) still plays on open (and is itself
        // reduced-motion-gated in globals.css).
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.55 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          // The fourth vector, and the only one that is ours. Both gates — "was this decisive" and
          // "may we close at all" — live in the policy, so the thresholds cannot be re-derived here
          // and drift. Below the threshold (or while busy) framer springs the sheet back to y:0 on
          // the existing `dragConstraints` path: no new motion, nothing new for reduced motion, and
          // a rubber-band that reads as "not now" rather than as a dead handle.
          if (
            sheetDismiss({ busy, via: "drag", offsetY: info.offset.y, velocityY: info.velocity.y })
          )
            onClose();
        }}
      >
        {/* W9e — ONE sticky head (grab zone + title + ✕) so the exit chrome never scrolls out of
            reach on a long sheet (QA §A P0: "Each sheet has a visible, labelled ✕ close"): a dish
            with modifiers used to scroll its only visible close button away. The grab zone stays
            inside the sticky band — it must remain reachable for the same reason, it is the ONLY
            drag origin (dragListener=false), and `touch-action: none` still claims the gesture
            before the scroll does. The ✕ keeps its 44×44 target with the visible 32px disc
            (background-clip trick) — its offsets are re-derived against the head in globals.css. */}
        <div className="mms-sheet-head">
          <div className="mms-grab-zone" aria-hidden onPointerDown={(e) => controls.start(e)}>
            <div className="mms-grab" />
          </div>
          <Dialog.Title className="mms-sheet-title">{title}</Dialog.Title>
          {/* Visible, named, 44×44 throughout (QA §A P0) — and while busy, ANNOUNCED as unavailable
              rather than natively disabled. `disabled` would blur it, and it is the first tabbable
              element in the sheet — the container takes initial focus but is `tabIndex={-1}`, i.e.
              focusable, NOT tabbable — so a focused ✕ going disabled destroys the user's place, the
              WCAG 2.4.3 rule W22e learned.
              `aria-disabled` states it without moving focus; the choke point above is the real
              enforcement, since `aria-disabled` does not stop Enter or Space. (The ✕ is the FIRST
              tabbable element here — the container above is `tabIndex={-1}`, i.e. focusable but not
              tabbable — which makes the point stronger, not weaker.) */}
          <Dialog.Close
            aria-label={busy ? "Close — finishing, please wait" : "Close"}
            aria-disabled={busy || undefined}
            className="mms-sheet-close"
          >
            <Icon name="close" size={18} />
          </Dialog.Close>
        </div>
        {children}
      </m.div>
    </Dialog.Content>
  );
}
