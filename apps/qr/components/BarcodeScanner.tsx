"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Phone-camera barcode scanner. Uses the native BarcodeDetector API where available
 * (Chrome/Android — zero deps), and falls back to @zxing/library on everything else.
 * Calls onScan(barcode) once per code, debounced so a held barcode doesn't spam.
 */
export function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  useEffect(() => {
    let stop = () => {};
    const emit = (code: string) => {
      const now = Date.now();
      if (code === lastRef.current.code && now - lastRef.current.t < 1500) return;
      lastRef.current = { code, t: now };
      onScan(code);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }

        // Native path
        if ("BarcodeDetector" in window) {
          // @ts-expect-error - BarcodeDetector is not in TS DOM lib yet
          const detector = new window.BarcodeDetector({ formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"] });
          let raf = 0;
          const tick = async () => {
            if (videoRef.current) {
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes[0]?.rawValue) emit(codes[0].rawValue);
              } catch {}
            }
            raf = requestAnimationFrame(tick);
          };
          tick();
          stop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); };
          return;
        }

        // Fallback: @zxing/library  (pnpm add @zxing/library)
        const { BrowserMultiFormatReader } = await import("@zxing/library");
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoElementContinuously(videoRef.current!, (result) => {
          if (result) emit(result.getText());
        });
        stop = () => { reader.reset(); stream.getTracks().forEach((t) => t.stop()); };
      } catch (e) {
        setErr("Camera unavailable — allow camera access, or type the barcode.");
      }
    })();

    return () => stop();
  }, [onScan]);

  return (
    <div>
      <video ref={videoRef} muted playsInline aria-label="Barcode scanner viewfinder"
        style={{ width: "100%", borderRadius: 16, background: "#000", aspectRatio: "4/3", objectFit: "cover" }} />
      {err && <p role="alert" style={{ color: "var(--warn)", fontSize: 13 }}>{err}</p>}
    </div>
  );
}
