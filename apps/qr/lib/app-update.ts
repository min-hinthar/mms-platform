import {
  CLIENT_BUILD,
  STAFF_CONTRACT,
  parseServed,
  versionVerdict,
  type VersionVerdict,
} from "./build-stamp";
import {
  anyOwnWait,
  monoNow,
  msSinceWriteSettled,
  stalledWrite,
  youngWrite,
} from "./bounded-write";
import {
  autoBlock,
  manualBlock,
  reloadHolds,
  type ApplyBlock,
  type GuardInput,
} from "./reload-guard";
import type { TabStore } from "./settled-view";
import {
  CURRENT,
  stepUpdate,
  type ApplyOutcome,
  type UpdateEvent,
  type UpdatePhase,
} from "./update-policy";
import type { ConnectionTruth } from "./useConnectionTruth";

export type { ApplyOutcome } from "./update-policy";

/**
 * Phase 2i (P2bi) — the per-tab update store and THE ONLY CODE THAT RELOADS FOR AN UPDATE.
 * Client-safe with every browser dependency injected (`ApplyDeps`), so the whole executor runs in
 * node with fakes; no `next/*`, no React.
 *
 * ⚠️ ONE EXECUTOR. A person's tap and the automatic countdown both end in `applyUpdate`, which
 * re-reads its OWN mode's verdict at the call and AGAIN synchronously after its last await (W4: the
 * pre-flight awaits a fetch and a health probe, and a write can start, a dialog open or a pick be
 * made in between), and makes the document inert in the same task as `location.reload()` — so
 * nothing can be tapped into the page while it unloads. It never posts SKIP_WAITING, never calls
 * `router.refresh()` and never navigates (`location.assign`).
 *
 * ⚠️ AN ATTEMPT IS RECORDED BEFORE THE RELOAD (`markApplied`), per target build, in this tab. If the
 * next document is still not that build (a CDN still serving the old one), the automatic path never
 * retries that target in this tab — only a person can. `afterLoad` clears the record on success.
 */

// ── the store ────────────────────────────────────────────────────────────────────────────────────
type Snapshot = { phase: UpdatePhase; refusal: ApplyBlock | null };
let snap: Snapshot = { phase: CURRENT, refusal: null };
const listeners = new Set<() => void>();
const checkListeners = new Set<() => void>();
let deps: ApplyDeps | null = null;

function publish(next: Snapshot): void {
  if (next.phase === snap.phase && next.refusal === snap.refusal) return;
  snap = next;
  for (const l of [...listeners]) l();
}

/** The phase and the last MANUAL refusal (null once cleared). Same object until a change. */
export function updateSnapshot(): Snapshot {
  return snap;
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The reducer's `check` effect — the version watcher subscribes and runs a check at once. */
export function onCheckRequested(listener: () => void): () => void {
  checkListeners.add(listener);
  return () => {
    checkListeners.delete(listener);
  };
}

/** The row's refusal is cleared when what it said no longer holds (the row re-checks it). */
export function clearRefusal(): void {
  publish({ phase: snap.phase, refusal: null });
}

/** `stepUpdate`, published, and its effect run with the installed dependencies. */
export function dispatchUpdate(ev: UpdateEvent): void {
  const { phase, effect } = stepUpdate(snap.phase, ev);
  // A tap starts a new attempt: the last refusal is no longer what this row says.
  const refusal = ev.e === "tap" ? null : snap.refusal;
  publish({ phase, refusal });
  if (effect === null) return;
  if ("check" in effect) {
    for (const l of [...checkListeners]) l();
    return;
  }
  const mode = effect.apply;
  const d = deps;
  if (d === null) {
    // No watcher installed (this tab never mounted the staff layout): nothing can apply.
    land(mode, { kind: "refused", block: { kind: "check" } });
    return;
  }
  void applyUpdate(mode, d).then((o) => land(mode, o));
}

function land(mode: "manual" | "auto", o: ApplyOutcome): void {
  const { phase } = stepUpdate(snap.phase, { e: "outcome", o, now: monoNow() });
  // Only a PERSON is told why: an automatic attempt that is refused simply waits.
  const refusal = o.kind === "refused" && mode === "manual" ? o.block : null;
  publish({ phase, refusal });
}

// ── the executor ─────────────────────────────────────────────────────────────────────────────────
export type ApplyDeps = {
  /** `readGuardInput` bound to the live document, read NOW. */
  guardInput(): GuardInput;
  /** `navigator.onLine !== false`, read now. */
  online(): boolean;
  /** `makeFetchServed(fetch)`: no-store, credentials omitted, bounded, parsed strictly. */
  fetchServed(): Promise<VersionVerdict>;
  /** `freshTruth` — bypasses the probe's 15s cache. */
  freshTruth(): Promise<ConnectionTruth>;
  /** The one-shot record: this tab already reloaded INTO `build` without arriving. */
  triedTarget(build: string): boolean;
  markApplied(build: string): void;
  /** `document.body.inert = true` + `<html data-reloading>`. */
  freeze(): void;
  /** `location.reload()`, plus ONE re-issue after RELOAD_STUCK_MS. */
  reload(): void;
};
export const RELOAD_STUCK_MS = 20_000;

/** Install the live dependencies; returns the uninstall (a no-op once another install replaced it). */
export function installApplyDeps(d: ApplyDeps): () => void {
  deps = d;
  return () => {
    if (deps === d) deps = null;
  };
}

let applying = false;

export async function applyUpdate(mode: "manual" | "auto", d: ApplyDeps): Promise<ApplyOutcome> {
  if (applying) return { kind: "busy" };
  const verdict = mode === "manual" ? manualBlock : autoBlock;
  const first = verdict(d.guardInput());
  if (first !== null) return { kind: "refused", block: first };
  applying = true;
  const refuse = (block: ApplyBlock): ApplyOutcome => {
    applying = false;
    return { kind: "refused", block };
  };
  // ── pre-flight, always fresh ──
  if (!d.online()) return refuse({ kind: "offline" });
  let served: VersionVerdict;
  try {
    served = await d.fetchServed();
  } catch {
    return refuse({ kind: "check" });
  }
  if (served.kind === "unknown") return refuse({ kind: "check" });
  if (served.kind === "current") {
    applying = false;
    return { kind: "current" };
  }
  const target = served.served.build;
  let truth: ConnectionTruth;
  try {
    truth = await d.freshTruth();
  } catch {
    return refuse({ kind: "check" });
  }
  if (truth === "we-down") return refuse({ kind: "down" });
  if (truth === "you-offline") return refuse({ kind: "offline" });
  // Only a person retries a target this tab already reloaded into without arriving.
  if (mode === "auto" && d.triedTarget(target)) return refuse({ kind: "check" });
  // ── re-read THIS mode's verdict, synchronously after the last await (W4) ──
  const last = verdict(d.guardInput());
  if (last !== null) return refuse(last);
  d.markApplied(target);
  d.freeze();
  d.reload();
  return { kind: "reloading" };
}

// ── the guard input, read from the live document ─────────────────────────────────────────────────
let lastInputAt: number | null = null;

/** Capture listeners (pointerdown · keydown · touchstart) call this: input is "now". */
export function noteInput(): void {
  lastInputAt = monoNow();
}

const TEXT_INPUTS = new Set(["", "text", "search", "email", "tel", "url", "password", "number"]);

function isTyping(el: Element | null): boolean {
  if (el === null) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return TEXT_INPUTS.has((el.getAttribute("type") ?? "").toLowerCase());
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Every input the verdicts read, each on its own source's clock: the ledger's signals on
 * `monoNow()`, input on `monoNow()` (a document load counts as input — `performance.now()` starts at
 * the load), the holds from the register, and the DOM read now. `[aria-busy]` is deliberately NOT
 * read: every board sets it on its own reads (W10).
 */
export function readGuardInput(env: {
  doc: Document;
  nav: Navigator;
  retired: boolean;
}): GuardInput {
  return {
    online: env.nav.onLine !== false,
    holds: reloadHolds(),
    youngWrite: youngWrite(),
    stalledWrite: stalledWrite(),
    ownWait: anyOwnWait(),
    msSinceWriteSettled: msSinceWriteSettled(),
    msSinceInput: monoNow() - (lastInputAt ?? 0),
    dialogOpen:
      env.doc.querySelector('[role="dialog"],[role="alertdialog"],[aria-modal="true"]') !== null,
    typing: isTyping(env.doc.activeElement),
    retired: env.retired,
  };
}

/** `/api/version`, read strictly: never cached, never with credentials, bounded at 4s, and anything
 *  that is not our JSON is "unknown" (no verdict) — never "changed". */
export function makeFetchServed(
  f: typeof fetch,
  own: string | null = CLIENT_BUILD,
  ownContract: number = STAFF_CONTRACT,
): () => Promise<VersionVerdict> {
  return async () => {
    try {
      const res = await f("/api/version", {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(4_000),
      });
      if (!res.ok) return { kind: "unknown" };
      return versionVerdict(own, ownContract, parseServed(await res.json()));
    } catch {
      return { kind: "unknown" };
    }
  };
}

// ── the one-shot record ──────────────────────────────────────────────────────────────────────────
export const APPLIED_KEY = "mms.staff.applied";

function readApplied(store: TabStore | null): string | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(APPLIED_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const target = (parsed as { target?: unknown } | null)?.target;
    return typeof target === "string" ? target : null;
  } catch {
    return null;
  }
}

/** `triedTarget` for a tab store: this tab reloaded into `build` and did not arrive. */
export function triedTargetIn(store: TabStore | null, build: string): boolean {
  return readApplied(store) === build;
}

/** `markApplied` for a tab store. Storage that throws keeps nothing (the auto path may retry once
 *  more per load — the safe direction for a screen that needs the new version). */
export function markAppliedIn(store: TabStore | null, build: string): void {
  if (store === null) return;
  try {
    store.setItem(APPLIED_KEY, JSON.stringify({ target: build }));
  } catch {
    // Deliberate swallow: see above.
  }
}

/** At mount: the record's target IS this build → it arrived, clear it; else keep it (that target
 *  stays "tried" in this tab). */
export function afterLoad(store: TabStore | null, own: string | null): void {
  if (store === null || own === null) return;
  if (readApplied(store) !== own) return;
  try {
    store.removeItem(APPLIED_KEY);
  } catch {
    // Deliberate swallow: an unclearable record only means this tab will not auto-retry that build.
  }
}

/** Test seam: the store, the latch, the deps, the input clock and the check listeners. */
export function resetUpdateForTests(): void {
  snap = { phase: CURRENT, refusal: null };
  listeners.clear();
  checkListeners.clear();
  deps = null;
  applying = false;
  lastInputAt = null;
}
