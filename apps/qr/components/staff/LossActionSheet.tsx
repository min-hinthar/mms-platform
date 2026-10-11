"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Icon, Sheet } from "@mms/ui";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { useResaid } from "./useResaid";
import { listApprovers, voidLine, type VoidLineResult } from "@/lib/voids";
import { requestApproval } from "@/lib/approvals";
import { boundWrite, ownWaitSlot, stalledSince, tapRefusal } from "@/lib/bounded-write";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import type { TableLineView } from "@/lib/floor-types";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { padDishName } from "@/lib/order-pad";
import {
  PIN_NO_PIN_COPY,
  pinFailureCopy,
  useApproverRoster,
  useLockout,
  useRosterRegion,
} from "./ManagerPinStepUp";
import { ApprovalSlip, KindMark, litApproverId, signersFor, zeroReasonFor } from "./ApprovalSlip";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { ReloadButton } from "./ReloadOffer";
import { useStaffLang } from "./StaffLangProvider";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Action = "void" | "comp";
type Reason =
  | "mistake"
  | "kitchen_error"
  | "sold_out"
  | "quality"
  | "guest_request"
  | "service_recovery"
  | "other";

// Reason codes per action (the SQL audit only length-bounds the code; these are the offered set).
// P2 — the DB `value` is the audit record and never moves; only `k` (what the button says) is
// localized. `quality` and `other` share one key across both actions because they share one label;
// `guest_request` does NOT — void reads "Guest changed their mind", comp reads "Guest courtesy" —
// so the two arms deliberately name different keys for the same code.
// PD8 (m8 decision 6) — ONE chip says what AND why: every chip wears its column's kind mark, so
// the two "Quality / guest unhappy" and the two "Other" chips never look alike.
const REASONS: Record<Action, { value: Reason; k: StaffKey }[]> = {
  void: [
    { value: "mistake", k: "table.loss.reason.mistake" },
    { value: "kitchen_error", k: "table.loss.reason.kitchenError" },
    // W23a — the dine-in twin of the refund's "We ran out". A dine-in 86 costs nothing (the line is
    // voided before settle, no money moved), which is exactly why it has to be COUNTED — otherwise
    // the cheapest recovery is also the most invisible one.
    { value: "sold_out", k: "table.loss.reason.soldOut" },
    { value: "quality", k: "table.loss.reason.quality" },
    { value: "guest_request", k: "table.loss.reason.guestChanged" },
    { value: "other", k: "table.loss.reason.other" },
  ],
  comp: [
    { value: "service_recovery", k: "table.loss.reason.serviceRecovery" },
    { value: "quality", k: "table.loss.reason.quality" },
    { value: "guest_request", k: "table.loss.reason.guestCourtesy" },
    { value: "other", k: "table.loss.reason.other" },
  ],
};

// The per-action chrome, keyed off the SAME `Action` union the write uses — so a third action could
// never render a label the server does not know about. Separate keys per tongue-order reason: the
// verb sits in a different place in Burmese (SOV), which one shared `{x}` template cannot express.
const SEG_KEY: Record<Action, StaffKey> = {
  void: "table.loss.seg.void",
  comp: "table.loss.seg.comp",
};
const HINT_KEY: Record<Action, StaffKey> = {
  void: "table.loss.hint.void",
  comp: "table.loss.hint.comp",
};
const CONFIRM_KEY: Record<Action, StaffKey> = {
  void: "table.loss.confirm.void",
  comp: "table.loss.confirm.comp",
};
const CONFIRM_APPROVAL_KEY: Record<Action, StaffKey> = {
  void: "table.loss.confirmApproval.void",
  comp: "table.loss.confirmApproval.comp",
};
const REQUEST_KEY: Record<Action, StaffKey> = {
  void: "table.loss.requestApproval.void",
  comp: "table.loss.requestApproval.comp",
};
const TITLE_KEY: Record<Action, StaffKey> = {
  void: "table.loss.title.void",
  comp: "table.loss.title.comp",
};

/** Phase 2h — the sentences that say "reload the page": the region says them, and the ONE reload
 *  control sits beside the region (the console is installed standalone — no browser reload). */
const RELOAD_SAYS: ReadonlySet<StaffKey> = new Set<StaffKey>([
  "out.stalled",
  "table.loss.msg.waiting",
  "table.loss.msg.requestWaiting",
]);

/**
 * The loss action (S2.3): void (cancel + remove) or comp (free, kitchen still makes it) a fired line, with
 * the manager-PIN step-up when the server requires it. The loss gate is SERVER-authoritative — this sheet
 * shows the PIN step up-front for the clearly-gated cases (a comp, or a cooked line) and otherwise submits
 * solo, revealing the step-up only if the server returns `needs_pin` (e.g. an over-ceiling uncooked void).
 *
 * PD8 · m8 — the asker's sheet: one chip picks what AND why (each with its column's kind mark), the
 * consequence hint lives in the grid's reserved foot, and the step-up is THE ONE SLIP ("Thiri → Aye",
 * then "Aye, your PIN"): only people who can sign are listed, exactly one eligible arrives lit, and the
 * two true zero-eligible sentences replace the retired "none are signed in right now". The asker is the
 * signed-in account (D4): the roster's `self` row, left out of the signers.
 */
export function LossActionSheet({
  open,
  onOpenChange,
  sessionId,
  line,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  line: TableLineView;
  onDone: (action: Action) => void;
}) {
  const [action, setAction] = useState<Action>("void");
  const [reason, setReason] = useState<Reason | "">("");
  const [reasonInvalid, setReasonInvalid] = useState(false); // S14: inline "pick a reason" validation
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const lang = useStaffLang();
  const { setLockLeft, locked, lockCopy } = useLockout(lang);
  // Phase 2h (9a) — the sheet's `busy` is STATE, set at the tap and cleared in the `finally` around a
  // BOUNDED await — never a transition's `pending`, which does not clear while the Server Action it
  // dispatched is unanswered (Next's per-tab action queue; LEARNINGS #149 · #200). Freed at
  // STAFF_HANG_MS at the latest, on every path; the M82 guard parses for exactly this shape.
  const [busy, setBusy] = useState(false);
  // The tap-time guard: two taps in one frame both read the render before `busy` flipped.
  const inFlight = useRef(false);
  // Critic F12 — THIS sheet's own write went past the bound unanswered and is still out. A re-tap
  // is refused on it directly, not only through the 9d ledger check: it is this sheet's OWN fact,
  // whatever the ledger reads (F12 caught the ledger reading "not stalled" with the wall clock set
  // back mid-hang; it ages on a monotonic clock since Codex r2 B4), so a second write never queues
  // behind the first. It holds the
  // sentence that write SAID at the bound (the void's or the request's — one write is out at a time),
  // because the refusal re-says it, not the tablet's (`tapRefusal`, owner decision); null: none out.
  // Review a (A4) — kept per LINE in the tab's own-wait register, never per mount (the line editor
  // keys every open as a fresh sheet; a re-opened one must still say the write that is out).
  const ownLate = ownWaitSlot<StaffKey | null>(`loss:${line.id}`, null);
  // PD8 — the slip's focus targets: a chip tap on a gated line lands on the PIN (one name lit) or
  // the first tile; a wrong PIN lands back in the emptied field.
  const slipRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const firstTileRef = useRef<HTMLButtonElement>(null);

  // The kitchen has started/finished this line → a void of it (and any comp) is a loss → manager-gated.
  const cooked = line.state === "in_progress" || line.state === "served";
  // Show the PIN step up-front for the obviously-gated cases; an uncooked over-ceiling void escalates via
  // the server's `needs_pin` instead (no ceiling value shipped to the client).
  const gatedUpFront = action === "comp" || cooked;
  const showStepUp = stepUp || gatedUpFront;

  // Load the manager list once on mount. The sheet is MOUNTED only while open (StaffLineEditor gates it),
  // so a fresh mount each open both refetches the roster (a manager added/removed mid-shift is reflected)
  // and resets all transient state via the initial useState values — no setState-in-effect reset needed.
  // A failed read stays an OUTAGE (`roster.failed`), never `[]` — an empty roster would promote the
  // deferred request to primary and tell the server nobody is on shift (Codex round 2 on #308).
  const roster = useApproverRoster(listApprovers);
  const approvers = roster.approvers;
  // Try again on the roster, and the ONE region rule for any recovery (`useRosterRegion`, shared with
  // the no-show sheet): a second failure is said in the region; a recovery — the Try again's answer,
  // or a read that answered after its bound (Codex r1 follow-up on #310, V1) — retires only that
  // sentence, putting back "a manager needs to approve" while the server's step-up is pending.
  const retryRoster = useRosterRegion(roster, msg, setMsg, stepUp);
  // PD8 — the asker is the signed-in account: the roster's `self` row (D4, no asker-by-PIN seam).
  const self = approvers?.find((a) => a.self) ?? null;
  const askerId = self?.staffId ?? "";
  const eligible = signersFor(approvers, askerId);
  const zero = zeroReasonFor(approvers, askerId);
  // Exactly one eligible arrives lit; the person's own tap wins while it is still eligible.
  const lit = litApproverId(approverStaffId, eligible);

  // The reason DERIVED-valid for the current action: when the action toggles, a reason that doesn't apply
  // to it simply reads as unselected (no effect / setState-in-effect needed — it forces a fresh choice).
  const effectiveReason = reason && REASONS[action].some((r) => r.value === reason) ? reason : "";

  const pinOk = pin.length >= 4 && pin.length <= 8;
  // The reason is validated inline on submit (S14), not folded into the disabled gate — a silently-dimmed
  // CTA leaves the server with no idea why. The PIN/manager completeness still gates the button visibly.
  const canSubmit = !locked && !busy && (!showStepUp || (lit !== "" && pinOk));
  // S11 → PD8: nobody here can sign (the two true sentences) → the deferred request is the primary.
  const noManagers = zero !== null;

  /** A chip tap: the action AND the reason in one tap; on a gated line, the slip comes into view. */
  const slipFocusWanted = useRef(false);
  function pickChip(a: Action, r: Reason) {
    setAction(a);
    setReason(r);
    setReasonInvalid(false);
    // The slip may MOUNT on this very tap (a comp chip after a void one), so the focus waits for the
    // render that holds it (the effect below), never the tap's closure.
    if (a === "comp" || cooked || stepUp) slipFocusWanted.current = true;
  }
  useEffect(() => {
    if (!showStepUp || !slipFocusWanted.current) return;
    slipFocusWanted.current = false;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Optional call: jsdom has no scrollIntoView (the SettledToday precedent).
    slipRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    // The PIN once a name is lit; else the first tile; else (the list still loading) the PIN.
    (lit !== "" ? pinRef.current : (firstTileRef.current ?? pinRef.current))?.focus({
      preventScroll: true,
    });
  });

  /**
   * The void/comp's ANSWER — on time, or late (9e: the answer to an attempt the region already said
   * had none yet). A landed one closes through the parent (`onDone`/`onOpenChange` are its state, so
   * a late landing after the sheet closed still lands); a refusal is said in the one region — state,
   * which React drops on an unmounted sheet, so a late refusal is said only while it is open. Every
   * value read here is the TAP's render (the closure), never the one the answer lands in.
   */
  function handleResult(res: VoidLineResult) {
    if (res.ok) {
      onDone(res.action);
      onOpenChange(false);
      return;
    }
    setPin("");
    switch (res.reason) {
      case "needs_pin":
        setStepUp(true);
        setMsg({ k: "pin.needsManager" });
        break;
      case "pin_wrong":
      case "pin_locked":
        setMsg(pinFailureCopy(res, setLockLeft)); // S2-audit S13: shared PIN-failure copy
        pinRef.current?.focus({ preventScroll: true }); // the emptied field takes focus
        break;
      case "pin_no_pin":
        setMsg(PIN_NO_PIN_COPY);
        break;
      case "bad_approver":
        setMsg({ k: "pin.badApprover.self" });
        break;
      case "step_up_rate_limited":
        setMsg({ k: "pin.rateLimited" });
        break;
      case "in_flight":
        setMsg({ k: "table.appr.msg.inFlight" });
        break;
      case "not_open":
        setMsg({ k: "table.loss.msg.notOpen" });
        break;
      case "not_found":
        setMsg({ k: "table.loss.msg.notFound" });
        break;
      case "already":
        // Already voided/comped (a double-tap / a peer beat us) — treat as done so the sheet closes clean.
        onDone(action);
        onOpenChange(false);
        break;
      case "outage":
        // W10b — the action ANSWERED that nothing was voided/comped; the platform is unreachable, not
        // the line or the PIN. (A THROWN action is not this: it may have landed — see `submit`.)
        setMsg(STAFF_WRITE_OUTAGE);
        break;
      default:
        setMsg({ k: "table.loss.msg.failed" });
    }
  }

  /** The approval request's answer — on time or late, the same rule as `handleResult`. */
  function handleRequest(res: Awaited<ReturnType<typeof requestApproval>>) {
    if (res.ok) {
      onDone(action);
      onOpenChange(false);
      return;
    }
    switch (res.reason) {
      case "already_pending":
        setMsg({ k: "table.loss.msg.alreadyPending" });
        break;
      case "no_approval_needed":
        setMsg({
          k: "table.loss.msg.noApprovalNeeded",
          vars: { x: ts(lang, "table.loss.seg.void") },
        });
        break;
      case "in_flight":
        setMsg({ k: "table.appr.msg.inFlight" });
        break;
      case "not_open":
        setMsg({ k: "table.loss.msg.notOpen" });
        break;
      case "not_found":
        setMsg({ k: "table.loss.msg.notFound" });
        break;
      case "outage":
        // W10b — the request ANSWERED that it wasn't recorded; the platform is unreachable.
        setMsg(STAFF_WRITE_OUTAGE);
        break;
      default:
        setMsg({ k: "table.loss.msg.sendFailed" });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    if (!effectiveReason) {
      setReasonInvalid(true); // S14: tell them what's missing instead of a dead, dimmed button
      setMsg({ k: "table.loss.reasonRequired" });
      return;
    }
    if (!canSubmit) return; // §17 — the button says so with `aria-disabled`; the refusal is here
    // Phase 2h (9d) — a loss is refused AT THE TAP, never dispatched, while any action on this tab
    // has gone STAFF_HANG_MS without an answer (Next would only queue it behind that one — and the
    // void spends a manager's PIN attempt when it finally runs). Read now, never from render state.
    // Owner decision: while THIS sheet's own write is still out past the bound, the refusal re-says
    // ITS sentence ("Don't do it again"), never the tablet's "this did nothing" (`tapRefusal`).
    const refused = tapRefusal(ownLate.current, stalledSince(), "out.stalled");
    if (refused !== null) {
      setMsg({ k: refused });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      // 9b — called OUTSIDE any transition and awaited BOUNDED, the RAW action promise handed over.
      const out = await boundWrite(
        voidLine({
          sessionId,
          cartItemId: line.id,
          action,
          reason: effectiveReason,
          ...(showStepUp ? { approverStaffId: lit, pin } : {}),
        }),
      );
      if (out.kind === "answer") {
        handleResult(out.value);
        return;
      }
      // Sent either way (critic F4): `voidLine` spends the manager's attempt BEFORE the RPC, so a PIN
      // whose verdict was lost must not stay to be re-sent toward the floor-wide lockout — the
      // refund and no-show sheets empty theirs on the same two arms.
      setPin("");
      if (out.kind === "threw") {
        // ⚠️ A REJECTED action — offline, a version skew after a deploy, a response lost after the
        // RPC committed — may have landed: "couldn't confirm", never "wasn't saved" (9e). It used to
        // say the write-outage sentence, which claims nothing was voided.
        setMsg({ k: "table.loss.msg.unknown" });
        return;
      }
      // 9e — no answer yet: it may still be recorded; the late answer is applied when it arrives.
      setMsg({ k: "table.loss.msg.waiting" });
      ownLate.current = "table.loss.msg.waiting";
      void out.late.then((late) => {
        ownLate.current = null;
        if (late.kind === "answer") handleResult(late.value);
        else setMsg({ k: "table.loss.msg.unknown" });
      });
    } finally {
      inFlight.current = false;
      setBusy(false); // frees AT THE BOUND on every path — the M82 guard parses for it
    }
  }

  // Deferred path (S2.4): no manager at hand → request approval (no PIN). The line stays live until a
  // manager resolves it from the queue. Needs a reason (for the audit), not a manager/PIN.
  async function submitRequest() {
    if (inFlight.current || busy || locked) return; // §17 — the buttons say so with `aria-disabled`
    if (!effectiveReason) {
      setReasonInvalid(true); // S14: same inline validation on the deferred path
      setMsg({ k: "table.loss.reasonRequired" });
      return;
    }
    // 9d — the request rides the same queue as the loss it asks for; refused while stalled too —
    // and while this sheet's own void or request is still out, in THAT write's words (`tapRefusal`).
    const refused = tapRefusal(ownLate.current, stalledSince(), "out.stalled");
    if (refused !== null) {
      setMsg({ k: refused });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const out = await boundWrite(
        requestApproval({
          sessionId,
          cartItemId: line.id,
          action,
          reason: effectiveReason,
        }),
      );
      if (out.kind === "answer") {
        handleRequest(out.value);
        return;
      }
      if (out.kind === "threw") {
        // A rejected transport may have reached the queue: couldn't confirm (an `already_pending`
        // on the retry says so if it did).
        setMsg({ k: "table.loss.msg.requestUnknown" });
        return;
      }
      setMsg({ k: "table.loss.msg.requestWaiting" });
      ownLate.current = "table.loss.msg.requestWaiting";
      void out.late.then((late) => {
        ownLate.current = null;
        if (late.kind === "answer") handleRequest(late.value);
        else setMsg({ k: "table.loss.msg.requestUnknown" });
      });
    } finally {
      inFlight.current = false;
      setBusy(false); // the request's lock frees at the bound too
    }
  }

  // The lockout countdown takes precedence over a transient message.
  const shown = lockCopy ?? msg;
  // Critic F1 — every SET of the message (a re-tap's refusal re-says the standing waiting line)
  // replaces the region's content, so the re-said sentence is announced, not swallowed as no change.
  const said = useResaid(msg);
  const reload =
    typeof shown === "object" && shown !== null && "k" in shown && RELOAD_SAYS.has(shown.k);
  const dish = padDishName(lang, line.name, line.nameMy);
  return (
    // M82 — `busy` while a void/comp or an approval request is in flight. This sheet had NO guard at
    // all while its sibling `RefundActionSheet` did, and it is the worse case of the two: `voidLine`
    // runs `verifyStaffPin` BEFORE the RPC, which atomically spends one of the manager's five
    // attempts. A dismissal mid-flight therefore loses the verdict AND the attempt — and the natural
    // response, trying again, walks a manager toward a floor-wide lockout with nothing on screen
    // ever having said why. Phase 2h: `busy` is state cleared in a bounded `finally` (9a), so a
    // hung write frees every exit at STAFF_HANG_MS and the region says "no answer yet" instead.
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      closeLabel={sheetCloseLabel(lang)}
      // manager-6 / P2t — the dictionary's title, marked (`Sheet.title` is a ReactNode). PD8: each
      // tongue takes its own dish name (`varsMy`), and before a chip is lit the title is the dish.
      title={
        effectiveReason ? (
          <Chrome
            lang={lang}
            k={TITLE_KEY[action]}
            vars={{ x: line.name }}
            varsMy={line.nameMy ? { x: line.nameMy } : undefined}
          />
        ) : (
          <>
            <span lang={dish.lead.lang === lang && lang === "en" ? undefined : dish.lead.lang}>
              {dish.lead.text}
            </span>
            {dish.echo && (
              <>
                {" · "}
                <span lang={dish.echo.lang}>{dish.echo.text}</span>
              </>
            )}
          </>
        )
      }
    >
      <form onSubmit={submit} style={{ marginTop: 8 }} noValidate>
        {/* The summary, a receipt row on one baseline: qty × dish · cooked · a leader · the price. */}
        <p style={lineSummary}>
          <span>
            {line.qty}× {line.name}
          </span>
          {cooked && (
            <span
              style={{ color: "var(--t2)", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Icon name="flame" size={14} aria-hidden />
              <Chrome lang={lang} k="table.loss.cooking" echo="inline" />
            </span>
          )}
          <span className="settle-flag-leader" aria-hidden />
          <span style={price}>{fmt(line.unitPriceCents * line.qty)}</span>
        </p>

        {/* ONE chip = what + why: two columns, each headed by its kind mark and the shipped segment
            word, every chip wearing the column's mark at 18px. `aria-pressed` buttons (the app's
            segmented-control convention), the lit one on the console's ONE cap through the shared
            `.staff-chip[aria-pressed]` rule — never an inline fill. */}
        <div role="group" aria-label={sx(lang, "table.loss.a11y.action")} className="loss-grid">
          {(["void", "comp"] as Action[]).map((a) => (
            <div key={a}>
              <div id={`loss-col-${a}`} className="loss-col-head">
                <KindMark kind={a} size="md" />
                <Chrome lang={lang} k={SEG_KEY[a]} echo="stack" />
              </div>
              <div
                role="group"
                aria-labelledby={`loss-col-${a}`}
                aria-describedby={
                  effectiveReason ? "loss-hint" : reasonInvalid ? "loss-reason-err" : undefined
                }
                className="loss-chips"
              >
                {REASONS[a].map((r) => {
                  const on = action === a && effectiveReason === r.value;
                  return (
                    <button
                      className="staff-btn staff-chip staff-chip-block loss-chip"
                      key={`${a}-${r.value}`}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickChip(a, r.value)}
                    >
                      <KindMark kind={a} size="sm" />
                      <Chrome lang={lang} k={r.k} echo="stack" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* THE CONSEQUENCE HINT — reserved at all times so nothing jumps when it fills (decision 7). */}
        <p id="loss-hint" className="loss-hint">
          {effectiveReason && <Chrome lang={lang} k={HINT_KEY[action]} echo="stack" />}
        </p>
        {reasonInvalid && (
          <p
            id="loss-reason-err"
            style={{ margin: "6px 0 0", fontSize: "var(--fs-sm)", color: "var(--warn)" }}
          >
            {/* No echo: this element is the `aria-describedby` target of the reason groups, and a
                computed description is its full text — a pair would say everything twice. */}
            <Chrome lang={lang} k="table.loss.reasonRequired" />
          </p>
        )}

        {/* THE ONE SLIP — shown for a comp / cooked void up-front, or after the server asks for it. */}
        {showStepUp && (
          <div ref={slipRef} style={{ marginTop: 12 }}>
            <ApprovalSlip
              idPrefix="loss"
              askerName={self?.displayName ?? ""}
              eligible={eligible}
              zero={zero}
              zeroTail={<Chrome lang={lang} k="pin.sendToQueue" echo="stack" />}
              rosterFailed={roster.failed}
              retrying={roster.retrying}
              onRetry={retryRoster}
              lit={lit}
              onPick={(id) => {
                setApproverStaffId(id);
                pinRef.current?.focus({ preventScroll: true });
              }}
              pin={pin}
              onPinChange={setPin}
              locked={locked}
              pinRef={pinRef}
              firstTileRef={firstTileRef}
            />
          </div>
        )}

        {/* Nobody here can sign → the deferred request is the primary action (and the secondary is not
            drawn); otherwise the PIN confirm leads and the request is the "no manager?" way out. */}
        {showStepUp && noManagers ? (
          <button
            className="staff-btn"
            type="button"
            onClick={submitRequest}
            aria-disabled={busy || locked || undefined}
            aria-busy={busy || undefined}
            style={{ ...primaryBtn, opacity: busy || locked ? 0.6 : 1 }}
          >
            {busy ? (
              <Chrome lang={lang} k="table.loss.sending" echo="stack" />
            ) : (
              <Chrome lang={lang} k={REQUEST_KEY[action]} echo="stack" />
            )}
          </button>
        ) : (
          <>
            <button
              className="staff-btn"
              type="submit"
              aria-disabled={!canSubmit || undefined}
              aria-busy={busy || undefined}
              style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.6 }}
            >
              {busy ? (
                <Chrome lang={lang} k="table.loss.working" echo="stack" />
              ) : showStepUp ? (
                <Chrome lang={lang} k={CONFIRM_APPROVAL_KEY[action]} echo="stack" />
              ) : (
                <Chrome lang={lang} k={CONFIRM_KEY[action]} echo="stack" />
              )}
            </button>

            {/* Deferred path (S2.4): for gated actions — request a manager's approval without a PIN now.
                The line stays live until a manager resolves it from the queue. */}
            {showStepUp && (
              <button
                className="staff-btn"
                type="button"
                onClick={submitRequest}
                aria-disabled={busy || locked || undefined}
                style={{ ...secondaryBtn, opacity: busy || locked ? 0.6 : 1 }}
              >
                <Chrome lang={lang} k="table.loss.noManager" echo="stack" />
              </button>
            )}
          </>
        )}

        {/* One live region (QA §A): the lockout countdown takes precedence over a transient message. */}
        <p id="loss-msg" role="status" style={{ margin: "12px 0 0", minHeight: 18 }}>
          {shown && (
            <span key={said} style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
              {/* P7·2 — a `pin.*` key renders through <Chrome>; a server sentence passes through
                  <OutageText>, which swaps in the one twin that exists (the rest is P2i). */}
              <MsgText lang={lang} msg={shown} />
            </span>
          )}
        </p>
        {/* Phase 2h — the reload the region's sentence names, BESIDE the region (never inside it:
            no second live role, no <div> in a <p>). */}
        {reload && (
          <div style={reloadRow}>
            <ReloadButton lang={lang} block />
          </div>
        )}
      </form>
    </Sheet>
  );
}

const reloadRow: CSSProperties = { marginTop: "var(--s2)" };
const lineSummary: CSSProperties = {
  margin: "0 0 14px",
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
};
const price: CSSProperties = {
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-heavy)",
  fontVariantNumeric: "tabular-nums",
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 64,
  marginTop: 16,
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const secondaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 54,
  marginTop: 8,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
