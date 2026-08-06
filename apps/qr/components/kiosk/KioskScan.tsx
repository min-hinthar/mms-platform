"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { scanAdd, type GroceryLine } from "@/lib/grocery";
import { t, type KioskLang } from "@/lib/kiosk/strings";

/**
 * The kiosk grocery lane (W6b): a HID keyboard-wedge scanner emits the barcode as keystrokes +
 * Enter — a window-level accumulator buffers digit bursts (flush on Enter or a short inter-key
 * gap), routes them through the EXISTING `scanAdd` (server-authoritative barcode → catalog), and
 * renders the running basket. No grocery-flow change: the scanner is just another input device
 * (M6·P6.1). Repeat-scan dedupe is the accumulator's own (a wedge can double-fire a held trigger).
 */

const MIN_BARCODE_LEN = 8;
const INTERKEY_FLUSH_MS = 80;
const REPEAT_DEDUPE_MS = 1500;

export function KioskScan({
  lang,
  cartId,
  onReview,
}: {
  lang: KioskLang;
  cartId: string;
  onReview: () => void;
}) {
  const [lines, setLines] = useState<GroceryLine[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const buffer = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  function submit(code: string) {
    const now = Date.now();
    if (lastScan.current.code === code && now - lastScan.current.at < REPEAT_DEDUPE_MS) return;
    lastScan.current = { code, at: now };
    startTransition(async () => {
      try {
        const r = await scanAdd(cartId, code);
        if (r.ok) {
          if (r.lines) setLines(r.lines);
          setStatus(`${t(lang, "add")} · ${r.name}`);
        } else {
          setStatus(t(lang, "somethingWrong"));
        }
      } catch {
        setStatus(t(lang, "somethingWrong"));
      }
    });
  }

  useEffect(() => {
    const flush = () => {
      const code = buffer.current;
      buffer.current = "";
      if (code.length >= MIN_BARCODE_LEN) submit(code);
    };
    const onKey = (e: KeyboardEvent) => {
      // A focused text input owns its own keys — the wedge listener must never eat typed text.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (e.key === "Enter") {
        flush();
        return;
      }
      if (/^\d$/.test(e.key)) {
        buffer.current += e.key;
        flushTimer.current = setTimeout(flush, INTERKEY_FLUSH_MS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable listener; submit reads refs
  }, [cartId]);

  const totalCents = lines.reduce((n, l) => n + l.qty * l.unitPriceCents, 0);

  return (
    <div className="kiosk-screen">
      <h1 className="kiosk-h1" lang={lang === "my" ? "my" : undefined}>
        {t(lang, "scanPrompt")}
      </h1>

      {/* The screen's ONE polite live region — scan results land here. */}
      <p role="status" className="kiosk-touch-hint" style={{ minHeight: 28, margin: 0 }}>
        {status ?? ""}
      </p>

      <ul role="list" aria-label={t(lang, "yourOrder")} style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--s2)" }}>
        {lines.map((l) => (
          <li
            key={l.lineId}
            className="card"
            style={{ display: "flex", justifyContent: "space-between", gap: "var(--s3)", padding: "var(--s3) var(--s4)", fontSize: "var(--xfs-body)" }}
          >
            <span>
              {l.qty} × {l.name}
            </span>
            <span style={{ fontWeight: 800 }}>${((l.qty * l.unitPriceCents) / 100).toFixed(2)}</span>
          </li>
        ))}
      </ul>

      <div style={{ position: "sticky", bottom: "var(--s4)", display: "flex", justifyContent: "center", gap: "var(--s3)" }}>
        <button type="button" className="kiosk-cta" disabled={lines.length === 0} onClick={onReview}>
          {t(lang, "viewOrder")}
          {lines.length > 0 ? ` · $${(totalCents / 100).toFixed(2)}` : ""}
        </button>
      </div>
    </div>
  );
}
