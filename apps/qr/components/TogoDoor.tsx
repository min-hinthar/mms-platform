"use client";
import { useId, useState, type CSSProperties } from "react";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import posthog from "posthog-js";
import { DoorFace } from "./ModeCard";

// K1 (Journey II) — the To-go door: one entrance for "food I'll carry out", with **Now vs scheduled
// decided INSIDE the door**, not by picking a different app mode. Now → the scango menu (today's
// counter-food flow: orders reach staff via the expo at pay), Schedule → the pickup menu (real
// capacity-checked slots). This wiring was decided by plan-critique recon: an "ASAP slot" is
// unrepresentable in the money path (create-intent hard-400s a slotless pickup cart), so Now routes
// to scango — zero money-path risk, presentation-only, exactly what this phase promises.
//
// The door is a disclosure: tapping it OPENS (aria-expanded) to reveal the two choices — a real door
// you open, not a mode toggle. The panel is `inert` + row-collapsed when closed (removed from tab
// order + AT + hit-testing), so the choices can't be tabbed into or announced behind a shut door.

const choiceArrow: CSSProperties = { marginLeft: "auto", color: "var(--ac)", fontSize: "var(--fs-h3)" };

export function TogoDoor({ index = 0 }: { index?: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mms-stagger" style={{ animationDelay: `calc(${index} * 70ms)` }}>
      <button
        type="button"
        className="card card-interactive togo-door"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) posthog.capture("door_opened", { door: "togo" }); // pre-open only (intent signal)
        }}
      >
        <DoorFace
          emoji="🥡"
          name="To-go"
          my="ပါဆယ်ယူရန်"
          description="Order and carry out — now or scheduled"
          trailing={
            <span aria-hidden className="togo-caret" data-open={open || undefined}>
              ›
            </span>
          }
        />
      </button>

      {/* Disclosure panel. `inert` when closed = not focusable / not announced / not hit-testable,
          while the grid-rows transition still animates the collapse (inert doesn't block rendering). */}
      <div
        id={panelId}
        className="togo-panel"
        data-open={open || undefined}
        inert={!open || undefined}
      >
        <div className="togo-panel-inner">
          <Link
            href="/menu?mode=scango&door=togo"
            className="togo-choice"
            onClick={() => posthog.capture("mode_selected", { mode: "scango", door: "togo" })}
          >
            <span>
              <b>Now</b>
              <br />
              <small style={{ color: "var(--t2)" }}>We bring it out to you</small>
            </span>
            <span aria-hidden style={choiceArrow}>
              ›
            </span>
          </Link>
          <Link
            href="/menu?mode=pickup&door=togo"
            className="togo-choice"
            onClick={() => posthog.capture("mode_selected", { mode: "pickup", door: "togo" })}
          >
            <span>
              <b>Schedule for later</b>
              <br />
              <small style={{ color: "var(--t2)" }}>Pick a time, skip the line</small>
            </span>
            <span aria-hidden style={choiceArrow}>
              ›
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
