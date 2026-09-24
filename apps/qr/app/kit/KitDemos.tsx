"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, SAME_GESTURE_MS, Toast, TOAST_LEAVE_MS, type ToastMessage } from "@mms/ui";

/** The interactive half of /kit — the states a static render cannot show (busy, a toast, an error). */
export function KitDemos({
  part,
}: {
  part: "buttons" | "toast" | "toast-xl" | "field" | "empty-action";
}) {
  if (part === "buttons") return <ButtonsDemo />;
  if (part === "toast") return <ToastDemo />;
  if (part === "toast-xl") return <ThumbUndoDemo />;
  if (part === "field") return <FieldDemo />;
  return (
    <Button variant="primary" arrow="fwd">
      Choose how you&rsquo;re ordering
    </Button>
  );
}

function ButtonsDemo() {
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const run = () => {
    setBusy(true);
    timer.current = window.setTimeout(() => setBusy(false), 1600);
  };
  return (
    <div style={{ display: "grid", gap: "var(--s3)" }}>
      <div style={row}>
        <Button variant="primary" arrow="fwd">
          Send to kitchen
        </Button>
        <Button variant="secondary">Add a note</Button>
        <Button variant="quiet" arrow="back">
          Back
        </Button>
        <Button variant="danger">Void line</Button>
      </div>
      <div style={row}>
        <Button size="sm" variant="secondary">
          Small
        </Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <Button size="xl" block busy={busy} busyLabel="Settling…" onClick={run}>
        Settle $42.10 cash
      </Button>
      <div style={row}>
        <Button disabled>Pay $42.10</Button>
        <Button variant="secondary" disabled>
          Split
        </Button>
      </div>
    </div>
  );
}

function ToastDemo() {
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const show = (m: Omit<ToastMessage, "key">) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setMsg({ ...m, key: Date.now() });
    // A toast carrying an action is never timed out from under the person reaching for it
    // (WCAG 2.2.1 — see the Toast docblock); it leaves when its action is taken.
    if (!m.action) timer.current = window.setTimeout(() => setMsg(null), 3200);
  };
  return (
    <>
      <div style={row}>
        <Button
          variant="secondary"
          onClick={() => show({ text: "Added Mohinga", my: "မုန့်ဟင်းခါး ထည့်ပြီး" })}
        >
          Show a confirmation
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            show({
              text: "Picked up · #A1B2",
              action: { label: "Undo", onAction: () => show({ text: "Back on the shelf" }) },
            })
          }
        >
          Show an undo
        </Button>
        <Button
          variant="secondary"
          onClick={() => show({ text: "Mohinga added", my: "ထည့်ပြီးပါပြီ", quiet: true })}
        >
          Speak quietly
        </Button>
      </div>
      <p style={{ margin: "var(--s2) 0 0", color: "var(--t2)", fontSize: "var(--fs-label)" }}>
        Spoken to screen readers, draws nothing — for a change already visible where you tapped.
      </p>
      <Toast message={msg} />
    </>
  );
}

/**
 * Phase 2b · feedback — the staff lane's thumb-zone Undo, on the kit: `live={false}` (the lane's own
 * region speaks the pick), `size="xl"`, the drain over the real 6 s window, the Undo refused until
 * it arms, the visible shield after it, and the leave. A keyboard focus on Undo (Tab to it) pauses
 * the drain — the hold the lane gives a keyboard user. Review both themes by flipping the OS theme.
 */
const XL_WINDOW_MS = 6000;
const XL_ARM_MS = 400;
function ThumbUndoDemo() {
  const [pick, setPick] = useState<{
    key: number;
    phase: "showing" | "shield" | "leaving";
    armed: boolean;
    held: boolean;
  } | null>(null);
  const timers = useRef<number[]>([]);
  const clear = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const leave = () => {
    setPick((p) => (p ? { ...p, phase: "leaving" } : p));
    later(() => setPick(null), TOAST_LEAVE_MS);
  };
  const open = () => {
    clear();
    setPick({ key: Date.now(), phase: "showing", armed: false, held: false });
    later(() => setPick((p) => (p ? { ...p, armed: true } : p)), XL_ARM_MS);
    later(leave, XL_WINDOW_MS);
  };
  const undo = () => {
    clear();
    setPick((p) => (p ? { ...p, phase: "shield" } : p));
    later(leave, SAME_GESTURE_MS);
  };
  return (
    <>
      <div style={row}>
        <Button variant="secondary" onClick={open}>
          Picked up · Table 7
        </Button>
      </div>
      <p style={{ margin: "var(--s2) 0 0", color: "var(--t2)", fontSize: "var(--fs-label)" }}>
        Silent (the page&rsquo;s own region speaks it), 64px, the whole pill takes the tap. The bar
        drains over the real window; Tab to Undo and it pauses (this demo does not extend the
        window).
      </p>
      <Toast
        live={false}
        size="xl"
        shield={pick?.phase === "shield"}
        leaving={pick?.phase === "leaving"}
        message={
          pick && {
            key: pick.key,
            text: "Table 7 picked up",
            action: {
              label: "Undo",
              onAction: undo,
              disabled: !pick.armed || pick.phase !== "showing",
              onHold: (held) => setPick((p) => (p ? { ...p, held } : p)),
            },
            drainMs: XL_WINDOW_MS,
            held: pick.held,
          }
        }
      />
    </>
  );
}

function FieldDemo() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      style={{ display: "grid", gap: "var(--s3)", maxWidth: "var(--w-content)" }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(/.+@.+\..+/.test(value) ? null : "That email is missing an @ or a domain.");
      }}
    >
      <Field
        label="Email"
        labelMy="အီးမေးလ်"
        hint="We'll send a six-digit code."
        error={error}
        required
      >
        {(control) => (
          <input
            {...control}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" block>
        Email me a code
      </Button>
    </form>
  );
}

const row = { display: "flex", flexWrap: "wrap", gap: "var(--s2)", alignItems: "center" } as const;
