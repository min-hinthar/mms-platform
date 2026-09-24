"use client";
import { useState } from "react";
import { Button, Sheet, removeHeld } from "@mms/ui";
import type { KitchenLine } from "@/lib/kitchen-types";
import type { KdsMsg } from "@/lib/kds-errors";
import type { KdsSize } from "@/lib/kds-size";
import { canEightySix } from "@/lib/kds-line";
import { al } from "@/lib/staff-labels";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { MsgText } from "./StaffMsg";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { TicketDishTitle } from "./TicketText";

/**
 * Phase 2b · kitchen (K22) — the sheet behind a KDS line's ⋯, where the 86 now lives.
 *
 * Before 2b the 86 was ONE tap on a 44px warn band wedged under every line's Start/Done row; a test
 * pass 86'd a live dish by clicking the first one. Now it is two deliberate taps — the ⋯, then this
 * sheet's 86 — and the second is held for `SAME_GESTURE_MS` from the sheet's MOUNT: the bottom sheet
 * rises under the finger that opened it (and under reduced motion appears there at once), so the
 * second half of a double-tap would otherwise land on the write (DESIGN-LANGUAGE §24).
 *
 * THE RESULT RESOLVES HERE, not after a close-at-tap: the Button goes busy (the label kept) and the
 * sheet stays open for the one round trip. A refusal renders in this sheet's ONE region, right
 * above the finger; a success UNMOUNTS the sheet (the board's `landedKey`) rather than closing it,
 * because a closing sheet keeps the page `aria-hidden` through its exit and the board's
 * announcement would be spoken under it (the cash confirm's worked example). Closing at the tap
 * left a window where a "did it work?" re-tap hit the undo pill that mounts in this footprint.
 *
 * No Sheet `busy` (§16): the write is reversible (6s undo, then /staff/menu) and resolves into the
 * board, so every exit stays live — a cook who dismisses mid-write lands on the busy ⋯ and the
 * write finishes at board level. The component is KEYED per open (`useSheetSubject`'s key), so
 * `openedAt` is this open's mount time.
 *
 * `line` is the LIVE line (`lineMenuSubject`), so a dish another console took off while this was
 * open turns the body into the statement "Off the menu" with no action left.
 */
export function KdsLineMenu({
  line,
  open,
  size,
  pending,
  blocked,
  msg,
  on86,
  onOpenChange,
}: {
  line: KitchenLine;
  open: boolean;
  /** The board's text size — the body is a `--kfs-*` tier host, as help-1's pictures are. */
  size: KdsSize;
  /** This line's 86 is in flight: the Button is busy (spinner, label kept). */
  pending: boolean;
  /** Another line of this dish is in flight: refused, not busy. */
  blocked: boolean;
  /** A refusal for THIS line, in the device language — the sheet's one region. */
  msg: KdsMsg | null;
  on86: (line: KitchenLine) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const lang = useStaffLang();
  const [openedAt] = useState(() => performance.now());
  const hintId = `kds-menu-hint-${line.id}`;
  const offer = canEightySix(line);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      // The sheet portals to <body>, outside `.kds-root.dark`: the class keeps it in Night.
      className="dark kds-menu"
      closeLabel={sheetCloseLabel(lang)}
      title={<TicketDishTitle line={line} />}
      onCloseAutoFocus={(e) => {
        // Only an ORPHANED focus is moved: after a landed 86 the board has already put focus on
        // the dish's own line (its name now ends "— Off the menu"), and Radix's unmount focus runs
        // after that commit, so the two must never fight. Otherwise back to the ⋯ that opened
        // this (busy, if dismissed mid-write), else the line, else the board's heading.
        e.preventDefault();
        const ae = document.activeElement;
        if (ae !== null && ae !== document.body) return;
        const target =
          document.getElementById(`kds-more-${line.id}`) ??
          document.getElementById(`kds-line-${line.id}`) ??
          document.getElementById("kds-h");
        target?.focus({ preventScroll: true });
      }}
    >
      <div className="kds-menu-body" data-size={size}>
        {offer ? (
          <p id={hintId} className="kds-menu-hint">
            <Chrome lang={lang} k="kds.86.hint" echo="stack" />
          </p>
        ) : (
          <p className="kds-menu-off">
            <span className="kds-line-off-dot" aria-hidden />
            <Chrome lang={lang} k="kds.86.done" echo="stack" />
          </p>
        )}
        {/* The sheet's ONE region, always mounted and empty until a refusal. It sits ABOVE the
            Button: a message grows the bottom-anchored sheet UPWARD, so the button never moves
            under the finger. Same element in both bodies, so the region survives the swap. */}
        <p role="status" className="kds-menu-msg">
          {msg && <MsgText lang={lang} msg={msg} />}
        </p>
        {offer && (
          <Button
            variant="danger"
            size="xl"
            block
            busy={pending}
            disabled={!open || blocked}
            aria-describedby={hintId}
            aria-label={
              al(lang, { kind: "eighty6", echo: "stack", name: line.name, nameMy: line.nameMy })
                .aria
            }
            onClick={() => {
              // Refused with no visual (the Stepper's precedent): an exiting sheet, or the second
              // half of the tap that opened it.
              if (!open || removeHeld(openedAt, performance.now())) return;
              on86(line);
            }}
          >
            <Chrome lang={lang} k="kds.86" echo="stack" />
          </Button>
        )}
      </div>
    </Sheet>
  );
}
