"use client";
import { useEffect, useState } from "react";
import { useCart } from "@/components/TableCartProvider";
import { nextSlotCheck, slotIsPast } from "@/lib/pickup-slot";
import { formatSlotLong } from "@/lib/pickupTime";
import type { WelcomeBack } from "@/lib/rewards";

/**
 * J2 — the arrival beat (docs/JOURNEY_PLAN.md · place-setting). The first branded moment after the scan:
 * a bilingual greeting line that settles into the menu masthead, plus one mode-aware line of place-setting
 * copy. HONEST by construction: the dine-in party line comes from live presence (real members), never a
 * fabricated table number (sessions carry no human table label); solo modes get a welcome, not a claim.
 *
 * J5 — recognition layers in, both claims strictly data-backed (getWelcomeBack): the NAME only for an
 * upgraded account (an anonymous uid isn't a durable identity to greet by), and the welcome-back line
 * only when ≥2 PAID orders exist this month — phrased as ORDERS, never "visits" (two orders in one
 * sitting are two orders; we don't invent ordinals the data can't back). First-timers see the J2
 * greeting unchanged.
 *
 * The once-per-session "beat" comes free from J1's SurfaceMemory: `.mms-stagger` premieres on the first
 * menu visit this session and lands settled on revisits — arrival is a moment, not a recurring animation.
 * Reduced motion inherits `.mms-stagger`'s existing gate. The Burmese greeting is REAL content (not
 * decoration): `lang="my"` for correct SR pronunciation (WCAG 3.1.2) + the Padauk face; the ✦ is
 * decorative and hidden. No live region — this is static place-setting, announced once in reading order.
 *
 * Phase 3b · D10 — one owner per fact. The pickup line is a STATEMENT, never a control: it used to
 * say "Pick a time — we'll have it ready." beside a chip whose pick the provider wrote into React
 * state only and the next server view overwrote. The When write has ONE owner — `PickupWhenChoice`
 * on /cart — so this line reads the context's `pickupSlot` (the server view) and says what that
 * owner recorded: no slot → an invitation to order; a slot (a diner back from checkout) → the time,
 * through the ONE formatter (`formatSlotLong`), and where to change it. Like the party line, the
 * scheduled statement wins the sub-line over welcome-back warmth: it is information the diner set.
 * English-only beside the bilingual Mingalaba — a pre-existing gap, not new debt.
 */
export function ArrivalBeat({
  mode,
  welcome = null,
}: {
  mode: string;
  welcome?: WelcomeBack | null;
}) {
  const { isGroup, members, pickupSlot } = useCart();
  const party = isGroup && members.length > 1 ? members.length : 0;
  // A slot already gone is not stated as the plan (deep pass on #312): the greeting falls back to
  // the invitation, and checkout's own When choice is where the diner picks again.
  // Codex round 1 on #313 — and the statement is re-read when the instant PASSES: `slotIsPast` is
  // evaluated in render, and a menu left open across the boundary had nothing to re-render it, so the
  // expired slot stood as the plan until some unrelated state moved. `nextSlotCheck` is the one rule
  // for when to look again (capped, so a far slot re-arms); the tick is the re-render.
  const slot = mode === "pickup" ? pickupSlot : null;
  const [, tick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const wait = nextSlotCheck(slot);
      if (wait === null) return;
      timer = setTimeout(() => {
        tick((n) => n + 1);
        arm();
      }, wait);
    };
    arm();
    return () => clearTimeout(timer);
  }, [slot]);
  const scheduled = slot && !slotIsPast(slot) ? slot : null;
  const line =
    mode === "dinein"
      ? party > 0
        ? `${party} of you at the table — order together, pay together.`
        : "You’re at the table — order when you’re ready."
      : mode === "pickup"
        ? scheduled
          ? `Scheduled for ${formatSlotLong(scheduled)} — change it at checkout.`
          : "Order when you’re ready — we’ll pack it to go."
        : "Welcome in — pay right from your phone.";

  const name = welcome?.name?.trim() || null;
  const backLine =
    welcome && welcome.ordersThisMonth >= 2
      ? `Welcome back — ${welcome.ordersThisMonth} orders with us this month.`
      : null;
  // The group party line always wins the one sub-line: it carries live coordination semantics
  // ("order together, settle together"); warmth never displaces information. D10 — the scheduled
  // pickup statement wins for the same reason: a time the diner set at checkout, and the pointer back
  // to it, is information; the welcome-back line returns on the next visit without a slot.
  const shown = (mode === "dinein" && party > 0) || scheduled !== null ? line : (backLine ?? line);

  // Phase 1a — the beat is a LINE now, not a card. It was a textured card repeating the eyebrow's
  // door ("At the table" twice), the table number the guest list already shows, and two exit tiles
  // placed before any food — the first things a scanned guest could tap were ways to leave. The
  // exits live in the door sheet (`DoorSheet`, behind every door eyebrow since Phase 3b); the greeting
  // keeps its one job: say hello in both tongues and set the place in one sentence.
  return (
    <div className="menu-greet mms-stagger">
      <p className="menu-greet-hello">
        <span lang="my" className="arrival-greeting-my">
          မင်္ဂလာပါ
        </span>{" "}
        Mingalaba{name ? `, ${name}` : ""} <span aria-hidden>✦</span>
      </p>
      <p className="menu-greet-line">{shown}</p>
    </div>
  );
}
