"use client";
import { Button } from "@mms/ui";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { useCounterMint, type MintNotice } from "./CounterMint";

/** Walk-up's description: its honest note, or — once its start waited past the bound — the line
 *  that replaces it. The seal's `aria-describedby` target. */
export const SEAL_WALKUP_NOTE_ID = "seal-walkup-note";

/**
 * PD6 (m6 screen 2) — the seal's ONE quiet secondary on the pad: Walk-up, a paper `lg` pill beside
 * "Back to the counter" (PATH_DESIGN decision 8: that is the one hero), starting the next walk-up
 * through the pad's ONE mint lock (`CounterMintProvider`, mounted around the seal) — the only start
 * control on this screen.
 *
 * Its note is the true one (m6 appendix B5): the bag shows up on the counter page when it is ready —
 * nothing about when a bell rings, which the code does not keep. A start unanswered past the bound
 * holds it (`aria-disabled`) and its note becomes "No answer yet — the next order may still start…"
 * (`pad.next.waiting`): on the pad, the way to see whether it started is the counter, never a reload.
 * Every refusal is said ONCE through the pad's one region (`onNotice`); this mounts no region.
 */
export function SealWalkUp({
  lang,
  onNotice,
}: {
  lang: StaffLang;
  /** The pad's ONE live region (its Toast). */
  onNotice: (n: MintNotice) => void;
}) {
  const { minting, startHeld, waiting, run } = useCounterMint();
  const waited = waiting === "walkup";
  // The mint's own waiting line asks for a reload; on the pad the counter page is where a start
  // that did go shows up, so the pad's line points there instead (the same fact, the pad's way out).
  const say = (n: MintNotice) =>
    onNotice(typeof n !== "string" && n.k === "floor.mint.waiting" ? { k: "pad.next.waiting" } : n);
  return (
    <>
      <p id={SEAL_WALKUP_NOTE_ID} className="staff-seal-note">
        <Chrome
          lang={lang}
          k={waited ? "pad.next.waiting" : "table.detail.handoff.walkupNote"}
          echo="stack"
        />
      </p>
      <Button
        variant="secondary"
        size="lg"
        busy={minting === "walkup"}
        busyLabel={<Chrome lang={lang} k="reg.going" echo="stack" />}
        // Held while any start is out or unanswered: the attribute plus the handler's own guard,
        // never native `disabled` (focus would drop to <body> mid-tap).
        {...(startHeld ? { "aria-disabled": true } : {})}
        aria-describedby={SEAL_WALKUP_NOTE_ID}
        onClick={() => {
          if (startHeld) {
            // A tap on a held Walk-up is said, never silent (the line above is a description).
            if (waited) say({ k: "pad.next.waiting" });
            return;
          }
          run("walkup", { kind: "walkup" }, { onStart: () => {}, onRefusal: say });
        }}
      >
        <Chrome lang={lang} k="reg.start.walkup" echo="stack" />
      </Button>
    </>
  );
}
