"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { openRegisterOrder } from "@/lib/register";

/**
 * The register's Start zone (W6a) — Walk-up · Phone order · Start a table. Each arm mints server-side
 * (staff-gated service-role; never /api/session) and lands on the existing drill-down order screen.
 * One busy state for the whole zone: a counter mints one order at a time, and a double-tap minting two
 * sessions is worse than a beat of waiting.
 */
export function RegisterStart() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phoneName, setPhoneName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [arm, setArm] = useState<"none" | "phone" | "table">("none");

  function mint(input: { kind: "walkup" | "phone" | "table"; tableNumber?: number; customerName?: string }) {
    setError(null);
    startTransition(async () => {
      const r = await openRegisterOrder(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/staff/table/${r.sessionId}/add`);
    });
  }

  return (
    <section aria-label="Start an order" style={zone}>
      <div style={row}>
        <button type="button" style={startBtn} disabled={pending} onClick={() => mint({ kind: "walkup" })}>
          Walk-up
        </button>
        <button
          type="button"
          style={arm === "phone" ? startBtnActive : startBtn}
          disabled={pending}
          aria-expanded={arm === "phone"}
          onClick={() => setArm(arm === "phone" ? "none" : "phone")}
        >
          Phone order
        </button>
        <button
          type="button"
          style={arm === "table" ? startBtnActive : startBtn}
          disabled={pending}
          aria-expanded={arm === "table"}
          onClick={() => setArm(arm === "table" ? "none" : "table")}
        >
          Start a table
        </button>
      </div>

      {arm === "phone" && (
        <form
          style={subForm}
          onSubmit={(e) => {
            e.preventDefault();
            mint({ kind: "phone", customerName: phoneName.trim() || undefined });
          }}
        >
          <label style={label} htmlFor="reg-phone-name">
            Caller’s name
          </label>
          <div style={row}>
            <input
              id="reg-phone-name"
              style={input}
              value={phoneName}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => setPhoneName(e.target.value)}
              placeholder="First name"
            />
            <button type="submit" style={goBtn} disabled={pending}>
              {pending ? "Starting…" : "Start"}
            </button>
          </div>
        </form>
      )}

      {arm === "table" && (
        <form
          style={subForm}
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number.parseInt(tableNumber, 10);
            if (!Number.isInteger(n) || n < 1) {
              setError("Enter the table number.");
              return;
            }
            mint({ kind: "table", tableNumber: n });
          }}
        >
          <label style={label} htmlFor="reg-table-number">
            Table number
          </label>
          <div style={row}>
            <input
              id="reg-table-number"
              style={input}
              value={tableNumber}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              autoComplete="off"
              onChange={(e) => setTableNumber(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 4"
            />
            <button type="submit" style={goBtn} disabled={pending}>
              {pending ? "Starting…" : "Start"}
            </button>
          </div>
        </form>
      )}

      {/* The zone's ONE live region — mint failures land here (outage copy included). */}
      <p role="status" style={error ? errText : srOnly}>
        {error ?? ""}
      </p>
    </section>
  );
}

const zone: CSSProperties = { display: "grid", gap: "var(--s3)" };
const row: CSSProperties = { display: "flex", gap: "var(--s3)", flexWrap: "wrap" };
const startBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s4)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const startBtnActive: CSSProperties = {
  ...startBtn,
  borderColor: "var(--ac-strong)",
  color: "var(--ac-strong)",
};
const subForm: CSSProperties = { display: "grid", gap: "var(--s2)" };
const label: CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--t2)" };
const input: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  flex: "1 1 160px",
};
const goBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s5)",
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const errText: CSSProperties = { color: "var(--warn)", fontSize: "var(--fs-sm)", margin: 0 };
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
