"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { CartItem } from "@mms/db";
import { Sheet } from "@mms/ui";
import { boundWrite } from "@/lib/bounded-write";
import { t } from "@/lib/i18n";
import { noteAfterChanged, noteOnLiveChange, noteSaveState, type NoteDraft } from "@/lib/note-edit";

/**
 * Phase 3c-i (D17) — the dish's ⋯ sheet: where the line goes (For here / To go) and, for a to-go
 * line, "Send to kitchen now". The line itself is a receipt row again — the Stepper and the state
 * chip stay on the card; these two choices moved here so the Order stage reads as a bill you can
 * read, not a control panel.
 *
 * SUBJECT-KEYED by the parent (`useSheetSubject`, the KdsLineMenu idiom): `line` is the LIVE line, so
 * a refresh mid-open reaches it, and when the line stops being draft (Send-now landed, a tablemate's
 * send fired it) the parent closes the sheet and lands focus on the line's `data-line-name`. A
 * normal close returns focus to the ⋯ that opened it (the parent's `onCloseAutoFocus`).
 *
 * ONE selection vocabulary: the lit-gold `.checkout-pill-on` on the pressed pill; the ⋯ never lights.
 * Pills are `aria-disabled` under a freeze, never native — a peer can take the lock while a pill
 * holds focus, and a native disable would drop it to <body> mid-interaction (WCAG 2.4.3).
 *
 * GUARDED (M82, `lib/sheet-busy-callers.test.ts`): "Send to kitchen now" fires a line the kitchen
 * will cook — one-way for the guest who tapped it, so dismissing mid-write would hide how it ended.
 * `busy` is bounded STATE in the Phase 2h shape (set at the tap, cleared in the `finally` around
 * `await boundWrite(onMakeNow())`, outside any transition), never a transition's pending: the raw
 * action may stay out for as long as the network likes, and a modal that cannot be left is a
 * keyboard trap (WCAG 2.1.2). At the bound the sheet frees; the late answer lands through the
 * parent's own re-sync.
 *
 * ONE `role="status"` INSIDE the sheet: Radix hides the page's content (and its region) under an
 * open dialog, so the view's sentence — a refused toggle, a refused fire, the freeze banner — is
 * mirrored here, where a reader can hear it.
 */
export function LineOptionsSheet({
  line,
  open,
  frozen,
  prepMinutes,
  notice,
  dineIn = true,
  onOpenChange,
  onChoose,
  onMakeNow,
  onSaveNote,
  onCloseAutoFocus,
}: {
  /** The LIVE line (held through the exit by the parent's `useSheetSubject`). */
  line: CartItem;
  open: boolean;
  /** Checkout's `editsFrozen` — every write here refuses on bare `locked`. */
  frozen: boolean;
  /** S4.2 — the configured kitchen prep estimate; "usually" hedges it. */
  prepMinutes: number;
  /** The view's one sentence (`payError ?? status`), mirrored into this sheet's region. */
  notice: string | null;
  /** Lifecycle audit (edit-notes 3) — a dine-in table's line: draws For here / To go and the to-go
   *  line's "Send to kitchen now". Off a table the sheet holds the kitchen note alone. */
  dineIn?: boolean;
  onOpenChange: (open: boolean) => void;
  /** A destination chosen — the parent closes the sheet and runs its optimistic toggle. */
  onChoose: (ful: "dinein" | "togo") => void;
  /** The raw fire, as the parent runs it (write → re-sync, or diagnosis). Awaited BOUNDED here. */
  /** The RAW `makeItNow` write — what `boundWrite` tracks and bounds; its answer is the parent's to
   *  read (the sheet only waits), so the type is deliberately opaque. */
  onMakeNow: () => Promise<unknown>;
  /** Lifecycle audit (edit-notes 3) — the RAW `setLineNote` write for this line, as the parent runs
   *  it (the follow-through — the re-sync and any refusal's sentence — rides beside it, the
   *  `makeNow` shape). Awaited BOUNDED here; an answered `ok` closes the sheet. Omitted = no field.
   *  #362 — `seen` is the stored note the field was seeded from (the write's compare-and-swap); a
   *  `changed` answer carries the note now on the order, and the field re-seeds from it. */
  onSaveNote?: (
    notes: string,
    seen: string,
  ) => Promise<{ ok: boolean; reason?: string; notes?: string | null }>;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [busy, setBusy] = useState(false);
  // WHICH write holds the sheet — for the labels only (the one `busy` is the guard): a note being
  // saved must not make "Send to kitchen now" read "Sending…".
  const [busyWith, setBusyWith] = useState<"send" | "note">("send");
  // The note as the diner is editing it, against the note on the ORDER (#362 blind pass 1 —
  // `lib/note-edit.ts`): `seen` is what the field was seeded from and the write's compare-and-swap;
  // an untouched field FOLLOWS the order, a touched one keeps the diner's words and SHOWS the change
  // (`underneath`). Bounded to 160, the Zod cap and the `qr_cart_items.notes` column CHECK.
  const live = line.notes ?? "";
  const [draft, setDraft] = useState<NoteDraft>({ note: live, seen: live, underneath: null });
  const [liveSeen, setLiveSeen] = useState(live);
  // The order's note moved under the open sheet — the render-time adjust (the parent re-renders this
  // sheet with the LIVE line on every applied view).
  if (live !== liveSeen) {
    setLiveSeen(live);
    setDraft((d) => noteOnLiveChange(d, live));
  }
  const note = draft.note;
  const { unchanged: noteUnchanged, removes: noteRemoves } = noteSaveState(draft);
  // The field's CURRENT value for the post-await check below (state is a render behind there),
  // mirrored after every commit.
  const noteNowRef = useRef(note);
  useLayoutEffect(() => {
    noteNowRef.current = note;
  });
  // Codex D — an edit that slipped in while the save was out (`readOnly` stops a keyboard, not every
  // input path): the sheet stays open and says the newer words are not saved.
  const [newerUnsaved, setNewerUnsaved] = useState(false);

  async function saveNote() {
    if (busy || frozen || noteUnchanged || !onSaveNote) return;
    const submitted = note.trim();
    setNewerUnsaved(false);
    setBusyWith("note");
    setBusy(true);
    // The capped blind pass on #362 — remember what THIS save sent: past the bound the field frees
    // while it is still out, and the order reaching these words later is this save landing
    // (`noteOnLiveChange`), never someone else's change.
    setDraft((d) => ({ ...d, submitted }));
    try {
      // The RAW write, awaited bounded, outside any transition (9b) — the `sendNow` shape. A note is
      // the allergy channel, so the sheet holds for the answer rather than closing on a hope.
      const out = await boundWrite(onSaveNote(submitted, draft.seen));
      if (out.kind === "answer") {
        if (out.value.ok) {
          // Saved: the order now holds `submitted`. Close only if that is still what the field
          // says — otherwise the newer words would vanish with the sheet (Codex D).
          if (noteNowRef.current.trim() === submitted) onOpenChange(false);
          else {
            setDraft((d) => ({ ...d, seen: submitted, underneath: null, submitted: null }));
            setNewerUnsaved(true);
          }
        } else if (out.value.reason === "changed") {
          // Someone else's note is on the order now: show it, and save against it next time. The
          // view's one region says so (the parent's `settleNote`).
          setDraft(noteAfterChanged(out.value.notes ?? null));
        } else {
          // Any other answer wrote nothing: there is no pending save to recognise.
          setDraft((d) => ({ ...d, submitted: null }));
        }
      }
    } finally {
      setBusy(false); // frees AT THE BOUND on every path — the M82 guard parses for it
    }
  }

  async function sendNow() {
    if (busy || frozen) return;
    setBusyWith("send");
    setBusy(true);
    try {
      // The RAW write, awaited bounded, outside any transition (9b). `waiting` at the bound frees
      // the sheet; the parent's re-sync applies the late answer either way.
      await boundWrite(onMakeNow());
    } finally {
      setBusy(false); // frees AT THE BOUND on every path — the M82 guard parses for it
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onCloseAutoFocus={onCloseAutoFocus}
      title={
        <>
          {line.name}
          {line.nameMy && (
            <span
              lang="my"
              style={{
                display: "block",
                fontFamily: "var(--font-my)",
                fontSize: "var(--fs-sm)",
                fontWeight: "var(--fw-semibold)",
                color: "var(--t2)",
              }}
            >
              {line.nameMy}
            </span>
          )}
        </>
      }
    >
      <div className="checkout-line-sheet">
        {/* For-here / To-go (S4): the server recomputes per-line tax (cold food flips taxability);
            the parent's toggle is optimistic (instant re-group), reconciled on refresh. */}
        {dineIn && (
          <div role="group" aria-label={`Where ${line.name} goes`} className="checkout-pill-row">
            {(["dinein", "togo"] as const).map((f) => {
              const on = line.fulfillment === f;
              return (
                <button
                  key={f}
                  type="button"
                  data-ful-line={line.id}
                  data-ful-val={f}
                  aria-pressed={on}
                  // Unavailable under a freeze AND while "Send to kitchen now" is held (Codex round 6
                  // on #313): the handler already refused the tap; the control must SAY so too.
                  aria-disabled={frozen || busy || undefined}
                  onClick={() => {
                    if (frozen || busy) return;
                    onChoose(f);
                  }}
                  className={`checkout-pill${on ? " checkout-pill-on" : ""}`}
                  style={frozen || busy ? { opacity: 0.55 } : undefined}
                >
                  {f === "dinein" ? "For here" : "To go"}
                </button>
              );
            })}
          </div>
        )}
        {/* Make it now (S4.2): a to-go food line waits for checkout by default; this fires it to the
            kitchen early. NOT optimistic — a fire is one-way, so the sheet holds for the answer and
            the line's chip changes only when the server says so. */}
        {dineIn && line.fulfillment === "togo" && (
          <button
            type="button"
            aria-disabled={frozen || undefined}
            aria-busy={busy || undefined}
            onClick={() => void sendNow()}
            className="checkout-pill checkout-pill-accent"
            style={{
              display: "flex",
              width: "100%",
              marginTop: 8,
              ...(frozen ? { opacity: 0.55 } : null),
            }}
          >
            {/* W19 — "Send" names what the tap really is (a per-line kitchen commit, same vocabulary
                as the batch CTA and the "Sent to kitchen" chip this line becomes); "usually" hedges
                the config estimate. While the write is out, the shipped "Sending…". */}
            {busy && busyWith === "send"
              ? t("en", "sending")
              : `Send to kitchen now · usually ~${prepMinutes} min`}
          </button>
        )}
        {/* Lifecycle audit (edit-notes 3) — the dish's kitchen note, editable while it is unsent (the
            line read "remove/re-add to change it" before, and a diner who only wanted to add an
            allergy had to rebuild the dish). Empty clears it. The same field, words and bound as the
            item sheet's (`ItemSheet`), so the allergy channel reads one way everywhere. */}
        {onSaveNote && (
          <div className="item-note">
            <label htmlFor={`line-note-${line.id}`} className="item-note-label">
              A note for the kitchen
            </label>
            <textarea
              id={`line-note-${line.id}`}
              className="item-note-input"
              value={note}
              maxLength={160}
              rows={2}
              placeholder="e.g. No peanuts — allergy"
              // Codex D — READ-ONLY while its save is out (never `disabled`: focus stays put), so the
              // words that are saving are the words on screen.
              readOnly={busy && busyWith === "note"}
              aria-busy={(busy && busyWith === "note") || undefined}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((d) => ({ ...d, note: value }));
                setNewerUnsaved(false);
              }}
              aria-describedby={note.length >= 120 ? `line-note-count-${line.id}` : undefined}
            />
            {/* #362 — the order's note moved while the diner was typing: SHOWN, never adopted over
                their words (a save is then refused as `changed`, and the field re-seeds). Plain
                text, not a second live region — the view's region says the change. */}
            {draft.underneath !== null && (
              <p className="item-note-count">
                {draft.underneath
                  ? `Changed on the order while you were typing: “${draft.underneath}”`
                  : "The note on the order was removed while you were typing."}
              </p>
            )}
            {newerUnsaved && (
              <p className="item-note-count">Your newer change isn’t saved yet — tap Save note.</p>
            )}
            {note.length >= 120 && (
              <p id={`line-note-count-${line.id}`} className="item-note-count">
                {160 - note.length} characters left
              </p>
            )}
            <button
              type="button"
              // `aria-disabled`, never native, for the same reason as the pills: a peer's lock can
              // land while this holds focus, and a native disable would drop it to <body>.
              aria-disabled={frozen || busy || noteUnchanged || undefined}
              aria-busy={busy || undefined}
              onClick={() => void saveNote()}
              className="checkout-pill checkout-pill-accent"
              style={{
                display: "flex",
                width: "100%",
                marginTop: 8,
                ...(frozen || noteUnchanged ? { opacity: 0.55 } : null),
              }}
            >
              {busy && busyWith === "note"
                ? "Saving…"
                : noteRemoves
                  ? "Remove the note"
                  : "Save note"}
            </button>
          </div>
        )}
        {/* The sheet's ONE region — the view's sentence, where a reader can hear it. Plain text
            colour follows the sentence's kind on the page; here it stays quiet. */}
        <p
          role="status"
          aria-atomic="true"
          style={{
            minHeight: 16,
            margin: "10px 0 0",
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
          }}
        >
          {notice ?? ""}
        </p>
      </div>
    </Sheet>
  );
}
