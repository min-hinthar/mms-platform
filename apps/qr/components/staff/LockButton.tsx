"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@mms/ui";
import { lockConsole } from "@/lib/staff-pin-actions";
import { Chrome } from "./Chrome";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * Lock the shared tablet (S1.1b). Sets the device-local lock (server action, httpOnly cookie) and sends
 * the staff member to the PIN screen. Only rendered when a PIN is set (lockConsole also refuses without
 * one) — locking with no PIN would strand the device behind an unenterable screen.
 *
 * P7·1b — a 44px CIRCLE in the staff bar's trailing slot, last, on every page: the thing you do on
 * the way out sits where iOS puts it. Icon-only to the eye; the NAME is sr-only dictionary text
 * rendered through <Chrome> (marked Burmese, never an aria-label on a control with children — rule
 * 3), and the busy state is spoken through the same name, so a circle that changed nothing visible
 * still tells assistive tech what it is doing.
 */
export function LockButton({ lang }: { lang: StaffLang }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function lock() {
    if (busy) return; // re-entry is refused HERE, never by `disabled` (see below)
    setBusy(true);
    setErr(null);
    const res = await lockConsole();
    if (!res.ok) {
      setBusy(false);
      setErr(res.error);
      return;
    }
    router.replace("/staff/lock");
    router.refresh();
  }
  return (
    <>
      {/* NEVER native `disabled` while busy: disabling the button that was just tapped drops focus
          to <body> in a real browser (StaffLangSwitch's measured rule), so the busy name below would
          be spoken from a node nobody is on and a failure's alert would fire with the place lost.
          `aria-disabled` states it; the handler refuses re-entry. */}
      <button
        type="button"
        className="staff-circ"
        onClick={lock}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
      >
        {/* Decorative lock glyph — the sr-only text carries the meaning. */}
        <Icon name="lock" size={20} />
        <span className="sr-only">
          <Chrome lang={lang} k={busy ? "shell.locking" : "shell.lock"} />
        </span>
      </button>
      {err && (
        <span role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
          {err}
        </span>
      )}
    </>
  );
}
