"use client";
import { useId, useMemo, useState, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  selectionDeltaCents,
  toggleOption,
  type ModGroup,
  type Selection,
} from "@/lib/menu/modifiers";
import { ts } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P2 — the add refusal, tagged by ORIGIN. `staffAddItem`'s own sentence goes through
 * `<OutageText>`, which swaps the one write-outage twin and shows every other sentence in English
 * rather than guessing at a Burmese it has no authored twin for. The thrown-action sentence is this
 * console's OWN copy and stays a dictionary key: passed to `OutageText` it would render as English
 * forever while looking converted.
 */
export type StaffSheetFailure =
  | { kind: "server"; message: string }
  /** The action THREW — transport, or a redacted server error. */
  | { kind: "threw" };

/**
 * The staff modifier sheet (W6a — closes K17). Same pure selection model as the diner ItemSheet
 * (radio for required singles, checkboxes capped at maxSelect), plus the register's qty (1–9) and an
 * optional kitchen note. Every cents figure here is ADVISORY preview — the add sends option IDS and
 * the server re-derives the price with cardinality enforced.
 *
 * P2 — the sheet renders through `Dialog.Portal`, so its Burmese lands OUTSIDE `.stx-root` and is
 * styled by `.chrome-my` alone (globals.css says so at the `.stx-root [lang="my"]` arms). That is
 * correct here and needs no CSS: nothing inside a sheet out-specifies it. It does mean every visible
 * string must go through `<Chrome>` — a hand-marked `<span lang={lang}>` would reach the DOM with
 * no face, because the selector that would give it one cannot cross the portal.
 */
export function StaffModSheet({
  open,
  onOpenChange,
  itemName,
  basePriceCents,
  groups,
  pending,
  error,
  onAdd,
  lang = "en",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  basePriceCents: number;
  groups: ModGroup[];
  pending: boolean;
  /**
   * Add failure surfaced INSIDE the sheet — a page-level live region is behind the modal scrim.
   *
   * A BARE STRING is a caller that owns its own localization and has already resolved the sentence
   * (the kiosk, through `lib/kiosk/strings.ts`); it is rendered verbatim, exactly as before P2. The
   * tagged form is the staff console's, and is what lets the write-outage twin be swapped without
   * laundering an authored English literal through `<OutageText>` forever.
   */
  error: StaffSheetFailure | string | null;
  onAdd: (choice: { modifierIds: string[]; qty: number; notes?: string }) => void;
  /**
   * ⚠️ A PROP, not `useStaffLang()`, and the default is not laziness. This sheet is ALSO composed
   * by `components/kiosk/KioskMenu.tsx`, which renders under `app/kiosk` — outside
   * `app/staff/layout.tsx` and therefore outside `<StaffLangProvider>`, whose hook THROWS rather
   * than defaulting. Reading the context here would crash the kiosk the moment a guest opened a
   * required-choice item. The kiosk is a guest surface with its own dictionary and no staff device
   * language, so it gets `"en"` — and `Chrome`'s English arm returns a bare text node, so that
   * caller's markup is byte-identical to the pre-P2 sheet. Its own bilingual pass is a separate
   * slice (`lib/kiosk/strings.ts` owns those words, not the staff dictionary).
   */
  lang?: StaffLang;
}) {
  const qtyLabelId = useId();
  const [sel, setSel] = useState<Selection>(() => initialSelection(groups));
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const valid = isSelectionValid(groups, sel);
  const previewCents = useMemo(
    () => (basePriceCents + selectionDeltaCents(groups, sel)) * qty,
    [basePriceCents, groups, sel, qty],
  );

  return (
    // M82 — `busy` while the add is in flight. The refusal from `staffAddItem` ("This table is
    // mid-payment — wait until they've finished.") is rendered ONLY inside this sheet, and
    // deliberately so: `StaffMenuBrowser` routes it here with the comment "the page-level one is
    // behind the modal scrim". Dismissing mid-add destroys the one surface that message has, so the
    // server is told nothing and the item is simply not there. `pending` is the parent's transition
    // flag, threaded down.
    <Sheet open={open} onOpenChange={onOpenChange} busy={pending} title={itemName}>
      {/* The Sheet renders its title visibly — no duplicate heading here. The title is the DISH's
          catalog name: data, rendered verbatim in whatever script it arrives in, never chrome. */}
      <div style={body}>
        {groups.map((g) => (
          <fieldset key={g.id} style={groupBox}>
            {/* The legend NAMES this group — `g.name` is catalog data, and a <fieldset> takes its
                accessible name from its <legend>. The option row below therefore carries no second
                role="group" of its own: two nested groups with one name announced the same words
                twice and put a hand-built name on a DOM element that had no business owning one. */}
            <legend style={legend}>
              {g.name}
              {g.minSelect >= 1 ? (
                <span style={reqTag}>
                  {" · "}
                  <Chrome lang={lang} k="browse.mod.required" />
                </span>
              ) : (
                <span style={optTag}>
                  {" · "}
                  <Chrome lang={lang} k="browse.mod.optional" />
                </span>
              )}
            </legend>
            <div style={optList}>
              {g.options.map((o) => {
                const chosen = (sel[g.id] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    // Toggle-button semantics (aria-pressed): conformant without the roving-tabindex
                    // machinery real radio groups demand — the single-select behavior lives in
                    // toggleOption, and each option stays independently tabbable.
                    aria-pressed={chosen}
                    style={chosen ? optBtnOn : optBtn}
                    onClick={() =>
                      setSel((s) => ({ ...s, [g.id]: toggleOption(g, s[g.id] ?? [], o.id) }))
                    }
                  >
                    {/* The option's own catalog name — data, not chrome. */}
                    <span>{o.name}</span>
                    {o.priceDeltaCents !== 0 && (
                      <span style={delta}>
                        {o.priceDeltaCents > 0 ? "+" : "−"}$
                        {(Math.abs(o.priceDeltaCents) / 100).toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div style={qtyRow}>
          {/* echo={false} because this span is the stepper's aria-labelledby target: an English echo
              would make the group's computed name the Burmese and the English run together. */}
          <span id={qtyLabelId} style={legend}>
            <Chrome lang={lang} k="browse.mod.qty" />
          </span>
          <div style={qtyCtl} role="group" aria-labelledby={qtyLabelId}>
            <button
              type="button"
              style={qtyBtn}
              aria-label={sx(lang, "browse.mod.a11y.less")}
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span style={qtyNum}>{qty}</span>
            <button
              type="button"
              style={qtyBtn}
              aria-label={sx(lang, "browse.mod.a11y.more")}
              disabled={qty >= 9}
              onClick={() => setQty((q) => Math.min(9, q + 1))}
            >
              +
            </button>
          </div>
        </div>

        <label style={legend} htmlFor="staff-mod-note">
          <Chrome lang={lang} k="browse.mod.note" echo="stack" />
        </label>
        <input
          id="staff-mod-note"
          style={noteInput}
          value={notes}
          maxLength={160}
          autoComplete="off"
          placeholder={ts(lang, "browse.mod.notePlaceholder")}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button
          type="button"
          style={valid && !pending ? cta : ctaDisabled}
          disabled={!valid || pending}
          onClick={() =>
            onAdd({
              modifierIds: selectedIds(groups, sel),
              qty,
              notes: notes.trim() || undefined,
            })
          }
        >
          {/* The money slot stays Latin and <Chrome> marks it lang="en" inside the Burmese run.
              Presentation only — `previewCents` is unchanged, and the server re-derives the price. */}
          {pending ? (
            <Chrome lang={lang} k="browse.mod.adding" echo="stack" />
          ) : (
            <Chrome
              lang={lang}
              k="browse.mod.add"
              vars={{ m: `$${(previewCents / 100).toFixed(2)}` }}
              echo="stack"
            />
          )}
        </button>
        {!valid && (
          <p style={hint}>
            <Chrome lang={lang} k="browse.mod.pickRequired" echo="stack" />
          </p>
        )}
        {/* The sheet's ONE live region — the add refusal must be readable OVER the scrim. No `lang`
            on the region: a server sentence is English, and both renderers mark their own output. */}
        <p role="status" style={error ? errLine : srOnlyLine}>
          {error === null ? (
            ""
          ) : typeof error === "string" ? (
            // ⚠️ VERBATIM, not through <OutageText>. The only producer of the bare-string arm is the
            // KIOSK (`KioskMenu` passes `t(lang, "somethingWrong")`), which has already localized
            // it with its own dictionary — and this prop's docblock promises exactly that. Routing
            // it through the swapper would identity-match a caller's own sentence against
            // STAFF_WRITE_OUTAGE and replace it with the staff twin; it does not today only because
            // this component defaults `lang` to "en" and the swap is gated on "my".
            <>{error}</>
          ) : error.kind === "server" ? (
            <OutageText lang={lang} error={error.message} />
          ) : (
            <Chrome lang={lang} k="browse.add.failed" />
          )}
        </p>
      </div>
    </Sheet>
  );
}

const body: CSSProperties = { display: "grid", gap: "var(--s4)", padding: "var(--s4)" };
const groupBox: CSSProperties = { border: "none", margin: 0, padding: 0 };
const legend: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--tx)",
  padding: 0,
  marginBottom: "var(--s2)",
};
const reqTag: CSSProperties = { color: "var(--ac-strong)", fontWeight: 600 };
const optTag: CSSProperties = { color: "var(--t3)", fontWeight: 400 };
const optList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--s2)" };
const optBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--s2)",
  cursor: "pointer",
};
const optBtnOn: CSSProperties = {
  ...optBtn,
  borderColor: "var(--ac)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 700,
};
const delta: CSSProperties = { fontSize: "var(--fs-xs)", opacity: 0.85 };
const qtyRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const qtyCtl: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "var(--s3)" };
const qtyBtn: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-h3)",
  cursor: "pointer",
};
const qtyNum: CSSProperties = { minWidth: 24, textAlign: "center", fontWeight: 800 };
const noteInput: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const cta: CSSProperties = {
  minHeight: 52,
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 800,
  cursor: "pointer",
};
const ctaDisabled: CSSProperties = { ...cta, opacity: 0.5, cursor: "default" };
const hint: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 };
const errLine: CSSProperties = { color: "var(--warn)", fontSize: "var(--fs-sm)", margin: 0 };
const srOnlyLine: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
