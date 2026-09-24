"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import posthog from "posthog-js";
import { Button, EmptyState, Icon } from "@mms/ui";
import { BarcodeScanner, ScanReticle, type ScannerState } from "@/components/BarcodeScanner";
import {
  cameraOpening,
  decodeHold,
  instantRefusal,
  isInAppBrowser,
  isPaper,
  readCameraPermission,
  readingOf,
  type CameraFailure,
  type CameraState,
  type PermissionStatusLike,
} from "@/lib/camera-state";
import { scanHint, type ScanHint } from "@/lib/scan-notice";
import { storageWorks } from "@/lib/grocery-queue";
import { t, type DictKey } from "@/lib/i18n";

/**
 * Phase 1c — the Scan door's ONE honest stage: every camera state, drawn in one of two geometries.
 *
 *   · INK (idle · primer · starting · live) — one fixed `section.scan-stage` box, so moving between
 *     them never changes layout. The camera prompt only ever follows the shopper's tap on the
 *     primer, or a grant they already gave (`cameraOpening`).
 *   · PAPER (denied · busy · no-camera · unsupported · in-app · failed) — an EmptyState card that
 *     grows freely and never clips, with ONE primary action (§20).
 *
 * Focus (never to <body>): a user-initiated change moves focus — Start / Try again → the stage box,
 * a failure → the panel's visible h2. An AMBIENT change (a permission flip, a visibility restart, a
 * track that ended) moves focus only when focus was inside the stage AND the element holding it is
 * about to unmount (ink ↔ paper); otherwise it is silent. The stage adds NO live region: the toast
 * is the view's announcement, and a focused heading announces itself.
 *
 * The decisions are `lib/camera-state.ts`; the stream is `components/BarcodeScanner.tsx`.
 */

/** Remembered on this device after the first `live`; cleared by a `denied`. */
const CAM_FLAG = "mms-grocery-cam";
/** "Starting the camera…" only appears if the start is still running after this long. */
const SLOW_START_MS = 400;

function rememberedGrant(): boolean {
  try {
    return window.localStorage.getItem(CAM_FLAG) === "1";
  } catch {
    return false; // deliberate: a broken store reads "not remembered" — the primer's one tap
  }
}
function remember(granted: boolean) {
  try {
    if (granted) window.localStorage.setItem(CAM_FLAG, "1");
    else window.localStorage.removeItem(CAM_FLAG);
  } catch {
    /* deliberate: a broken store only costs the primer's one tap on the next visit */
  }
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};
const storageProbe = () => typeof window === "undefined" || storageWorks();

const HINT_KEY: Record<ScanHint, DictKey> = {
  "basket-starting": "scanHintBasket",
  "offline-saved": "scanHintOfflineSaved",
  "offline-blocked": "scanHintOfflineBlocked",
  aim: "scanHintAim",
};

/** The stage's accessible name outside the primer (sr-only; EN-only by design, like the toasts). */
function stageName(cam: CameraState): string {
  if (cam === "live") return "Scanner on — point your camera at a barcode";
  if (cam === "starting") return t("en", "scanStarting");
  return "Barcode scanner";
}

const PANEL: Record<
  CameraFailure,
  { title: DictKey; body: DictKey; retry: boolean; tone: "empty" | "error" }
> = {
  denied: { title: "camDeniedTitle", body: "camDeniedBody", retry: true, tone: "empty" },
  busy: { title: "camBusyTitle", body: "camBusyBody", retry: true, tone: "error" },
  failed: { title: "camFailedTitle", body: "camFailedBody", retry: true, tone: "error" },
  "no-camera": { title: "camNoneTitle", body: "camNoneBody", retry: false, tone: "empty" },
  unsupported: {
    title: "camUnsupportedTitle",
    body: "camUnsupportedBody",
    retry: false,
    tone: "empty",
  },
  "in-app": { title: "camInAppTitle", body: "camInAppBody", retry: false, tone: "empty" },
};

/** EN + MY on one control — the Burmese half separated by the label's flex gap, never a space. */
function Bi({ k }: { k: DictKey }) {
  return (
    <>
      {t("en", k)}
      <span lang="my" className="scan-btn-my">
        {t("my", k)}
      </span>
    </>
  );
}

type Geometry = "ink" | "primer" | "paper";
const geometryOf = (s: CameraState): Geometry =>
  isPaper(s) ? "paper" : s === "primer" ? "primer" : "ink";

export function ScanStage({
  onScan,
  cartReady,
  sheetOpen,
  result,
  onSearch,
}: {
  onScan: (code: string) => void;
  /** The basket exists — sightings may be announced (`decodeHold`). */
  cartReady: boolean;
  /** The basket sheet covers the stage — sightings are swallowed (`decodeHold`). */
  sheetOpen: boolean;
  /** The page's result bar (chip / notice), or null. Rendered only while starting or live. */
  result: ReactNode;
  /** Focus the name search — the way out every panel offers. */
  onSearch: () => void;
}) {
  const [cam, setCam] = useState<CameraState>("idle");
  const [attempt, setAttempt] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  const [storage] = useState(storageProbe);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const camRef = useRef<CameraState>("idle");
  const tapAtRef = useRef<number | null>(null);
  const focusNextRef = useRef<"stage" | "panel" | null>(null);
  const reportedRef = useRef(false);

  /** Every state change goes through here, so focus, memory and analytics can never drift apart. */
  const go = useCallback((next: CameraState, how: "user" | "ambient") => {
    const prev = camRef.current;
    const root = rootRef.current;
    const focusInside = !!root && root.contains(document.activeElement);
    if (how === "user" || (focusInside && geometryOf(prev) !== geometryOf(next)))
      focusNextRef.current = isPaper(next) ? "panel" : "stage";
    if (next === "live") remember(true);
    else if (next === "denied") remember(false);
    if (!reportedRef.current && (next === "live" || isPaper(next))) {
      reportedRef.current = true;
      posthog.capture("grocery_camera", { state: next });
    }
    camRef.current = next;
    setSlow(false);
    setCam(next);
  }, []);

  const start = useCallback(() => {
    tapAtRef.current = performance.now();
    setHelpOpen(false);
    setAttempt((a) => a + 1);
    go("starting", "user");
  }, [go]);

  // The opening decision: the permission query (500ms race) + the remembered grant.
  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatusLike | null = null;
    const inApp = isInAppBrowser(navigator.userAgent);
    const cameraApi = typeof navigator.mediaDevices?.getUserMedia === "function";
    const secure = window.isSecureContext !== false;
    const permissions = (navigator as { permissions?: unknown }).permissions as Parameters<
      typeof readCameraPermission
    >[0];
    void readCameraPermission(permissions).then(({ reading, status: st }) => {
      if (cancelled) return;
      const opening = cameraOpening({
        cameraApi,
        secure,
        inApp,
        permission: reading,
        rememberedGrant: rememberedGrant(),
      });
      go(opening === "auto" ? "starting" : opening, "ambient");
      if (!st) return;
      status = st;
      // Granted from the browser's settings while a panel shows → start without another tap.
      st.onchange = () => {
        if (readingOf(st.state) !== "granted" || !isPaper(camRef.current)) return;
        tapAtRef.current = null;
        setAttempt((a) => a + 1);
        go("starting", "ambient");
      };
    });
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [go]);

  const onState = useCallback(
    (s: ScannerState) => {
      if (s === "starting") {
        if (camRef.current === "live") go("starting", "ambient"); // a visibility restart
        return;
      }
      if (s === "live") {
        tapAtRef.current = null;
        go("live", "ambient");
        return;
      }
      const tapAt = tapAtRef.current;
      tapAtRef.current = null;
      // A denial right after a tap = the browser refused without asking: open the settings help.
      if (tapAt !== null && instantRefusal({ failure: s, elapsedMs: performance.now() - tapAt }))
        setHelpOpen(true);
      go(s, "ambient");
    },
    [go],
  );

  // Focus follows the state (see the docblock) — applied after the new target has rendered.
  useEffect(() => {
    const target = focusNextRef.current;
    if (!target) return;
    focusNextRef.current = null;
    if (target === "stage") stageRef.current?.focus();
    else rootRef.current?.querySelector<HTMLElement>("#scan-panel-title")?.focus();
  }, [cam]);

  useEffect(() => {
    if (cam !== "starting") return;
    const id = window.setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => window.clearTimeout(id);
  }, [cam, attempt]);

  const hold = decodeHold({ cartReady, sheetOpen });
  const streaming = cam === "starting" || cam === "live";
  const hintKey = HINT_KEY[scanHint({ cartReady, online, storage })];

  if (isPaper(cam)) {
    const p = PANEL[cam];
    return (
      <div ref={rootRef}>
        <div className="scan-panel mms-settle">
          <EmptyState
            layout="page"
            titleAs="h2"
            titleId="scan-panel-title"
            tone={p.tone}
            icon={<Icon name="camera-off" size={28} />}
            title={
              <>
                {t("en", p.title)}
                <span lang="my" className="scan-panel-my">
                  {t("my", p.title)}
                </span>
              </>
            }
            subtitle={
              <>
                {t("en", p.body)}
                <span lang="my" className="scan-panel-my">
                  {t("my", p.body)}
                </span>
              </>
            }
            action={
              <div className="scan-panel-actions">
                {p.retry ? (
                  <>
                    <Button variant="primary" className="scan-btn-bi" onClick={start}>
                      <Bi k="tryAgain" />
                    </Button>
                    <Button variant="secondary" className="scan-btn-bi" onClick={onSearch}>
                      <Bi k="searchByName" />
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" className="scan-btn-bi" onClick={onSearch}>
                    <Bi k="searchByName" />
                  </Button>
                )}
                {cam === "denied" && (
                  <details
                    className="scan-help"
                    open={helpOpen}
                    onToggle={(e) => setHelpOpen(e.currentTarget.open)}
                  >
                    <summary>
                      {t("en", "camHelpSummary")}
                      <span lang="my" className="scan-panel-my">
                        {t("my", "camHelpSummary")}
                      </span>
                    </summary>
                    {/* EN device paths on purpose: the OS labels read as the device shows them.
                        Verify both on real devices before ship (OPEN-ITEMS). */}
                    <ol>
                      <li>
                        iPhone · Safari: tap aA in the address bar → Website Settings → Camera →
                        Allow.
                      </li>
                      <li>
                        Android · Chrome: tap the icon left of the address → Permissions → Camera →
                        Allow.
                      </li>
                    </ol>
                  </details>
                )}
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <section
        ref={stageRef}
        id="scan-stage"
        className="scan-stage"
        data-state={cam}
        aria-labelledby="scan-stage-title"
        tabIndex={-1}
      >
        {cam === "primer" ? (
          <div className="scan-primer">
            <h2 id="scan-stage-title" className="scan-stage-title">
              {t("en", "scanTitle")}
            </h2>
            <p className="scan-primer-my" lang="my">
              {t("my", "scanTitle")}
            </p>
            <Button variant="primary" className="scan-on-ink scan-btn-bi" onClick={start}>
              <Icon name="camera" size={20} />
              <Bi k="scanStart" />
            </Button>
          </div>
        ) : (
          <h2 id="scan-stage-title" className="sr-only">
            {stageName(cam)}
          </h2>
        )}
        {cam === "idle" && <ScanReticle />}
        {streaming && (
          <BarcodeScanner onScan={onScan} onState={onState} hold={hold} attempt={attempt} />
        )}
        {cam === "live" && !result && (
          <p className="scan-hint">
            <span>{t("en", hintKey)}</span>
            <span lang="my" className="scan-hint-my">
              {t("my", hintKey)}
            </span>
          </p>
        )}
        {cam === "starting" && slow && (
          <p className="scan-starting">
            <span>{t("en", "scanStarting")}</span>
            <span lang="my" className="scan-hint-my">
              {t("my", "scanStarting")}
            </span>
          </p>
        )}
        {streaming && result}
      </section>
      {cam === "primer" && (
        <p className="scan-note">
          {t("en", "scanNote")}
          <span lang="my" className="scan-note-my">
            {t("my", "scanNote")}
          </span>
        </p>
      )}
    </div>
  );
}
