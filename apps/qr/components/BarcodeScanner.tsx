"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { freshScanGate, sightBarcode, type ScanGate } from "@/lib/scan-gate";
import {
  cameraFailure,
  gateOnHoldChange,
  isInAppBrowser,
  type CameraFailure,
  type DecodeHold,
} from "@/lib/camera-state";

/**
 * Phone-camera barcode scanner — the STREAM and the DECODER, nothing else (Phase 1c). The camera
 * state machine, its copy and every recovery panel live in `components/grocery/ScanStage.tsx`; this
 * component reports what happened (`onState`) and what it read (`onScan`).
 *
 * Uses the native BarcodeDetector API where available (Chrome/Android — zero deps) and falls back to
 * @zxing/library on everything else.
 *
 * ⚠️ THIS COMPONENT DOES NOT DECIDE WHAT IS CHARGED (M186). `sightBarcode` here is only a THROTTLE —
 * one barcode resting in frame is a continuous stream of identical codes. Whether a decoded barcode
 * becomes a charge is `classifyScan`'s answer, made from the BASKET, in the page. What this component
 * DOES decide is whether a sighting is announced at all (`hold`, from `decodeHold`): under the basket
 * sheet (`swallow`) and before the basket exists (`hold`) every sighting is RECORDED in the throttle
 * and none is announced; only the `hold → none` edge resets the throttle (`gateOnHoldChange`).
 *
 * The stream effect is keyed on `[attempt, visible]` ONLY. `onScan` / `onState` / `hold` are read
 * through latest-value refs, so neither the basket landing (a new `onScan` identity) nor the sheet
 * opening ever restarts the camera. `visible` stops every track while the page is hidden — the
 * camera light never stays on in a pocket — and restarts it without a tap when the page returns.
 */

/** What the stream reports. `starting` again after `live` means a visibility restart. */
export type ScannerState = "starting" | "live" | CameraFailure;

/** How long the gold lock corners show per announced sighting. */
export const LOCK_MS = 900;

const FORMATS = ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"];

type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue?: string }[]> };

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageVisible = () => document.visibilityState !== "hidden";

function Corners() {
  return (
    <>
      <span className="scan-corner" data-c="tl" />
      <span className="scan-corner" data-c="tr" />
      <span className="scan-corner" data-c="bl" />
      <span className="scan-corner" data-c="br" />
    </>
  );
}

/**
 * The four L-corners, plus their gold "lit" twin for the lock. Decorative (`aria-hidden`): the lock
 * is beat one of the decode feedback and claims only "I read it". `lockSeq` re-keys the element so
 * back-to-back locks each restart the animation.
 */
export function ScanReticle({
  lockSeq = 0,
  locked = false,
}: {
  lockSeq?: number;
  locked?: boolean;
}) {
  return (
    <div className="scan-reticle" aria-hidden key={lockSeq} data-lock={locked || undefined}>
      <Corners />
      <div className="scan-reticle-lit">
        <Corners />
      </div>
    </div>
  );
}

export function BarcodeScanner({
  onScan,
  onState,
  hold,
  attempt,
}: {
  onScan: (code: string) => void;
  onState: (s: ScannerState) => void;
  hold: DecodeHold;
  /** Bumped by Start / Try again: a new attempt is a new stream. */
  attempt: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const gateRef = useRef<ScanGate>(freshScanGate());
  const onScanRef = useRef(onScan);
  const onStateRef = useRef(onState);
  const holdRef = useRef<DecodeHold>(hold);
  const lockTimer = useRef<number | null>(null);
  const [lock, setLock] = useState({ seq: 0, on: false });
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, () => true);

  // Latest-value refs — written in effects, read by the long-lived stream closure.
  useEffect(() => {
    onScanRef.current = onScan;
    onStateRef.current = onState;
  });
  useEffect(() => {
    const prev = holdRef.current;
    holdRef.current = hold;
    // Only hold → none resets: the basket now exists, so the jar already in frame announces ONCE.
    // swallow → none keeps the throttle, so the jar behind the sheet is never announced on close.
    if (gateOnHoldChange(prev, hold) === "reset") gateRef.current = freshScanGate();
  }, [hold]);
  useEffect(
    () => () => {
      if (lockTimer.current !== null) window.clearTimeout(lockTimer.current);
    },
    [],
  );

  useEffect(() => {
    // Hidden page → no stream at all; the previous run's cleanup already stopped every track.
    if (!visible) return;
    let stopped = false;
    let teardown = () => {};
    const inApp = isInAppBrowser(navigator.userAgent);
    const report = (s: ScannerState) => {
      if (!stopped) onStateRef.current(s);
    };

    const emit = (code: string) => {
      // `performance.now()`, not `Date.now()`: the throttle measures an elapsed interval, and a wall
      // clock can step (NTP resync — this page is built around offline→online transitions).
      const { emit: fresh, next } = sightBarcode(gateRef.current, code, performance.now());
      // Stored on EVERY sighting — announced, suppressed, or held. Skipping the store while paused
      // would make a jar that sat in frame behind the sheet look new the moment the sheet closes.
      gateRef.current = next;
      if (!fresh || holdRef.current !== "none") return;
      // Beat one — the lock, before the network. It claims "read", never "added".
      setLock((l) => ({ seq: l.seq + 1, on: true }));
      if (lockTimer.current !== null) window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(() => setLock((l) => ({ ...l, on: false })), LOCK_MS);
      onScanRef.current(code);
    };

    // A microtask, not a synchronous call: the stage's state update belongs to the stream's
    // lifecycle, not to this effect's body.
    void Promise.resolve().then(() => report("starting"));

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          report(inApp ? "in-app" : "unsupported");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const tracks = stream.getTracks();
        const stopTracks = () => tracks.forEach((t) => t.stop());
        if (stopped) {
          stopTracks();
          return;
        }
        // A track that ends on its own (unplugged, revoked, taken by the OS) is a failure we did not
        // cause. Ours never fire it: `stopped` is set before we stop anything.
        const onEnded = () => report("failed");
        tracks.forEach((t) => t.addEventListener("ended", onEnded));
        teardown = () => {
          tracks.forEach((t) => t.removeEventListener("ended", onEnded));
          stopTracks();
        };
        const video = videoRef.current;
        if (!video) {
          teardown();
          return;
        }
        video.srcObject = stream;
        video.addEventListener("playing", () => report("live"), { once: true });
        try {
          await video.play();
        } catch {
          // A refused play() must never leave an ink slate that says nothing — it is a failure.
          report("failed");
          return;
        }
        if (stopped) return;

        // Native path.
        if ("BarcodeDetector" in window) {
          const Ctor = (window as unknown as { BarcodeDetector: new (o: object) => Detector })
            .BarcodeDetector;
          const detector = new Ctor({ formats: FORMATS });
          let raf = 0;
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (!stopped && codes[0]?.rawValue) emit(codes[0].rawValue);
            } catch {
              // Deliberate: detection can throw on a bad frame — keep scanning.
            }
            if (!stopped) raf = requestAnimationFrame(() => void tick());
          };
          void tick();
          const stopStream = teardown;
          teardown = () => {
            cancelAnimationFrame(raf);
            stopStream();
          };
          return;
        }

        // Fallback: @zxing/library.
        const { BrowserMultiFormatReader } = await import("@zxing/library");
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        reader
          .decodeFromVideoElementContinuously(video, (result) => {
            if (!stopped && result) emit(result.getText());
          })
          // The decoder refusing the element is the same failure as a refused play().
          .catch(() => report("failed"));
        const stopStream = teardown;
        teardown = () => {
          reader.reset();
          stopStream();
        };
      } catch (err) {
        report(cameraFailure(err, { inApp }));
      }
    })();

    return () => {
      stopped = true;
      teardown();
    };
  }, [attempt, visible]);

  return (
    <>
      <video ref={videoRef} className="scan-video" muted playsInline aria-hidden />
      <span className="scan-window" aria-hidden />
      <ScanReticle lockSeq={lock.seq} locked={lock.on} />
    </>
  );
}
