"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openKioskOrder, kioskReset } from "@/lib/kiosk";
import type { GroceryLine } from "@/lib/grocery";
import { t, type KioskLang } from "@/lib/kiosk/strings";
import { useKioskIdle } from "./useKioskIdle";
import { KioskMenu } from "./KioskMenu";
import { KioskScan } from "./KioskScan";
import { KioskReview } from "./KioskReview";
import type { KioskItem } from "./types";
import type { KioskDoor } from "./KioskShell";

/**
 * The kiosk order flow (W6b): setup → order → review → handoff, with sessionId/cartId in MEMORY
 * only. The idle machinery forks by phase (the plan's sharpest rule): mid-order idle ABANDONS
 * (kioskReset closes + cancels — the order is dead, a claimed table frees), while the HANDOFF
 * screen clears the SCREEN only — the order's home is now the register queue / floor board, and
 * destroying it while the customer walks to the counter is the bug the fork exists to prevent.
 * The fork has a THIRD leg (review finding): once the customer taps "Pay at the counter" they have
 * COMMITTED — an idle timeout on the upsell screen advances to the handoff (the order survives),
 * it never abandons a decision the customer already made.
 */

type Phase = "setup" | "order" | "review" | "handoff";
/** The handoff screen returns to attract on its own after this long (screen-clear ONLY). */
const HANDOFF_DWELL_S = 20;

export function KioskOrderFlow({
  token,
  door,
  lang,
  items,
  categories,
  onReset,
  leaveRef,
}: {
  token: string;
  door: KioskDoor;
  lang: KioskLang;
  items: KioskItem[];
  categories: string[];
  onReset: () => void;
  /** The topbar's "← Start over" fires through here — it must ABANDON mid-order (close + cancel),
   *  not just clear the screen (the identical-label IdleModal button already does; a screen-only
   *  clear leaks a live session that blocks its table and squats in the register queue). */
  leaveRef: { current: (() => void) | null };
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(door === "grocery" ? "order" : "setup");
  const [ids, setIds] = useState<{ sessionId: string; cartId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tent, setTent] = useState("");
  // Committed = the customer said "pay at the counter" (the upsell interposed). From here the
  // order's fate is the counter's — a timeout moves the SCREEN forward, never kills the order.
  const [committed, setCommitted] = useState(false);
  // Order tallies live HERE, not in the order screens (review finding): "Back" from review
  // remounts KioskMenu/KioskScan, and a per-mount tally of 0 over a non-empty cart disables
  // "View order" — a dead end whose only exits are double-adding or walking away.
  const [menuCount, setMenuCount] = useState(0);
  const [groceryLines, setGroceryLines] = useState<GroceryLine[]>([]);
  const [minting, startMint] = useTransition();
  const mintedForGrocery = useRef(false);

  function mintFail(reason: string): string {
    if (reason === "not_configured") return t(lang, "notConfigured");
    if (reason === "occupied") return t(lang, "tableTaken");
    if (reason === "table") return t(lang, "tableUnknown");
    return t(lang, "somethingWrong");
  }

  function mint(input: { tableNumber?: number; customerName?: string }) {
    setError(null);
    startMint(async () => {
      try {
        const r = await openKioskOrder({ k: token, kind: door, ...input });
        if (!r.ok) {
          setError(mintFail(r.reason));
          return;
        }
        setIds({ sessionId: r.sessionId, cartId: r.cartId });
        setPhase("order");
      } catch {
        setError(t(lang, "somethingWrong"));
      }
    });
  }

  // Grocery skips setup — mint on arrival (once; a transition retry re-taps through the error CTA).
  useEffect(() => {
    if (door === "grocery" && !mintedForGrocery.current) {
      mintedForGrocery.current = true;
      mint({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only kick for the grocery door
  }, []);

  // Abandon: close + cancel server-side, then hand the shell back to attract. A fresh RSC pass
  // (router.refresh) re-reads the catalog so each customer starts on current data. The reset runs
  // detached (the customer is already gone) but NOT fire-and-forget: a transient failure gets one
  // retry, a `frozen` refusal is the register owning the order (correct — stand down), and a final
  // failure is logged loud (the sweeper owns the leak, but staff deserve the trace).
  const abandon = useCallback(() => {
    const sid = ids?.sessionId;
    if (sid) {
      void (async () => {
        const first = await kioskReset({ k: token, sessionId: sid });
        if (first.ok || first.reason !== "error") return;
        const retry = await kioskReset({ k: token, sessionId: sid });
        if (!retry.ok && retry.reason === "error")
          console.error("[kiosk] abandon reset failed twice — session leaks to the sweeper", {
            sessionId: sid,
          });
      })();
    }
    router.refresh();
    onReset();
  }, [ids, token, router, onReset]);
  // Handoff/done: the ORDER SURVIVES — screen-clear only.
  const finish = useCallback(() => {
    router.refresh();
    onReset();
  }, [router, onReset]);
  const toHandoff = useCallback(() => setPhase("handoff"), []);

  const { countdown, keepAlive } = useKioskIdle({
    enabled: phase !== "handoff",
    // The committed fork: an idle timeout after "Pay at the counter" walks the screen forward to
    // the handoff (dwell → attract). Only an UNcommitted idle abandons.
    onExpire: committed ? toHandoff : abandon,
  });

  // The topbar's "← Start over": EXPLICIT intent, so it abandons everywhere before the handoff —
  // including the upsell screen (unlike the timeout, which respects the commitment). Post-handoff
  // the register owns the order and the button is a screen-clear.
  useEffect(() => {
    leaveRef.current = phase === "handoff" ? finish : abandon;
    return () => {
      leaveRef.current = null;
    };
  }, [leaveRef, phase, abandon, finish]);

  // The handoff screen owns its own quiet return — a dwell, not the idle machinery.
  useEffect(() => {
    if (phase !== "handoff") return;
    const id = setTimeout(finish, HANDOFF_DWELL_S * 1000);
    return () => clearTimeout(id);
  }, [phase, finish]);

  if (phase === "setup") {
    const isDinein = door === "dinein";
    return (
      <div className="kiosk-screen">
        <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
          {t(lang, isDinein ? "tableNumber" : "yourName")}
        </h1>
        <p className="kiosk-touch-hint" lang={lang === "my" ? "my" : undefined}>
          {t(lang, isDinein ? "tablePrompt" : "namePrompt")}
        </p>
        <form
          style={{ display: "grid", gap: "var(--s4)", maxWidth: 480 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (isDinein) {
              const n = Number.parseInt(tent, 10);
              if (!Number.isInteger(n) || n < 1) return;
              mint({ tableNumber: n });
            } else {
              mint({ customerName: name.trim() || undefined });
            }
          }}
        >
          {isDinein ? (
            <input
              className="kiosk-input"
              value={tent}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              autoComplete="off"
              aria-label={t(lang, "tableNumber")}
              onChange={(e) => setTent(e.target.value.replace(/\D/g, ""))}
            />
          ) : (
            <input
              className="kiosk-input"
              value={name}
              maxLength={40}
              autoComplete="off"
              aria-label={t(lang, "yourName")}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <button type="submit" className="kiosk-cta" disabled={minting}>
            {t(lang, "start")}
          </button>
        </form>
        {/* The flow's ONE live region — mint refusals (occupied table, not-configured) land here. */}
        <p role="status" className="kiosk-touch-hint" style={{ color: "var(--warn)", minHeight: 28 }}>
          {error ?? ""}
        </p>
        <IdleModal
          lang={lang}
          countdown={countdown}
          committed={committed}
          onStay={keepAlive}
          onOver={abandon}
        />
      </div>
    );
  }

  if (!ids) {
    // Grocery mint in flight / failed — never a blank screen.
    return (
      <div className="kiosk-screen">
        <p role="status" className="kiosk-touch-hint" style={{ minHeight: 28 }}>
          {error ?? "…"}
        </p>
        {error && (
          <button type="button" className="kiosk-ghost" onClick={abandon}>
            {t(lang, "startOver")}
          </button>
        )}
      </div>
    );
  }

  // Which handoff promise the counter can actually keep: a name call-out needs a captured name
  // (grocery never captures one; the to-go name field is optional).
  const handoffKey =
    door === "dinein" ? "handoffDinein" : name.trim() ? "handoffTogo" : "handoffCounter";

  return (
    <>
      {phase === "order" &&
        (door === "grocery" ? (
          <KioskScan
            lang={lang}
            cartId={ids.cartId}
            lines={groceryLines}
            onLines={setGroceryLines}
            onReview={() => setPhase("review")}
          />
        ) : (
          <KioskMenu
            lang={lang}
            cartId={ids.cartId}
            items={items}
            categories={categories}
            count={menuCount}
            onAdded={(qty) => setMenuCount((n) => n + qty)}
            onReview={() => setPhase("review")}
          />
        ))}
      {phase === "review" && (
        <KioskReview
          lang={lang}
          cartId={ids.cartId}
          items={items}
          onBack={() => setPhase("order")}
          onCommitted={() => setCommitted(true)}
          onHandoff={toHandoff}
        />
      )}
      {phase === "handoff" && (
        <div className="kiosk-screen" style={{ textAlign: "center", justifyContent: "center" }}>
          <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
            {t(lang, handoffKey)}
          </h1>
          <p className="kiosk-touch-hint" lang={lang === "my" ? "my" : undefined}>
            {t(lang, "handoffThanks")}
          </p>
          <div>
            <button type="button" className="kiosk-cta" onClick={finish}>
              {t(lang, "done")}
            </button>
          </div>
        </div>
      )}
      <IdleModal
        lang={lang}
        countdown={countdown}
        committed={committed}
        onStay={keepAlive}
        onOver={abandon}
      />
    </>
  );
}

/** The "Still there?" countdown — rendered only while the countdown runs. Any tap re-arms. */
function IdleModal({
  lang,
  countdown,
  committed,
  onStay,
  onOver,
}: {
  lang: KioskLang;
  countdown: number | null;
  committed: boolean;
  onStay: () => void;
  onOver: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Move focus INTO the dialog on open (review finding): without it, a keyboard/switch user's
  // focus sits behind the scrim while the countdown runs out on them.
  useEffect(() => {
    const open = countdown != null;
    if (open && !wasOpen.current) stayRef.current?.focus();
    wasOpen.current = open;
  }, [countdown]);
  if (countdown == null) return null;
  return (
    <div className="mms-scrim" style={{ display: "grid", placeItems: "center", position: "fixed", inset: 0 }}>
      <div
        role="alertdialog"
        aria-label={t(lang, "stillThere")}
        className="card"
        style={{ padding: "var(--s6)", textAlign: "center", display: "grid", gap: "var(--s4)", maxWidth: 460 }}
      >
        <h2 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
          {t(lang, "stillThere")} · {countdown}
        </h2>
        <p className="kiosk-touch-hint" lang={lang === "my" ? "my" : undefined}>
          {/* Committed = the order survives the timeout — never threaten to clear it. */}
          {t(lang, committed ? "idleBodyCommitted" : "idleBody")}
        </p>
        <button type="button" ref={stayRef} className="kiosk-cta" onClick={onStay}>
          {t(lang, "imHere")}
        </button>
        <button type="button" className="kiosk-ghost" onClick={onOver}>
          {t(lang, "startOver")}
        </button>
      </div>
    </div>
  );
}
