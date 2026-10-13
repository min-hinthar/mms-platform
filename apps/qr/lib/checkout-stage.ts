import type { CartItem } from "@mms/db";
import { trackStage, type TrackLine } from "./kitchen-track";

/**
 * W12 — the two-moment checkout's ONE behavioral rule, kept pure so it can be pinned by a unit
 * test (the repo has no .test.tsx runner — decision logic lives in lib/, the W10d M46 rule).
 *
 * The dine-in cart opens on the moment the diner is most likely in:
 *  - anything still DRAFT → the Order moment (they're building a round — steppers, Send);
 *  - everything with the kitchen → the Bill moment (the mid-meal settle-nudge journey lands
 *    ready to pay, not back on a spent ordering screen).
 * An empty cart answers "order" but never renders a stage (the empty state returns first).
 * The diner can flip stages freely afterward — this only picks the landing.
 */
export type CheckoutStage = "order" | "bill";

export function initialStage(items: ReadonlyArray<Pick<CartItem, "lineState">>): CheckoutStage {
  if (items.length === 0) return "order";
  return items.some((i) => i.lineState === "draft") ? "order" : "bill";
}

/**
 * W12 review HIGH — what "Send to kitchen" actually SENDS. `mms_fire_cart` fires ONLY
 * fulfillment='dinein' drafts (to-go waits for checkout / make-it-now; grocery never fires), so
 * the CTA count, its render gate, and the View-bill promotion must bind to this predicate — an
 * all-drafts count promises sends the server will not perform, and a lone to-go/grocery draft
 * would pin the promotion forever. Counted in UNITS (qty), matching the header cart badge.
 */
export function kitchenDraftQty(
  items: ReadonlyArray<Pick<CartItem, "lineState" | "fulfillment" | "qty">>,
): number {
  return items
    .filter((i) => i.lineState === "draft" && i.fulfillment === "dinein")
    .reduce((a, i) => a + i.qty, 0);
}

/**
 * W19 — what the Bill moment must WARN about (owner: "What if customers forget to send items to
 * kitchen and move forward to pay?"). Every still-draft FOOD line (dinein + togo, never grocery) is
 * charged at pay and then fired by `mms_fire_pending_food` the moment the payment lands — money is
 * safe, but the kitchen only starts those dishes AFTER payment, so the diner deserves to be told
 * before the charge, not discover it on the tracker.
 *
 * Deliberately a DIFFERENT predicate from `kitchenDraftQty` (dinein-only, bound to what the host's
 * Send button fires): a lone to-go draft is also charged-then-fired and deserves the same notice.
 * Counted in UNITS (qty), matching the badge and the send count.
 */
export function unsentFoodQty(
  items: ReadonlyArray<Pick<CartItem, "lineState" | "fulfillment" | "qty">>,
): number {
  return items
    .filter((i) => i.lineState === "draft" && i.fulfillment !== "grocery")
    .reduce((a, i) => a + i.qty, 0);
}

/**
 * Phase 1b (owner, 2026-09-23: "only fulfilled orders on the bill should be payable … customers
 * should only checkout after bill is finalized" → "Everything sent") — at a dine-in table the bill
 * can be paid only once every dish the table can SEND has gone to the kitchen. Binds to the same
 * predicate as the Send CTA (`kitchenDraftQty`: dinein drafts, what `mms_fire_cart` fires), so every
 * line that blocks Pay is a line the host can clear with one tap. To-go drafts at a dine-in table
 * are not sendable (they fire at checkout) and so never block.
 *
 * ⚠️ ONLY WHEN SOMEONE CAN SEND (blind pass on #301). Only the host fires the table, and a table can
 * have NO host: a staff-started session mints `host_seat: null`, and a diner arriving by invite link
 * (`joinOnly`) never claims it. Gating that table would leave nobody able to send and so nobody able
 * to pay. Without a host the pre-1b behaviour stands: pay, and the drafts fire when it lands.
 *
 * The same binding on both sides: the split doors (`openSettlement`, `create-share-intent`) still
 * refuse on it server-side while the self-serve split is parked (wiring D5's verdict into them is on
 * `selfServeSplit`'s reopen list, lib/surfaces), and the Bill reads it to say why before the diner
 * taps — Pay's unsent reason (never the diner's counter ask: PD2's lift, m2 decision 12, took it off
 * the ask and the counter door, which carry unsent dishes to the register; the register's own settle
 * doors still read it, through `staffSettleBlockedByUnsent` below). `create-intent` NO LONGER
 * refuses on it: PD10 replaced that refusal with D5's served gate (`servedGateDecision` below),
 * which every unsent dine-in line also holds, and `check:phone-pay-door` (rule 7) refuses a live
 * `payBlockedByUnsent(` there.
 * Pickup and scan-and-go have no send step — paying IS ordering — so it never applies there.
 */
export function payBlockedByUnsent(
  mode: string | null | undefined,
  kitchenDraftUnits: number,
  hostPresent: boolean,
): boolean {
  return mode === "dinein" && hostPresent && kitchenDraftUnits > 0;
}

/**
 * PD2 (the owner, PATH_DESIGN_2026-10-07 decision 2: "until live card keys are switched on, the
 * dine-in Bill offers only Pay at the counter") — is the PHONE-PAY door parked for this session?
 *
 * The switch is `SURFACES.dineInPhonePay` (lib/surfaces), passed IN by the caller so a test can
 * falsify the wiring against the table and the flip stays a one-line commit. The rule itself is
 * the mode: only a dine-in table has a counter to walk to, so only dine-in reads the switch —
 * pickup and scan-and-go pay before the kitchen ever sees the order (paying IS ordering), and a
 * parked door there would be a revenue outage behind a rule meant for tables. `mode` is read the
 * way `payBlockedByUnsent` reads it: a string the session row answers (`table_sessions.mode`), null
 * or undefined when the read missed — and a missed read is NOT a table, so it is never parked by
 * this function (the callers that must fail closed on an unreadable mode do so before asking).
 *
 * Read on BOTH sides of the door (lib/surfaces: "drawn AND answered"): `Checkout` draws the Bill
 * without a card hero while it is true, and `create-intent` refuses the mint while it is true.
 */
export function phonePayParked(
  mode: string | null | undefined,
  dineInPhonePayOpen: boolean,
): boolean {
  return mode === "dinein" && !dineInPhonePayOpen;
}

/**
 * Codex round 2 on #331 — WHICH mode the Bill asks `phonePayParked` about. The split context's mode
 * is best-effort: `app/cart/page.tsx` passes `null` on any `getSplitContext` failure, and its session
 * read is unchecked (`mode: ""` on a miss). Asking the door with it let a transient blip draw the
 * card hero and the tip ask at a dine-in table whose every Pay tap create-intent then refused (410).
 * The cart view's mode is the AUTHORITATIVE one — `assertCartMember` reads `table_sessions.mode` and
 * fails CLOSED (503) on a miss, the same row create-intent's door reads — so it wins whenever it is
 * known; the split's is the fallback for a view that predates the field.
 */
export function doorMode(
  viewMode: string | null | undefined,
  splitMode: string | null | undefined,
): string | null {
  return viewMode || splitMode || null;
}

/** The same count from raw `qr_cart_items` rows (`state`, not the view's `lineState`) — the server
 *  gate's input. */
export function kitchenDraftUnitsFromRows(
  rows: ReadonlyArray<{ state: string; fulfillment: string; qty: number }>,
): number {
  return rows
    .filter((r) => r.state === "draft" && r.fulfillment === "dinein")
    .reduce((a, r) => a + r.qty, 0);
}

// ── Phase 2c · gate ──
/**
 * The staff settle gate (owner decision 3, 2026-09-24: "every settle door refuses while dine-in
 * dishes are unsent") — the COUNTER half of `payBlockedByUnsent`, and deliberately a delegation, not
 * a copy: the rule is stated once, above, where its mutants live.
 *
 * The console can ALWAYS send (the table page's Send fires every dine-in draft, a diner's round
 * included), so the hostless exemption does not apply at the register: `hostPresent` is `true` by
 * construction here. A staff-started table with no host is exactly the table whose dishes nobody
 * else will send — the case the gate exists for.
 *
 * Read by the three staff settle doors on the server (`settleCash`, `closeSecureTab`,
 * `settleCard` — under the freeze, from `kitchenDraftUnits`), by the table page's pre-tap reason
 * (`FloorDetailLive`, from `detail.send.sendable`) and by the order pad's Take payment (`padSettle`).
 * `sendableUnits` is the same count on every side: `kitchenDraftUnitsFromRows`.
 */
export function staffSettleBlockedByUnsent(
  mode: string | null | undefined,
  sendableUnits: number,
): boolean {
  return payBlockedByUnsent(mode, sendableUnits, true);
}

/**
 * P2dc (owner decision 5a, 2026-09-29) — the staff gate when the unsent READ FAILED (`units` null).
 *
 * The diner doors keep `kitchenDraftUnits`' fail-open posture: a guest refused at Pay on a read blip
 * has nobody to ask. The three STAFF doors fail CLOSED instead — a person at the register can try
 * again in a second, and letting a card or cash through over a gate nobody could verify is the one
 * outcome the gate exists to prevent (the settle fires the unsent dishes after pay).
 *
 * Closed only where the gate could ever refuse: an unreadable count on a mode the gate never blocks
 * (a pickup order — paying IS ordering) changes nothing, and refusing it would block a counter sale
 * on a read whose answer cannot matter. Delegated, never restated: "would ANY unsent dish block this
 * mode?" is `staffSettleBlockedByUnsent(mode, 1)`.
 */
export function staffSettleUnsentVerdict(
  mode: string | null | undefined,
  sendableUnits: number | null,
): "unreadable" | "unsent" | null {
  if (sendableUnits === null) return staffSettleBlockedByUnsent(mode, 1) ? "unreadable" : null;
  return staffSettleBlockedByUnsent(mode, sendableUnits) ? "unsent" : null;
}

// ── PD10 · D5 — card / Apple Pay after served ──
/**
 * PD10 (PATH_DESIGN_2026-10-07 decision 10, D5) — does the SERVED GATE apply to this session at all?
 * Only a dine-in table eats before it pays: pickup and scan-and-go pay before the kitchen ever sees
 * the order (paying IS ordering), so a gate there would refuse every counter-less sale behind a rule
 * meant for tables. Named once, because two callers ask it: `servedGateDecision` below, and
 * `create-intent`, which spends the gate's read ONLY where the gate could refuse (an unreadable read
 * on a pickup cart must never become a 503 — the answer could not matter).
 *
 * `mode` is read the way `phonePayParked` reads it: the session row's string, null or undefined on a
 * missed read — and a missed read is not a table (callers that must fail closed on it already did).
 */
export function servedGateApplies(mode: string | null | undefined): boolean {
  return mode === "dinein";
}

/**
 * D5's HOLD SET, for one line: does this line keep the phone-pay door shut?
 *
 * Held: any FOOD line — dine-in or to-go, comped included (it still cooks) — in draft, fired or in
 * progress, and a SERVED line until its bump is `KDS_UNDO_MS` old on the DB clock (Codex round 4:
 * Mom can still take it back inside those six seconds, and a door opened on a bump she undoes is a
 * charge over food that is not done). Never held: a served line past its undo window, a voided line
 * (nothing is cooking) and a grocery line (it never fires).
 *
 * The stage is `trackStage`'s — the ONE derivation every surface reads (m10 B3: never a second one
 * here) — and the rule is stated as "not served", never as a list of holding stages, so it FAILS
 * CLOSED: a state this module was not written for (`trackStage` answers null for it) holds the door,
 * because a door opened over a line nobody can name is the one outcome the gate exists to prevent.
 */
export function holdsServedGate(line: TrackLine, nowIso: string): boolean {
  if (line.fulfillment === "grocery" || line.state === "voided") return false;
  return trackStage(line, nowIso) !== "served";
}

/**
 * Why the door is held — the reason the Bill's one line slot says and create-intent refuses with:
 *  - `unsent`   a dine-in draft at a table with a HOST (the host sends it; a guest is told who does);
 *  - `hostless` a dine-in draft at a table with NO host (`host_seat` null): nobody at the table can
 *               send, so a server sends it from the console or the table pays at the counter;
 *  - `togo`     a to-go draft (Codex round 3): it otherwise fires only when the bill is PAID, so a
 *               phone payment would charge before that dish was cooked — it can go early from its
 *               ⋯ ("Send to kitchen now");
 *  - `kitchen`  everything is sent, and something is not served yet (or served inside Mom's undo);
 *  - `unknownHost` a dine-in draft at a table whose host the Bill cannot READ (Codex round 2 on
 *               #346: the split context missed, or its member read came back empty). It is never
 *               guessed as `hostless`: that reason says a server will send the dishes, which is
 *               false at a hosted table, whose host sends them. Nor is it guessed as `unsent`, which
 *               would tell a guest to send. It says only
 *               what is known: some dishes have not gone to the kitchen yet. The server always
 *               knows `host_seat`, so `create-intent` never reaches this reason.
 */
export type ServedHold = "unsent" | "hostless" | "togo" | "kitchen" | "unknownHost";

/**
 * PD10 (Codex round 2 on #346) — whether the table has a HOST, as the Bill can KNOW it from its split
 * context. Null (UNKNOWN), never false, when that context is missing (`app/cart/page.tsx` nulls it on
 * any `getSplitContext` failure) or its member list is empty. The viewer is always a member, so an
 * empty list is a member read that failed (`getSplitContext` does not check its error). Known false
 * only when the table's members were read and none of them is the host.
 */
export function servedGateHost(
  split: { members: ReadonlyArray<{ role: string }> } | null | undefined,
): boolean | null {
  if (!split || split.members.length === 0) return null;
  return split.members.some((m) => m.role === "host");
}

/**
 * PD10 · D5 — THE SERVED GATE. Phone pay (card, Apple Pay, Google Pay) opens only when nothing on
 * the table's bill is still with the kitchen. Pure: the client feeds it the cart view's lines
 * (`trackLineOf`, lib/live-pass) and the view's DB clock; `create-intent` feeds it raw
 * `qr_cart_items` rows and `mms_now()` (lib/unsent-read `readServedGateInput`). ONE rule, both sides.
 *
 * ⚠️ DELIBERATELY NOT `payBlockedByUnsent` (the mutants separate the two). That rule is "Everything
 * SENT" and it has two exemptions this one must not inherit: a HOSTLESS table is never gated there
 * (nobody can send, so it pays and the drafts fire on landing) and a TO-GO draft never counts (it
 * fires at checkout). Under D5 both would charge a card before the food exists — so here a hostless
 * draft holds with its own reason, a to-go draft holds with its own, and a fired or cooking line
 * holds where "Everything sent" would have opened the door.
 *
 * Precedence, so the ONE reason names the step that moves things: a dine-in draft first (sending it
 * is the next act, and it outranks the kitchen — D5: unsent outranks kitchen), then a to-go draft,
 * then the kitchen. Null when nothing holds — or when the gate does not apply to this mode.
 */
export function servedGateVerdict(
  mode: string | null | undefined,
  lines: ReadonlyArray<TrackLine>,
  nowIso: string,
  /** Null = the host is UNKNOWN to this reader (`servedGateHost`); the server always passes a value. */
  hostPresent: boolean | null,
): ServedHold | null {
  if (!servedGateApplies(mode)) return null;
  let dineInDraft = false;
  let togoDraft = false;
  let kitchen = false;
  for (const l of lines) {
    if (!holdsServedGate(l, nowIso)) continue;
    if (l.state !== "draft") kitchen = true;
    else if (l.fulfillment === "togo") togoDraft = true;
    else dineInDraft = true;
  }
  if (dineInDraft)
    return hostPresent === null ? "unknownHost" : hostPresent ? "unsent" : "hostless";
  if (togoDraft) return "togo";
  return kitchen ? "kitchen" : null;
}

/**
 * The SERVER's decision: the verdict from ONE error-aware read, failing CLOSED. `read` is null when
 * the read did not answer (`readServedGateInput`) — and for a table that is `unreadable`, never a
 * guessed "nothing holds": unlike the diner doors' unsent read (fail-open, P2dc — a payment that
 * slips past it is today's behaviour), a payment slipping past THIS gate charges a card for food that
 * is not cooked, so `create-intent` refuses it with the shipped 503 sentence and the diner retries.
 *
 * Closed only where the gate could ever refuse (the `staffSettleUnsentVerdict` shape): a mode the
 * gate never applies to answers null whatever the read did — the route does not even spend it there.
 */
export function servedGateDecision(
  mode: string | null | undefined,
  read: { lines: ReadonlyArray<TrackLine>; nowIso: string } | null,
  hostPresent: boolean,
): ServedHold | "unreadable" | null {
  if (!servedGateApplies(mode)) return null;
  if (read === null) return "unreadable";
  return servedGateVerdict(mode, read.lines, read.nowIso, hostPresent);
}
