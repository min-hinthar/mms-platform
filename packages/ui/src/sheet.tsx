"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { m, useDragControls } from "framer-motion";
import { DomMaxProvider } from "./dom-max-provider";

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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="mms-scrim" />
        <DomMaxProvider>
          <SheetContent title={title} onClose={() => onOpenChange(false)}>
            {children}
          </SheetContent>
        </DomMaxProvider>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Separate component so the drag-controls hook runs UNDER the DomMaxProvider (where `m`/drag resolve).
function SheetContent({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Dialog.Content asChild aria-describedby={undefined}>
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
        <div
          className="mms-grab"
          aria-hidden
          onPointerDown={(e) => controls.start(e)}
          style={{ touchAction: "none", cursor: "grab" }}
        />
        <Dialog.Title className="mms-sheet-title">{title}</Dialog.Title>
        {children}
        <Dialog.Close aria-label="Close" className="mms-sheet-close">
          ✕
        </Dialog.Close>
      </m.div>
    </Dialog.Content>
  );
}
