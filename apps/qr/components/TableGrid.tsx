"use client";
import type { CSSProperties, MouseEvent } from "react";
import posthog from "posthog-js";
import { useJourneyRouter } from "./nav/TransitionNav"; // J1: dine-in→menu is a FORWARD cut
import type { DineInTable } from "@/lib/tables";
import { useSessionPeek } from "@/lib/useSessionPeek";
import {
  dineInMenuHref,
  tableChipAction,
  tableChipLabel,
  tableChipWord,
  tablePlainLabel,
  type TableChipAction,
  type TableGridSource,
} from "@/lib/table-pick";

/**
 * K2 (Journey II) — the dine-in table GRID, extracted from `TablePicker` in Phase 3c-i (D18) so the
 * DoorSheet can host it as a section. The registered tables with truth-at-read-time occupancy;
 * tapping an OPEN table claims it (routes by NUMBER — `?table=N`; the mint resolves the token
 * server-side, so the token never touches the client); tapping a SEATED table hands the join to the
 * HOST through `onJoin` — the owner chose that a seated table needs the party's code (a stranger
 * can't drop into a live cart from a grid), and the host decides how the code is asked for: an
 * inline form under the grid (`TableSection`), never a second sheet. Occupancy is advisory — the
 * server re-checks at mint. Every word, label and href is `lib/table-pick.ts`'s.
 *
 * The grid NEVER closes a host sheet: the sheet stays open through the navigation (the market's
 * camera hold; the per-door remount unmounts it). `onEnter` runs right before each navigation INTO
 * the dine-in door so the host can record the door actually entered (`mode_selected`) — a seated
 * chip, which only reveals the join, is not an entry.
 *
 * Phase 3c-ii (D27) — the SEND sheet hosts the same grid, where a chip BINDS the live session
 * instead of navigating: with `onClaim` an open chip hands its number to the host (no push, no
 * `onEnter` — the door is not entered, so `mode_selected` never fires from there) and with
 * `onPlain` the escape does the same with no number. `markMine={false}` keeps every occupied table
 * plainly Seated: a "pick up where you left off" chip whose bind would answer `seated` is a promise
 * the code cannot keep. The capture keeps its `source` ("send") either way.
 *
 * Codex round 3 on #314 (P2) — in the Send sheet a SEATED chip tries the BIND first. `markMine={false}`
 * makes every occupied table read Seated, and the registry reports the host's OWN numberless row on a
 * table's sticker (the stranded shape `seatedSessionFor`'s token read exists for) as occupied too — so
 * from here no Seated chip can be told from a stranger's party. Only `bindTable`'s pre-read can: the
 * own numberless row lands, a stranger's answers `seated`, and the host reveals the ask on THAT answer
 * (`TableBindSheet`). Routed through `onJoin` as the DoorSheet's chip is, the stranded table read
 * Seated forever and its ask could only rejoin the same numberless row. The chip whose ask is already
 * OPEN collapses it through `onJoin` — a toggle, never a second write.
 *
 * J40 — a Seated chip in `noJoin` (the Send sheet's: its bind answered an order no code joins, a
 * kiosk order or a table a server is holding) has no form to reveal, so it is NOT a disclosure — no
 * `aria-expanded`, no `aria-controls` — and its name drops the join clause (`tableChipLabel`). Its tap
 * still binds first: the table may have been cleared since.
 */
export function TableGrid({
  tables,
  stagger,
  source,
  onJoin,
  onEnter,
  onClaim,
  onPlain,
  markMine = true,
  expandedTable,
  controls,
  noJoin,
}: {
  tables: DineInTable[];
  /** `true` on /dine-in keeps the K2 cascade (`mms-stagger` + per-chip delay); `false` inside the
   *  sheet renders neither — the sheet's motion is the primitive's own. */
  stagger: boolean;
  /** Where the tap came from, on the `table_picked` capture — and which verb the escape wears. */
  source: TableGridSource;
  /** A SEATED chip was tapped: ask for the party's code. The chip comes along so the host can
   *  return focus to it when the ask collapses (QA §A: focus moves on a step change — and back). */
  onJoin: (tableNumber: number, chip: HTMLButtonElement) => void;
  /** Called immediately before each navigation into the dine-in door (claim · resume · host-start). */
  onEnter?: () => void;
  /** 3c-ii — given, an OPEN chip calls this with its number INSTEAD of navigating (the Send sheet's
   *  bind); `onEnter` is not called, since no door is entered. */
  onClaim?: (tableNumber: number) => void;
  /** 3c-ii — given, the escape ("Send anyway" · "start without a number") calls this instead of
   *  navigating. */
  onPlain?: () => void;
  /** W5a's "Your table" marking from the session peek. `false` in the Send sheet (3c-ii): the
   *  session being bound has no number, so no chip can honestly be "yours" there. */
  markMine?: boolean;
  /** A host that reveals the join INLINE says so on the chip: the seated table whose ask is open, or
   *  null for none — every SEATED chip outside `noJoin` then wears `aria-expanded`, and the open
   *  one `aria-controls` → `controls` (the form's id). Omit it when the join would open a dialog
   *  instead: a chip that opens a dialog is not a disclosure (blind pass on 3c-i · a11y). */
  expandedTable?: number | null;
  controls?: string;
  /** J40 — Seated tables NO code joins (the Send sheet's `kiosk` · `held` answers): no disclosure
   *  state and no join clause in the name. Absent, every Seated chip offers the join. */
  noJoin?: ReadonlySet<number>;
}) {
  const router = useJourneyRouter();
  // W5a — is one of these "seated" tables OURS? A swipe-back diner re-entering the picker used to
  // see their own table as a dead "Seated" chip (and the claim 409'd). The peek marks it "Your
  // table"; tapping it goes through the same claim route, which now rejoins a member (server-side
  // member-aware claim). Advisory-only: peek failure just leaves the plain Seated state. Read
  // unconditionally (a hook), consulted only when the host marks mine.
  const peeked = useSessionPeek();
  // ALL my live tables (a seat can hold several memberships — claimed one, scanned into another):
  // each must read "Your table"; a .find() would code-wall the diner's own second table.
  const myTables = new Set(
    (markMine ? (peeked ?? []) : [])
      .filter((s) => s.mode === "dinein" && s.tableNumber != null)
      .map((s) => s.tableNumber),
  );

  function enter(href: string) {
    onEnter?.();
    router.push(href);
  }
  function claim(n: number, action: TableChipAction) {
    const resuming = action === "resume";
    posthog.capture("table_picked", {
      table_number: n,
      occupied: action !== "claim",
      resumed: resuming,
      source,
    });
    if (onClaim) {
      onClaim(n);
      return;
    }
    enter(dineInMenuHref(resuming ? { table: n, resume: true } : { table: n }));
  }
  function askCode(n: number, chip: HTMLButtonElement) {
    posthog.capture("table_picked", { table_number: n, occupied: true, source });
    onJoin(n, chip);
  }
  function startPlain() {
    if (onPlain) {
      onPlain();
      return;
    }
    enter(dineInMenuHref({}));
  }

  if (tables.length === 0) {
    // The registry read failed or is empty — never dead-end the dine-in door; offer the sticker
    // scan + a plain host-start (a session with no table number, exactly today's behavior).
    return (
      <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
        Couldn’t load the tables. Scan your table’s sticker, or{" "}
        <button type="button" onClick={startPlain} style={inlineLink}>
          start without a number
        </button>
        .
      </p>
    );
  }

  return (
    <>
      <ul role="list" className="table-grid" aria-label="Choose your table">
        {tables.map((t, i) => {
          const action = tableChipAction(myTables.has(t.tableNumber), t.occupied);
          const state =
            action === "resume" ? "is-mine" : action === "join" ? "is-seated" : "is-open";
          // The Send sheet's Seated chip binds first (docblock); its open ask collapses instead.
          const bindsFirst = action === "join" && !!onClaim && expandedTable !== t.tableNumber;
          // J40 — no code joins this table: no form to reveal, so no disclosure (docblock).
          const noJoinHere = noJoin?.has(t.tableNumber) ?? false;
          const discloses = action === "join" && !noJoinHere;
          return (
            <li key={t.tableNumber}>
              <button
                type="button"
                className={stagger ? `table-chip mms-stagger ${state}` : `table-chip ${state}`}
                style={
                  stagger ? ({ animationDelay: `calc(${i} * 40ms)` } as CSSProperties) : undefined
                }
                aria-label={tableChipLabel(t.tableNumber, action, noJoinHere)}
                aria-expanded={
                  discloses && expandedTable !== undefined
                    ? expandedTable === t.tableNumber
                    : undefined
                }
                aria-controls={discloses && expandedTable === t.tableNumber ? controls : undefined}
                onClick={(e: MouseEvent<HTMLButtonElement>) =>
                  action === "join" && !bindsFirst
                    ? askCode(t.tableNumber, e.currentTarget)
                    : claim(t.tableNumber, action)
                }
              >
                <span className="table-chip-num" aria-hidden>
                  {t.tableNumber}
                </span>
                <span className="table-chip-state">
                  <span className="table-dot" aria-hidden />
                  {tableChipWord(action)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={startPlain} style={inlineLink} className="table-start-plain">
        {tablePlainLabel(source)}
      </button>
    </>
  );
}

// No top margin of its own (J32): TableGrid's one host is `TableSection`, whose --s3 gap is the
// rhythm; the 20/18px tops were the retired TablePicker page's spacing and doubled inside it.
const inlineLink: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 44,
  background: "none",
  border: "none",
  color: "var(--ac)",
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
