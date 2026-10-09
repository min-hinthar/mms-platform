import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KITCHEN_STAGES,
  KitchenTrack,
  TRACK_SEGMENTS,
  kitchenTrackLit,
  type KitchenStage,
  type KitchenTrackProps,
} from "../kitchen-track";
import type { KitchenTrackName as BarrelTrackName } from "../index";

/**
 * PATH_DESIGN round 3 — the ONE KITCHEN TRACK. Node env, static markup: every proposition is about
 * what the primitive RENDERS for a stage, which needs no DOM. The CSS half (which ink each lit
 * segment takes, the sizes, the reduced-motion escort) is `pass-css.test.ts`.
 */
const WORD = { en: "Cooking", my: "ချက်နေဆဲ" };
const render = (props: Partial<KitchenTrackProps> & { stage: KitchenStage }) =>
  renderToStaticMarkup(createElement(KitchenTrack, { size: "row", ...props } as KitchenTrackProps));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("KitchenTrack — length is progress", () => {
  it("lights 0 · 0 · 1 · 2 · 3 of three segments across the five stages", () => {
    // MUTATION: served lighting two (`case "served": return 2`) — red on the last entry.
    expect(KITCHEN_STAGES.map(kitchenTrackLit)).toEqual([0, 0, 1, 2, 3]);
    expect(TRACK_SEGMENTS).toBe(3);
    for (const stage of ["sending", "sent", "cooking", "served"] as const) {
      const html = render({ stage });
      expect(count(html, 'class="ui-track-seg"')).toBe(TRACK_SEGMENTS);
      expect(count(html, 'data-lit=""')).toBe(kitchenTrackLit(stage));
    }
  });

  it("unsent is the hollow ring, never a track", () => {
    const html = render({ stage: "unsent" });
    expect(html).toContain('class="ui-track-ring"');
    expect(html).not.toContain("ui-track-seg");
  });

  it("inside the grace, ONE dashed segment and nothing lit", () => {
    const html = render({ stage: "sending" });
    expect(count(html, 'data-dashed=""')).toBe(1);
    expect(html).not.toContain("data-lit");
    // The first segment is the dashed one, so a Sent FILL lands in its place.
    const segs = [...html.matchAll(/<span class="ui-track-seg"([^>]*)>/g)].map((m) => m[1]!);
    expect(segs.map((s) => s.includes("data-dashed"))).toEqual([true, false, false]);
    for (const stage of ["sent", "cooking", "served"] as const)
      expect(render({ stage })).not.toContain("data-dashed");
  });

  it("marks the segment that just landed, so FILL plays on it alone", () => {
    for (const stage of ["sent", "cooking", "served"] as const) {
      const html = render({ stage, filling: true });
      expect(count(html, 'data-landing=""')).toBe(1);
      // The landing segment is the LAST lit one: the lit run ends where the landing mark sits.
      const segs = [...html.matchAll(/<span class="ui-track-seg"([^>]*)>/g)].map((m) => m[1]!);
      expect(segs.findIndex((s) => s.includes("data-landing"))).toBe(kitchenTrackLit(stage) - 1);
      expect(html).toContain('data-filling=""');
    }
    // Nothing lands on the ring or the dashed grace: `filling` is ignored there.
    expect(render({ stage: "unsent", filling: true })).not.toContain("data-filling");
    expect(render({ stage: "sending", filling: true })).not.toContain("data-filling");
    // And an un-fill (the earlier stage, no `filling`) carries neither hook: no `data-filling`
    // and no landing mark — a first read or a revisit renders exactly this, the final frame.
    const unfill = render({ stage: "sent" });
    expect(unfill).not.toContain("data-filling");
    expect(unfill).not.toContain("data-landing");
  });
});

describe("KitchenTrack — the stage word and the surface", () => {
  it("prints the caller's word, lead tongue first, each tongue marked", () => {
    const en = render({ stage: "cooking", word: WORD, lang: "en" });
    expect(en).toContain('<span class="ui-track-word-en" lang="en">Cooking</span>');
    expect(en).toContain('<span class="ui-track-word-my" lang="my">ချက်နေဆဲ</span>');
    expect(en.indexOf("Cooking")).toBeLessThan(en.indexOf("ချက်နေဆဲ"));
    const my = render({ stage: "cooking", word: WORD, lang: "my" });
    expect(my.indexOf("ချက်နေဆဲ")).toBeLessThan(my.indexOf("Cooking"));
    // The word sits in the ink's element, so pass.css can colour it by stage.
    expect(en).toContain('class="ui-track-word"');
  });

  it("echo=false prints the lead tongue only (the TV's rows)", () => {
    const html = render({ stage: "served", word: { en: "Served", my: "ထုတ်ပြီး" }, lang: "my", echo: false }); // prettier-ignore
    expect(html).toContain("ထုတ်ပြီး");
    expect(html).not.toContain("Served");
    expect(html).not.toContain("ui-track-word-dot");
  });

  it("holds no string of its own: no word, no text", () => {
    expect(render({ stage: "served" }).replace(/<[^>]+>/g, "")).toBe("");
  });

  it("defaults to the pass surface; the theme surface is explicit", () => {
    expect(render({ stage: "sent" })).toContain('data-surface="pass"');
    expect(render({ stage: "sent", surface: "theme" })).toContain('data-surface="theme"');
  });

  it("renders no inline colour — the surface's palette is pass.css's, never a style prop", () => {
    expect(render({ stage: "served", word: WORD, surface: "theme" })).not.toContain("style=");
  });
});

describe("KitchenTrack — a11y: the word carries the state; never a live region", () => {
  it("with a word, the segments are decorative and the root has no role", () => {
    const html = render({ stage: "cooking", word: WORD });
    expect(html).toContain('<span class="ui-track-segs" aria-hidden="true">');
    expect(html).not.toMatch(/^<span class="ui-track"[^>]*role=/);
    expect(html).not.toMatch(/^<span class="ui-track"[^>]*aria-hidden/);
  });

  it("with an aria-label and no word, the track is ONE image named by it", () => {
    const html = render({ stage: "served", "aria-label": "Served" });
    expect(html).toMatch(/^<span class="ui-track"[^>]*role="img"[^>]*aria-label="Served"/);
  });

  it("a word AND an aria-label would be two names for one fact: the type refuses the pair", () => {
    // Compile-time pin (`pnpm typecheck` reads this file): a loosened union un-expects it.
    // @ts-expect-error — word and aria-label together
    const both: KitchenTrackProps = {
      stage: "sent",
      size: "row",
      word: WORD,
      "aria-label": "Sent",
    };
    expect(both).toBeDefined();
  });

  it("the naming union reaches a consumer through the barrel (Codex round 3 on #327)", () => {
    // Compile-time pin: `@mms/ui` has ONE entry (`index.ts`, no `kitchen-track` subpath), so a
    // stream models word-vs-label through the barrel or not at all. Dropped from it — red.
    const named: BarrelTrackName = { "aria-label": "Sent" };
    expect(named["aria-label"]).toBe("Sent");
  });

  it("with neither, the track is decorative", () => {
    expect(render({ stage: "sent" })).toMatch(/^<span class="ui-track"[^>]*aria-hidden="true"/);
    expect(render({ stage: "unsent" })).toMatch(/^<span class="ui-track"[^>]*aria-hidden="true"/);
  });

  it("is never a live region, in any state", () => {
    for (const stage of KITCHEN_STAGES)
      for (const props of [{}, { word: WORD }, { "aria-label": "x" }]) {
        const html = render({ stage, ...props });
        expect(html).not.toContain("aria-live");
        expect(html).not.toContain('role="status"');
        expect(html).not.toContain('role="alert"');
      }
  });
});
