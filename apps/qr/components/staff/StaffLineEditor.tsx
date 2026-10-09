"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { setLineNotes, staffSetQty, type StaffWriteResult } from "@/lib/staff-cart";
import { boundWrite } from "@/lib/bounded-write";
import { WRITE_UNCONFIRMED, WRITE_WAITING } from "@/lib/staff-outage";
import { draftHeld } from "@/lib/reload-guard";
import type { TableLineView } from "@/lib/floor-types";
import type { StaffLineEdit } from "@/lib/staff-send-view";
import { KitchenTrack, Stepper, useSheetSubject } from "@mms/ui";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { al, dishVisible } from "@/lib/staff-labels";
// ── Phase 2c · pad ──
import { tf } from "@/lib/i18n/fill";
import { padDishName } from "@/lib/order-pad";
import type { StaffLang } from "@/lib/staff-lang";
import { LossActionSheet } from "./LossActionSheet";
import { Chrome } from "./Chrome";
import { RelativeTime } from "./RelativeTime";
import { useStaffLang } from "./StaffLangProvider";
import { ReloadButton } from "./ReloadOffer";
import { useReloadHold } from "./useReloadHold";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Phase 2a · send (K25 for this surface) — a post-fire line's state in the DEVICE language. It
 *  replaced the English-only `STAFF_STATE_COPY`, so on a Burmese console the one word that separates
 *  a sent dish from an unsent one is no longer half-translated. */
const LINE_STATE_KEY: Record<"fired" | "in_progress" | "served", StaffKey> = {
  fired: "table.line.state.fired",
  in_progress: "table.line.state.inProgress",
  served: "table.line.state.served",
};

/**
 * One cart line on the staff drill-down. The control depends on the line's kitchen state (S2.1/S2.3):
 *   • 'draft'  → qty steppers (− / +); staff edit freely (no canMutateLine restriction).
 *   • fired / in_progress / served → POST-fire: a silent qty change would desync the kitchen + skip the
 *     loss audit, so the only edit is **Void / Comp** (loss-gated, manager-PIN when cooked — S2.3).
 *   • 'voided' → terminal, shown muted with no controls. 'comped' → shown as a free line, no controls.
 * The server is authoritative; the live re-fetch (FloorDetailLive) reconciles the displayed state.
 *
 * Phase 2h (P2fc) — the qty and note writes are NOT transitions any more: a transition whose action
 * hangs keeps its `pending` until the RAW answers and holds every other transition on the tab
 * (LEARNINGS #149 · #200), so a hung qty write dimmed this row's stepper and the note's Save for as
 * long as the queue was stuck. Each write is awaited with a BOUND (`boundWrite`), its busy is state
 * cleared in a `finally`, and a lost or slow answer is said as one — `WRITE_UNCONFIRMED` ("we
 * couldn't confirm that change") or `WRITE_WAITING` ("no answer yet — it may still be saved") —
 * through the plain-string `onError`, which every renderer localizes (`OUTAGE_TWINS`). The late
 * answer still lands: a late refusal rolls the qty back and says the server's sentence.
 *
 * S2 critic D1 · D2 — WRITE_WAITING says "reload the page" on a console installed standalone (no
 * browser reload), and the regions that say it (the table page's line, the pad's Toast) are not
 * this row's. So the ROW offers the `ReloadButton` for exactly as long as one of its writes is
 * still unanswered — where the person just tapped — and reports it (`onWaiting`): `true` at the
 * bound, `false` when the late answer lands, whatever it is. A late refusal or a lost answer says
 * its own sentence through `onError` first; a late SUCCESS says nothing, so `onWaiting(…, false)`
 * is the renderer's cue to retract a WRITE_WAITING it still shows.
 */
export function StaffLineEditor({
  sessionId,
  line,
  disabled,
  onError,
  onEditState,
  onWaiting,
  onRemove,
  rowProps,
  leaving = false,
  unsentAge,
}: {
  sessionId: string;
  line: TableLineView;
  disabled: boolean;
  onError: (msg: string) => void;
  /** Phase 2h (S2 critic D2) — this line has a write still unanswered past the bound (`true`, said
   *  as WRITE_WAITING through `onError`), or no longer (`false`: its late answer landed). Reported
   *  from the write itself, so it arrives even after this row unmounted. */
  onWaiting?: (lineId: string, waiting: boolean) => void;
  /** Phase 2a · send — DRAIN BEFORE FIRE. The line reports what is still unsaved or in flight, so
   *  the table page's Send holds while a sendable dish's note is typed but not saved (`setLineNotes`
   *  is draft-guarded: a note still in the field when its line fires is lost — and the note is
   *  where an allergy lives). `null` = this line left the list. */
  onEditState?: (lineId: string, edit: StaffLineEdit | null) => void;
  /**
   * ── Phase 2c · pad ── the ORDER PAD's ticket owns a removal (qty → 0): it moves focus to the
   * neighbouring dish BEFORE the write, leaves the row as a ghost while the list closes over it, and
   * brings it back in place on a refusal (§24, `useLineMotion`). When set, the stepper's Remove calls
   * this instead of writing here. The table page passes nothing and keeps its own write.
   */
  onRemove?: () => void;
  /** `useLineMotion`'s row attributes (the line id, and on a ghost `inert` + `aria-hidden`). */
  rowProps?: Record<string, unknown>;
  /** A ghost: drawn as last painted, fading, and it never writes. */
  leaving?: boolean;
  /** P2do (owner ruling #15) — the table has ASKED to pay at the counter: a line the kitchen has not
   *  got says how long it has waited, "Not sent yet · 4m ago", as plain text — no "late" rule, no
   *  escalation (the loudness ladder: only Late escalates with time). The server's clock. */
  unsentAge?: { serverNow: string };
}) {
  // P2 — the staff device's language, from app/staff/layout.tsx.
  //
  // `onError` stays a PLAIN STRING and is deliberately not localized here. The reason is no longer
  // the one an earlier draft of this comment gave (that the target region marked `lang` only while
  // the frozen copy rendered — that suppression is gone; `FloorDetailLive` now renders the write
  // failure through `<OutageText>`, which marks its own span). The reason is the contract: what
  // arrives through this callback is a SERVER sentence, and `<OutageText>` is what decides at the
  // render site whether it has an authored Burmese twin. Localizing it here would mean guessing on
  // this side of the boundary for a sentence the server owns.
  const lang = useStaffLang();
  // Phase 2c · pad — minted per editor, so two editors of one line (the pad and a table page open
  // side by side, a test rendering both) never share an id. The Send's note hold finds the field by
  // `data-note-for`, never by this id.
  const noteId = useId();
  // Phase 2h — the qty write's busy: STATE cleared in a `finally` at the bound (never a transition's
  // `pending`), and its tap-time twin (two stepper taps in one frame both read the same render).
  const [pending, setPending] = useState(false);
  const qtyInFlight = useRef(false);
  // Which qty write is the latest: a LATE answer rolls the optimistic value back only if no newer
  // write has replaced it since (the bound frees the stepper while the first is still out).
  const qtySeq = useRef(0);
  const [optimisticQty, setOptimisticQty] = useState<number | null>(null);
  const [seenServerQty, setSeenServerQty] = useState(line.qty);
  const [sheetOpen, setSheetOpen] = useState(false);
  const loss = useSheetSubject(sheetOpen && !line.pendingApproval ? line : null);
  // W3b kitchen note: null = editor closed; a string = the in-progress draft (may be "", which clears).
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // Phase 2h — the note save's busy, the same shape as the qty's (state + its tap-time twin).
  const [notePending, setNotePending] = useState(false);
  const noteInFlight = useRef(false);
  // ── Phase 2c · review fixes · pad2 ── the note button, where focus goes when a save closes the
  // editor under the finger (P7): the field and its Save unmount together.
  const noteBtnRef = useRef<HTMLButtonElement>(null);
  // Phase 2h (S2 critic D1 · D2) — this row's writes still unanswered past the bound (a qty and a
  // note can both be): the count is the truth, the state draws the reload, `onWaiting` tells the
  // renderer on every edge (none → some, some → none).
  const waitingWrites = useRef(0);
  const [waiting, setWaiting] = useState(false);
  const lineId = line.id;
  function markWaiting(on: boolean) {
    const was = waitingWrites.current > 0;
    waitingWrites.current = Math.max(0, waitingWrites.current + (on ? 1 : -1));
    const now = waitingWrites.current > 0;
    if (was === now) return;
    setWaiting(now);
    onWaiting?.(lineId, now);
  }

  /** The note save's answer, whenever it lands — at once, or after the bound (9e). */
  function landNote(res: StaffWriteResult, value: string, late: boolean) {
    if (!res.ok) {
      onError(res.error);
      return;
    }
    // The live re-fetch renders the saved note. A LATE save closes the editor only if it still
    // holds exactly what was saved — a draft typed since is never thrown away.
    flushSync(() => setNoteDraft((d) => (!late || (d !== null && d.trim() === value) ? null : d)));
    // Only when focus FELL (it was on the field or its Save): a control the person moved to
    // is never yanked.
    if (document.activeElement === document.body) noteBtnRef.current?.focus();
  }

  async function saveNote() {
    // §17 — the button says so with `aria-disabled`; the refusal is here (a REF: same-frame taps).
    if (noteInFlight.current) return;
    noteInFlight.current = true;
    setNotePending(true);
    const value = (noteDraft ?? "").trim();
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(setLineNotes(sessionId, { cartItemId: line.id, notes: value }));
      if (out.kind === "answer") {
        landNote(out.value, value, false);
        return;
      }
      if (out.kind === "threw") {
        // The answer was lost — the note may have been saved: "couldn't confirm", never "wasn't".
        onError(WRITE_UNCONFIRMED);
        return;
      }
      onError(WRITE_WAITING);
      markWaiting(true);
      // The late answer is said through the PAGE's region, which outlives this row (9e).
      void out.late.then((late) => {
        if (late.kind === "answer") landNote(late.value, value, true);
        else onError(WRITE_UNCONFIRMED);
        markWaiting(false);
      });
    } finally {
      noteInFlight.current = false;
      setNotePending(false); // frees AT THE BOUND (fact 3)
    }
  }

  // When the server (the live re-fetch) reports a new qty, drop any optimistic value — both when it
  // catches up to ours AND when another actor changes the line. React's guarded set-during-render pattern.
  if (line.qty !== seenServerQty) {
    setSeenServerQty(line.qty);
    setOptimisticQty(null);
  }
  const qty = optimisticQty ?? line.qty;
  // A ghost (`leaving`) is busy: the stepper and the note refuse, so it never writes — even where
  // `inert` is unsupported (Safari < 15.5).
  const busy = pending || disabled || leaving;
  // Phase 2c · pad — the qty digit pops when it CHANGES (never on first paint, so a ticket opening
  // does not pop every row). React's guarded set-during-render; `.mms-pop` is RM-escorted.
  const [paintedQty, setPaintedQty] = useState(qty);
  const [qtyPops, setQtyPops] = useState(0);
  if (qty !== paintedQty) {
    setPaintedQty(qty);
    setQtyPops((n) => n + 1);
  }

  // Phase 2a · send — reported from an effect (never during render), and withdrawn on unmount so a
  // removed line, or a list that went read-only, cannot keep holding the Send.
  const noteDirty = draftHeld(noteDraft, line.notes ?? "");
  // Codex r2 on #311 — the typed note holds a reload for a new version while it is unsaved, whether
  // or not its field still has focus (the person may have tapped away to the next dish).
  useReloadHold("unsent", "draft", `note:${line.id}`, noteDirty);
  const writing = pending || notePending;
  useEffect(() => {
    onEditState?.(line.id, {
      lineId: line.id,
      name: line.name,
      noteDirty,
      writing,
      sendable: line.sendable,
    });
  }, [onEditState, line.id, line.name, line.sendable, noteDirty, writing]);
  useEffect(() => () => onEditState?.(line.id, null), [onEditState, line.id]);

  async function setQty(next: number) {
    if (next <= 0 && onRemove) {
      onRemove(); // the ticket owns the removal (focus, ghost, write, return on refusal)
      return;
    }
    if (qtyInFlight.current) return; // the stepper says so (`aria-disabled`); the refusal is here
    qtyInFlight.current = true;
    const seq = ++qtySeq.current;
    setOptimisticQty(next);
    setPending(true);
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(staffSetQty(sessionId, { cartItemId: line.id, qty: next }));
      if (out.kind === "answer") {
        if (!out.value.ok) {
          setOptimisticQty(null); // roll back to the last server value
          onError(out.value.error);
        }
        return;
      }
      if (out.kind === "threw") {
        // S2-audit B3: an unexpected throw (network/redacted server error) must not strand the
        // optimistic qty silently — roll back to the last confirmed value and say we couldn't
        // CONFIRM it (the answer was lost, so it may have landed — never "it failed").
        setOptimisticQty(null);
        onError(WRITE_UNCONFIRMED);
        return;
      }
      // Still out at the bound: the new figure stays shown (the person's own change, which may
      // still be saved — rolled back it would invite a second tap that changes it twice).
      onError(WRITE_WAITING);
      markWaiting(true);
      // The late answer is said through the PAGE's region, which outlives this row (9e).
      void out.late.then((late) => {
        if (!(late.kind === "answer" && late.value.ok)) {
          // A late refusal or a lost answer rolls back — only if no newer write has replaced it.
          if (qtySeq.current === seq) setOptimisticQty(null);
          onError(late.kind === "answer" && !late.value.ok ? late.value.error : WRITE_UNCONFIRMED);
        }
        // A late success says nothing: the re-fetch shows it, confirmed — and the renderer
        // retracts its "no answer yet" on this edge.
        markWaiting(false);
      });
    } finally {
      qtyInFlight.current = false;
      setPending(false); // frees AT THE BOUND (fact 3)
    }
  }

  // K33 — the options the guest chose, under the dish name on EVERY branch of this editor. The floor
  // was the one staff surface that never showed them: a server reading table 6 back could not tell a
  // no-egg Mohinga from a plain one, and the void/comp decision is made from exactly this row. The
  // labels are the server-priced strings stored on the line — rendered verbatim, never re-derived.
  const mods =
    line.modifiers.length > 0 ? (
      <span
        style={{ display: "block", color: "var(--t3)", fontSize: "var(--fs-sm)", marginTop: 1 }}
      >
        {/* Phase 2c · pad — on a Burmese console each option leads in Burmese where the catalog has
            it (per slot); an option with none stays English, marked. The English console is the
            joined English, exactly as before. */}
        {lang === "my"
          ? line.modifiers.map((m, i) => {
              const my = line.modifiersMy[i] ?? null;
              return (
                <span key={i}>
                  {i > 0 ? " · " : null}
                  {my !== null ? <span lang="my">{my}</span> : <span lang="en">{m}</span>}
                </span>
              );
            })
          : line.modifiers.join(" · ")}
      </span>
    ) : null;
  // Phase 2c · pad — the dish's name, the console's tongue first (`padDishName`), inside the span
  // focus lands on when a NEIGHBOURING line is removed (`data-line-name`, §24: it cannot be
  // activated, so a repeated Enter can never remove this dish).
  const dish = <DishName lang={lang} name={line.name} nameMy={line.nameMy} />;
  // ── Phase 2c · review fixes · pad2 ── ONE name for every control on the row (P12): the dish as it
  // RENDERS — the same binding the stepper's Remove reads — never the English beside a Burmese one.
  const dishLabel = dishVisible(lang, line.name, line.nameMy);

  // ── Terminal / settled-as-free states: a muted row, no controls ──────────────────────────────────────
  if (line.state === "voided") {
    return (
      <li {...rowProps} className={ghostClass(leaving)} style={{ ...row, opacity: 0.55 }}>
        <span style={{ ...nameCell, textDecoration: "line-through" }}>
          {line.qty}× {dish}
          {mods}
        </span>
        <span style={badge}>
          <Chrome lang={lang} k="table.detail.line.voided" />
        </span>
      </li>
    );
  }
  if (line.comped) {
    return (
      <li {...rowProps} className={ghostClass(leaving)} style={row}>
        <span style={nameCell}>
          {line.qty}× {dish}
          {mods}
          {line.bySeatName && (
            <span style={{ color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
              {" "}
              · {line.bySeatName}
            </span>
          )}
        </span>
        <span style={{ ...badge, color: "var(--ac-strong)" }}>
          <Chrome lang={lang} k="table.line.comped" />
        </span>
      </li>
    );
  }

  // ── Post-fire (fired / in_progress / served): Void / Comp instead of a silent stepper ────────────────
  const postFire = line.state !== "draft";
  if (postFire) {
    return (
      <li {...rowProps} className={ghostClass(leaving)} style={row}>
        <span style={nameCell}>
          {line.qty}× {dish}
          <span style={{ color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
            {" · "}
            {/* S12's one vocabulary, now the dictionary's — no echo: a tag inside a dense row. */}
            <Chrome lang={lang} k={LINE_STATE_KEY[line.state as keyof typeof LINE_STATE_KEY]} />
          </span>
          {mods}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
          <span style={priceCell}>{fmt(line.unitPriceCents * line.qty)}</span>
          {line.pendingApproval ? (
            // S2.4: a void/comp request is open for this line — a manager resolves it from the queue; don't
            // offer a second request.
            // The aria-label this carried ("Approval requested for {dish}") is DELETED rather than
            // localized: it sat on a roleless <span>, where a name is not reliably exposed at all
            // (the same reason `Stepper`'s count uses real `.sr-only` text), and the dish name it
            // added is already the first thing in this <li>. A redundant name is one more string to
            // keep in sync; the visible text is the name.
            <span style={badge}>
              <Chrome lang={lang} k="table.line.approvalRequested" />
            </span>
          ) : (
            <button
              className="staff-btn"
              type="button"
              onClick={() => {
                if (disabled) return;
                setSheetOpen(true);
              }}
              aria-disabled={disabled || undefined}
              aria-label={
                al(lang, {
                  kind: "verb",
                  verb: "table.line.verb.voidComp",
                  subject: dishLabel,
                }).aria
              }
              style={{ ...lossBtn, opacity: disabled ? 0.5 : 1 }}
            >
              {/* No echo: a 44px pill in a dense per-line row, `whiteSpace: nowrap`. Stacked, it
                  grows every line; inline, it doubles the button's width and squeezes the dish
                  name. The sheet it opens carries the bilingual pair instead. */}
              <Chrome lang={lang} k="table.line.verb.voidComp" />
            </button>
          )}
        </span>
        {/* Each open is a fresh sheet (resets reason/PIN, refetches managers) by REMOUNT — the
            `key` advances on every open — while the subject is HELD through the exit so the sheet
            can slide down instead of cutting (M76, `useSheetSubject`). */}
        {loss.held && (
          <LossActionSheet
            key={loss.key}
            open={loss.open}
            onOpenChange={setSheetOpen}
            sessionId={sessionId}
            line={loss.held}
            onDone={() => setSheetOpen(false)}
          />
        )}
      </li>
    );
  }

  // ── Draft: the qty stepper (shared @mms/ui Stepper; the red ✕ remove is the staff variant) + the
  // W3b kitchen-note editor (draft-only; the note freezes at fire so the board can't silently diverge).
  return (
    <li {...rowProps} className={ghostClass(leaving)} style={row}>
      <span style={nameCell}>
        <span
          key={qtyPops}
          className={qtyPops > 0 ? "staff-qty mms-pop" : "staff-qty"}
          style={{ fontWeight: "var(--fw-semibold)" }}
        >
          {qty}×
        </span>{" "}
        {dish}
        {/* Phase 2a · send — the WORD marks what the kitchen has not got, never colour alone. Only a
            line the Send fires wears it (`sendFiresLine` — a counter order's to-go drafts too): a
            table's to-go draft cooks at pay, so "not sent" there is no call to action. */}
        {line.sendable && (
          <span style={notSentTag}>
            {" · "}
            {/* PD1 · P2do — the hollow ring, the one shape for "not sent yet" (decorative: the word
                carries it), in --warn on the console. */}
            <KitchenTrack
              stage="unsent"
              size="glyph"
              surface="theme"
              className="staff-unsent-ring"
            />{" "}
            <Chrome lang={lang} k="pad.group.unsent" />
            {unsentAge && line.createdAt ? (
              <>
                {" · "}
                <RelativeTime iso={line.createdAt} serverNow={unsentAge.serverNow} />
              </>
            ) : null}
          </span>
        )}
        {mods}
        {line.soldOut && (
          <span
            style={{
              color: "var(--t3)",
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-regular)",
            }}
          >
            {" · "}
            <Chrome lang={lang} k="table.line.soldOut" />
          </span>
        )}
        {line.bySeatName && (
          <span style={{ color: "var(--t3)", fontSize: "var(--fs-sm)" }}> · {line.bySeatName}</span>
        )}
        {line.notes && noteDraft === null && <span style={noteText}>“{line.notes}”</span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
        <span style={priceCell}>{fmt(line.unitPriceCents * qty)}</span>
        <button
          ref={noteBtnRef}
          className="staff-btn"
          type="button"
          onClick={() => {
            if (busy) return;
            setNoteDraft((d) => (d === null ? (line.notes ?? "") : null));
          }}
          aria-disabled={busy || undefined}
          aria-expanded={noteDraft !== null}
          // Two whole al() calls rather than one over a computed key: `check-staff-lang.mjs` rule 3c
          // needs the verb key as a string LITERAL to find the label the name must contain, and the
          // button's visible word genuinely changes with the line's state.
          aria-label={
            line.notes
              ? al(lang, {
                  kind: "verb",
                  verb: "table.line.verb.editNote",
                  subject: dishLabel,
                }).aria
              : al(lang, {
                  kind: "verb",
                  verb: "table.line.verb.addNote",
                  subject: dishLabel,
                }).aria
          }
          style={{ ...noteBtn, opacity: busy ? 0.5 : 1 }}
        >
          {line.notes ? (
            <Chrome lang={lang} k="table.line.verb.editNote" />
          ) : (
            <Chrome lang={lang} k="table.line.verb.addNote" />
          )}
        </button>
        <Stepper
          qty={qty}
          onChange={(n) => void setQty(n)}
          name={line.name}
          // The primitive maps this to `aria-disabled` + a refusal in its handlers (§17, K35).
          disabled={busy}
          soldOut={line.soldOut}
          // Phase 2c · pad (K25) — every name from the dictionary, as a unit (`labels` is
          // all-or-nothing), naming the dish as it RENDERS (Burmese-first under `my`).
          labels={stepperLabels(lang, dishLabel)}
          removeTone="var(--warn)"
        />
      </span>
      {noteDraft !== null && (
        <span style={noteEditor}>
          {/* No echo: this label is `sr-only`, so a pair would announce the field twice. */}
          <label className="sr-only" htmlFor={noteId}>
            <Chrome lang={lang} k="table.line.noteLabel" vars={{ x: dishLabel }} />
          </label>
          <input
            id={noteId}
            // Phase 2a · send — the Send's note hold finds this field by the LINE, within the order
            // card, rather than by the id (which the order pad may re-mint with useId()).
            data-note-for={line.id}
            type="text"
            value={noteDraft}
            maxLength={160}
            placeholder={ts(lang, "table.line.notePlaceholder")}
            onChange={(e) => setNoteDraft(e.target.value)}
            style={noteInput}
          />
          <button
            className="staff-btn"
            type="button"
            onClick={() => void saveNote()}
            aria-disabled={notePending || undefined}
            aria-busy={notePending || undefined}
            style={noteSave}
          >
            {/* §17 — a stated word while it saves, never "…": this button has no aria-label, so its
                content IS its accessible name, and an ellipsis was the name for the round trip. */}
            {notePending ? (
              <Chrome lang={lang} k="table.line.saving" />
            ) : (
              <Chrome lang={lang} k="table.line.save" />
            )}
          </button>
        </span>
      )}
      {/* Phase 2h (S2 critic D1) — a write of this row still unanswered: WRITE_WAITING says "reload
          the page" in the renderer's region, and the installed console has no browser reload. The
          button alone (no line, no live role), on its own line under the row's controls. */}
      {waiting && (
        <div style={reloadRow}>
          <ReloadButton lang={lang} />
        </div>
      )}
    </li>
  );
}

// ── Phase 2c · pad ──
/** The dish name, the console's tongue first. On an English console with no Burmese it is the bare
 *  English text, exactly as before; a lead in the OTHER tongue is marked, and the echo sits beneath. */
function DishName({
  lang,
  name,
  nameMy,
}: {
  lang: StaffLang;
  name: string;
  nameMy: string | null;
}) {
  const n = padDishName(lang, name, nameMy);
  return (
    <span data-line-name tabIndex={-1} className="staff-line-name">
      {n.lead.lang === lang && lang === "en" ? (
        n.lead.text
      ) : (
        <span lang={n.lead.lang}>{n.lead.text}</span>
      )}
      {n.echo && (
        <span className="staff-line-echo" lang={n.echo.lang}>
          {n.echo.text}
        </span>
      )}
    </span>
  );
}

/** The stepper's names, whole, in the device language (`Stepper`'s `labels`). */
function stepperLabels(lang: StaffLang, x: string) {
  return {
    decrease: tf(lang, "table.line.a11y.less", { x }),
    remove: tf(lang, "table.line.a11y.remove", { x }),
    increase: tf(lang, "table.line.a11y.more", { x }),
    soldOut: tf(lang, "table.line.a11y.soldOut", { x }),
    // The primitive hands in its REAL ceiling — the name never restates the number (one binding).
    max: (n: number) => tf(lang, "table.line.a11y.max", { x, n }),
  };
}

/** A ghost row fades with the house removal idiom (§24); a live row carries no class. */
function ghostClass(leaving: boolean): string | undefined {
  return leaving ? "mms-remove" : undefined;
}

// Phase 2h — the row's reload wraps onto a line of its own under the controls (`row` wraps).
const reloadRow: CSSProperties = { flexBasis: "100%", display: "flex" };

// The name takes the row's free space from a 12rem basis, so in a narrow pane (the order pad's
// ticket) the controls wrap under the name instead of squeezing it to a sliver.
const nameCell: CSSProperties = { minWidth: 0, flex: "1 1 12rem" };

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  padding: "8px 0",
  borderTop: "1px solid var(--bd)",
  fontSize: "var(--fs-sm)",
};
// Phase 2a · send — the "Not sent" tag: bold, never colour alone (the word carries it). PD1 — in
// --warn on the console, the ring's own ink (m1 A8: "not sent" is the MARK-tier case staff act on).
const notSentTag: CSSProperties = {
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
};
const priceCell: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  minWidth: 56,
  textAlign: "right",
};
const lossBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const badge: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  color: "var(--t2)",
  whiteSpace: "nowrap",
};
// The saved note reads at FULL text color (safety-adjacent, never muted) in the diner's own words.
const noteText: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
};
const noteBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const noteEditor: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  width: "100%",
  paddingTop: 6,
};
const noteInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-sm)",
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  font: "inherit",
  fontSize: "var(--fs-body)", // iOS input-zoom floor (P5.2)
};
const noteSave: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--ac)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
