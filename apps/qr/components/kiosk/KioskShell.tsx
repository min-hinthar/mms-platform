"use client";
import { useCallback, useRef, useState } from "react";
import { useWakeLock } from "@/lib/useWakeLock";
import { t, type KioskLang } from "@/lib/kiosk/strings";
import { KioskOrderFlow } from "./KioskOrderFlow";
import type { KioskItem } from "./types";

/**
 * The kiosk shell (W6b — S5): screen state machine over the self-serve flow. This slice carries
 * attract → doors; the order/review/handoff screens land with the door flows (W6b·2/·3), which mount
 * through `onDoor`. The language chosen on the attract screen IS the chrome language (menu data stays
 * stacked-bilingual everywhere); the persistent toggle keeps the choice reversible mid-order.
 *
 * The device token (`?k=` bookmark, the /board pattern) is held here and threaded into every kiosk
 * server action — the PAGE is ungated; the actions are the gate.
 */

export type KioskDoor = "dinein" | "togo" | "grocery";
type Screen = "attract" | "doors";

export function KioskShell({
  token,
  items,
  categories,
}: {
  token: string;
  items: KioskItem[];
  categories: string[];
}) {
  // Kiosks are always-on lobby displays — keep the screen awake (the ReadyBoard pattern).
  useWakeLock();
  const [lang, setLang] = useState<KioskLang>("en");
  const [screen, setScreen] = useState<Screen>("attract");
  const [door, setDoor] = useState<KioskDoor | null>(null);
  // While an order flow is mounted it owns what "← Start over" MEANS (abandon mid-order, screen-
  // clear post-handoff) — a bare screen-clear here would leak the live session (review HIGH).
  const flowLeave = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    setDoor(null);
    setScreen("attract");
    // Each customer starts from the attract choice — the previous customer's language must not
    // greet the next one.
    setLang("en");
  }, []);

  if (screen === "attract") {
    return (
      <div className="kiosk-root">
        {/* The whole attract surface is the start control; the language tiles are the two entries. */}
        <div className="kiosk-attract" onClick={() => setScreen("doors")} role="presentation">
          <div className="kiosk-attract-glow" aria-hidden />
          <h1 className="kiosk-hero">{t("en", "welcome")}</h1>
          <p className="kiosk-hero-my" lang="my">
            {t("my", "welcome")}
          </p>
          <p className="kiosk-touch-hint">
            {t("en", "touchToStart")} · <span lang="my">{t("my", "touchToStart")}</span>
          </p>
          <div className="kiosk-lang-row">
            <button
              type="button"
              className="kiosk-lang-tile"
              onClick={(e) => {
                e.stopPropagation();
                setLang("en");
                setScreen("doors");
              }}
            >
              {t("en", "english")}
            </button>
            <button
              type="button"
              className="kiosk-lang-tile"
              lang="my"
              onClick={(e) => {
                e.stopPropagation();
                setLang("my");
                setScreen("doors");
              }}
            >
              {t("en", "burmese")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (door) {
    return (
      <div className="kiosk-root">
        <KioskTopbar lang={lang} onLang={setLang} onHome={() => (flowLeave.current ?? reset)()} />
        <KioskOrderFlow
          key={door}
          token={token}
          door={door}
          lang={lang}
          items={items}
          categories={categories}
          onReset={reset}
          leaveRef={flowLeave}
        />
      </div>
    );
  }

  return (
    <div className="kiosk-root">
      <KioskTopbar lang={lang} onLang={setLang} onHome={reset} />
      <div className="kiosk-screen">
        <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
          {t(lang, "howToday")}
        </h1>
        <div className="kiosk-door-grid">
          {(
            [
              ["dinein", "dineIn", "dineInHint"],
              ["togo", "toGo", "toGoHint"],
              ["grocery", "grocery", "groceryHint"],
            ] as const
          ).map(([key, label, hint]) => (
            <button key={key} type="button" className="kiosk-door" onClick={() => setDoor(key)}>
              <span className="kiosk-door-label" lang={lang === "my" ? "my" : undefined}>
                {t(lang, label)}
              </span>
              <span className="kiosk-door-hint" lang={lang === "my" ? "my" : undefined}>
                {t(lang, hint)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Persistent chrome: language toggle + start-over. Lives on every post-attract screen. */
function KioskTopbar({
  lang,
  onLang,
  onHome,
}: {
  lang: KioskLang;
  onLang: (l: KioskLang) => void;
  onHome: () => void;
}) {
  return (
    <div className="kiosk-topbar">
      <button type="button" className="kiosk-lang-toggle" onClick={onHome}>
        ← {t(lang, "startOver")}
      </button>
      {/* The visible label (the TARGET language's own name) IS the accessible name — an English
          aria-label would misname the control for the Burmese-mode screen reader. */}
      <button
        type="button"
        className="kiosk-lang-toggle"
        lang={lang === "en" ? "my" : undefined}
        onClick={() => onLang(lang === "en" ? "my" : "en")}
      >
        {lang === "en" ? t("en", "burmese") : t("en", "english")}
      </button>
    </div>
  );
}
