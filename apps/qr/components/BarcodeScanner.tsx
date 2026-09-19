"use client";
import { useEffect, useRef, useState } from "react";

import { freshScanGate, sightBarcode, type ScanGate } from "@/lib/scan-gate";

/**
 * Phone-camera barcode scanner. Uses the native BarcodeDetector API where available
 * (Chrome/Android — zero deps), and falls back to @zxing/library on everything else.
 *
 * ⚠️ THIS COMPONENT DOES NOT DECIDE WHAT IS CHARGED (M186). `sightBarcode` here is only a
 * THROTTLE — one barcode resting in frame is a continuous stream of identical codes, and without
 * it the page would hear about it sixty times a second. Whether a decoded barcode becomes a charge
 * is `classifyScan`'s answer, made from the BASKET, in `lib/scan-gate.ts`: a camera cannot tell a
 * jar resting in frame from a second identical jar, so nothing here should try. The worst this
 * throttle can do is drop a duplicate toast; the worst it used to do was bill twice.
 */
export function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const gateRef = useRef<ScanGate>(freshScanGate());

  useEffect(() => {
    let stopped = false;
    let stop = () => {
      stopped = true;
    };
    const emit = (code: string) => {
      // `performance.now()`, not `Date.now()`: the throttle measures an elapsed interval, and a
      // wall clock can step (NTP resync — this page is built around offline→online transitions).
      // A step would only cost a duplicate toast now, but a monotonic reading is what the
      // measurement actually means, and it costs nothing.
      const { emit: announce, next } = sightBarcode(gateRef.current, code, performance.now());
      // Stored on every sighting, emitted or not — otherwise the throttle measures time since the
      // last announcement and re-announces on a schedule under a barcode that never left.
      gateRef.current = next;
      if (announce) onScan(code);
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
      {/* R1 — once the camera has refused, the 4:3 black viewfinder is the largest thing on the
          screen and does nothing (a 400×300 slab on a laptop, and on a 667px phone it pushed the
          only recovery copy under the fixed checkout band). `hidden` keeps the element for the ref
          and the stream teardown; the alert below is the whole Scan tab until the shopper searches
          by name instead. Four reviewers, three viewports. */}
      <video
        ref={videoRef}
        muted
        playsInline
        hidden={Boolean(err)}
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
        <p role="alert" style={{ color: "var(--warn)", fontSize: "var(--fs-sm)" }}>
          {err}
        </p>
      )}
    </div>
  );
}
