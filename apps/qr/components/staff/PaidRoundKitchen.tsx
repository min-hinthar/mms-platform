"use client";
import { useId, type CSSProperties } from "react";
import type { PaidKitchenLine } from "@/lib/floor-types";
import type { StaffLang } from "@/lib/staff-lang";
import { lineTagKey } from "@/lib/staff-line-tag";
import { Chrome } from "./Chrome";

/**
 * The lifecycle audit (2026-10-13) — "From the paid round": a round this table already PAID for, with
 * food still in the kitchen or just out, dish by dish with its stage on the ONE track. The floor card
 * counts that food ("Paid · 2 in kitchen", "1 ready to serve"), so the page the card opens names it —
 * before this group it showed the settled record with no stage, and nothing at all once a new round
 * opened. Read-only (a paid dish changes through a refund, never here); a labelled list, no live
 * region, no motion — the 5 s poll brings each stage.
 */
export function PaidRoundKitchen({
  lang,
  lines,
}: {
  lang: StaffLang;
  lines: readonly PaidKitchenLine[];
}) {
  const id = useId();
  return (
    <div style={wrap}>
      <p id={id} style={title}>
        <Chrome lang={lang} k="table.detail.paidKitchen.title" echo="inline" />
      </p>
      <ul role="list" aria-labelledby={id} style={list}>
        {lines.map((l) => (
          <li key={l.id} style={row}>
            <span>
              {l.qty}× {l.name}
            </span>
            <span style={tag}>
              {" · "}
              <Chrome lang={lang} k={lineTagKey({ state: "", stage: l.stage })} />
              {l.togo && (
                <>
                  {" · "}
                  <Chrome lang={lang} k="table.line.toGo" />
                </>
              )}
            </span>
            {l.modifiers.length > 0 && <span style={mods}>{l.modifiers.join(" · ")}</span>}
            {l.notes && <span style={note}>“{l.notes}”</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const wrap: CSSProperties = {
  margin: "var(--s2) 0 var(--s3)",
  padding: "var(--s2) var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px dashed var(--bd)",
};
const title: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  color: "var(--t2)",
};
const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };
const row: CSSProperties = { padding: "6px 0", fontSize: "var(--fs-sm)" };
const tag: CSSProperties = { color: "var(--t3)" };
const mods: CSSProperties = { display: "block", color: "var(--t3)" };
const note: CSSProperties = { display: "block", fontWeight: "var(--fw-semibold)" };
