"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";

/**
 * Accessible bottom sheet built on Radix Dialog — replaces the prototype's hand-rolled
 * focus-trap + inert. Radix handles: focus trap, focus restore, Esc, aria-modal, and
 * scroll lock. Always pass `title` so the dialog has an accessible name (fixes the v7.1
 * "every sheet announces 'Details'" finding). Decorative-only sheets pass `srTitle`.
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
        <Dialog.Content className="mms-sheet" aria-describedby={undefined}>
          <div className="mms-grab" aria-hidden />
          <Dialog.Title className="mms-sheet-title">{title}</Dialog.Title>
          {children}
          <Dialog.Close aria-label="Close" className="mms-sheet-close">
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
