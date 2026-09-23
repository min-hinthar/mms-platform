"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Toast, type ToastMessage } from "@mms/ui";

/** The interactive half of /kit — the states a static render cannot show (busy, a toast, an error). */
export function KitDemos({ part }: { part: "buttons" | "toast" | "field" | "empty-action" }) {
  if (part === "buttons") return <ButtonsDemo />;
  if (part === "toast") return <ToastDemo />;
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
    timer.current = window.setTimeout(() => setMsg(null), 3200);
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
      </div>
      <Toast message={msg} />
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
