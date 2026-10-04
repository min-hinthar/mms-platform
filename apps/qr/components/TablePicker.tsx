"use client";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Sheet } from "@mms/ui";
import { useJourneyRouter } from "./nav/TransitionNav"; // J1: dine-in→menu is a FORWARD cut
import { TableGrid } from "./TableGrid";
import type { DineInTable } from "@/lib/tables";
import { JOIN_COPY, dineInMenuHref } from "@/lib/table-pick";

/**
 * K2 (Journey II) — the dine-in table picker: the "can't scan the sticker" fallback. The page shell
 * (eyebrow · heading · the bilingual sub-line) around the K2 grid — `TableGrid`, extracted in Phase
 * 3c-i (D18) so the DoorSheet can host the same grid as a section. Tapping an OPEN table claims it
 * (routes by NUMBER — `?table=N`; the mint resolves the token server-side, so the token never
 * touches the client). Tapping a SEATED table opens THIS page's party-code join Sheet (the owner
 * chose: a seated table needs the party's code — a stranger can't drop into a live cart from the
 * picker; the physical sticker scan is the code-free path, and the mint's race guards refuse a claim
 * that lost to a concurrent seat). Occupancy is advisory — the server re-checks at mint. /dine-in's
 * behaviour and presentation did not change with the extraction: the grid still cascades once
 * (`stagger`), the join is still a Sheet here — its words are `JOIN_COPY`'s (lib/table-pick), the
 * ONE source the DoorSheet's inline form reads too, so the two can never drift apart.
 */
export function TablePicker({ tables }: { tables: DineInTable[] }) {
  const router = useJourneyRouter();
  const [seatedNum, setSeatedNum] = useState<number | null>(null); // open code-sheet for this table
  const [code, setCode] = useState("");
  const codeId = useId();

  function askCode(n: number) {
    setCode("");
    setSeatedNum(n);
  }
  function submitJoin(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase(); // tokens are 8-char uppercase — normalize like JoinTable
    if (!c) return;
    router.push(dineInMenuHref({ join: c }));
  }

  return (
    <main className="page-col" style={{ padding: "28px 20px 40px" }}>
      <p className="eyebrow">Dine-in</p>
      <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: 4 }}>Which table are you at?</h1>
      <p style={{ color: "var(--t2)", marginTop: 0, lineHeight: 1.5 }}>
        Scan your table’s sticker, or pick your number.
        {/* R1 — the Burmese echo on its OWN line (the /cart heading's idiom), never inline after
            the sentence: at every width from 375 to 1920 the English filled the line and left
            "ရွေးပါ" orphaned alone on the next one — five reviewers, five viewports, one finding.
            A block never splits the pair. */}
        <span lang="my" style={{ display: "block", fontFamily: "var(--font-my)", marginTop: 2 }}>
          စားပွဲနံပါတ် ရွေးပါ
        </span>
      </p>

      <TableGrid tables={tables} stagger source="page" onJoin={askCode} />

      {/* Seated-table join: enter the party's code (the owner's choice — no code-free remote join into
          a live cart). Same code the invite sheet shows + the sticker encodes. */}
      <Sheet
        open={seatedNum != null}
        onOpenChange={(o) => !o && setSeatedNum(null)}
        title={JOIN_COPY.title(seatedNum)}
      >
        <p
          style={{
            color: "var(--t2)",
            fontSize: "var(--fs-sm)",
            lineHeight: 1.5,
            margin: "0 0 12px",
          }}
        >
          {seatedNum != null ? JOIN_COPY.body(seatedNum) : ""}
        </p>
        <form onSubmit={submitJoin}>
          <label
            htmlFor={codeId}
            style={{
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-bold)",
              display: "block",
              marginBottom: 6,
            }}
          >
            {JOIN_COPY.label}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id={codeId}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              // A synthetic example, NOT any seeded token — a real token in a "use client" bundle is a
              // live join credential shipped to every browser + git (adversarial catch).
              placeholder={JOIN_COPY.placeholder}
              style={input}
            />
            <button type="submit" disabled={!code.trim()} style={joinBtn}>
              {JOIN_COPY.button}
            </button>
          </div>
        </form>
      </Sheet>
    </main>
  );
}

const input: CSSProperties = {
  flex: 1,
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 12,
  border: "1.5px solid var(--bd)",
  background: "var(--pg)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  font: "inherit",
  letterSpacing: "var(--track-wide)",
  textTransform: "uppercase",
};
const joinBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 22px",
  borderRadius: 12,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: "var(--fw-heavy)",
  fontSize: "var(--fs-body)",
  cursor: "pointer",
};
