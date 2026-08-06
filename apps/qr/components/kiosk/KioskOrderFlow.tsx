"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openKioskOrder, kioskReset } from "@/lib/kiosk";
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
}: {
  token: string;
  door: KioskDoor;
  lang: KioskLang;
  items: KioskItem[];
  categories: string[];
  onReset: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(door === "grocery" ? "order" : "setup");
  const [ids, setIds] = useState<{ sessionId: string; cartId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tent, setTent] = useState("");
  const [minting, startMint] = useTransition();
  const mintedForGrocery = useRef(false);

  function mintFail(reason: string): string {
    if (reason === "not_configured") return t(lang, "notConfigured");
    if (reason === "occupied") return t(lang, "tablePrompt");
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
  // (router.refresh) re-reads the catalog so each customer starts on current data.
  const abandon = () => {
    const sid = ids?.sessionId;
    if (sid) void kioskReset({ k: token, sessionId: sid });
    router.refresh();
    onReset();
  };
  // Handoff/done: the ORDER SURVIVES — screen-clear only.
  const finish = () => {
    router.refresh();
    onReset();
  };

  const { countdown, keepAlive } = useKioskIdle({
    enabled: phase !== "handoff",
    onExpire: abandon,
  });

  // The handoff screen owns its own quiet return — a dwell, not the idle machinery.
  useEffect(() => {
    if (phase !== "handoff") return;
    const id = setTimeout(finish, HANDOFF_DWELL_S * 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dwell keyed on phase entry only
  }, [phase]);

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
        <IdleModal lang={lang} countdown={countdown} onStay={keepAlive} onOver={abandon} />
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

  return (
    <>
      {phase === "order" &&
        (door === "grocery" ? (
          <KioskScan lang={lang} cartId={ids.cartId} onReview={() => setPhase("review")} />
        ) : (
          <KioskMenu
            lang={lang}
            cartId={ids.cartId}
            items={items}
            categories={categories}
            onReview={() => setPhase("review")}
          />
        ))}
      {phase === "review" && (
        <KioskReview
          lang={lang}
          cartId={ids.cartId}
          items={items}
          onBack={() => setPhase("order")}
          onHandoff={() => setPhase("handoff")}
        />
      )}
      {phase === "handoff" && (
        <div className="kiosk-screen" style={{ textAlign: "center", justifyContent: "center" }}>
          <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
            {t(lang, door === "dinein" ? "handoffDinein" : "handoffTogo")}
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
      <IdleModal lang={lang} countdown={countdown} onStay={keepAlive} onOver={abandon} />
    </>
  );
}

/** The "Still there?" countdown — rendered only while the countdown runs. Any tap re-arms. */
function IdleModal({
  lang,
  countdown,
  onStay,
  onOver,
}: {
  lang: KioskLang;
  countdown: number | null;
  onStay: () => void;
  onOver: () => void;
}) {
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
          {t(lang, "idleBody")}
        </p>
        <button type="button" className="kiosk-cta" onClick={onStay}>
          {t(lang, "imHere")}
        </button>
        <button type="button" className="kiosk-ghost" onClick={onOver}>
          {t(lang, "startOver")}
        </button>
      </div>
    </div>
  );
}
