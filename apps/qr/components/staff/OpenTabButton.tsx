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
  hasOwnWait,
  ownWaitSlot,
  subscribeOwnWait,
  type Late,
} from "@/lib/bounded-write";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
import { ReloadButton } from "./ReloadOffer";
import { useResaid } from "./useResaid";

/**
 * What the opener says after a tap that did not open the bill, kept APART by who authored it (the
 * TerminalSettle `SettleError` pattern): `server` is `openTab`'s own sentence (`<OutageText>`, which
 * swaps the one write-outage twin); `waiting` / `unknown` are THIS file's (Phase 2h, 9e) — the answer
 * is still out at the bound, or it was lost (the bill may have opened: "couldn't confirm").
 */
type OpenError = { kind: "server"; text: string } | { kind: "waiting" } | { kind: "unknown" };
type OpenResult = Awaited<ReturnType<typeof openTab>>;
/** What a button mounted while its cart's open is still out shows before any tap of its own (B1). */
const HELD: OpenError = { kind: "waiting" };

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
 * one. A tap on the held control RE-SAYS "no answer yet" as a new node (`useResaid` keys the alert's
 * content), so it is announced again instead of reading as a dead tap. The hold lets go when the late
 * answer lands: a late open stays held as an on-time one does; a late refusal or a lost answer frees
 * it, with its sentence.
 *
 * Codex round 2 on #310 (B1) — the hold is the CART's, never this mount's: it lives in the tab's
 * own-wait register under `open:<cart>` (`ownWaitSlot`, holding the open's late answer while it is
 * out), as the other remount-safe guards do. In refs, switching to another table and back remounted
 * this button with both reset, and the next tap sent another open behind the unresolved one. A
 * button mounted while its cart's open still waits renders HELD (subscribed) with the waiting line
 * and the reload, a tap re-says it, and the late answer lands on it as on the one that sent it.
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
  // The tap-time guard — a REF read when the finger lands (two taps in one frame both read the same
  // render), beside the `busy` the button says.
  const inFlight = useRef(false);
  // Codex r1 follow-up on #310 (V3) — the HOLD as the tap reads it: set from the bound until the
  // late answer lands, set and cleared with the same updates that move `waiting`. A tap's handler is
  // the COMMITTED render's, so between a late answer and React's commit its `waiting` still reads
  // true — and a tap in that beat re-said "no answer yet" over a bill that had just opened.
  // Codex r2 (B1) — kept per CART in the tab's own-wait register, never per mount (the docblock): it
  // holds the open's late answer while the open is out, and `false` when none is.
  const ownWaitKey = `open:${cartId}`;
  const heldOut = ownWaitSlot<Promise<Late<OpenResult>> | false>(ownWaitKey, false);
  // B1 — the same hold, READ BY RENDER: a button mounted while its cart's open still waits renders
  // held with the waiting line before any tap of its own, and frees when the late answer clears it.
  const held = useSyncExternalStore(
    subscribeOwnWait,
    () => hasOwnWait(ownWaitKey),
    () => false,
  );
  const hintId = useId();
  const alertId = useId();
  // CX2 — every SET of the line moves this, even to the sentence standing: the alert's content is
  // keyed by it, so a re-said "no answer yet" replaces the node and is announced again.
  const said = useResaid(error);
  // What the line says: this mount's own word (an answer, a lost one, a re-said wait), else the
  // hold's "no answer yet" while this cart's open is out past the bound (B1: set nowhere else).
  const shown = error ?? (held ? HELD : null);
  // CX2 — this open is still unanswered past the bound: the control is held, described by the line.
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
  // B1 — the late answer reaches the CURRENT `land` (its props), from an effect bound to the cart.
  const landRef = useRef(land);
  useEffect(() => {
    landRef.current = land;
  });

  // B1 — mounted while this cart's open is still out (sent by a mount that is gone): its late answer
  // lands HERE — the one that sent it can no longer say it. Its own state is a no-op once this goes.
  useEffect(() => {
    const late = ownWaitSlot<Promise<Late<OpenResult>> | false>(ownWaitKey, false).current;
    if (late === false) return;
    let live = true;
    void late.then((answer) => {
      if (!live) return;
      if (answer.kind !== "answer") {
        setError({ kind: "unknown" });
        return;
      }
      // A late open holds "Opening…" until the re-read swaps this button away (D8).
      if (answer.value.ok) {
        inFlight.current = true;
        setBusy(true);
      }
      landRef.current(answer.value);
    });
    return () => {
      live = false;
    };
  }, [ownWaitKey]);

  async function onOpen() {
    if (inFlight.current || heldOut.current) {
      // CX2 — its own open still waits past the bound: re-say "no answer yet", send nothing. Read
      // from the ref, never the render (V3): a late answer may have landed and not yet committed.
      // B1 — the hold is the cart's: a remounted button's fresh `inFlight` does not free it.
      if (heldOut.current) setError({ kind: "waiting" });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    // The bill opened: stay busy until the re-read swaps this button away (D8).
    let opened = false;
    // Still out at the bound: the guard stays spent until the late answer lands (CX2).
    let outstanding = false;
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(openTab({ cartId }));
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
      // "No answer yet" is said by the HOLD (`shown`) — one source for this button and for any
      // mounted on this cart since, so the line cannot say one thing here and another there.
      heldOut.current = out.late;
      outstanding = true;
      // The late answer lands whenever it comes: its own state is a no-op once this is gone, and
      // the page's re-read is right whenever the bill did open.
      void out.late.then((late) => {
        // The hold ends the moment the answer lands, before its state commits (V3).
        heldOut.current = false;
        if (late.kind !== "answer") {
          // A lost answer ends the hold: said, and the open may be asked again.
          inFlight.current = false;
          setError({ kind: "unknown" });
          return;
        }
        // A LATE open holds exactly like an on-time one, until the re-read swaps it away; a late
        // refusal ends the hold, with its sentence.
        if (late.value.ok) setBusy(true);
        else inFlight.current = false;
        land(late.value);
      });
    } finally {
      // "Opening…" frees AT THE BOUND (fact 3) — never latched by the raw — unless it opened; the
      // guard stays spent while the answer is still out (`outstanding`, CX2).
      if (!opened) {
        if (!outstanding) inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void onOpen()}
        // Held while it opens AND while its own open is still out past the bound (CX2).
        aria-disabled={busy || waiting || undefined}
        aria-busy={busy || undefined}
        aria-describedby={waiting ? `${alertId} ${hintId}` : hintId}
        style={waiting ? { ...btn, ...heldLook } : btn}
      >
        {/* A stated word while it opens, never a bare ellipsis: the content IS the name. */}
        {busy ? (
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
          {/* Keyed by `said` (CX2): a re-said sentence replaces the node, so it is announced again. */}
          <span key={said}>
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
