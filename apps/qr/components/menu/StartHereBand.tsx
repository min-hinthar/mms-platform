"use client";
import { useEffect, useState } from "react";
import type { MenuItem } from "./MenuBrowser";
import { BlurUpImage } from "./BlurUpImage";
import { PhotoPlaceholder } from "./PhotoPlaceholder";
import { MarqueeRail } from "./MarqueeRail";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * J2 → W22 — the "Start here" band. First-timers face a wall of items; this is the guided opening,
 * now TWO independently drifting rows (owner: "two independent moving and micro-interactions rows
 * each 10 items"): row A is the honest curation the band always had (real paid-order ranking with
 * tie-aware seals, `popular` fallback while history is thin — the caller decides, this component
 * never invents an ordering), row B is "a little of everything" — a round-robin lap around the
 * categories (lib/menu/startHereRows.ts), a curation rule that is not a ranking and so never
 * wears a seal. The rows drift in OPPOSITE directions at different speeds; every pause rule and
 * the reduced-motion off-switch live in MarqueeRail, and the heading carries the visible
 * pause/play control (WCAG 2.2.2) whenever motion is possible.
 *
 * a11y: a labelled region; each rail a real list labelled by the heading / its own caption; each
 * card one ≥44px button whose accessible name is the dish + price (photos decorative). Entrance
 * rides `.mms-stagger` (once per session, RM-gated).
 */
export function StartHereBand({
  rowA,
  rowB,
  dataBacked,
  onSelect,
}: {
  /** W20 review — each entry carries its TRUE pre-filter rank (competitionRanks order; a sold-out
   *  dish keeps its number and simply doesn't render). M133: `null` where the numeral is SHARED
   *  with another dish, and on the whole `popular` fallback row — no seal, no ordinal claim. */
  rowA: { item: MenuItem; rank: number | null }[];
  /** The category round-robin — no ranking claim, no seals. Empty below its 3-card floor. */
  rowB: MenuItem[];
  /** True only when real paid-order counts curated row A — drives the honest sub-heading. */
  dataBacked: boolean;
  onSelect: (i: MenuItem) => void;
}) {
  // Motion eligibility — mounted AND no reduced-motion preference. SSR/first paint renders the
  // static rail (hydration-stable); the loop sets + drift arrive in an effect. Live-tracked so
  // flipping the OS setting mid-visit lands without a reload.
  const [motionOk, setMotionOk] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionOk(!mq.matches);
    sync();
    // Older iOS Safari has only the legacy addListener API — the ThemeSync guard, verbatim
    // (Codex P1 on #194: an unguarded addEventListener would throw and take the menu down on
    // exactly the devices reduced-motion support is FOR).
    if (mq.addEventListener) {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  if (rowA.length === 0) return null;

  // `dupe` = the marquee's loop copy: aria-hidden by the rail, out of the tab order here, but
  // still clickable — a visibly on-screen copy must open the same sheet as its original.
  const card = (i: MenuItem, dupe: boolean, rank?: number | null) => (
    <button
      type="button"
      className="start-here-card"
      tabIndex={dupe ? -1 : undefined}
      onClick={() => onSelect(i)}
    >
      {/* W20 — the rank seal, ONLY when real paid-order counts curated this row: a numeral this
          prominent is a claim. #1 wears the gold cap. The sr-only twin says it in words. */}
      {/* M133 — a seal needs an UNAMBIGUOUS numeral. `soleRanks` nulls every rank two or more
          dishes share, and on the live menu that is most of them (1, 2, 2, 4, 5, 5, 5, 8×5): five
          identical "8" coins are each true and together unreadable, which is what the owner saw as
          "numbering duplicates". A tied dish keeps its place in the row and simply makes no ordinal
          claim — nothing is downgraded, the illegible claims are withheld. */}
      {dataBacked && rank != null && (
        <>
          <span
            className={`start-here-rank${rank === 1 ? " start-here-rank-top" : ""}`}
            aria-hidden
          >
            {rank}
          </span>
          <span className="sr-only">
            {rank === 1 ? "Most loved at tables. " : `No. ${rank} at tables. `}
          </span>
        </>
      )}
      {/* W16e — NO truthiness gate on the slot: BlurUpImage renders the designed placeholder for a
          null src; gating the <span> away made photo-less dishes render as ragged short cards. */}
      <span className="start-here-photo" aria-hidden>
        <BlurUpImage
          src={i.image_url}
          alt=""
          width={160}
          height={120}
          sizes="166px"
          fallback={<PhotoPlaceholder category={i.category} />}
        />
      </span>
      <span className="start-here-name">{i.name_en}</span>
      {i.name_my && (
        <span lang="my" className="start-here-my">
          {i.name_my}
        </span>
      )}
      <span className="start-here-price">{dollars(i.base_price_cents)}</span>
    </button>
  );

  return (
    <section
      aria-labelledby="start-here-h"
      className="mms-stagger"
      // 90ms after the arrival beat above so the first-visit cascade reads TOP-DOWN (greeting, then rail).
      style={{ padding: "10px 0 2px", animationDelay: "90ms" }}
    >
      {/* The pause control sits BESIDE the h2, not inside it — a button inside the heading joins
          its accessible name (and the rails' aria-labelledby), narrating "Pause the moving rows"
          into every heading announcement (review LOW). */}
      <div className="start-here-hrow">
        <h2 id="start-here-h" className="start-here-h">
          Start here <span aria-hidden>✦</span>
          <span className="start-here-sub">
            {dataBacked ? "what tables love" : "our picks to start"}
          </span>
        </h2>
        {/* WCAG 2.2.2 — auto-moving content gets a REAL stop control, not just hover luck. One
            button rules both rows; hidden entirely when motion can't happen (reduced motion /
            pre-mount), where it would be a dead switch. */}
        {motionOk && (
          <button
            type="button"
            className="start-here-pause"
            aria-label={paused ? "Play the moving rows" : "Pause the moving rows"}
            onClick={() => setPaused((p) => !p)}
          >
            <span aria-hidden>{paused ? "▶︎" : "❚❚"}</span>
          </button>
        )}
      </div>
      <MarqueeRail
        items={rowA}
        itemKey={(e) => e.item.id}
        renderItem={(e, dupe) => card(e.item, dupe, e.rank)}
        direction={1}
        speed={30}
        motion={motionOk}
        playing={motionOk && !paused}
        aria-labelledby="start-here-h"
      />
      {rowB.length > 0 && (
        <>
          <p id="start-here-more" className="start-here-rowcap">
            a little of everything
            {/* K15 — Claude-authored MY accent, pending the native check like every batch. */}
            <span lang="my" className="start-here-rowcap-my">
              အစုံလေး မြည်းကြည့်နော်
            </span>
          </p>
          <MarqueeRail
            items={rowB}
            itemKey={(i) => i.id}
            renderItem={(i, dupe) => card(i, dupe)}
            direction={-1}
            speed={22}
            motion={motionOk}
            playing={motionOk && !paused}
            aria-labelledby="start-here-more"
          />
        </>
      )}
    </section>
  );
}
