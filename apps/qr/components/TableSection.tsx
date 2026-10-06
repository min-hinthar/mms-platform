"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Field, buttonClass } from "@mms/ui";
import { useJourneyRouter } from "@/components/nav/TransitionNav";
import { TableGrid } from "@/components/TableGrid";
import { t } from "@/lib/i18n";
import { JOIN_COPY, dineInMenuHref, type TableGridSource } from "@/lib/table-pick";
import type { DineInTable } from "@/lib/tables";

/**
 * Phase 3c-ii (D27) — the "Pick your table" SECTION, extracted verbatim from the DoorSheet (3c-i,
 * D18) so its two hosts cannot drift: the DoorSheet on the to-go menu (a chip NAVIGATES into the
 * dine-in door) and the Send sheet on the cart (a chip BINDS the live session — `onClaim`). The
 * heading in both tongues (v7.2's "Pick your table / စားပွဲ ရွေး"), the host's sub-line, the K2
 * `TableGrid` with the sheet's own motion (no stagger), and, under a tapped SEATED chip, the INLINE
 * join form (D9: never a nested sheet; the dialog count stays one) that arrives with `mms-rise`,
 * takes focus on its code input, and gives it back to the chip when the ask collapses. An EMPTY Join
 * is refused ON THE FIELD (`JOIN_COPY.missing`, `aria-invalid`, focus back on the input): an
 * `aria-disabled` button still submits on Enter, and used to say nothing. The seated chip is a
 * DISCLOSURE (`aria-expanded` / `aria-controls` → the form).
 *
 * WHO OWNS THE ASK. `joinNum` is the HOST's (controlled): the DoorSheet reveals it on a seated chip's
 * tap, the Send sheet on a tap OR on the bind's `seated` answer — a table that was Open when the
 * grid was read and seated by the time the chip was pressed. The form's own state (the typed code,
 * the empty-submit refusal) lives in `JoinForm`, keyed on the table, so a re-target is a fresh form
 * with focus in its input and a refusal never survives a collapse.
 *
 * No live region: nothing here announces; the host's sheet names itself by its title.
 */
export function TableSection({
  tables,
  source,
  sub,
  joinNum,
  onJoinChange,
  onEnter,
  onClaim,
  onPlain,
  markMine,
  joinNote,
  noJoin,
}: {
  tables: DineInTable[];
  /** `sheet` (the DoorSheet) or `send` (the bind sheet) — on the capture and the escape's verb. */
  source: Exclude<TableGridSource, "page">;
  /** The sub-line under the heading — the host's own sentence (the DoorSheet's sticker line; the
   *  Send sheet's `BIND_COPY.sub` with its MY draft). */
  sub: ReactNode;
  /** The seated table whose code is being asked for, inline under the grid (null = no ask). */
  joinNum: number | null;
  onJoinChange: (tableNumber: number | null) => void;
  /** Called right before each navigation INTO the dine-in door (a claim, a host-start, a join) so the
   *  host records the door entered (`mode_selected`). The Send sheet passes none: no door is entered. */
  onEnter?: () => void;
  /** 3c-ii — an open chip hands its number here instead of navigating (`TableGrid`). */
  onClaim?: (tableNumber: number) => void;
  /** 3c-ii — the escape under the grid does the same with no number. */
  onPlain?: () => void;
  /** `false` in the Send sheet — no chip is "yours" on a numberless session (`TableGrid`). */
  markMine?: boolean;
  /** Rendered under the join form only (the Send sheet's drafts note). */
  joinNote?: ReactNode;
  /** J40 — the Send sheet's Seated tables whose order no code joins (`TableGrid`): no disclosure,
   *  no join clause. The DoorSheet passes none. */
  noJoin?: ReadonlySet<number>;
}) {
  const tablesTitleId = useId();
  const joinFormId = useId();
  const router = useJourneyRouter();
  const onJoin = (n: number, chip: HTMLButtonElement) => {
    if (joinNum === n) {
      // The same chip again collapses the ask; focus goes back where the diner was.
      onJoinChange(null);
      chip.focus();
      return;
    }
    onJoinChange(n);
  };
  const submitJoin = (code: string) => {
    onEnter?.();
    // The host sheet stays open through the navigation (the per-door remount unmounts it).
    router.push(dineInMenuHref({ join: code }));
  };

  return (
    // 3c-i (D18) — the grid as a SECTION, under the doors, under a hairline. Its spacing is the
    // stylesheet's (J32): `.door-sheet-tables` beside `.door-sheet-exits`, the DoorSheet's hairline
    // on `[data-host="sheet"]`, none under the Send sheet's title — and inside it the --s3 gap is the
    // one rhythm, so no child carries a top margin. `.table-chip.is-mine` is availability (the clay
    // wash), never the lit cap — the current door above stays the one selected thing on this surface.
    <section
      aria-labelledby={source === "send" ? undefined : tablesTitleId}
      className="door-sheet-tables"
      data-host={source}
    >
      {/* Under the DoorSheet the section sits beneath the door's title and names itself; the Send
          sheet IS this section and its dialog title is the one name — a second "Pick your table"
          heading under a hairline with nothing above it was read twice (the blind pass on 3c-ii). */}
      {source !== "send" && (
        <h3 id={tablesTitleId} style={sectionTitle}>
          {t("en", "pickYourTable")}{" "}
          <span lang="my" className="door-sheet-my">
            {t("my", "pickYourTable")}
          </span>
        </h3>
      )}
      <p className="door-sheet-sub" style={flush}>
        {sub}
      </p>
      <TableGrid
        tables={tables}
        stagger={false}
        source={source}
        onJoin={onJoin}
        onEnter={onEnter}
        onClaim={onClaim}
        onPlain={onPlain}
        markMine={markMine}
        expandedTable={joinNum}
        controls={joinFormId}
        noJoin={noJoin}
      />
      {joinNum != null && (
        <JoinForm key={joinNum} id={joinFormId} tableNumber={joinNum} onJoin={submitJoin}>
          {joinNote}
        </JoinForm>
      )}
    </section>
  );
}

/**
 * The seated-table ask, INLINE (never a nested sheet). Arrives with `mms-rise` — RM-none in
 * globals.css — and the Field is the app's one field. Keyed on the table by its host: a fresh form
 * per reveal and per re-target, so the typed code and the on-field refusal never carry across.
 */
function JoinForm({
  id,
  tableNumber,
  onJoin,
  children,
}: {
  id: string;
  tableNumber: number;
  /** The trimmed, upper-cased code — never empty (the empty submit is refused on the field). */
  onJoin: (code: string) => void;
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  // The empty submit's refusal, on the field; cleared by typing.
  const [joinError, setJoinError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const joinTitleId = useId();
  // The step change moves focus INTO the ask (QA §A) — on every reveal and every re-target (a new
  // key is a new mount).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase(); // tokens are 8-char uppercase — normalize like JoinTable
    if (!c) {
      // Said on the field and focus goes back to it — a refusal a reader can find (QA §A).
      setJoinError(JOIN_COPY.missing);
      inputRef.current?.focus();
      return;
    }
    onJoin(c);
  };
  return (
    <form
      id={id}
      aria-labelledby={joinTitleId}
      className="mms-rise"
      style={joinForm}
      onSubmit={submit}
    >
      <h4 id={joinTitleId} style={sectionTitle}>
        {JOIN_COPY.title(tableNumber)}
      </h4>
      <p className="door-sheet-sub" style={flush}>
        {JOIN_COPY.body(tableNumber)}
      </p>
      <Field label={JOIN_COPY.label} error={joinError}>
        {(control) => (
          <input
            {...control}
            ref={inputRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setJoinError(null);
            }}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            // A synthetic example, NOT any seeded token (lib/table-pick.ts says why).
            placeholder={JOIN_COPY.placeholder}
          />
        )}
      </Field>
      {/* A refusal that stays reachable: `aria-disabled`, never native `disabled` — the submit
          guard above is the enforcement; an empty code goes nowhere, and SAYS so on the field
          (Enter in the input submits past any disabled look). */}
      <button
        type="submit"
        className={buttonClass({ variant: "primary", size: "lg", block: true })}
        aria-disabled={!code.trim() || undefined}
      >
        {JOIN_COPY.button}
      </button>
      {children}
    </form>
  );
}

const sectionTitle = { margin: 0, fontSize: "var(--fs-h3)" } as const;
const flush = { margin: 0 } as const;
// No top margin (J32): the form is a direct child of the section's grid, whose --s3 gap is the one
// rhythm — its old `--s2` top made the escape-to-form step 20px where every other step is 12px.
const joinForm = { display: "grid", gap: "var(--s3)" } as const;
