"use client";
import { useId, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { openTab } from "@/lib/tabs";
import { boundWrite } from "@/lib/bounded-write";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
import { ReloadButton } from "./ReloadOffer";

/**
 * What the opener says after a tap that did not open the bill, kept APART by who authored it (the
 * TerminalSettle `SettleError` pattern): `server` is `openTab`'s own sentence (`<OutageText>`, which
 * swaps the one write-outage twin); `waiting` / `unknown` are THIS file's (Phase 2h, 9e) — the answer
 * is still out at the bound, or it was lost (the bill may have opened: "couldn't confirm").
 */
type OpenError = { kind: "server"; text: string } | { kind: "waiting" } | { kind: "unknown" };

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
 * as one; the late answer still lands (a late open re-reads the detail).
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
  const hintId = useId();

  /** The open's answer, whenever it lands — at once, or after the bound (9e: never dropped). */
  function land(res: Awaited<ReturnType<typeof openTab>>) {
    if (!res.ok) {
      setError({ kind: "server", text: res.error });
      return;
    }
    setError(null);
    if (onChanged) onChanged();
    else router.refresh();
  }

  async function onOpen() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(openTab({ cartId }));
      if (out.kind === "answer") {
        land(out.value);
        return;
      }
      if (out.kind === "threw") {
        console.error("[OpenTabButton] open unconfirmed", out.error);
        setError({ kind: "unknown" });
        return;
      }
      setError({ kind: "waiting" });
      // The late answer lands whenever it comes: its own state is a no-op once this is gone, and
      // the page's re-read is right whenever the bill did open.
      void out.late.then((late) => {
        if (late.kind === "answer") land(late.value);
        else setError({ kind: "unknown" });
      });
    } finally {
      // Frees AT THE BOUND (fact 3) — never latched on "Opening…" by the raw.
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void onOpen()}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-describedby={hintId}
        style={btn}
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
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.text} />
          ) : error.kind === "waiting" ? (
            <Chrome lang={lang} k="table.detail.openBill.waiting" echo={false} />
          ) : (
            <Chrome lang={lang} k="table.detail.openBill.unknown" echo={false} />
          )}
        </p>
      )}
      {/* The waiting line says "reload the page", and the console is installed standalone (no
          browser reload): the one way out sits BESIDE the alert, never inside it. */}
      {error?.kind === "waiting" && (
        <div style={{ marginTop: "var(--s2)" }}>
          <ReloadButton lang={lang} />
        </div>
      )}
    </div>
  );
}

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
