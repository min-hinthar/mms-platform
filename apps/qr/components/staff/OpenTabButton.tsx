"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { openTab } from "@/lib/tabs";
import {
  boundWrite,
  moveOwnOut,
  ownWaitSlot,
  settleLate,
  subscribeOwnWait,
  type Late,
  type OwnOut,
} from "@/lib/bounded-write";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
import { ReloadButton } from "./ReloadOffer";
import { useResaid } from "./useResaid";

/**
 * What the opener says after a tap that did not open the bill, kept APART by who authored it (the
 * TerminalSettle `SettleError` pattern): `server` is `openTab`'s own sentence (`<OutageText>`, which
 * swaps the one write-outage twin); `unknown` is THIS file's (Phase 2h, 9e) — the answer was lost
 * (the bill may have opened: "couldn't confirm"). `waiting` — still out at the bound — is never this
 * state: the cart's hold alone says it (`HELD`, R1).
 */
type OpenError = { kind: "server"; text: string } | { kind: "unknown" };
type OpenLine = OpenError | { kind: "waiting" };
type OpenResult = Awaited<ReturnType<typeof openTab>>;
/** The cart's open, held from the moment it is sent until its answer (R2): its late answer, and
 *  whether the bound has passed with none. */
type OpenOut = OwnOut<OpenResult>;
/** What the line says while the cart's open is out past the bound — for every mount alike (B1). */
const HELD: OpenLine = { kind: "waiting" };

/**
 * Open a trust tab on a dine-in table (S3.1). Low-stakes, single-tap (no confirm step): it marks the
 * cart so the floor reads "Tab open" and the table settles once at close instead of each round — it
 * moves no money and unlocks nothing new, so the copy stays honest about what it does. The server
 * (openTab → mms_open_tab) re-derives authority + the dine-in/open guards; this is just the affordance.
 * On success the parent's realtime re-fetch picks up the new tab state; router.refresh nudges it now.
 *
 * Phase 2h — every word is the dictionary's now (`table.detail.openBill.*`, plain words: never "tab",
 * never "settle", in the device's language), the action is awaited with a BOUND (`boundWrite`, called
 * outside any transition), busy is state cleared in a `finally`, the control is `aria-disabled` (never
 * native — a native disable drops focus to <body> under the tap), and a lost or slow answer is said
 * as one; the late answer still lands (a late open re-reads the detail). An OPENED bill keeps
 * "Opening…" until the re-read swaps this button away (S2 critic D8) — on time or late — so a second
 * tap in that beat never asks for a second open.
 *
 * Codex round 1 on #310 (CX2) — "Opening…" frees at the bound, but the GUARD does not: while this
 * open is still unanswered the control is HELD (aria-disabled, never native; the handler refuses at
 * the tap), as the clear and merge controls hold — a second open would only queue behind the stuck
 * one. A tap on the held control RE-SAYS "no answer yet" as a new node (a re-say count keys the
 * alert's content), so it is announced again instead of reading as a dead tap. The hold lets go when
 * the late answer lands: a late open stays held as an on-time one does; a late refusal or a lost
 * answer frees it, with its sentence.
 *
 * Codex round 2 on #310 (B1) — the hold is the CART's, never this mount's: it lives in the tab's
 * own-wait register under `open:<cart>`, as the other remount-safe guards do. In refs, switching to
 * another table and back remounted this button with both reset, and the next tap sent another open
 * behind the unresolved one.
 *
 * Codex r2 follow-up (R1 · R2) — and it is held from the moment the open is SENT, not from the bound
 * (`OwnOut`: before the bound every mount reads "Opening…", after it "no answer yet"), so a button
 * remounted inside the first STAFF_HANG_MS refuses too instead of sending a second open; each answer
 * releases only the hold its own open set (`moveOwnOut`, token-scoped). Every mount ATTACHES to its
 * cart's open whenever the hold appears — at mount, or while mounted (two buttons on one cart) — and
 * applies the answer once (`heard`): a late open holds "Opening…" and re-reads the detail, a late
 * refusal is said, a lost one says "couldn't confirm". Attached only at mount, a button remounted
 * before the bound never heard the answer: it read "no answer yet" over a bill that had opened.
 */
export function OpenTabButton({
  cartId,
  onChanged,
}: {
  cartId: string;
  /** Phase 2d · split — the parent's own detail re-read (register's `onChanged`, the one binding):
   *  a `router.refresh()` re-renders the whole route and cannot update the detail's own state. The
   *  refresh stays only as the no-parent fallback. */
  onChanged?: () => void;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OpenError | null>(null);
  // This mount's own tap-time guard — a REF read when the finger lands (two taps in one frame both
  // read the same render), beside the `busy` the button says. It spans this mount's own open until
  // the bound, and an OPENED bill until the re-read swaps the button away (D8); past the bound the
  // CART's hold is the guard, for this button and any mounted since (R2).
  const inFlight = useRef(false);
  // Codex r1 follow-up on #310 (V3) — the HOLD as the tap reads it: the register, written by the same
  // updates that move the render. A tap's handler is the COMMITTED render's, so between a late answer
  // and React's commit the render's hold still reads held — and a tap in that beat re-said "no answer
  // yet" over a bill that had just opened. Codex r2 (B1 · R2) — kept per CART in the tab's own-wait
  // register, never per mount: set when the open is sent, released by its answer.
  const ownWaitKey = `open:${cartId}`;
  const heldOut = ownWaitSlot<OpenOut | false>(ownWaitKey, false);
  // B1 · R1 — the same hold, READ BY RENDER (subscribed): a button mounted while its cart's open is
  // out shows it before any tap of its own, and frees when the answer releases it.
  const hold = useSyncExternalStore<OpenOut | false>(
    subscribeOwnWait,
    () => ownWaitSlot<OpenOut | false>(ownWaitKey, false).current,
    () => false,
  );
  // R2 — sent and not yet at the bound (by this mount, or one that is gone): "Opening…".
  const opening = hold !== false && !hold.past;
  const opens = busy || opening;
  const hintId = useId();
  const alertId = useId();
  // CX2 — the alert's content is keyed by these: an answer's sentence (every SET of `error`, even to
  // the sentence standing) and a re-said "no answer yet" (`resaid`) replace the node, so each is
  // announced again.
  const said = useResaid(error);
  const [resaid, setResaid] = useState(0);
  // What the line says. While this cart's open is out the HOLD alone speaks — nothing before the
  // bound ("Opening…" says it), "no answer yet" past it — for this button and any mounted since
  // (B1 · R1); otherwise this mount's own word: an answer, or a lost one.
  const shown: OpenLine | null = hold === false ? error : hold.past ? HELD : null;
  // CX2 — this cart's open is still unanswered past the bound: the control is held, described by it.
  const waiting = shown?.kind === "waiting";

  /** The open's answer, whenever it lands — at once, or after the bound (9e: never dropped). */
  function land(res: OpenResult) {
    if (!res.ok) {
      setError({ kind: "server", text: res.error });
      return;
    }
    setError(null);
    if (onChanged) onChanged();
    else router.refresh();
  }
  /** A LATE answer to this cart's open, on whichever mount hears it (R1): a lost one says "couldn't
   *  confirm" and frees; an open holds "Opening…" until the re-read swaps this away (D8); a refusal
   *  frees, with its sentence. */
  function hearLate(late: Late<OpenResult>) {
    if (late.kind !== "answer") {
      setError({ kind: "unknown" });
      return;
    }
    if (late.value.ok) {
      inFlight.current = true;
      setBusy(true);
    }
    land(late.value);
  }
  // R1 — the late answers this mount already hears: its OWN open (the bound's `.then` in `onOpen`),
  // and every hold it attached to. One late answer is applied once, by one listener here.
  const heard = useRef(new Set<Promise<Late<OpenResult>>>());
  const alive = useRef(false);
  // The late answer reaches the CURRENT `hearLate` (its props) and is applied only while this
  // button still shows the cart it was sent for.
  const hearRef = useRef(hearLate);
  const keyRef = useRef(ownWaitKey);
  useEffect(() => {
    hearRef.current = hearLate;
    keyRef.current = ownWaitKey;
  });
  useEffect(() => {
    // Re-armed at every setup (a cleanup-only latch stays false after Strict Mode's first pass).
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // R1 — whenever this cart's open is out and this mount does not already hear it (sent by a
  // button that is gone, or by another on the same cart), its answer lands HERE: keyed on the hold,
  // never only on the mount, so a hold that appears while this is mounted is heard too.
  const holdLate = hold === false ? null : hold.late;
  useEffect(() => {
    if (holdLate === null || heard.current.has(holdLate)) return;
    heard.current.add(holdLate);
    const key = ownWaitKey;
    void holdLate.then((answer) => {
      if (alive.current && keyRef.current === key) hearRef.current(answer);
    });
  }, [holdLate, ownWaitKey]);

  async function onOpen() {
    // Refused at the tap, read from the ref and the register — never the render (V3): this mount's
    // own open (an opened bill holds until the swap, D8), or this CART's open still out, sent here or
    // by a button that is gone (B1 · R2). Past the bound the tap re-says "no answer yet" (CX2);
    // before it, "Opening…" already says it.
    const out0 = heldOut.current;
    if (inFlight.current || out0 !== false) {
      if (out0 !== false && out0.past) setResaid((n) => n + 1);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    // 9b — the RAW action, awaited with a bound below (`boundWrite` never rejects, tracks the raw).
    const raw = openTab({ cartId });
    const late = settleLate(raw);
    // R2 — HELD from the moment it is sent, in the cart's register: a button mounted again inside
    // the bound refuses instead of sending a second open. This mount hears its own answer below.
    heard.current.add(late);
    ownWaitSlot<OpenOut | false>(ownWaitKey, false).current = { late, past: false };
    // Released by THIS open's answer only (token-scoped, `moveOwnOut`), whichever way and whenever
    // it comes — the first reaction to it, so the hold ends before the answer's state commits (V3).
    void late.then(() => moveOwnOut(ownWaitKey, late, false));
    // The bill opened: stay busy until the re-read swaps this button away (D8).
    let opened = false;
    try {
      const out = await boundWrite(raw);
      if (out.kind === "answer") {
        opened = out.value.ok;
        land(out.value);
        return;
      }
      if (out.kind === "threw") {
        console.error("[OpenTabButton] open unconfirmed", out.error);
        setError({ kind: "unknown" });
        return;
      }
      // Still out at the bound: the hold turns "no answer yet" — the HOLD says it (`shown`), one
      // source for this button and any mounted on this cart, so no two can say different things.
      moveOwnOut(ownWaitKey, late, { late, past: true });
      // The late answer lands whenever it comes: its own state is a no-op once this is gone, and
      // the page's re-read is right whenever the bill did open.
      void late.then(hearLate);
    } finally {
      // "Opening…" frees AT THE BOUND (fact 3) — never latched by the raw — unless it opened (D8).
      if (!opened) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void onOpen()}
        // Held while it opens AND while its cart's open is still out past the bound (CX2 · R2).
        aria-disabled={opens || waiting || undefined}
        aria-busy={opens || undefined}
        aria-describedby={waiting ? `${alertId} ${hintId}` : hintId}
        style={waiting ? { ...btn, ...heldLook } : btn}
      >
        {/* A stated word while it opens, never a bare ellipsis: the content IS the name. */}
        {opens ? (
          <Chrome lang={lang} k="table.detail.openBill.opening" echo={false} />
        ) : (
          <Chrome lang={lang} k="table.detail.openBill.btn" echo="stack" />
        )}
      </button>
      <p id={hintId} style={hint}>
        <Chrome lang={lang} k="table.detail.openBill.hint" echo="stack" />
      </p>
      {shown && (
        <p id={alertId} role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {/* Keyed by the two counts (CX2): a re-said sentence replaces the node, announced again. */}
          <span key={`${said}.${resaid}`}>
            {shown.kind === "server" ? (
              <OutageText lang={lang} error={shown.text} />
            ) : shown.kind === "waiting" ? (
              <Chrome lang={lang} k="table.detail.openBill.waiting" echo={false} />
            ) : (
              <Chrome lang={lang} k="table.detail.openBill.unknown" echo={false} />
            )}
          </span>
        </p>
      )}
      {/* The waiting line says "reload the page", and the console is installed standalone (no
          browser reload): the one way out sits BESIDE the alert, never inside it. */}
      {waiting && (
        <div style={{ marginTop: "var(--s2)" }}>
          <ReloadButton lang={lang} />
        </div>
      )}
    </div>
  );
}

// A held control's dim (the clear and merge controls'), never a native disable.
const heldLook: CSSProperties = { opacity: 0.5, cursor: "not-allowed" };
const btn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
