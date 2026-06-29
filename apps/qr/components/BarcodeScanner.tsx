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
    let stopped = false;
    let stop = () => {
      stopped = true;
    };
    const emit = (code: string) => {
      const now = Date.now();
      if (code === lastRef.current.code && now - lastRef.current.t < 1500) return;
      lastRef.current = { code, t: now };
      onScan(code);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErr("Camera unavailable — search for the item by name instead.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const stopStream = () => stream.getTracks().forEach((t) => t.stop());
        stop = () => {
          stopped = true;
          stopStream();
        };
        if (stopped) {
          stopStream();
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Native path
        if ("BarcodeDetector" in window) {
          // @ts-expect-error - BarcodeDetector is not in TS DOM lib yet
          const detector = new window.BarcodeDetector({
            formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"],
          });
          let raf = 0;
          const tick = async () => {
            if (stopped) return;
            if (videoRef.current) {
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes[0]?.rawValue) emit(codes[0].rawValue);
              } catch {
                // detection can throw on a bad frame; keep scanning
              }
            }
            if (!stopped) raf = requestAnimationFrame(tick);
          };
          tick();
          stop = () => {
            stopped = true;
            cancelAnimationFrame(raf);
            stopStream();
          };
          return;
        }

        // Fallback: @zxing/library
        const { BrowserMultiFormatReader } = await import("@zxing/library");
        if (stopped || !videoRef.current) {
          stopStream();
          return;
        }
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoElementContinuously(videoRef.current, (result) => {
          if (!stopped && result) emit(result.getText());
        });
        stop = () => {
          stopped = true;
          reader.reset();
          stopStream();
        };
      } catch {
        if (!stopped) setErr("Camera unavailable — search for the item by name instead.");
      }
    })();

    return () => stop();
  }, [onScan]);

  return (
    <div>
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Barcode scanner viewfinder"
        style={{
          width: "100%",
          borderRadius: 16,
          background: "#000",
          aspectRatio: "4/3",
          objectFit: "cover",
        }}
      />
      {err && (
        <p role="alert" style={{ color: "var(--warn)", fontSize: 13 }}>
          {err}
        </p>
      )}
    </div>
  );
}
