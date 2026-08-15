"use client";
import type { CSSProperties } from "react";
import { useLocale } from "./LocaleProvider";

/**
 * W5 — the one-tap EN↔MY toggle (S2). The kiosk's single-button form, with its a11y rule copied
 * verbatim (KioskShell): the visible label is the TARGET language's OWN name — `မြန်မာ` in EN
 * mode, `English` in MY mode — and that label IS the accessible name (an English aria-label would
 * misname the control for the Burmese-mode screen reader). The `lang` attribute rides the Burmese
 * label so TTS pronounces it as Burmese (WCAG 3.1.2).
 */
export function LocaleToggle({ variant = "chip" }: { variant?: "chip" | "row" }) {
  const { locale, setLocale } = useLocale();
  const target = locale === "my" ? "en" : "my";
  const label =
    target === "my" ? (
      <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
        မြန်မာ
      </span>
    ) : (
      "English"
    );
  return (
    <button
      type="button"
      onClick={() => setLocale(target)}
      className={variant === "chip" ? "app-header-rewards" : "nav-link"}
      style={variant === "chip" ? chip : row}
    >
      <span aria-hidden>🌐</span>
      {label}
    </button>
  );
}

const chip: CSSProperties = {
  border: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};
const row: CSSProperties = {
  minHeight: 44,
  padding: "0 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};
