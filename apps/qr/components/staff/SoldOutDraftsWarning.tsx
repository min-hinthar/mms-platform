"use client";
import { useRef, useState, type CSSProperties } from "react";
import { Button } from "@mms/ui";
import { staffSetQty } from "@/lib/staff-cart";
import { boundWrite } from "@/lib/bounded-write";
import { WRITE_UNCONFIRMED, WRITE_WAITING } from "@/lib/staff-outage";
import { dishVisible } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * #360 — a sold-out DRAFT at the payment doors: a re-warning, never a block (PD8's pattern,
 * `lib/settle-sold-out.ts`). It sits above the doors like the approval flag: the dishes named, and
 * REMOVE FIRST — one primary button per dish, the order's own removal (`staffSetQty(…, 0)`, the
 * stepper's ✕). The doors below stay live at full ink: tapping one with this warning up IS the
 * acknowledgement of exactly these dishes, and settlement then fires them anyway (no migration), so
 * the words say "tell the cook" — the KDS line wears its sold-out tag already.
 *
 * Every write is bounded (`boundWrite`); a refusal, a lost answer and a slow one are said through the
 * page's ONE region (`onError`), never a second live region here. A landed removal re-reads the page,
 * which drops this warning with the dish.
 */
export function SoldOutDraftsWarning({
  lang,
  sessionId,
  lines,
  onError,
  onChanged,
}: {
  lang: StaffLang;
  sessionId: string;
  /** The sold-out DRAFT lines the page displays (`displayedSoldOut`'s rows). */
  lines: readonly { id: string; name: string; nameMy: string | null }[];
  onError: (msg: string) => void;
  onChanged: () => void;
}) {
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const names = [...new Set(lines.map((l) => dishVisible(lang, l.name, l.nameMy)))].join(", ");

  async function remove(id: string) {
    if (inFlight.current.has(id)) return; // §17 — refused in the handler, never by `disabled`
    inFlight.current.add(id);
    setBusy(new Set(inFlight.current));
    try {
      const out = await boundWrite(staffSetQty(sessionId, { cartItemId: id, qty: 0 }));
      if (out.kind === "answer") {
        if (out.value.ok) onChanged();
        else onError(out.value.error);
        return;
      }
      if (out.kind === "threw") {
        // The answer was lost — the removal may have landed: never "it failed". The re-read decides.
        onError(WRITE_UNCONFIRMED);
        onChanged();
        return;
      }
      onError(WRITE_WAITING);
      void out.late.then((late) => {
        if (late.kind === "answer" && late.value.ok) onChanged();
        else
          onError(late.kind === "answer" && !late.value.ok ? late.value.error : WRITE_UNCONFIRMED);
      });
    } finally {
      inFlight.current.delete(id);
      setBusy(new Set(inFlight.current));
    }
  }

  return (
    <div className="staff-soldout-warn" style={box}>
      <p style={text}>
        <Chrome lang={lang} k="settle.soldOut.warn" vars={{ x: names }} echo="stack" />
      </p>
      <div style={actions}>
        {lines.map((l) => (
          <Button
            key={l.id}
            variant="primary"
            aria-busy={busy.has(l.id) || undefined}
            onClick={() => void remove(l.id)}
          >
            <Chrome
              lang={lang}
              k="settle.soldOut.remove"
              vars={{ x: dishVisible(lang, l.name, l.nameMy) }}
              echo={false}
            />
          </Button>
        ))}
      </div>
    </div>
  );
}

const box: CSSProperties = {
  margin: "var(--s2) 0 var(--s3)",
  padding: "var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--warn)",
  background: "var(--warnb)",
};
const text: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--tx)" };
const actions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--s2)",
  marginTop: "var(--s2)",
};
