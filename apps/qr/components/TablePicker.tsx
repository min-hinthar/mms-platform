"use client";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Sheet } from "@mms/ui";
import posthog from "posthog-js";
import { useJourneyRouter } from "./nav/TransitionNav"; // J1: dine-in→menu is a FORWARD cut
import type { DineInTable } from "@/lib/tables";
import { useSessionPeek } from "@/lib/useSessionPeek";

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
  // W5a — is one of these "seated" tables OURS? A swipe-back diner re-entering the picker used to
  // see their own table as a dead "Seated" chip (and the claim 409'd). The peek marks it "Your
  // table"; tapping it goes through the same claim route, which now rejoins a member (server-side
  // member-aware claim). Advisory-only: peek failure just leaves the plain Seated state.
  const peeked = useSessionPeek();
  // ALL my live tables (a seat can hold several memberships — claimed one, scanned into another):
  // each must read "Your table"; a .find() would code-wall the diner's own second table.
  const myTables = new Set(
    (peeked ?? []).filter((s) => s.mode === "dinein" && s.tableNumber != null).map((s) => s.tableNumber),
  );

  function claim(n: number, resuming = false) {
    posthog.capture("table_picked", { table_number: n, occupied: resuming, resumed: resuming });
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
      <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: 4 }}>Which table are you at?</h1>
      <p style={{ color: "var(--t2)", marginTop: 0, lineHeight: 1.5 }}>
        Scan your table’s sticker, or pick your number.{" "}
        <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
          စားပွဲနံပါတ် ရွေးပါ
        </span>
      </p>

      {tables.length === 0 ? (
        // The registry read failed or is empty — never dead-end the dine-in door; offer the sticker
        // scan + a plain host-start (a session with no table number, exactly today's behavior).
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", marginTop: 20 }}>
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
          {tables.map((t, i) => {
            const mine = myTables.has(t.tableNumber);
            return (
              <li key={t.tableNumber}>
                <button
                  type="button"
                  className={`table-chip mms-stagger ${mine ? "is-mine" : t.occupied ? "is-seated" : "is-open"}`}
                  style={{ animationDelay: `calc(${i} * 40ms)` } as CSSProperties}
                  aria-label={
                    mine
                      ? `Table ${t.tableNumber}, your table — pick up where you left off`
                      : t.occupied
                        ? `Table ${t.tableNumber}, seated — join with the party’s code`
                        : `Table ${t.tableNumber}, open — sit here`
                  }
                  onClick={() =>
                    mine
                      ? claim(t.tableNumber, true)
                      : t.occupied
                        ? askCode(t.tableNumber)
                        : claim(t.tableNumber)
                  }
                >
                  <span className="table-chip-num" aria-hidden>
                    {t.tableNumber}
                  </span>
                  <span className="table-chip-state">
                    <span className="table-dot" aria-hidden />
                    {mine ? "Your table" : t.occupied ? "Seated" : "Open"}
                  </span>
                </button>
              </li>
            );
          })}
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
        <p
          style={{
            color: "var(--t2)",
            fontSize: "var(--fs-sm)",
            lineHeight: 1.5,
            margin: "0 0 12px",
          }}
        >
          Table {seatedNum} is seated. Enter the code the party shares (or scan the table’s sticker)
          to order together on one cart.
        </p>
        <form onSubmit={submitJoin}>
          <label
            htmlFor={codeId}
            style={{ fontSize: "var(--fs-sm)", fontWeight: 700, display: "block", marginBottom: 6 }}
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
  fontSize: "var(--fs-sm)",
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
  fontSize: "var(--fs-body)",
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
  fontSize: "var(--fs-body)",
  cursor: "pointer",
};
