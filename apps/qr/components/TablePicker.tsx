"use client";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Sheet } from "@mms/ui";
import posthog from "posthog-js";
import { useJourneyRouter } from "./nav/TransitionNav"; // J1: dine-in→menu is a FORWARD cut
import type { DineInTable } from "@/lib/tables";

/**
 * K2 (Journey II) — the dine-in table picker: the "can't scan the sticker" fallback. A grid of the
 * registered tables with truth-at-read-time occupancy. Tapping an OPEN table claims it (routes by
 * NUMBER — `?table=N`; the mint resolves the token server-side, so the token never touches the
 * client). Tapping a SEATED table opens the party-code join (the owner chose: a seated table needs
 * the party's code — a stranger can't drop into a live cart from the picker; the physical sticker
 * scan is the code-free path, and the mint's race guards refuse a claim that lost to a concurrent
 * seat). Occupancy is advisory — the server re-checks at mint.
 */
export function TablePicker({ tables }: { tables: DineInTable[] }) {
  const router = useJourneyRouter();
  const [seatedNum, setSeatedNum] = useState<number | null>(null); // open code-sheet for this table
  const [code, setCode] = useState("");
  const codeId = useId();

  function claim(n: number) {
    posthog.capture("table_picked", { table_number: n, occupied: false });
    router.push(`/menu?mode=dinein&door=dinein&table=${n}`);
  }
  function askCode(n: number) {
    posthog.capture("table_picked", { table_number: n, occupied: true });
    setCode("");
    setSeatedNum(n);
  }
  function submitJoin(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase(); // tokens are 8-char uppercase — normalize like JoinTable
    if (!c) return;
    router.push(`/menu?mode=dinein&door=dinein&j=${encodeURIComponent(c)}`);
  }

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "28px 20px 40px" }}>
      <p className="eyebrow">Dine-in</p>
      <h1 style={{ fontSize: 30, marginBottom: 4 }}>Which table are you at?</h1>
      <p style={{ color: "var(--t2)", marginTop: 0, lineHeight: 1.5 }}>
        Scan your table’s sticker, or pick your number.{" "}
        <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
          စားပွဲနံပါတ် ရွေးပါ
        </span>
      </p>

      {tables.length === 0 ? (
        // The registry read failed or is empty — never dead-end the dine-in door; offer the sticker
        // scan + a plain host-start (a session with no table number, exactly today's behavior).
        <p style={{ color: "var(--t2)", fontSize: 14, marginTop: 20 }}>
          Couldn’t load the tables. Scan your table’s sticker, or{" "}
          <button
            type="button"
            onClick={() => router.push("/menu?mode=dinein&door=dinein")}
            style={inlineLink}
          >
            start without a number
          </button>
          .
        </p>
      ) : (
        <ul role="list" className="table-grid" aria-label="Choose your table">
          {tables.map((t, i) => (
            <li key={t.tableNumber}>
              <button
                type="button"
                className={`table-chip mms-stagger ${t.occupied ? "is-seated" : "is-open"}`}
                style={{ animationDelay: `calc(${i} * 40ms)` } as CSSProperties}
                aria-label={
                  t.occupied
                    ? `Table ${t.tableNumber}, seated — join with the party’s code`
                    : `Table ${t.tableNumber}, open — sit here`
                }
                onClick={() => (t.occupied ? askCode(t.tableNumber) : claim(t.tableNumber))}
              >
                <span className="table-chip-num" aria-hidden>
                  {t.tableNumber}
                </span>
                <span className="table-chip-state">
                  <span className="table-dot" aria-hidden />
                  {t.occupied ? "Seated" : "Open"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tables.length > 0 && (
        <button
          type="button"
          onClick={() => router.push("/menu?mode=dinein&door=dinein")}
          style={inlineLink}
          className="table-start-plain"
        >
          Not at a numbered table? Start anyway
        </button>
      )}

      {/* Seated-table join: enter the party's code (the owner's choice — no code-free remote join into
          a live cart). Same code the invite sheet shows + the sticker encodes. */}
      <Sheet
        open={seatedNum != null}
        onOpenChange={(o) => !o && setSeatedNum(null)}
        title={seatedNum != null ? `Join Table ${seatedNum}` : "Join a table"}
      >
        <p style={{ color: "var(--t2)", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 12px" }}>
          Table {seatedNum} is seated. Enter the code the party shares (or scan the table’s sticker)
          to order together on one cart.
        </p>
        <form onSubmit={submitJoin}>
          <label
            htmlFor={codeId}
            style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}
          >
            Party code
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
              placeholder="e.g. WXYZ1234"
              style={input}
            />
            <button type="submit" disabled={!code.trim()} style={joinBtn}>
              Join
            </button>
          </div>
        </form>
      </Sheet>
    </main>
  );
}

const inlineLink: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 18,
  minHeight: 44,
  background: "none",
  border: "none",
  color: "var(--ac)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const input: CSSProperties = {
  flex: 1,
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 12,
  border: "1.5px solid var(--bd)",
  background: "var(--pg)",
  color: "var(--tx)",
  fontSize: 16,
  font: "inherit",
  letterSpacing: ".08em",
  textTransform: "uppercase",
};
const joinBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 22px",
  borderRadius: 12,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
};
