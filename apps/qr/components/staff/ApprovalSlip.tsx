"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { Button, Icon } from "@mms/ui";
import type { Approver } from "@/lib/voids";
import { eligibleApprovers, preselectApprover, zeroEligibleReason } from "@/lib/approvers";
import { Chrome } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";

/**
 * PD8 · m8 — THE ONE SLIP: "Thiri → Aye", then "Aye, your PIN". One component, so the asker's sheet,
 * the request card and the pane print the same thing (a boarding pass: origin → destination, and the
 * PIN is the signature, not an "are you sure?").
 *
 *   · The asker token reuses the shipped "{x} က တောင်းထား / from {x}" — both ends read one sentence.
 *   · The tiles list ONLY the people who can sign (`eligibleApprovers`, pure, mutated): an active
 *     manager or owner with a tablet PIN, never the asker (except a CLOSE, where the asker may).
 *     Exactly one eligible arrives lit; two or more arrive with none lit (a pre-lit wrong name spends
 *     someone else's lockout). The lit tile wears the console's ONE cap (`.staff-chip[aria-pressed]`).
 *   · The PIN field is labelled with the person — "Aye, your PIN" — once a name is lit; the shipped
 *     "PIN" otherwise. It is READ-ONLY under a lockout, never disabled (§17).
 *   · Zero eligible says one of the two TRUE sentences (never "none are signed in"): the asker is the
 *     only signer here, or no manager has a tablet PIN yet — on plain ground, no flag, no warn fill
 *     (appendix B8). A roster that could not be READ says so, with Try again — never "nobody".
 *
 * The slip is presentational; the parent owns the lit id (`litApproverId` below) and the PIN, and
 * decides what the submit does. It mounts NO live region: the caller's one region speaks.
 */

/** The signers for THIS request, from the roster — null while the roster is still loading. */
export function signersFor(
  roster: Approver[] | null,
  askerStaffId: string,
  selfAllowed = false,
): Approver[] | null {
  return roster === null ? null : eligibleApprovers(roster, askerStaffId, { selfAllowed });
}

/** The lit tile: the person's own pick while it is still eligible, else the one-eligible preselect. */
export function litApproverId(chosen: string, eligible: Approver[] | null): string {
  if (eligible === null) return "";
  if (chosen !== "" && eligible.some((e) => e.staffId === chosen)) return chosen;
  return preselectApprover(eligible);
}

/** Why nobody can sign — one of the two true sentences — or null while someone can. */
export function zeroReasonFor(
  roster: Approver[] | null,
  askerStaffId: string,
  selfAllowed = false,
): { kind: "only_self"; name: string } | { kind: "no_pin" } | null {
  if (roster === null) return null;
  if (eligibleApprovers(roster, askerStaffId, { selfAllowed }).length > 0) return null;
  // With self allowed the asker IS a signer when they have a PIN, so an empty list means no PIN.
  return selfAllowed ? { kind: "no_pin" } : zeroEligibleReason(roster, askerStaffId);
}

/** The kind mark — a minus-square for Remove, the gift disc for Make it free — beside its word; it
 *  is decorative (the word carries the kind), so a check never means an approval. */
export function KindMark({
  kind,
  size = "md",
}: {
  kind: "void" | "comp";
  size?: "sm" | "md" | "lg";
}) {
  const cls = `appr-mark ${size === "sm" ? "appr-mark-sm" : size === "lg" ? "appr-mark-lg" : ""} ${
    kind === "void" ? "appr-mark-remove" : "appr-mark-free"
  }`;
  return (
    <span className={cls} aria-hidden>
      {kind === "comp" && <Icon name="gift" size={size === "sm" ? 11 : size === "lg" ? 18 : 16} />}
    </span>
  );
}

/** The first letter of a display name, for the initial discs. */
function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "";
}
const LATIN = /[A-Za-z0-9]/;

export function ApprovalSlip({
  idPrefix,
  askerName,
  eligible,
  zero,
  zeroTail,
  rosterFailed = false,
  retrying = false,
  onRetry,
  lit,
  onPick,
  pin,
  onPinChange,
  locked,
  pinRef,
  firstTileRef,
}: {
  idPrefix: string;
  /** The asker's display name, verbatim (the signed-in account, or the request's initiator). */
  askerName: string;
  /** The signers (`signersFor`); null while the roster loads. */
  eligible: Approver[] | null;
  /** Why nobody can sign (`zeroReasonFor`); null while someone can. */
  zero: { kind: "only_self"; name: string } | { kind: "no_pin" } | null;
  /** The sentence after a zero-eligible reason (the sheet's "Send it to Open requests…"). */
  zeroTail?: ReactNode;
  rosterFailed?: boolean;
  retrying?: boolean;
  onRetry?: () => Promise<boolean>;
  /** The lit tile's id (`litApproverId`), or "" when none is lit. */
  lit: string;
  onPick: (staffId: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  locked: boolean;
  pinRef?: Ref<HTMLInputElement>;
  firstTileRef?: Ref<HTMLButtonElement>;
}) {
  const lang = useStaffLang();
  const legendId = useId();
  const litName = eligible?.find((e) => e.staffId === lit)?.displayName ?? null;
  const loading = !rosterFailed && eligible === null;
  const showTiles = !rosterFailed && eligible !== null && eligible.length > 0;
  // Codex r1 follow-up on #310 (V2), kept from the shipped fields — a recovery (a Try again's answer,
  // or a late one) unmounts the Try again under whatever focus it holds: when focus was ON it as it
  // left, the spoken next step takes it — the PIN once a name is lit, else the first tile. Focus
  // the person put anywhere else is never taken. The ref cleanup reads `activeElement` BEFORE the
  // node is removed, which is the only moment the fact can be read.
  const retryHadFocus = useRef(false);
  const retryBox = useCallback((el: HTMLDivElement | null) => {
    if (el === null) return;
    return () => {
      retryHadFocus.current = el.contains(document.activeElement);
    };
  }, []);
  const pinNode = useRef<HTMLInputElement | null>(null);
  const tileNode = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (rosterFailed || !retryHadFocus.current) return;
    retryHadFocus.current = false;
    (litName !== null ? pinNode.current : tileNode.current)?.focus({ preventScroll: true });
  }, [rosterFailed, litName]);

  return (
    <fieldset className="appr-slip" style={fieldset}>
      <legend id={legendId} className="appr-slip-legend">
        <Chrome lang={lang} k="table.loss.managerLegend" echo="inline" />
      </legend>
      <div className="appr-slip-names">
        {/* The asker token: plain text (D4 — the signed-in account, no asker-by-PIN seam). */}
        <div className="appr-slip-asker">
          <span className="appr-initial" aria-hidden>
            {initialOf(askerName)}
          </span>
          <span className="appr-slip-asker-words">
            <Chrome lang={lang} k="table.appr.from" vars={{ x: askerName }} echo="stack" />
          </span>
        </div>
        <span className="appr-slip-arrow" aria-hidden>
          →
        </span>
        {loading && (
          <div className="appr-slip-tiles" aria-busy>
            <span className="appr-tile appr-tile-skeleton" aria-hidden />
            <span className="appr-tile appr-tile-skeleton" aria-hidden />
            <span className="sr-only">
              <Chrome lang={lang} k="pin.manager.loading" />
            </span>
          </div>
        )}
        {showTiles && (
          // `role="group"` named by the legend: the tiles are an aria-pressed set, one lit at most.
          <div role="group" aria-labelledby={legendId} className="appr-slip-tiles">
            {eligible!.map((a, i) => {
              const on = a.staffId === lit;
              return (
                <button
                  key={a.staffId}
                  ref={(el) => {
                    if (i === 0) {
                      tileNode.current = el;
                      if (typeof firstTileRef === "function") firstTileRef(el);
                      else if (firstTileRef) firstTileRef.current = el;
                    }
                  }}
                  type="button"
                  className="staff-btn staff-chip appr-tile"
                  aria-pressed={on}
                  onClick={() => onPick(a.staffId)}
                >
                  <span className="appr-initial" aria-hidden>
                    {initialOf(a.displayName)}
                  </span>
                  {/* A Latin name inside a Burmese run is marked, as <Chrome> marks a slot. */}
                  <span lang={LATIN.test(a.displayName) ? "en" : undefined}>{a.displayName}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {rosterFailed && (
        // The list could not be READ — said as that, never as "nobody can sign" (W10b).
        <div ref={retryBox} className="appr-slip-inset" data-roster-failed="">
          <p style={noteCopy}>
            <Chrome lang={lang} k="pin.manager.loadFailed" echo="stack" />
          </p>
          {onRetry && (
            <div style={{ marginTop: 8 }}>
              <Button
                type="button"
                variant="secondary"
                block
                busy={retrying}
                busyLabel={<Chrome lang={lang} k="out.shell.retrying" />}
                onClick={() => void onRetry()}
              >
                <Chrome lang={lang} k="out.shell.retry" echo="stack" />
              </Button>
            </div>
          )}
        </div>
      )}
      {zero && !rosterFailed && (
        // Zero eligible: plain --sf ground, --tx/--t2 ink, no flag and no warn fill (B8).
        <div className="appr-slip-inset" data-zero-eligible={zero.kind}>
          <p style={noteCopy}>
            {zero.kind === "only_self" ? (
              <Chrome lang={lang} k="pin.onlySelf" vars={{ x: zero.name }} echo="stack" />
            ) : (
              <Chrome lang={lang} k="pin.noPinHere" echo="stack" />
            )}
          </p>
          {zeroTail && <p style={{ ...noteCopy, marginTop: 6 }}>{zeroTail}</p>}
        </div>
      )}
      {(showTiles || loading) && (
        <div className="appr-slip-pin">
          <label htmlFor={`${idPrefix}-pin`} className="appr-slip-pin-label">
            {litName !== null ? (
              <Chrome lang={lang} k="pin.yourPin" vars={{ x: litName }} echo="stack" />
            ) : (
              <Chrome lang={lang} k="pin.label" echo="stack" />
            )}
          </label>
          <input
            ref={(el) => {
              pinNode.current = el;
              if (typeof pinRef === "function") pinRef(el);
              else if (pinRef) pinRef.current = el;
            }}
            id={`${idPrefix}-pin`}
            className="appr-slip-pin-field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => onPinChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="••••"
            // §17 — a lockout makes the field READ-ONLY, never disabled: the refused submit just
            // moved focus into it, and a disabled field drops that focus to <body>.
            readOnly={locked}
          />
        </div>
      )}
    </fieldset>
  );
}

const fieldset: CSSProperties = { border: "none", padding: 0, margin: 0, minInlineSize: 0 };
const noteCopy: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
