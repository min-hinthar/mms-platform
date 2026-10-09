"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { settleCash } from "@/lib/staff-cart";
import {
  boundWrite,
  hasOwnWait,
  ownWaitSlot,
  stalledSince,
  subscribeOwnWait,
  tapRefusal,
} from "@/lib/bounded-write";
import {
  cashSettleBlocked,
  changeAsTipCents,
  openQuote,
  quickCashTenders,
  quoteDrift,
  reconcileQuote,
  tenderState,
  type SettleQuote,
} from "@/lib/register-math";
import { centsToField, noteLabel, parseMoneyCents, sanitizeMoneyInput } from "@/lib/money-input";
import { tipPresets, tipWithinAmountCap } from "@/lib/tip";
import { haptic } from "@/lib/haptics";
import { inFlightMsg, type InFlightHolder } from "@/lib/inflight-refusal";
import type { SettleOutcome } from "@/lib/floor-pane";
import { Button, Sheet, type ButtonVariant } from "@mms/ui";
import { tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { ReloadButton } from "./ReloadOffer";
import { useResaid } from "./useResaid";
import { useReloadHold } from "./useReloadHold";
import { cashTipDraftHeld } from "@/lib/reload-guard";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2c · gate ──
import { settleBlockedMsg } from "@/lib/staff-send-view";
import { ackForTap, reWarning, type PendingFlag } from "@/lib/settle-approvals";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** What the sheet's ONE alert says. `server` is a sentence `settleCash` returned (through
 *  `<OutageText>`); `moved` names both figures — the compare-and-swap refusal, or the page's total
 *  moving off the frozen quote while the sheet is open; `inflight` is the server refusing while money
 *  is already moving on the table, with WHO holds it (P2w — a dictionary key per holder, never the
 *  server's English); `unknown` is a REJECTED action — the response was lost, so the settle may
 *  have landed (P2ab); `unsent` is the settle gate refusing (Phase 2c · gate — dishes the kitchen
 *  never got), with the server's own count. Phase 2h: `waiting` is NO ANSWER YET at the bound — the
 *  settle may still be recorded (9e); `stalled` is a tap refused before anything was sent, because
 *  this tablet is still waiting on an earlier answer (9d). Both offer the reload (`ReloadButton`). */
type SheetError =
  | { kind: "server"; text: string }
  | { kind: "moved"; from: number; to: number }
  | { kind: "inflight"; holder: InFlightHolder }
  | { kind: "unknown" }
  | { kind: "unsent"; units: number }
  // P2el — the gate could not read the lines, so nothing was recorded; the same tap retries.
  | { kind: "unreadable" }
  // PD8 — a request this tap did not display (a re-warning, never a block): the page re-draws the
  // flag card naming it when it can; with no page, the sheet says it and the next tap passes.
  | { kind: "approvalPending"; dish: string }
  // PD8 — the pending read could not be made; nothing recorded, the same tap retries.
  | { kind: "approvalUnreadable" }
  | { kind: "waiting" }
  | { kind: "stalled" };

/** What a settle's answer is read against — every figure captured AT THE TAP, so a late answer
 *  (9e) lands on the attempt the cashier made, never on whatever the sheet shows when it arrives. */
type SettleTap = {
  quoted: number;
  basis: number;
  tenderAtTap: number | null;
  /** PD8 — the pending request ids the trigger DISPLAYED when it was tapped: the acknowledgement. */
  acked: string[];
};

/** What the settle hands UP when a paid card follows (the parent adds `isCounter` and `cartId`). */
export type CashSettled = {
  orderId: string;
  /** The PERSISTED all-in total (tip included) — never the prop, which can be a poll stale. */
  totalCents: number;
  /** The PERSISTED tip. */
  tipCents: number;
  /** What the cashier said was handed over, or null when no tender was entered. Display-only. */
  tenderedCents: number | null;
};

/**
 * Cash settle ("pay a human", S1.3). Two-step confirm showing the authoritative all-in total
 * (POS-priced lines + tax — W16a retired the service charge). The cash tip the cashier types IS
 * recorded (W17c-2: `p_tip_cents`); the charge itself is server-derived — this button never sends
 * an amount. It sends the total the cashier was SHOWN as `quotedCents`, a COMPARE-ONLY figure: the
 * server refuses a settle whose total moved since (Phase 2c · register, the compare-and-swap) and
 * names its own figure, which this sheet then quotes. On success the parent's detail re-reads
 * (`onChanged`) and the paid state renders this control away.
 *
 * K29(b) — the confirm is the shared `Sheet` (manager-3's two-tap shape, on the primitive that owns
 * its four exits, §16): it used to render INLINE at the foot of the column, a 200px scroll below
 * the trigger on a long table. `busy` because the settle is an irreversible write. Two choices the
 * sheet forced, both about what a screen reader hears: a REFUSED settle keeps the sheet open with
 * the reason inside it (closing it would raise the alert under the sheet's own `aria-hidden`
 * during the exit, unannounced); and a LANDED settle UNMOUNTS the sheet instead of closing it — the
 * trigger then reads "Taking payment…", busy, until the paid state re-renders this control away, and
 * when a paid card follows the parent's card takes focus on an un-hidden page rather than mid-exit
 * (M76 — the close animation is why a live sheet cannot simply be left open on success).
 *
 * Phase 2c · register — the cash moment (DESIGN-LANGUAGE §29): quick cash (Exact + three round-ups,
 * `quickCashTenders`), the tender optional on EVERY cash settle (tables pay at this register too),
 * a readout that says Change / Exact / Short (`tenderState`), "Keep the change as tip" as a FILL of
 * the tip field (never a commit), and ONE binding (`cashSettleBlocked`) that Settle's
 * `aria-disabled`, its description and its handler all read. Every action is a `@mms/ui` Button
 * (aria-disabled + aria-busy, never native `disabled`); the chips are `.staff-chip`s wearing the
 * console's one lit cap when pressed.
 */
export function CashSettleButton({
  sessionId,
  totalCents,
  tipBaseCents = null,
  intendedTipCents = null,
  isTab = false,
  handoff = false,
  variant = "primary",
  onSettled,
  onChanged,
  onOutcomeUnknown,
  onSettleOutcome,
  // Named `gateBlocked` inside: `blocked` below is the SHEET's binding (`cashSettleBlocked`).
  blocked: gateBlocked = false,
  blockedNoteId,
  onBlockedTap,
  running = false,
  readTicket = 0,
  readsStarted,
  acknowledgedApprovalIds,
  onApprovalPending,
  totalPending = false,
  describedBy,
}: {
  sessionId: string;
  totalCents: number;
  /** W17c-3 — the tip BASE (subtotal − discount, BEFORE tax) the quick-tip chips offer percentages
   *  against. NOT `totalCents`, which is tax-inclusive: the review's HIGH was that a "20%" chip
   *  computed off the tax-inclusive total charges ~9% more than the identically-labelled chip at
   *  the kiosk. Null when the total is unreadable — the chips simply don't render. */
  tipBaseCents?: number | null;
  /** W17c-3 — what the KIOSK guest chose on their way to the counter. `null` = never asked (every
   *  non-kiosk cart). It PRE-FILLS the field below; the cashier still confirms, because only the
   *  person who takes the money knows what was actually handed over. */
  intendedTipCents?: number | null;
  /** When this table is running a trust tab (S3.1), the cash settle IS the tab close — re-frame the
   *  copy ("Close bill" / "closes the running bill") so the action reads as the deliberate
   *  end-of-night close, not a mid-meal settle. The money path is identical (mms_fulfill_cash_order,
   *  server-reconciled). */
  isTab?: boolean;
  /** W6a (register): a counter order's settle ALWAYS ends with the paid card (#CODE to call out). A
   *  table's settle hands one up only when a tender was entered — the change figure is the one fact
   *  the cashier still needs after the tap (owner decision 7). The parent renders the card OUTSIDE
   *  the open-cart conditional this button lives in (the W6a confirmed HIGH: the detail refresh
   *  unmounts this component seconds after settle). Display-only; the charge stays server-derived. */
  handoff?: boolean;
  /** The settle section's ONE primary is decided by the parent (`settlePrimary`). */
  variant?: Extract<ButtonVariant, "primary" | "secondary">;
  onSettled?: (h: CashSettled) => void;
  /** The parent's own detail refresh (debounced). Replaces a `router.refresh()` that updated nothing
   *  this control reads — the detail lives in `FloorDetailLive`'s state, not the RSC payload. */
  onChanged?: () => void;
  /** Whether a settle's outcome is UNKNOWN right now: `true` when the action rejected (the response
   *  was lost — it may have landed), `false` the moment any later attempt gets an answer. The page
   *  holds a counter order's closed-bounce on it (critic finding: a landed counter settle closes the
   *  session behind it, and the bounce yanked the cashier to the floor mid-sheet). */
  onOutcomeUnknown?: (unknown: boolean) => void;
  /** Phase 2d · review fixes — every refusal (`refused`: nothing recorded) or unknown outcome (the
   *  answer never came) of this control's settle, as it lands. The page says it where this control
   *  cannot: once the detail unmounted mid-settle, this control's own line is gone with it.
   *  Phase 2h · integration — and `landed`: a LATE ok to the attempt this control reported
   *  `unknown` at the bound, so the page can retract what it said off that unknown. */
  onSettleOutcome?: (outcome: SettleOutcome) => void;
  /** Phase 2c · gate — the settle gate holds (`staffSettleBlockedByUnsent`, read by the page from
   *  `detail.send`): the trigger stays rendered with its amount but is `aria-disabled`, described by
   *  the page's note, and a tap opens NOTHING — it hands up (`onBlockedTap`). */
  blocked?: boolean;
  /** The page's note that says why — prepended to the trigger's description while blocked. */
  blockedNoteId?: string;
  /** A refused tap (`null` — the page's own count is the reading), or the server's `unsent` refusal
   *  (its count) once the sheet has closed: the page says why in its one region and moves focus to
   *  the fix (the Send). */
  onBlockedTap?: (units: number | null) => void;
  /** PD8 (PATH_DESIGN decision 4) — the pending approval-request ids the page is showing above this
   *  trigger. Captured at the TAP that opens the sheet and sent with the settle: tapping Take cash
   *  with a flag up IS the acknowledgement. Nothing here is read into an amount. */
  acknowledgedApprovalIds?: readonly string[];
  /** PD8 — the server re-warned (`approval_pending`): a request this tap did not display. The sheet
   *  closes and the page re-draws the flag card with the server's list and says `dishes` — the
   *  ones this tap did NOT acknowledge (`reWarning`); the next tap acknowledges what the card shows.
   *  Omitted (no page): the sheet says them and keeps Take armed. */
  onApprovalPending?: (pending: PendingFlag[], dishes: string) => void;
  /** PD8 — a decision just landed and the page's re-read has not: the trigger reads "Updating the
   *  total…" (busy, full ink — never dimmed) until the server's figure arrives; amounts are never
   *  optimistic. */
  totalPending?: boolean;
  /** PD8 — an id the trigger is described by FIRST (the flag card's consequence sentence). */
  describedBy?: string;
  /** Phase 2c · gate — the bill is a card-on-file running bill (the page's ONE binding,
   *  `settlePrimary(tab) === "secureTab"`): a raced refusal in the sheet says the running bill's
   *  sentence, the one the page's note and region say — never a second sentence for one fact. */
  running?: boolean;
  /** Phase 2c · review (R1) — the page's read clock: the ticket of the detail `totalCents` came
   *  from. A `moved` refusal's figure stands until a read that began AFTER the refusal commits. */
  readTicket?: number;
  /** The last detail read STARTED (the page's ref) — called when a refusal lands, never in render:
   *  a read already in the air then may predate the move, so it cannot settle the refusal. */
  readsStarted?: () => number;
}) {
  const lang = useStaffLang();
  const [confirming, setConfirming] = useState(false);
  // Phase 2h (9a) — the sheet's `busy` is STATE, set at the tap and cleared in the `finally` around a
  // BOUNDED await — never a transition's `pending`. Inside a modal sheet every exit is refused while
  // `busy` holds, behind a trapped focus scope, so a flag that does not clear is a keyboard trap —
  // and a transition's `pending` does not clear while the Server Action it dispatched is unanswered
  // (Next queues actions one per tab and the router's update shares the transition's lane; measured
  // in Chromium, LEARNINGS #149 · #200), whatever bound the callback races. `boundWrite` resolves at
  // STAFF_HANG_MS at the latest, so this frees at the bound on every path (the M82 guard parses for
  // exactly this shape). Calling the action OUTSIDE any transition also takes this sheet out of
  // React's global async-action scope, which would otherwise hold every other transition and every
  // router commit on the tab while a settle hangs.
  const [busy, setBusy] = useState(false);
  // The tap-time guard (a REF, read when the finger lands): `busy` is state, and two taps inside
  // one frame both read the render before it flipped.
  const inFlight = useRef(false);
  // Critic F12 — THIS sheet's own write went past the bound unanswered and is still out. A re-tap
  // is refused on it directly, not only through the 9d ledger check: it is this sheet's OWN fact,
  // whatever the ledger reads (F12 caught the ledger reading "not stalled" with the wall clock set
  // back mid-hang; it ages on a monotonic clock since Codex r2 B4), so a second write never queues
  // behind the first. The refusal it drives re-says the sheet's OWN waiting sentence, not the
  // tablet's (`tapRefusal`, in `confirm`).
  // Review a (A4) — kept per CART in the tab's own-wait register, never per mount: the detail this
  // control lives in can unmount and come back while the settle is still in Next's queue.
  const ownWaitKey = `cash:${sessionId}`;
  const ownLate = ownWaitSlot(ownWaitKey, false);
  // Review a (A1) — the same wait, READ BY RENDER: while this cart's own settle is out past the bound
  // the trigger is HELD and the waiting sentence stands under it (its siblings' shape —
  // CloseSecureTabButton's `held`, TerminalSettle's `waiting`). Without it, closing the waiting sheet
  // put the neutral hint back and a reopen offered a clean "Take $X" over a payment that may already
  // be recorded. Subscribed, so a remount holds too and the late answer frees it wherever it lands.
  const ownWaiting = useSyncExternalStore(
    subscribeOwnWait,
    () => hasOwnWait(ownWaitKey),
    () => false,
  );
  // The settle landed: the sheet is unmounted (see the render) and the trigger goes busy until the
  // paid state re-renders this control away. When a PAID CARD follows, the close-restore must not
  // fight the parent for focus (it focuses the card, `FloorDetailLive`'s own effect); a ref beside
  // the state because the restore runs from the unmounting sheet's effect cleanup.
  const [landed, setLanded] = useState(false);
  const handoffLandedRef = useRef(false);
  const [error, setError] = useState<SheetError | null>(null);
  // Critic F2 — a LATE word (refusal or throw) that landed while the sheet was CLOSED: the waiting
  // arm freed the exits, so the cashier may have closed it, and the page says nothing while this
  // detail is mounted (its hand-up speaks for an UNMOUNTED one). Unread, it is said under the
  // trigger and carried into the next open's alert — never wiped by that reopen. `sheetOpen` is
  // the sheet's state as of the last commit, for an answer that lands in a later render.
  const [lateUnseen, setLateUnseen] = useState(false);
  const sheetOpen = useRef(false);
  // Codex round 1 on #310 (CX3) — a tap on the HELD trigger (its own settle still out past the
  // bound). A fresh object per tap: `useResaid` keys the held-tap alert's content with it, so every
  // refused tap is announced again — never a dead tap under a line that is only a description.
  const [heldTap, setHeldTap] = useState<object | null>(null);
  const heldSaid = useResaid(heldTap);
  useEffect(() => {
    sheetOpen.current = confirming;
  }, [confirming]);
  // The QUOTE (lib/register-math `SettleQuote`) — frozen when the sheet OPENS, so every figure in it
  // (the question, the chips, the readout, Settle's label, the `quotedCents` the tap sends) is the
  // figure the cashier READ, never the prop the page's ~0.4s re-read keeps moving under an open
  // sheet (the critic's finding: "Change $7.90" became "Change $3.90" in silence, after the $7.90 was
  // handed back). A server `moved` refusal replaces it with the server's figure.
  const [quote, setQuote] = useState<SettleQuote | null>(null);
  // Render-time adjustment (React's guarded set-during-render, as FloorDetailLive's `seenDetail`):
  // the page caught up with the server's figure, so a later move BACK reads as the move it is.
  // Phase 2c · review (R1) — and a read that began after a refusal settles the refusal's figure.
  const reconciled = reconcileQuote(quote, totalCents, readTicket);
  // Codex round 2 (P2) — the tip base the percentage chips read is frozen WITH the quote: a
  // subtotal or discount moving under an open sheet must not move "20% · $8.42" while every other
  // figure holds. It follows the prop only where the quote itself moves (open, adopt, reconcile).
  const [tipBaseAtOpen, setTipBaseAtOpen] = useState<number | null>(tipBaseCents);
  if (reconciled !== quote) {
    setQuote(reconciled);
    setTipBaseAtOpen(tipBaseCents);
  }
  const shownTipBase = confirming ? tipBaseAtOpen : tipBaseCents;
  // Closed, it is the figure the sheet WOULD open on (the trigger's label); open, the frozen one.
  const shownTotal = (confirming && reconciled ? reconciled : openQuote(reconciled, totalCents))
    .cents;
  // The page's total moved off the quote while the sheet is open: said in the sheet's one alert,
  // naming both figures, and the next tap ADOPTS the new figure (it records nothing).
  const drift = confirming ? quoteDrift(reconciled, totalCents) : null;
  const [tendered, setTendered] = useState("");
  // W17c-2 — the cash tip the cashier was handed. Unlike every other amount in this app it IS typed
  // by a human, because nothing on the server can derive it: only the person who took the cash knows
  // what was left. It is bounded by Zod (0..100000) and by the qr_orders_tip_cents_nonneg CHECK.
  // Pre-filled from the guest's kiosk choice when there was one. `null` (never asked) leaves the
  // field empty rather than typing a 0 that would read as an answer nobody gave.
  const [tip, setTip] = useState(intendedTipCents != null ? centsToField(intendedTipCents) : "");
  // W21d (Codex P1 on #184) — the kiosk intent can arrive AFTER this control mounts (staff opens
  // the order before the guest answers the prompt; the realtime/5s refresh updates the prop, but a
  // useState initializer never re-runs). Sync the first non-null intent into the field UNLESS the
  // cashier already typed — their hands beat the wire, and a sync must never overwrite a human.
  const tipTouched = useRef(false);
  // Phase 2c · Codex round 1 (P1) — the intent is FROZEN with the quote while the sheet is open: a
  // tip arriving by realtime after the cashier read "Take $X · Change $Y" would otherwise re-quote
  // the due, the quick cash and the change under their hands, and the tap would record a tip they
  // never saw. It is picked up when the sheet closes (the next open quotes it).
  const [intentShown, setIntentShown] = useState(intendedTipCents);
  // A render-time adjustment (never an effect's synchronous setState): closed, the shown intent
  // follows the prop; open, it holds.
  if (!confirming && intentShown !== intendedTipCents) setIntentShown(intendedTipCents);
  useEffect(() => {
    if (confirming) return;
    if (intendedTipCents != null && !tipTouched.current) setTip(centsToField(intendedTipCents));
  }, [intendedTipCents, confirming]);
  // Codex r3 on #311 (CX14) — the tip is KEPT when the sheet closes (see the trigger's tap), so a
  // reload for a new version would erase it: the field re-mounts at the kiosk intent (the PROP, not
  // the intent frozen under an open sheet) or empty. Held as a `draft` while what the cashier typed
  // is a different tip from that, until the settle lands (then the tip is recorded).
  useReloadHold("unsent", "draft", "cashTip", !landed && cashTipDraftHeld(tip, intendedTipCents));
  // W21d (Codex P1 on #183, then its P2 on #193) — commas are AMBIGUOUS: "5,00" is a decimal
  // comma, "1,234.56" is US grouping. Phase 2a moved that rule to `lib/money-input`, and moved it
  // OUT OF THE KEYSTROKE: judged per key, "5," had no digits after the comma yet, so the comma was
  // deleted as grouping and "5,00" typed key by key recorded a $500 tip. The field now only refuses
  // characters (`sanitizeMoneyInput`); the comma is decided on the whole string when it is read
  // (`parseMoneyCents`), in integer cents — no float × 100.
  const tipParsed = parseMoneyCents(tip);
  const tipCents = tipParsed ?? 0;
  // A null read WITH a digit in it is more than seven whole-dollar digits — past any cap, so it is
  // refused as over the cap, never read as a zero tip. Digit-free text ("", ".", ",") is no tip.
  const tipOverlong = tipParsed == null && /\d/.test(tip);
  // What the cashier actually collects. Everything below — the confirm question, the chips, the
  // readout, the settle button — reads THIS, so none of them can quote a pre-tip figure while another
  // quotes the tipped one.
  const dueCents = shownTotal + tipCents;
  // Cashier arithmetic only — parsed to cents, never sent anywhere (the tender is not recorded).
  const tenderedCents = parseMoneyCents(tendered);
  const tender = tenderState(dueCents, tenderedCents);
  const keepCents = changeAsTipCents(shownTotal, tenderedCents, tipCents);
  // A tip is already typed: "Keep the change" names the tip the tap makes, not the change alone.
  const keepNamesTip = tipCents > 0;
  // §22 — the ONE binding: Settle's aria-disabled, its aria-describedby and `confirm` read it.
  const blocked = cashSettleBlocked(tipOverlong ? null : tipCents, tender);
  const tipValid = blocked !== "tipCap";
  const canSettle = !busy && blocked === null;
  // `.mms-pop` on the change figure only when a CHIP filled the field (typing never pops): the key
  // changes per chip tap, so the dd remounts and plays once.
  const [chipPop, setChipPop] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // PD8 — the pending request ids the trigger displayed at the tap that opened the sheet.
  const ackedAtTap = useRef<string[]>([]);
  // The blind pass on #333 — with NO page to re-draw the flag, what this door's own re-warning
  // carried, so its next Take passes (`ackForTap`): never a block. With a page, the page owns it.
  const warned = useRef<string[]>([]);
  const settleRef = useRef<HTMLButtonElement>(null);
  // "Keep the change" unmounts under its own tap (the readout then says Exact) — focus goes to
  // Settle, the next thing to do (§7). Moved in an effect, after the commit that removed the action.
  const [kept, setKept] = useState(0);
  useEffect(() => {
    if (kept > 0) settleRef.current?.focus();
  }, [kept]);
  // Phase 2c · gate — a server `unsent` refusal (a guest's dish landed after the page's last read)
  // is said INSIDE the sheet (its one alert: the page's region is hidden behind the modal), and the
  // jump to the Send waits for the sheet to close — the close hands focus to the fix instead of back
  // to this trigger. A ref, read by the close handler; the server's count rides it.
  const unsentJump = useRef<number | null>(null);

  /**
   * An ANSWER from `settleCash` — on time, or late (9e: the answer to an attempt whose sheet already
   * said "no answer yet"). Every branch reads the TAP's figures (`at`), never the render it lands in.
   * A refusal's words land in the sheet's one alert — state, which React simply drops on an
   * unmounted control, so they are said only while it is mounted with no flag to forget. The
   * hand-ups (`onOutcomeUnknown`, `onSettleOutcome`, `onSettled`, `onChanged`) are the page's and run
   * regardless: a settle that landed after the detail unmounted still hands its card up, since the
   * parent renders it outside the open-cart conditional this control lives in.
   */
  function land(res: Awaited<ReturnType<typeof settleCash>>, at: SettleTap) {
    // An answer came back: whatever it says, the outcome is KNOWN again — on a late answer too,
    // and even after unmount (the page's closed-bounce hold must not outlive the question).
    onOutcomeUnknown?.(false);
    if (!res.ok) {
      onSettleOutcome?.("refused"); // nothing was recorded, whichever refusal it is
      // The sheet stays open with the refusal inside it — the cashier reads why where they
      // tapped, and can fix the tip or cancel. (Closing it would raise the alert under the
      // exiting sheet's `aria-hidden`, and hand them the trigger with the reason somewhere else.)
      if (res.code === "moved") {
        // Nothing was recorded. Quote the server's figure at once (not optimistic — it is what the
        // server just derived) and re-read the detail; the re-tap quotes it and is re-checked.
        // `raisedAt` — the page's read clock NOW (R1): only a read that starts after this may
        // settle the server's figure, whatever that read brings back.
        setQuote({
          cents: res.totalCents,
          basis: at.basis,
          raisedAt: readsStarted?.() ?? readTicket,
        });
        // Codex round 3 (P2) — the server's figure came without its tip base: the percentage
        // chips are withheld until the page's read (the reconcile) supplies the matching base,
        // never computed off the previous order's.
        setTipBaseAtOpen(null);
        setError({ kind: "moved", from: at.quoted, to: res.totalCents });
        onChanged?.();
        return;
      }
      if (res.code === "inflight") {
        // P2w — said in the device language, naming who holds the money (the typed code; the
        // English `error` is for a bundle older than it).
        setError({ kind: "inflight", holder: res.holder });
        return;
      }
      if (res.code === "unsent") {
        // Phase 2c · gate — nothing recorded (the freeze released on the server). Said here in
        // the dictionary's words with the server's count; the close takes the cashier to the
        // Send, and the page re-reads so its note appears under the triggers.
        setError({ kind: "unsent", units: res.units });
        unsentJump.current = res.units;
        onChanged?.();
        return;
      }
      if (res.code === "unreadable") {
        // P2dc · P2el — nothing recorded, the freeze released: said in the dictionary's words,
        // and Take stays armed in the open sheet — the retry is the same tap.
        setError({ kind: "unreadable" });
        return;
      }
      if (res.code === "approval_pending") {
        // PD8 — a request this tap did not display: nothing recorded. A re-warning, never a block:
        // the page re-draws the flag card naming the dish (its one region says so) and the next
        // tap acknowledges what it shows. Both name the dishes this tap did NOT acknowledge
        // (`reWarning`). With no page, the sheet says them and Take stays armed — the next Take
        // acknowledges everything the refusal carried (`warned`; the rest this tap had acknowledged).
        const said = reWarning(res.pending, at.acked);
        if (onApprovalPending) {
          setConfirming(false);
          onApprovalPending(res.pending, said.dishes);
          return;
        }
        warned.current = res.pending.map((p) => p.id);
        setError({ kind: "approvalPending", dish: said.dishes });
        return;
      }
      if (res.code === "approval_unreadable") {
        // PD8 — the pending read failed; nothing recorded, the freeze released: the same tap retries.
        setError({ kind: "approvalUnreadable" });
        return;
      }
      setError({ kind: "server", text: res.error });
      return;
    }
    // The write is recorded — the sheet goes (unmounted, not closed: an exiting sheet with a
    // re-armed Settle inside it, or one held busy for a re-fetch this control does not own, is the
    // trap §16 names) and the trigger reads busy until the paid state lands.
    setLanded(true);
    setConfirming(false);
    if (handoff || at.tenderAtTap != null) {
      // Set in the SAME branch that hands the card up, so the sheet's close-restore never fights
      // the parent's card for focus.
      handoffLandedRef.current = true;
      // The PERSISTED figures the settle returned (the prop can be a poll interval stale).
      onSettled?.({
        orderId: res.orderId,
        totalCents: res.totalCents,
        tipCents: res.tipCents,
        tenderedCents: at.tenderAtTap,
      });
    }
    // No card (a table that paid without a tender): the paid state arrives on the re-read and
    // unmounts this control; until then the trigger says "Taking payment…" and refuses.
    onChanged?.();
  }

  async function confirm() {
    if (inFlight.current) return;
    if (drift && !busy) {
      // The total moved while the sheet was open: this tap ADOPTS the new figure explicitly — the
      // label, the chips and the readout re-derive from it in front of the cashier, the sentence
      // naming both stays, and nothing is recorded. The next tap settles the figure now shown.
      haptic("pick");
      setQuote({ cents: drift.to, basis: drift.to });
      setTipBaseAtOpen(tipBaseCents);
      setError({ kind: "moved", from: drift.from, to: drift.to });
      return;
    }
    if (!canSettle) return;
    // Phase 2h (9d) — refused AT THE TAP, never dispatched, while any action on this tab has gone
    // STAFF_HANG_MS without an answer: Next would only queue this payment behind it, and release it
    // minutes later — after the cashier took the money another way. Read NOW, never from render
    // state. Owner decision (Phase 2h · integration): while THIS sheet's own settle is still out
    // past the bound, the refusal re-says ITS sentence ("No answer yet — this payment may still be
    // recorded. Don't take it again…"), never the tablet's "this did nothing" — only the own one
    // says don't take it again. Another action's stall keeps `stalled` (`tapRefusal`).
    const refused = tapRefusal<"waiting" | "stalled">(
      ownLate.current ? "waiting" : null,
      stalledSince(),
      "stalled",
    );
    if (refused !== null) {
      setError({ kind: refused });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    haptic("commit"); // at the tap — the gesture, not the network — with the busy label beside it
    setError(null);
    unsentJump.current = null; // a new attempt owes no jump until it is refused for this reason
    // The figure the cashier is looking at (the frozen quote), and the prop the page read — both
    // captured at the tap, so a refusal can name the one and keep the other as the quote's basis.
    const at: SettleTap = {
      quoted: shownTotal,
      basis: totalCents,
      tenderAtTap: tenderedCents != null && tenderedCents > 0 ? tenderedCents : null,
      // PD8 — the ids the trigger displayed when it was tapped (captured at that tap, below), plus
      // what this door's own re-warning carried where no page re-draws the flag.
      acked: ackForTap(ackedAtTap.current, warned.current),
    };
    try {
      // 9b — called OUTSIDE any transition, awaited BOUNDED, handed the RAW action promise (a raced
      // one would read `threw` at 15s and drop the late answer). `quotedCents` is compare-only;
      // `acknowledgedApprovalIds` too (PD8).
      const out = await boundWrite(
        settleCash({
          sessionId,
          tipCents,
          quotedCents: at.quoted,
          acknowledgedApprovalIds: at.acked,
        }),
      );
      if (out.kind === "answer") {
        land(out.value, at);
        return;
      }
      if (out.kind === "threw") {
        // P2ab — a REJECTED action is an UNKNOWN outcome, not a refusal: the response can be lost
        // AFTER `mms_fulfill_cash_order` committed, so "that change wasn't saved" would be false.
        // Say we don't know, and re-read the detail: if it landed, the paid state renders this
        // control away; if not, Settle is live again (a retry cannot record twice — the cart is
        // no longer open once it has been paid).
        console.error("[CashSettleButton] settle rejected — outcome unknown", out.error);
        setError({ kind: "unknown" });
        onOutcomeUnknown?.(true);
        onSettleOutcome?.("unknown");
        onChanged?.();
        return;
      }
      // Phase 2h (9e) — NO ANSWER YET at the bound. Not "wasn't saved" and not "couldn't confirm":
      // the settle may still be recorded, so the sheet says so and offers the reload, and the
      // outcome is UNKNOWN to the page (its counter closed-bounce holds on it). The re-read queued
      // here runs only after this settle answers — Next's queue is FIFO per tab — so it shows the
      // truth; and it is FIFO, not FloorDetailLive's SETTLE_MAY_LAND_MS, that bounds a settle which
      // was queued unsent behind a hung head (register-math.ts `settleUnknownAfterRead`).
      ownLate.current = true;
      setError({ kind: "waiting" });
      onOutcomeUnknown?.(true);
      onSettleOutcome?.("unknown");
      onChanged?.();
      void out.late.then((late) => {
        ownLate.current = false; // answered or thrown: this sheet's write is no longer out
        // `late` never rejects. A late ANSWER (ok or refusal) is applied exactly as an on-time one
        // — a late ok LANDS (the sheet unmounts and hands its card over) — and clears the unknown
        // even after unmount. A late THROW is still no answer: the outcome stays unknown.
        if (late.kind === "answer") land(late.value, at);
        else {
          setError({ kind: "unknown" });
          // Codex r2 on #310 (A1) — and handed UP again: the bound's `unknown` reached a detail that
          // was still MOUNTED (it ignores one then — this control's own line said it), so if the
          // cashier switched tables since, this throw is the only thing left to tell the pane. The
          // state above lands on an unmounted control; FloorDetailLive forwards this only once gone.
          onSettleOutcome?.("unknown");
        }
        // Phase 2h · integration — this attempt was handed up `unknown` at the bound; a late OK is
        // its answer, so the page may retract what it said off it (the pane's "we don't know if
        // the payment went through", raised once the detail had unmounted). A refusal hands up
        // `refused` inside `land`; a throw is still no answer and retracts nothing.
        if (late.kind === "answer" && late.value.ok) onSettleOutcome?.("landed");
        // F2 — no sheet to read it in: keep it for the trigger's line and the next open.
        if (!sheetOpen.current && (late.kind === "threw" || !late.value.ok)) setLateUnseen(true);
      });
    } finally {
      inFlight.current = false;
      setBusy(false); // frees AT THE BOUND on every path (fact 3) — the M82 guard parses for it
    }
  }

  const settleReasons =
    blocked === "tipCap"
      ? "cash-tip-cap"
      : blocked === "short"
        ? "cash-readout cash-short-hint"
        : tender.kind !== "none"
          ? "cash-readout"
          : undefined;
  // While the figures disagree, Settle is described by the alert that names both (what its tap does).
  const settleDescribedBy = drift
    ? ["cash-alert", settleReasons].filter(Boolean).join(" ")
    : settleReasons;
  // The alert: a live drift outranks a stored outcome — it is the fact the cashier must act on now.
  const alertMsg: SheetError | null = drift ? { kind: "moved", ...drift } : error;
  // Critic F1 — every SET of the stored outcome (a re-tap's refusal re-says the standing waiting
  // line) replaces the alert's content, so it is announced again, not swallowed as no change. Keyed
  // on the STATE: `alertMsg` is built fresh each render while the figures drift.
  const said = useResaid(error);
  /** A sheet error's sentence — said in the ONE alert, or (F2) under the trigger while unread. */
  const sayError = (m: SheetError) =>
    m.kind === "server" ? (
      <OutageText lang={lang} error={m.text} />
    ) : m.kind === "unreadable" ? (
      <Chrome lang={lang} k="settle.unsentUnreadable" echo={false} />
    ) : m.kind === "moved" ? (
      <Chrome
        lang={lang}
        k="settle.cash.moved"
        vars={{ old: fmt(m.from), m: fmt(m.to) }}
        echo={false}
      />
    ) : m.kind === "inflight" ? (
      <Chrome
        lang={lang}
        k={inFlightMsg(m.holder).k}
        vars={inFlightMsg(m.holder).vars}
        echo={false}
      />
    ) : m.kind === "unsent" ? (
      <Chrome
        lang={lang}
        k={settleBlockedMsg(m.units, running).k}
        vars={settleBlockedMsg(m.units, running).vars}
        echo={false}
      />
    ) : m.kind === "approvalPending" ? (
      <Chrome lang={lang} k="settle.flag.pendingRefused" vars={{ x: m.dish }} echo={false} />
    ) : m.kind === "approvalUnreadable" ? (
      <Chrome lang={lang} k="settle.approvalsUnreadable" echo={false} />
    ) : m.kind === "waiting" ? (
      <Chrome lang={lang} k="settle.cash.waiting" echo={false} />
    ) : m.kind === "stalled" ? (
      <Chrome lang={lang} k="out.stalled" echo={false} />
    ) : (
      <Chrome lang={lang} k="settle.cash.unknown" echo={false} />
    );
  // F2 — an unread late word, said under the trigger while the sheet is closed (never at once with
  // the alert: opening the sheet reads it there, and the trigger's tap clears this).
  const lateNote = lateUnseen && !confirming ? error : null;
  // Review a (A1) — the trigger is held on this cart's own wait: its line says the waiting sentence
  // (never the neutral hint) while the sheet is closed. A late word outranks it (it ended the wait).
  const waitNote = !lateNote && ownWaiting && !confirming;
  // CX3 — the held tap's line lives only as long as the hold it answered: a LATER hold starts
  // silent (said by the description) until a tap of its own. A render-time adjustment (the sanctioned
  // set-during-render, as `quote` above), so no commit ever pairs a new hold with an old tap.
  if (!waitNote && heldTap !== null) setHeldTap(null);

  return (
    <div>
      {/* §17 — after a landed settle the trigger stays, says "Taking payment…" and refuses (Button's
          busy: aria-disabled + aria-busy on one predicate), never a live-looking control that
          silently does nothing. */}
      <Button
        ref={triggerRef}
        variant={variant}
        size="xl"
        block
        busy={landed || totalPending}
        busyLabel={
          totalPending && !landed ? (
            <Chrome lang={lang} k="settle.flag.updating" echo={false} />
          ) : (
            <Chrome lang={lang} k="settle.cash.settling" echo={false} />
          )
        }
        // Phase 2c · gate — refused while dishes are unsent: the ATTRIBUTE (spread only when set,
        // so the primitive's own busy state is never erased) plus the handler's guard below, never
        // native `disabled`; the page's note is read first.
        {...(gateBlocked ? { "aria-disabled": true } : {})}
        // Review a (A1) — held while this cart's own settle is still out past the bound: the
        // attribute plus the handler's own guard (read at the tap), never native `disabled`.
        {...(ownWaiting ? { "aria-disabled": true } : {})}
        aria-describedby={[
          describedBy,
          gateBlocked && blockedNoteId ? blockedNoteId : null,
          "settle-hint",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          // Review a (A1) — this cart's own settle may still be recorded: no sheet opens over it
          // (the line under the trigger says why, with the reload). It outranks the gate's jump —
          // a payment that may have gone through is the fact the cashier must act on first.
          if (ownLate.current) {
            // CX3 — said, not silent: the line under the trigger is its DESCRIPTION, never a live
            // region, and @mms/ui's Button forwards a caller-held click (its inert guard is only
            // its own `disabled` / `busy`) — so the refusal is this handler's to say.
            setHeldTap({});
            return;
          }
          if (gateBlocked) {
            // Opens no sheet: the page says why and takes the cashier to the Send.
            onBlockedTap?.(null);
            return;
          }
          // A refusal read in the last sheet is not this attempt's — but one that landed while the
          // sheet was closed was never read: it opens with this sheet, in its one alert (F2).
          if (!lateUnseen) setError(null);
          setLateUnseen(false);
          unsentJump.current = null;
          // PD8 — THIS tap is the acknowledgement: exactly the pending ids the page shows now.
          ackedAtTap.current = [...(acknowledgedApprovalIds ?? [])];
          // A new attempt starts clean: the tender belongs to the guest in front of the cashier, and
          // the quote FREEZES here — the live figure, or the server's figure a refusal handed back
          // while the page has not re-read yet (`openQuote`). The tip is kept.
          setTendered("");
          setQuote(openQuote(reconciled, totalCents));
          setTipBaseAtOpen(tipBaseCents);
          setChipPop(null);
          setConfirming(true);
        }}
      >
        <Chrome
          lang={lang}
          k={isTab ? "settle.cash.triggerTab" : "settle.cash.trigger"}
          vars={{ m: fmt(shownTotal) }}
          echo="stack"
        />
      </Button>
      {/* Unmounted, not closed, once the settle landed (see the docblock). The opener is restored
          by hand: WebKit does not focus a tapped button, so the primitive's captured activeElement
          is <body> on the tablet this runs on, and the cashier's place is the trigger. */}
      {!landed && (
        <Sheet
          open={confirming}
          // M82 — STATE cleared in a bounded `finally` (9a; see `busy` above), parsed by the guard.
          busy={busy}
          onOpenChange={(next) => {
            if (!next) setConfirming(false);
          }}
          title={
            <Chrome
              lang={lang}
              k={isTab ? "settle.cash.titleTab" : "settle.cash.title"}
              echo="stack"
            />
          }
          closeLabel={sheetCloseLabel(lang)}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (handoffLandedRef.current) return;
            // Phase 2c · gate — the sheet closed over an `unsent` refusal: the page takes the
            // cashier to the Send (and says why in its region) instead of back to this trigger.
            const units = unsentJump.current;
            unsentJump.current = null;
            if (units !== null && onBlockedTap) {
              onBlockedTap(units);
              return;
            }
            triggerRef.current?.focus();
          }}
        >
          <div style={confirmBody}>
            <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
              <Chrome lang={lang} k="settle.cash.take" vars={{ m: fmt(dueCents) }} echo="stack" />{" "}
              {tipCents > 0 && (
                <>
                  <Chrome
                    lang={lang}
                    k="settle.cash.tipBreakdown"
                    vars={{ m: fmt(shownTotal), tip: fmt(tipCents) }}
                    // A money label, which the echo policy gives an echo; "inline" rather than
                    // "stack" so it does not add a third block line to the confirm question.
                    echo="inline"
                  />{" "}
                </>
              )}
              <Chrome
                lang={lang}
                k={isTab ? "settle.cash.closesTab" : "settle.cash.closesOrder"}
                echo="stack"
              />
            </p>
            {/* W17c-2 — the tip is asked for BEFORE the tendered amount, because the change is owed
              against the tipped total; asking after would invite entering change from the wrong
              figure. Shown on every cash settle, not just the counter handoff. */}
            <div style={{ display: "grid", gap: "var(--s2)" }}>
              <label htmlFor="cash-tip" style={fieldLabel}>
                <Chrome lang={lang} k="settle.cash.tipLabel" echo="stack" />
              </label>
              {/* W17c-3 — the house ladder as one-tap chips, so a cashier is not doing percentage
                arithmetic at the counter. They fill the field (they do not settle), so the amount
                stays visible and adjustable before anything is recorded. */}
              <div role="group" aria-label={sx(lang, "settle.a11y.tipQuick")} style={tipChipRow}>
                {/* Withheld while the base is unknown (a server figure awaiting its read) — "None" stays. */}
                {(shownTipBase === null ? [] : tipPresets(shownTipBase))
                  .filter((p) => tipWithinAmountCap(Math.round((shownTipBase ?? 0) * p.rate)))
                  .map((p) => {
                    // The SAME base and the SAME rounding the diner and kiosk use, so an identical
                    // label means an identical amount wherever the guest happens to be standing.
                    const cents = Math.round((shownTipBase ?? 0) * p.rate);
                    // Lit while the FIELD holds this chip's amount — the field is the single source of
                    // the value (the chip only fills it), so the pressed state is derived, never stored,
                    // and hand-editing the field unlights the chip the moment they diverge (the
                    // checkout chips' idiom, and the W17c "name it once" rule applied to UI state).
                    // Compared by VALUE: "8,00" typed by hand is the $8.00 chip's amount too.
                    const on = parseMoneyCents(tip) === cents;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        // manager-7 — `.staff-chip`: the lit chip is the console's ONE cap through the
                        // shared pressed rule, not the ring-and-wash this file used to draw itself.
                        className="staff-btn staff-chip"
                        aria-pressed={on}
                        style={tipChip}
                        onClick={() => {
                          tipTouched.current = true;
                          haptic("pick");
                          setTip(centsToField(cents));
                        }}
                      >
                        {p.label}
                        <span className="staff-chip-amount">{fmt(cents)}</span>
                      </button>
                    );
                  })}
                {/* An ACTION (clears the field), not a state — no aria-pressed: the emptied field is
                  its own visible answer, and a "pressed None" lying beside a typed amount would
                  claim two truths at once. */}
                <button
                  type="button"
                  className="staff-btn staff-chip"
                  style={tipChip}
                  onClick={() => {
                    tipTouched.current = true;
                    setTip("");
                  }}
                >
                  <Chrome lang={lang} k="settle.cash.tipNone" echo={false} />
                </button>
              </div>
              <input
                id="cash-tip"
                className="ui-field-control"
                inputMode="decimal"
                autoComplete="off"
                placeholder={tf(lang, "settle.cash.example", { x: "5" })}
                value={tip}
                onChange={(e) => {
                  tipTouched.current = true;
                  setTip(sanitizeMoneyInput(e.target.value));
                }}
                aria-describedby={
                  !tipValid ? "cash-tip-cap" : intentShown != null ? "cash-tip-kiosk" : undefined
                }
                aria-invalid={!tipValid || undefined}
              />
              {/* Says WHERE the number came from. A pre-filled amount with no explanation reads as an
                app-invented charge; naming the guest's choice makes it something to confirm. */}
              {intentShown != null && (
                <p id="cash-tip-kiosk" style={note}>
                  {intentShown > 0 ? (
                    <Chrome
                      lang={lang}
                      k="settle.cash.kioskChose"
                      vars={{ m: fmt(intentShown) }}
                      echo="stack"
                    />
                  ) : (
                    <Chrome lang={lang} k="settle.cash.kioskNoTip" echo="stack" />
                  )}
                </p>
              )}
              {!tipValid && (
                <p id="cash-tip-cap" style={{ ...note, color: "var(--warn)" }}>
                  {/* The cap FIGURE is the same literal this sentence always carried — it is quoted,
                    never derived, so no money value moves. It rides an {m} slot only so the
                    dictionary value can stay free of digits. */}
                  <Chrome
                    lang={lang}
                    k="settle.cash.overCap"
                    vars={{ m: "$1,000.00" }}
                    echo="stack"
                  />
                </p>
              )}
            </div>
            {/* Phase 2c · register — the tender, OPTIONAL, on every cash settle. Chips first (the
              taps), then the field: no money input is ever autofocused, so the decimal pad never
              rises over Settle. The chips re-derive from what is due, so a tip change can unlight
              one — honest, and the readout then says Short. */}
            <div style={{ display: "grid", gap: "var(--s2)" }}>
              <label htmlFor="cash-tendered" style={fieldLabel}>
                <Chrome lang={lang} k="settle.cash.tenderedLabel" echo="stack" />
              </label>
              <div
                role="group"
                aria-label={sx(lang, "settle.a11y.cashQuick")}
                className="reg-tender-grid"
              >
                {[dueCents, ...quickCashTenders(dueCents)].map((cents, i) => (
                  <button
                    key={i === 0 ? "exact" : cents}
                    type="button"
                    className="staff-btn staff-chip staff-chip-cash"
                    // A state — lit while the field holds this amount (by VALUE), through the shared
                    // lit-cap rule; `.staff-chip-cash` declares no fill of its own.
                    aria-pressed={tenderedCents === cents}
                    onClick={() => {
                      haptic("pick");
                      setTendered(centsToField(cents));
                      setChipPop((n) => (n ?? 0) + 1);
                    }}
                  >
                    {i === 0 ? (
                      <>
                        <Chrome lang={lang} k="settle.cash.exact" echo={false} />{" "}
                        <span className="staff-chip-amount">{fmt(cents)}</span>
                      </>
                    ) : (
                      noteLabel(cents)
                    )}
                  </button>
                ))}
              </div>
              <input
                id="cash-tendered"
                className="ui-field-control"
                inputMode="decimal"
                autoComplete="off"
                placeholder={tf(lang, "settle.cash.example", { x: "40" })}
                value={tendered}
                onChange={(e) => {
                  setTendered(sanitizeMoneyInput(e.target.value));
                  setChipPop(null); // typing never pops
                }}
              />
              {/* A DESCRIPTION of Settle, never a live region (the sheet's one alert is the only
                  announcement here). Its height is reserved, so nothing jumps as it fills. */}
              <div id="cash-readout" className="reg-change">
                {tender.kind === "change" && (
                  <dl className="checkout-leader-row reg-change-row">
                    <dt>
                      <Chrome lang={lang} k="settle.cash.changeLabel" echo={false} />
                    </dt>
                    <dd
                      key={chipPop ?? "typed"}
                      className={chipPop != null ? "mms-pop" : undefined}
                    >
                      {fmt(tender.changeCents)}
                    </dd>
                  </dl>
                )}
                {tender.kind === "short" && (
                  <dl className="checkout-leader-row reg-change-row reg-change-short">
                    <dt>
                      <Chrome lang={lang} k="settle.cash.shortLabel" echo={false} />
                    </dt>
                    <dd>{fmt(tender.shortCents)}</dd>
                  </dl>
                )}
                {tender.kind === "exact" && (
                  <p className="reg-change-exact">
                    <Chrome lang={lang} k="settle.cash.exactNone" echo={false} />
                  </p>
                )}
              </div>
              {tender.kind === "short" && (
                <p id="cash-short-hint" style={{ ...note, color: "var(--warn)" }}>
                  <Chrome lang={lang} k="settle.cash.shortHint" echo="stack" />
                </p>
              )}
              {/* An ACTION (no aria-pressed): a FILL of the tip field — the new tip shows in the field
                  and in Settle's label before anything is recorded. With the tip field empty {m} is
                  the change being kept (the readout's own figure, and the new tip); with a tip
                  already typed it names the tip the tap MAKES (`keepNamesTip` — critic finding: "·
                  $3.00" beside a field that became 5.00 read as a $3 tip). */}
              {keepCents != null && tender.kind === "change" && (
                <button
                  type="button"
                  className="staff-btn staff-chip"
                  style={keepBtn}
                  onClick={() => {
                    tipTouched.current = true;
                    haptic("pick");
                    setTip(centsToField(keepCents));
                    setKept((n) => n + 1);
                  }}
                >
                  <Chrome
                    lang={lang}
                    k={keepNamesTip ? "settle.cash.keepChangeTip" : "settle.cash.keepChange"}
                    vars={{ m: fmt(keepNamesTip ? keepCents : tender.changeCents) }}
                    echo={false}
                  />
                </button>
              )}
            </div>
            {/* Critic finding — the actions PIN to the sheet's bottom (`.reg-settle-actions`, the
                `.item-cta-bar` pattern): the cash moment made the body tall (tip chips, four tender
                tiles, the readout, keep-the-change), and on a 390px phone in Burmese Take fell
                below the fold, under the decimal pad once a tender was typed. The ONE alert rides
                the same band, right above the button it explains. */}
            <div className="reg-settle-actions">
              {/* The ONE alert on this control, inside the sheet where the tap was — a second copy
                  under the trigger would mount at the start of the exit, under the sheet's own
                  `aria-hidden`, unannounced (the blind pass); the trigger clears it — except a late
                  one that landed with the sheet closed and unread (F2), which this alert says. */}
              {alertMsg && (
                <p
                  id="cash-alert"
                  role="alert"
                  style={{ ...hint, margin: 0, color: "var(--warn)" }}
                >
                  <span key={said}>{sayError(alertMsg)}</span>
                </p>
              )}
              {/* Phase 2h — both sentences say "reload the page", and the console is installed
                  standalone (no browser reload button): the reload sits BESIDE the one alert,
                  never inside it, and carries no live role of its own. */}
              {(alertMsg?.kind === "waiting" || alertMsg?.kind === "stalled") && (
                <ReloadButton lang={lang} block />
              )}
              <div style={buttonRow}>
                {/* The refusal is the ATTRIBUTE plus the handler's own guard — never a native
                    `disabled`, and not the primitive's `disabled` prop either, so the handler (and
                    a mutant) is what refuses (K35's measure counts `disabled=` literally). Spread
                    only when set: the primitive's own aria-disabled while busy must not be erased. */}
                <Button
                  variant="secondary"
                  size="lg"
                  {...(busy ? { "aria-disabled": true } : {})}
                  onClick={() => {
                    if (busy) return;
                    setConfirming(false);
                  }}
                >
                  <Chrome lang={lang} k="settle.cancel" echo={false} />
                </Button>
                {/* The dim rides `.ui-btn[aria-disabled="true"]`; the label stays a stated word. */}
                <Button
                  ref={settleRef}
                  variant="primary"
                  size="xl"
                  style={{ flex: 1 }}
                  {...(blocked !== null ? { "aria-disabled": true } : {})}
                  busy={busy}
                  busyLabel={<Chrome lang={lang} k="settle.cash.settling" echo={false} />}
                  aria-describedby={settleDescribedBy}
                  onClick={confirm}
                >
                  <Chrome
                    lang={lang}
                    k="settle.cash.settleAmount"
                    vars={{ m: fmt(dueCents) }}
                    echo="stack"
                  />
                </Button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {/* Static helper text (a description, not a status) — linked to the trigger, never a live
          region. A settle FAILURE is an assertive role="alert" instead, inside the sheet. After
          Phase 2c the table page carries exactly ONE polite region (FloorDetailLive's order card —
          OPEN-ITEMS P2r); this element is not one. Critic F2 — a LATE refusal that landed with the
          sheet closed has no alert to speak in and no page line while this detail is mounted, so
          it takes this line (still the trigger's description, still no live role) until the
          trigger is tapped — and the sheet that opens says it in its alert. */}
      <p id="settle-hint" style={lateNote || waitNote ? { ...hint, color: "var(--warn)" } : hint}>
        {lateNote ? (
          sayError(lateNote)
        ) : waitNote ? (
          <Chrome lang={lang} k="settle.cash.waiting" echo={false} />
        ) : (
          <Chrome lang={lang} k="settle.cash.hint" echo="stack" />
        )}
      </p>
      {/* Review a (A1) — the waiting line says "reload the page" and the console is installed
          standalone: the reload sits beside it, never inside it (no live role of its own). */}
      {waitNote && <ReloadButton lang={lang} block />}
      {/* CX3 — the held tap's ONE alert. It only SPEAKS (`.sr-only`): the sentence is already drawn
          by the line above, and drawing it twice would show one fact as two. Mounted with its words
          by the tap (an inserted alert is announced), and its content keyed by `heldSaid`, so a
          second tap replaces the node and is announced again. */}
      {waitNote && heldTap !== null && (
        <p role="alert" className="sr-only">
          <span key={heldSaid}>
            <Chrome lang={lang} k="settle.cash.waiting" echo={false} />
          </span>
        </p>
      )}
    </div>
  );
}

// Layout only — the surface, the head and the horizontal inset are the sheet's.
const confirmBody: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  paddingTop: "var(--s3)",
};
const fieldLabel: CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)" };
const note: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const hint: CSSProperties = {
  margin: "var(--s2) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
const buttonRow: CSSProperties = { display: "flex", gap: "var(--s3)", alignItems: "stretch" };

const tipChipRow: CSSProperties = { display: "flex", gap: "var(--s2)", flexWrap: "wrap" };
// manager-7 — layout only: the fill, ink, hairline and size are `.staff-chip`'s.
const tipChip: CSSProperties = { gap: "var(--s2)" };
// The keep-the-change action spans the block, so its money figure is never clipped at 390px.
const keepBtn: CSSProperties = { width: "100%" };
