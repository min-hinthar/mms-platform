"use client";

import { useEffect } from "react";
import { useDeviceTier } from "@mms/ui";

/** The one place the dial's storage key is written down. */
const KEY = "mms.fx";
type Fx = "full" | "lite" | "off";
const VALID = new Set<Fx>(["full", "lite", "off"]);

/**
 * M126 — the writer for the `--fx-*` dial (`tokens.css` § THE DIAL).
 *
 * The owner lifted the mobile GPU budget for M126 and asked for it maximal, so FULL STRENGTH IS THE
 * DEFAULT on every device and this component's job is to make the dial reachable, not to second-guess
 * that instruction. Without it the dial was a claim rather than a mechanism: nothing in the repo set
 * `data-fx`, so the escape hatch that justifies lifting a budget written after a production iOS
 * WebKit OOM could only be exercised from a devtools console.
 *
 * Two writers, in precedence order:
 *
 *  1. `localStorage["mms.fx"]` = "full" | "lite" | "off" — a per-device manual override. This is the
 *     real lever: set it on the actual phone that struggles, no deploy, no redesign, and it survives
 *     reloads. An unrecognised value is ignored rather than trusted.
 *  2. Otherwise `useDeviceTier() === "low"` (fewer than 4 cores) → `lite`. A floor, not a policy —
 *     `lite` keeps the chrome frost and every one-shot bloom, and only gives back the two largest
 *     buffers. It mirrors the gate `TierUpCelebration` and `PaySuccess` already use for the particle
 *     field, so this is the repo's existing line, not a new one.
 *
 * ⚠️ WHAT THIS DOES NOT DO, because the delivery repo learned it the expensive way: core count is a
 * poor proxy for a per-tab memory ceiling. A recent iPhone reports 6-8 cores and still has a tight
 * WebKit budget, so tier `high` is NOT evidence that the maximal composition is safe there. Auto-
 * degrading every coarse pointer would be the safe engineering call and the wrong product call —
 * it is exactly the restriction the owner lifted. So the honest shape is: default full, ship a lever
 * that works on a real device in one line, and say plainly that the lever is manual.
 *
 * Renders nothing. Writes one attribute on <html>, which every heavy declaration in the app already
 * reads through `--fx-glass-*` / `--fx-plane-blur` / `--fx-promote`.
 */
export function FxDial() {
  const tier = useDeviceTier();
  useEffect(() => {
    const root = document.documentElement;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      // Deliberate: private mode / blocked storage costs the override and nothing else. The tier
      // fallback below still runs, and a thrown read here would take the whole app's root down.
    }
    const choice: Fx | null =
      stored && VALID.has(stored as Fx) ? (stored as Fx) : tier === "low" ? "lite" : null;
    // `full` is the ABSENCE of the attribute, not a value — the token block's default. Writing
    // `data-fx="full"` would still match `html[data-fx]`, which the reduced-transparency override
    // uses to beat an explicit dial, so an owner choosing "full" must not out-rank that preference.
    if (choice && choice !== "full") root.dataset.fx = choice;
    else delete root.dataset.fx;
    return () => {
      delete root.dataset.fx;
    };
  }, [tier]);
  return null;
}
