"use client";
import { useId } from "react";
import { Button, Icon } from "@mms/ui";
import { plural } from "@/lib/i18n/fill";
import type { StaffSendHold } from "@/lib/staff-send-view";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import type { StaffSendController } from "./useStaffSend";

/** The controller's STATE — its two refs arrive as their own props, so this view never reads a ref
 *  off an object during render (react-hooks/refs). */
type SendState = Omit<StaffSendController, "controlRef" | "statusRef">;

/**
 * Phase 2a · send — the table page's "Send to kitchen" slot: a PURE VIEW over `useStaffSend`, which
 * the host owns (so a detail refresh or a view swap can never kill an open undo — see the hook).
 *
 * The control is the console's first `@mms/ui` Button (plan: `.ui-btn` is the vocabulary for every
 * new primary/secondary action; `.staff-press` never stacks on it): primary · xl · block, secondary
 * when a diner host runs the table and every unsent dish is theirs (owner decision #3). It is ONE
 * node through Send → Sending… → Undo → Bringing it back… → Send, so focus stays on it across every
 * relabel, and it is never natively disabled — a held or blocked Send is `aria-disabled` with its
 * reason as an `aria-describedby` hint BELOW it (a hint never sits above the control, so one
 * collapsing can never move the control under a finger).
 *
 * The Undo's accessible name is the verb alone; the countdown is a separate `aria-hidden` span, so
 * the name does not change every second. This component mounts NO live region: every outcome goes
 * to the page's ONE region through the hook's `onNotice`.
 */
export function StaffSendButton({
  lang,
  ctl,
  controlRef,
  statusRef,
  hold,
  hostName,
}: {
  lang: StaffLang;
  ctl: SendState;
  controlRef: StaffSendController["controlRef"];
  statusRef: StaffSendController["statusRef"];
  /** The drain-before-fire hold as RENDERED (the hook re-reads it at tap time). */
  hold: StaffSendHold;
  /** The diner host's display name, for the "sends from their phone" hint. */
  hostName: string | null;
}) {
  const ids = useId();
  const { display, phase } = ctl;
  if (display.kind === "none") return null;

  if (display.kind === "status") {
    const v = display.view;
    return (
      <div className="staff-send">
        {/* A STATUS ROW, not a pill: no fill, no border, no cursor. Focusable (tabIndex -1) so focus
            has somewhere to land, in the same place, when the Undo it replaced closes. */}
        <div ref={statusRef} tabIndex={-1} className="staff-send-status">
          <Icon
            name={v.kind === "allSent" ? "check" : v.kind === "togoAtPay" ? "bag" : "receipt"}
            size={18}
          />
          <span>
            {v.kind === "allSent" ? (
              <Chrome lang={lang} k="table.send.allSent" echo="stack" />
            ) : v.kind === "togoAtPay" ? (
              <Chrome
                lang={lang}
                k={plural(v.units, "table.send.togoAtPay.one", "table.send.togoAtPay.many")}
                vars={{ n: v.units }}
                echo="stack"
              />
            ) : (
              <Chrome lang={lang} k="table.send.counterAtPay" echo="stack" />
            )}
          </span>
        </div>
      </div>
    );
  }

  const undoing = display.kind === "undo";
  const busy = phase === "sending" || phase === "undoing" || phase === "returning";
  const view = display.kind === "send" ? display.view : null;
  // Hints describe the send; they vanish AT THE TAP (the thumb is on the control), never above it.
  const live = phase === "idle" && view !== null;
  const blocked = live && view.blocked === "paying";
  const held = live && !blocked && hold !== null;
  const noteId = `${ids}-note`;
  const reasonId = `${ids}-why`;
  const reason = blocked ? (
    <Chrome lang={lang} k="table.send.paying" echo="stack" />
  ) : held && hold.kind === "note" ? (
    <Chrome lang={lang} k="table.send.hold.note" vars={{ x: hold.name }} echo="stack" />
  ) : held ? (
    <Chrome lang={lang} k="table.send.hold.writing" echo="stack" />
  ) : null;
  const note =
    live && view.note === "host" ? (
      hostName ? (
        <Chrome lang={lang} k="table.send.hostNote" vars={{ x: hostName }} echo="stack" />
      ) : (
        <Chrome lang={lang} k="table.send.hostNote.anon" echo="stack" />
      )
    ) : live && view.note === "mixed" ? (
      <Chrome
        lang={lang}
        k="table.send.mixedNote"
        vars={{ n: view.staffAdded, total: view.dinerUnits }}
        echo="stack"
      />
    ) : live && view.note === "counterAsk" ? (
      <Chrome lang={lang} k="table.send.counterAskNote" vars={{ n: view.units }} echo="stack" />
    ) : null;
  const describedBy = [reason ? reasonId : null, note ? noteId : null].filter(Boolean).join(" ");

  return (
    <div className="staff-send">
      <Button
        ref={controlRef}
        variant={undoing || view?.emphasis === "secondary" ? "secondary" : "primary"}
        size="xl"
        block
        // `.mms-settle` on the Undo only: the entrance from .4 (never 0 — the focus ring shows from
        // the first frame), RM-escorted in globals.css.
        className={undoing && phase === "undo" ? "mms-settle" : undefined}
        busy={busy}
        busyLabel={
          phase === "sending" ? (
            <Chrome lang={lang} k="table.send.sending" echo="stack" />
          ) : (
            <Chrome lang={lang} k="table.send.undoing" echo="stack" />
          )
        }
        // A held or blocked Send stays FOCUSABLE and TAPPABLE: the refusal is the hook's (it reads
        // the hold at tap time and, on a note hold, takes the finger to the note). Passed through
        // rather than as `disabled`, which would refuse inside the primitive before the hook sees it.
        // Spread ONLY when set: the primitive's props spread last, and an explicit `undefined` here
        // would erase its own `aria-disabled` while busy.
        {...(blocked || held ? { "aria-disabled": true } : {})}
        aria-describedby={describedBy || undefined}
        onClick={undoing ? ctl.onUndo : ctl.onSend}
      >
        {undoing ? (
          <span className="staff-send-undo">
            <Chrome lang={lang} k="table.send.undo" echo="stack" />
            {/* The countdown is DISPLAY: aria-hidden, so the name stays "Undo" all ten seconds. */}
            <span aria-hidden="true" className="staff-send-left">
              <Chrome lang={lang} k="table.send.undoLeft" vars={{ n: ctl.remainingSec }} />
            </span>
          </span>
        ) : view ? (
          <Chrome
            lang={lang}
            k={plural(view.units, "table.send.cta.one", "table.send.cta.many")}
            vars={{ n: view.units }}
            echo="stack"
          />
        ) : (
          // Sending, and a poll already shows the round in the kitchen: the busy label covers this.
          <Chrome lang={lang} k="table.send.sending" echo="stack" />
        )}
      </Button>
      {reason && (
        <p id={reasonId} className="staff-send-hint">
          {reason}
        </p>
      )}
      {note && (
        <p id={noteId} className="staff-send-hint">
          {note}
        </p>
      )}
    </div>
  );
}
