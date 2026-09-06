"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { openRegisterOrder } from "@/lib/register";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome, OutageText } from "./Chrome";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";

/**
 * P2 — what the zone has to say, and who authored it.
 *
 * `openRegisterOrder` answers with a SERVER string (`STAFF_WRITE_OUTAGE` on the transport arm, a
 * gate sentence otherwise), which only `<OutageText>` may render: it swaps the one sentence that has
 * an authored twin and passes every other through verbatim, because a sentence with no twin is
 * better shown in English than guessed at in Burmese.
 *
 * The table arm ALSO raises one failure of its own, before any server call — and blanket-wrapping
 * the region in `<OutageText>` would pass that client literal through as English forever while
 * looking converted. So the region carries the branch instead: a `local` notice is a dictionary key
 * rendered through `<Chrome>`; a `server` notice is the string, rendered through `<OutageText>`.
 */
type Notice = { kind: "local"; k: StaffKey } | { kind: "server"; error: string };

/**
 * The register's Start zone (W6a) — Walk-up · Phone order · Start a table. Each arm mints server-side
 * (staff-gated service-role; never /api/session) and lands on the existing drill-down order screen.
 * One busy state for the whole zone: a counter mints one order at a time, and a double-tap minting two
 * sessions is worse than a beat of waiting.
 */
export function RegisterStart() {
  const lang = useStaffLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [phoneName, setPhoneName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [arm, setArm] = useState<"none" | "phone" | "table">("none");

  function mint(input: {
    kind: "walkup" | "phone" | "table";
    tableNumber?: number;
    customerName?: string;
  }) {
    setNotice(null);
    startTransition(async () => {
      const r = await openRegisterOrder(input);
      if (!r.ok) {
        setNotice({ kind: "server", error: r.error });
        return;
      }
      router.push(`/staff/table/${r.sessionId}/add`);
    });
  }

  return (
    <section aria-label={sx(lang, "reg.a11y.start")} style={zone}>
      <div style={row}>
        <button
          type="button"
          style={startBtn}
          disabled={pending}
          onClick={() => mint({ kind: "walkup" })}
        >
          <Chrome lang={lang} k="reg.start.walkup" echo="stack" />
        </button>
        <button
          type="button"
          style={arm === "phone" ? startBtnActive : startBtn}
          disabled={pending}
          aria-expanded={arm === "phone"}
          onClick={() => setArm(arm === "phone" ? "none" : "phone")}
        >
          <Chrome lang={lang} k="reg.start.phone" echo="stack" />
        </button>
        <button
          type="button"
          style={arm === "table" ? startBtnActive : startBtn}
          disabled={pending}
          aria-expanded={arm === "table"}
          onClick={() => setArm(arm === "table" ? "none" : "table")}
        >
          <Chrome lang={lang} k="reg.start.table" echo="stack" />
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
            <Chrome lang={lang} k="reg.phone.label" echo="stack" />
          </label>
          <div style={row}>
            <input
              id="reg-phone-name"
              style={input}
              value={phoneName}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => setPhoneName(e.target.value)}
              // A placeholder is a flat attribute — it carries no markup and so no `lang`, the same
              // trade-off an accessible name makes (lib/staff-labels.ts). The visible <label> above
              // is the marked one.
              placeholder={ts(lang, "reg.phone.placeholder")}
            />
            {/* Both states echo, so the button cannot change height mid-transition. */}
            <button type="submit" style={goBtn} disabled={pending}>
              <Chrome lang={lang} k={pending ? "reg.going" : "reg.go"} echo="stack" />
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
              setNotice({ kind: "local", k: "reg.err.table" });
              return;
            }
            mint({ kind: "table", tableNumber: n });
          }}
        >
          <label style={label} htmlFor="reg-table-number">
            <Chrome lang={lang} k="reg.table.label" echo="stack" />
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
              // The example number rides an `{id}` slot: it is an identifier, Latin in both tongues,
              // and no dictionary VALUE may carry a digit of either script.
              placeholder={tf(lang, "reg.table.placeholder", { id: EXAMPLE_TABLE })}
            />
            <button type="submit" style={goBtn} disabled={pending}>
              <Chrome lang={lang} k={pending ? "reg.going" : "reg.go"} echo="stack" />
            </button>
          </div>
        </form>
      )}

      {/* The zone's ONE live region — mint failures land here (outage copy included). No echo: a
          bilingual announcement says everything twice, and <Chrome>/<OutageText> mark their own
          Burmese, so the region itself carries no `lang`. */}
      <p role="status" style={notice ? errText : srOnly}>
        {notice === null ? (
          ""
        ) : notice.kind === "local" ? (
          <Chrome lang={lang} k={notice.k} />
        ) : (
          <OutageText lang={lang} error={notice.error} />
        )}
      </p>
    </section>
  );
}

/** The table number the placeholder shows as an example. Latin in both tongues. */
const EXAMPLE_TABLE = 4;

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
