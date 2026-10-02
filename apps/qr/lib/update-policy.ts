import type { Served, VersionVerdict } from "./build-stamp";
import type { ApplyBlock } from "./reload-guard";

/**
 * Phase 2i (P2bi) — the pure state machine behind "a new version of this screen is ready". It
 * decides WHEN a reload is attempted, never WHETHER it is safe: every attempt goes through the one
 * executor (`app-update.ts`), which re-reads the reload verdict itself. Every time here is on the
 * caller's MONOTONIC clock (`monoNow()`), so a wall-clock correction never fires or freezes a
 * countdown.
 *
 * The phases:
 *  - current   — nothing to do.
 *  - stale     — a newer build is served (or this screen's actions are retired). A person can tap
 *                Reload; the automatic path waits for a quiet moment, unless snoozed by Not now.
 *  - countdown — a visible COUNTDOWN_MS before an automatic reload, with Not now; any input, or the
 *                moment stops being quiet, cancels it back to stale.
 *  - applying  — the executor is running (or the page is reloading).
 */
export const VERSION_POLL_MS = 60_000;
export const COUNTDOWN_MS = 5_000;
export const SNOOZE_MS = 10 * 60_000;
export const RETIRED_SNOOZE_MS = 2 * 60_000;

export type UpdatePhase =
  | { k: "current" }
  | { k: "stale"; served: Served | null; retired: boolean; snoozeUntil: number | null }
  | { k: "countdown"; served: Served | null; retired: boolean; endsAt: number }
  | { k: "applying"; served: Served | null; retired: boolean; mode: "manual" | "auto" };

/** What one run of the executor came to. */
export type ApplyOutcome =
  | { kind: "reloading" }
  | { kind: "current" }
  | { kind: "refused"; block: ApplyBlock }
  | { kind: "busy" };

export type UpdateEvent =
  | { e: "verdict"; v: VersionVerdict; now: number }
  | { e: "retired"; now: number }
  | { e: "tick"; now: number; autoClear: boolean; tried: boolean }
  | { e: "input" }
  | { e: "notNow"; now: number }
  | { e: "tap" }
  | { e: "outcome"; o: ApplyOutcome; now: number };

export type UpdateEffect = { apply: "manual" | "auto" } | { check: true } | null;

export const CURRENT: UpdatePhase = { k: "current" };

function same(p: UpdatePhase): { phase: UpdatePhase; effect: UpdateEffect } {
  return { phase: p, effect: null };
}

export function stepUpdate(
  p: UpdatePhase,
  ev: UpdateEvent,
): { phase: UpdatePhase; effect: UpdateEffect } {
  switch (ev.e) {
    case "verdict": {
      // While the executor runs, its own outcome decides — a watcher verdict must not race it.
      if (p.k === "applying") return same(p);
      if (ev.v.kind === "unknown") return same(p);
      if (ev.v.kind === "current") {
        // A retired screen stays retired: its actions are gone whatever the version check says.
        if (p.k !== "current" && p.retired) return same(p);
        return same(p.k === "current" ? p : CURRENT);
      }
      const served = ev.v.served;
      if (p.k === "current")
        return same({ k: "stale", served, retired: ev.v.incompatible, snoozeUntil: null });
      // Keep the stronger phase (a countdown stays a countdown); never un-retire.
      return same({ ...p, served, retired: p.retired || ev.v.incompatible });
    }
    case "retired": {
      if (p.k === "current") {
        return {
          phase: { k: "stale", served: null, retired: true, snoozeUntil: null },
          effect: { check: true },
        };
      }
      if (p.retired) return same(p);
      if (p.k === "stale") {
        // A person's Not now still stands — shortened to the retired snooze.
        const cap = ev.now + RETIRED_SNOOZE_MS;
        const snoozeUntil = p.snoozeUntil === null ? null : Math.min(p.snoozeUntil, cap);
        return { phase: { ...p, retired: true, snoozeUntil }, effect: { check: true } };
      }
      return { phase: { ...p, retired: true }, effect: { check: true } };
    }
    case "tick": {
      if (p.k === "stale") {
        if (p.snoozeUntil !== null && ev.now < p.snoozeUntil) return same(p);
        if (!ev.autoClear || ev.tried) return same(p);
        return same({
          k: "countdown",
          served: p.served,
          retired: p.retired,
          endsAt: ev.now + COUNTDOWN_MS,
        });
      }
      if (p.k === "countdown") {
        if (!ev.autoClear || ev.tried)
          return same({ k: "stale", served: p.served, retired: p.retired, snoozeUntil: null });
        if (ev.now >= p.endsAt)
          return {
            phase: { k: "applying", served: p.served, retired: p.retired, mode: "auto" },
            effect: { apply: "auto" },
          };
      }
      return same(p);
    }
    case "input":
      if (p.k !== "countdown") return same(p);
      return same({ k: "stale", served: p.served, retired: p.retired, snoozeUntil: null });
    case "notNow": {
      if (p.k !== "stale" && p.k !== "countdown") return same(p);
      const snooze = p.retired ? RETIRED_SNOOZE_MS : SNOOZE_MS;
      return same({
        k: "stale",
        served: p.served,
        retired: p.retired,
        snoozeUntil: ev.now + snooze,
      });
    }
    case "tap":
      if (p.k !== "stale" && p.k !== "countdown") return same(p);
      return {
        phase: { k: "applying", served: p.served, retired: p.retired, mode: "manual" },
        effect: { apply: "manual" },
      };
    case "outcome": {
      if (p.k !== "applying") return same(p);
      const o = ev.o;
      if (o.kind === "reloading" || o.kind === "busy") return same(p);
      if (o.kind === "current") {
        // ⚠️ A RETIRED screen stays retired (Codex r1 on #311, P2iu). Its actions were refused by
        // the server whatever this one version read says (a read served stale, a rename the stamp
        // does not reflect), so the row keeps its warning and a person may tap again at once. Only
        // the AUTOMATIC path waits — RETIRED_SNOOZE_MS, or it would count down, pre-flight `current`
        // and count down again every few seconds. Nothing is muted: it used to go `current` with
        // every later retirement witness ignored for two minutes, so a screen whose taps really were
        // dropped said nothing right after a person asked. (No reload can loop here: `current`
        // never reloads.)
        if (p.retired)
          return same({
            k: "stale",
            served: p.served,
            retired: true,
            snoozeUntil: ev.now + RETIRED_SNOOZE_MS,
          });
        return same(CURRENT);
      }
      // Refused. A person is told why (the row) and may tap again at once. An AUTOMATIC attempt the
      // executor refused waits one poll before counting down again — otherwise a pre-flight that
      // keeps failing (no answer from /api/version) would count down and refuse every few seconds.
      const snoozeUntil = p.mode === "auto" ? ev.now + VERSION_POLL_MS : null;
      return same({ k: "stale", served: p.served, retired: p.retired, snoozeUntil });
    }
  }
}
