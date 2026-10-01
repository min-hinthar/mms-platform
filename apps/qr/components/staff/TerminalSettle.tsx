"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, type ButtonVariant } from "@mms/ui";
import { settleCard } from "@/lib/terminal";
import { inFlightMsg, type InFlightHolder } from "@/lib/inflight-refusal";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { MsgText } from "./StaffMsg";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2c · gate ──
import { settleBlockedMsg } from "@/lib/staff-send-view";
// ── Phase 2g · reader ──
import {
  readerNameText,
  readerStartRefused,
  type ReaderName,
  type ReaderStatus,
} from "@/lib/reader-collect";
import { useReaderCollect } from "./ReaderCollectContext";

/**
 * P2 — the two error sources on this surface, kept APART.
 *
 * `kind: "server"` is a sentence the Server Action returned, so it goes through `<OutageText>`
 * (which swaps the one write-outage twin and passes everything else through verbatim).
 * `kind: "local"` is copy THIS file authors for a thrown/rejected action — routing that through
 * `<OutageText>` would pass it through as English forever while looking converted, so it branches
 * to its own dictionary key instead.
 *
 * `kind: "inflight"` (Phase 2c · register, P2w) — the start was refused while money is already
 * moving on the table; `holder` picks the `settle.inflight.*` key (never the server's English).
 */
type SettleError =
  | { kind: "server"; text: string }
  | { kind: "local" }
  | { kind: "inflight"; holder: InFlightHolder }
  // Phase 2c · gate — the settle gate refused the start (dishes the kitchen never got), with the
  // server's count. Shown here, SAID by the page's one region (the jump hands it up).
  | { kind: "unsent"; units: number }
  // P2el — the gate could not read the lines, so the reader was never asked; the tap retries.
  | { kind: "unreadable" };

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Card-present settle at the register (W6c). Two halves, split on purpose:
 *
 *  - `TerminalSettleButton` starts the collect. It lives INSIDE the open-cart settle section — and
 *    unmounts seconds after starting (the settlement freeze flips `paymentInFlight`, which unmounts
 *    the whole section on the next detail refresh).
 *  - `TerminalCollectPanel` is the live collect window — a VIEW since Phase 2g. The collect itself
 *    (the record, the poll, cancel, the landing) lives in `ReaderCollectProvider`, above every staff
 *    route: the W6a lesson (UI that must outlive the settle section cannot keep its state inside it)
 *    taken one level further, because the DETAIL did not outlive "← Floor", Lock, More or a mint
 *    landing either (P2em), and a start answering after its detail left polled nothing (P2en).
 *
 * The button never sends an amount; the provider's poll (`terminalStatus`) is also what keeps the
 * settlement freeze alive across a slow chip interaction (server-side `extendSettlement`).
 */

/** What the collect panel says, handed to the page's ONE polite region (P2r) — the panel shows the
 *  same words visibly but is no live region of its own. `tone` colours nothing here; the page's
 *  region reads it for its precedence and tint. The ONE binding is `readerStatus` (lib). */
export type { ReaderStatus };

/** What the TAP knows about the bill the reader is asked to collect (Phase 2g): read from the props
 *  of the render that was tapped, so a detail that is gone by the answer (P2en) still names it. */
export type ReaderTap = {
  isCounter: boolean;
  name: ReaderName;
  /** Phase 2f — whether food went to the kitchen unpaid, AT THE TAP (the paid card says so). */
  sentEarly: boolean;
  cartId: string | null;
};

export function TerminalSettleButton({
  sessionId,
  totalCents,
  tap,
  variant = "secondary",
  onStarted,
  blocked = false,
  blockedNoteId,
  onBlockedTap,
  running = false,
  gateLive,
  onChanged,
  onSettleOutcome,
}: {
  sessionId: string;
  totalCents: number;
  /** Phase 2g — the bill's facts as of this render; a tap carries them into the collect. */
  tap: ReaderTap;
  /** Phase 2c — the reader is never the settle section's primary (`settlePrimary`, owner decision
   *  8): it sits BELOW cash as a secondary. The prop exists so that decision stays one line. */
  variant?: Extract<ButtonVariant, "primary" | "secondary">;
  /** The page's own work once the reader took the charge (the collect itself is the provider's,
   *  started before this runs — so it starts whether or not the page is still here). */
  onStarted?: () => void;
  /** Phase 2c · gate — the settle gate holds (read by the page): `aria-disabled`, described by the
   *  page's note, and a tap starts NO reader — it hands up (`onBlockedTap`). */
  blocked?: boolean;
  /** The page's note that says why — prepended to the trigger's description while blocked. */
  blockedNoteId?: string;
  /** A refused tap (`null` — the page's count is the reading), or the server's `unsent` refusal
   *  (its count): the page says why in its one region and moves focus to the Send. */
  onBlockedTap?: (units: number | null) => void;
  /** Codex round 2 (P2) — the page's own re-read. A raced `unsent` refusal means the page's detail
   *  is stale (a dish landed after its last read): without a re-read the Send the refusal points at
   *  may not exist yet, and staff wait for the next poll to act on the fix they were just told. */
  onChanged?: () => void;
  /** Phase 2c · gate — the bill is a card-on-file running bill (the page's ONE binding,
   *  `settlePrimary(tab) === "secureTab"`): a raced refusal says the running bill's sentence, the
   *  same one the page's note and region say — never a second sentence for the same fact. */
  running?: boolean;
  /** Phase 2c · gate — whether the page's one region still holds the gate's line. `false` once it
   *  retired (a send, a later read with nothing unsent, another setter): the raced line never
   *  outlives it. Omitted (no page): the line lives until the table reads blocked or the next tap. */
  gateLive?: boolean;
  /** Phase 2d · review fixes — every refusal (`refused`: nothing recorded) or unknown outcome (the
   *  answer never came) of this control's reader START (a refused start takes nothing), as it lands. The page says it where this control
   *  cannot: once the detail unmounted mid-settle, this control's own line is gone with it. */
  onSettleOutcome?: (outcome: "refused" | "unknown") => void;
}) {
  const lang = useStaffLang();
  // Phase 2g · reader — the collect's owner, above navigation. `reader.start` is the provider's
  // STABLE function: the resolved promise below calls it whether or not this button (or the detail
  // around it) is still mounted, so a start that answers after a switch still polls (P2en).
  const reader = useReaderCollect();
  const startCollect = reader.start;
  // The ONE refusal left (D1): another table's collect is live — there is one reader. Shown as a
  // held control with its reason; refused at the tap (`reader.startRefused`, a ref read) before the
  // server is asked.
  const busyElsewhere = readerStartRefused({
    collect: reader.record,
    live: reader.live,
    sessionId,
  });
  const [busy, setBusy] = useState(false);
  // The tap-time guard: a REF, read when the finger lands (two taps in one frame both read the
  // render before `busy`).
  const inFlight = useRef(false);
  const [error, setError] = useState<SettleError | null>(null);
  // Phase 2c · gate — render-time adjustment (guarded set-during-render): a raced `unsent` line is
  // DROPPED, not merely hidden, once the page has caught up — the page read the drafts (`blocked`:
  // its note says it now) or its own line retired. Hidden, it came back under a live trigger once
  // the dishes were sent, saying they had not been (critic finding).
  if (error?.kind === "unsent" && (blocked || gateLive === false)) setError(null);

  async function start() {
    if (inFlight.current) return;
    if (blocked) {
      // Phase 2c · gate — refused at the tap: no reader, no freeze; the page names the fix.
      setError(null);
      onBlockedTap?.(null);
      return;
    }
    // Phase 2g · reader — another table holds the one reader: no freeze, no PaymentIntent, no
    // reader command. The note under the trigger (its description) says whose and why.
    if (reader.startRefused(sessionId)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await settleCard({ sessionId });
      setBusy(false);
      if (!res.ok) {
        onSettleOutcome?.("refused"); // the reader was never asked for the money
        setError(
          res.code === "inflight"
            ? { kind: "inflight", holder: res.holder }
            : res.code === "unsent"
              ? { kind: "unsent", units: res.units }
              : res.code === "unreadable"
                ? { kind: "unreadable" }
                : { kind: "server", text: res.error },
        );
        // Phase 2c · gate — a raced refusal (a guest's dish landed after the page's last read):
        // the page says it in its one region and takes the cashier to the Send.
        if (res.code === "unsent") {
          onChanged?.();
          onBlockedTap?.(res.units);
        }
        return;
      }
      // The collect starts in the PROVIDER, with the tap's facts — never through a closure of the
      // detail, which may have unmounted while this was in the air.
      startCollect({
        sessionId,
        paymentIntentId: res.paymentIntentId,
        totalCents: res.totalCents,
        ...tap,
      });
      onStarted?.();
    } catch {
      // A rejected action (Next redacts the message in prod) must never latch the button on
      // "Starting…" — the W10c bug class.
      setBusy(false);
      setError({ kind: "local" });
      // The start's answer never came: the reader may be asking for the money right now.
      onSettleOutcome?.("unknown");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div>
      {/* Phase 2c — a `@mms/ui` Button: busy is aria-busy + aria-disabled with the label kept as a
          stated word, never a native `disabled` that drops focus to <body> under the tap (K35). */}
      <Button
        variant={variant}
        size="xl"
        block
        busy={busy}
        busyLabel={<Chrome lang={lang} k="settle.reader.starting" echo={false} />}
        // Phase 2c · gate — the attribute (spread only when set) plus `start`'s own guard.
        {...(blocked ? { "aria-disabled": true } : {})}
        // Phase 2g · reader — held while the one reader collects for another table (its note below).
        {...(busyElsewhere ? { "aria-disabled": true } : {})}
        aria-describedby={[
          blocked && blockedNoteId ? blockedNoteId : null,
          busyElsewhere ? "terminal-busy" : null,
          "terminal-hint",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={start}
      >
        <Chrome lang={lang} k="settle.reader.trigger" vars={{ m: fmt(totalCents) }} echo="stack" />
      </Button>
      {/* Phase 2g · reader — WHY the trigger is held, before anyone taps: whose payment the one
          reader is taking. The trigger's description reads it first; never a live region (the
          page has one). */}
      {busyElsewhere && reader.record && (
        <p id="terminal-busy" style={{ ...hint, color: "var(--warn)" }}>
          <Chrome
            lang={lang}
            k="settle.reader.busyElsewhere"
            vars={{ x: readerNameText(lang, reader.record.name) }}
            echo="stack"
          />
        </p>
      )}
      <p id="terminal-hint" style={hint}>
        <Chrome lang={lang} k="settle.reader.hint" echo="stack" />
      </p>
      {/* Phase 2c · gate — the settle gate's refusal is SHOWN here but SAID by the page's one polite
          region (the jump hands it up), so it carries no role of its own; once the page's note
          under the triggers says the same (the page read the drafts), this line is dropped for it
          (the render-time clear above). */}
      {error?.kind === "unsent" && (
        <p style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          <Chrome
            lang={lang}
            k={settleBlockedMsg(error.units, running).k}
            vars={settleBlockedMsg(error.units, running).vars}
            echo={false}
          />
        </p>
      )}
      {error && error.kind !== "unsent" && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.text} />
          ) : error.kind === "unreadable" ? (
            <Chrome lang={lang} k="settle.unsentUnreadable" echo={false} />
          ) : error.kind === "inflight" ? (
            <Chrome
              lang={lang}
              k={inFlightMsg(error.holder).k}
              vars={inFlightMsg(error.holder).vars}
              echo={false}
            />
          ) : (
            <Chrome lang={lang} k="settle.reader.startFailed" echo={false} />
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The live collect window — a VIEW over `ReaderCollectProvider` (Phase 2g), rendered by the table
 * detail it belongs to and by nothing else: null unless the collect is THIS table's, and null while a
 * charged-not-recorded collect was put away ("Back to payment" — D4: the provider keeps polling
 * silently until the order lands). On a landing the provider hands the counter's paid card to the
 * detail (`shownHere`'s `onLanded`); for a table settle there is no card — the detail's paid state is
 * the quiet signal.
 *
 * Phase 2c — the panel's status is SAID through the page's one polite region (`onStatus`, P2r) and
 * SHOWN here as plain text. Focus comes here only on the first mount after a START made in view (the
 * settle section unmounts under the cashier as the freeze lands) — never on a re-attach, which would
 * pull focus off the pane heading the person just landed on.
 */
export function TerminalCollectPanel({
  sessionId,
  onStatus,
}: {
  sessionId: string;
  /** The page's ONE polite region takes the panel's status (and a cancel refusal) from here. */
  onStatus?: (s: ReaderStatus) => void;
}) {
  const lang = useStaffLang();
  const reader = useReaderCollect();
  const collect = reader.record;
  const mine = collect !== null && collect.sessionId === sessionId && !collect.hidden;
  const phase = reader.poll.phase;
  // ⚠️ NOT an <OutageText> candidate, and the reason is narrower than "it is a server string".
  // `failCopy` (in `status` below) is set ONLY in the reducer's `failed` arm, whose `error` is
  // `declineCopy(intent.last_payment_error.code)` (lib/terminal.ts) — a card-decline sentence, which
  // has no Burmese twin. The arm that CAN carry STAFF_WRITE_OUTAGE is `!res.ok`, and the reducer
  // swallows that into `misses` without rendering it. So wrapping this would be a behavioural no-op
  // (OutageText passes every non-twin sentence through verbatim) and would imply a swap that can
  // never happen. What it actually needs is a twin per decline reason, a dictionary question.
  const status = reader.status;
  const cancelError = reader.cancelError;
  const panelRef = useRef<HTMLDivElement>(null);
  const owed = mine && reader.focusOwed === collect.paymentIntentId;
  const focusTaken = reader.focusTaken;
  const pi = collect?.paymentIntentId ?? null;
  useEffect(() => {
    // The settle section unmounts under the cashier as the freeze lands — carry focus here, once.
    if (!owed || pi === null) return;
    panelRef.current?.focus();
    focusTaken(pi);
  }, [owed, pi, focusTaken]);

  // What the region SPEAKS (`readerSpoken`): a cancel refusal is the newer fact while it stands.
  const spokenKey = mine && reader.spoken ? JSON.stringify(reader.spoken) : null;
  useEffect(() => {
    if (spokenKey === null) return;
    // The parent's setter, from an effect (never during render); keyed on the VALUE so a poll tick
    // that changes nothing re-announces nothing.
    onStatus?.(JSON.parse(spokenKey) as ReaderStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the spoken VALUE; onStatus is the parent's stable setter
  }, [spokenKey]);

  if (collect === null || !mine || status === null) return null;
  const recordingLong = reader.recordingLong;

  return (
    // `role="group"` is load-bearing, not decoration: a bare <div> maps to the `generic` role, which
    // PROHIBITS an author-supplied name — so the `aria-label` below was being discarded, and the
    // cashier's focus (carried here by the effect above, as the settle section unmounts under them)
    // landed on an unnamed container at the moment the reader took the transaction. A blind audit
    // found it; `check-staff-lang.mjs` rule 3d now holds the shape.
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label={sx(lang, "settle.a11y.readerPanel")}
      className="card"
      style={{ ...panel, outline: "none" }}
    >
      <p style={{ ...panelTitle, color: phase === "failed" ? "var(--warn)" : "var(--tx)" }}>
        {/* The amount stays OUTSIDE the dictionary sentence here — it trails the middot in both
            tongues — so it keeps its <strong> and its Latin figure untouched. */}
        {phase === "collecting" && (
          <>
            <Chrome lang={lang} k="settle.reader.onReader" echo="inline" />
            {" · "}
            <strong>{fmt(collect.totalCents)}</strong>
          </>
        )}
        {phase === "recording" && (
          <>
            <Chrome lang={lang} k="settle.reader.paid" echo="inline" />
            {" · "}
            <strong>{fmt(collect.totalCents)}</strong>
          </>
        )}
        {phase === "failed" && <Chrome lang={lang} k="settle.reader.failedTitle" echo="stack" />}
        {phase === "canceled" && (
          <Chrome lang={lang} k="settle.reader.canceledTitle" echo="stack" />
        )}
      </p>
      {/* SHOWN here, SAID by the page's one polite region (`onStatus` above) — no `role` of its own:
          a second polite region under one <main> was OPEN-ITEMS P2r. */}
      <p style={{ ...panelSub, color: status.tone === "warn" ? "var(--warn)" : "var(--t2)" }}>
        <MsgText lang={lang} msg={status.msg} />
        {/* Lifted out of the template literal it used to be spliced into: `<OutageText>` returns
            JSX and cannot live inside a string. */}
        {cancelError !== null && (
          <>
            {" "}
            {cancelError.kind === "server" ? (
              <OutageText lang={lang} error={cancelError.text} />
            ) : (
              <Chrome lang={lang} k="settle.reader.cancelFailed" echo={false} />
            )}
          </>
        )}
      </p>
      {phase === "collecting" && (
        <Button
          variant="secondary"
          size="lg"
          style={{ alignSelf: "flex-start" }}
          busy={reader.cancelBusy}
          busyLabel={<Chrome lang={lang} k="settle.reader.canceling" echo={false} />}
          onClick={() => void reader.cancel()}
        >
          <Chrome lang={lang} k="settle.reader.cancelBtn" echo="stack" />
        </Button>
      )}
      {(phase === "failed" || phase === "canceled" || recordingLong) && (
        // Declined or cancelled: the collect is cleared. Charged-not-recorded (D4): the panel is put
        // away and the provider keeps polling — the order still lands, and its #CODE with it.
        <Button
          variant="secondary"
          size="lg"
          style={{ alignSelf: "flex-start" }}
          onClick={reader.dismiss}
        >
          <Chrome lang={lang} k="settle.reader.backToSettle" echo="stack" />
        </Button>
      )}
    </div>
  );
}

const panel: CSSProperties = {
  marginTop: "var(--s4)",
  padding: "var(--s4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--s3)",
};
const panelTitle: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-bold)",
};
const panelSub: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
