"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { m, useDragControls } from "framer-motion";
import { DomMaxProvider } from "./dom-max-provider";
import { Icon } from "./icon";

/**
 * Accessible bottom sheet built on Radix Dialog — replaces the prototype's hand-rolled
 * focus-trap + inert. Radix handles: focus trap, focus restore, Esc, aria-modal, and
 * scroll lock. Always pass `title` so the dialog has an accessible name (fixes the v7.1
 * "every sheet announces 'Details'" finding).
 *
 * Richness R5b — **swipe-to-close**: the grab handle drags the sheet down (the iOS-native
 * expectation), symmetric with tap-scrim / Esc / the ✕ button. Drag is **handle-initiated**
 * (`useDragControls` + `dragListener={false}`) so the body's own `overflow-y:auto` scroll is
 * untouched — only the handle starts a drag. Needs framer `domMax` (drag), loaded lazily via the
 * nested `DomMaxProvider` (kept off the root chunk). A drag past a distance/velocity threshold closes.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** W9d — close-restore escape hatch. ⚠️ Radix's modal content unconditionally preventDefaults its
   *  own close event and focuses `Dialog.Trigger` — which this primitive NEVER renders (callers open
   *  it with plain buttons + controlled `open`), so with no handler the restore targets null and
   *  focus lands on <body> on every close. Callers should pass this, `e.preventDefault()`, and
   *  focus their own trigger/stable element (WCAG 2.4.3). The primitive-wide gap (every existing
   *  Sheet caller strands focus on close) is tracked as OPEN-ITEMS J21. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="mms-scrim" />
        <DomMaxProvider>
          <SheetContent
            title={title}
            onClose={() => onOpenChange(false)}
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
  onClose,
  children,
  onCloseAutoFocus,
}: {
  title: string;
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
  return (
    <Dialog.Content asChild aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
      <m.div
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
          // Close on a decisive downward drag (≥120px) or a fast downward flick.
          if (info.offset.y > 120 || info.velocity.y > 700) onClose();
        }}
      >
        {/* 44px-tall touch zone wraps the 5px visual bar so the swipe is actually triggerable on mobile
            (dragListener=false means the drag can ONLY start here). touch-action/cursor live on .mms-grab-zone. */}
        <div className="mms-grab-zone" aria-hidden onPointerDown={(e) => controls.start(e)}>
          <div className="mms-grab" />
        </div>
        <Dialog.Title className="mms-sheet-title">{title}</Dialog.Title>
        {children}
        <Dialog.Close aria-label="Close" className="mms-sheet-close">
          <Icon name="close" size={18} />
        </Dialog.Close>
      </m.div>
    </Dialog.Content>
  );
}
