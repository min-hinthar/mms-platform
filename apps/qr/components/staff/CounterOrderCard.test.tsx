/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CounterFloorRow } from "@/lib/floor-types";
import { STAFF } from "@/lib/i18n/staff";

/**
 * P2e review (A5) — the counter order card's NAME follows the device's echo mode exactly as its
 * `<Chrome>`s render.
 *
 * The card is one link whose visible content is a paragraph (the guest, the channel chip, the line
 * meta), so its name is COMPOSED from those pieces (`subjectOf`). Before this, each piece was derived
 * with its echo ALWAYS on, while `<Chrome>` drops the echo on a Burmese-only device — so the name
 * spliced "Walk-up" and "2 items · $12.00 + tax" between Burmese runs the screen no longer showed.
 * Every visible word was still in the name somewhere; they were no longer ONE RUN, which is what
 * WCAG 2.5.3 asks of a label a speech-input user reads off the screen and says.
 *
 * The assertion is on the RENDERED card, in all three modes: the text the link shows, in DOM order
 * with its separators normalised, is a contiguous run of the name that follows the verb — and on a
 * Burmese-only device the name carries no English the card does not show.
 */
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
// The clock is not what this file is about, and it prints no word inside the name.
vi.mock("./RelativeTime", () => ({
  RelativeTime: ({ iso }: { iso: string }) => <time dateTime={iso} />,
}));

const { CounterOrderCard } = await import("./CounterOrderCard");
const { StaffLangProvider } = await import("./StaffLangProvider");

afterEach(cleanup);

const WALK_UP: CounterFloorRow = {
  sessionId: "s-1",
  customerName: null,
  itemCount: 2,
  subtotalCents: 1200,
  startedAt: "2026-09-09T01:00:00.000Z",
  source: "register",
  // Phase 2f — nothing sent: no flag, no kitchen row.
  unpaidSent: false,
  kitchen: null,
};
const TH = {
  dineinAmberMin: 8,
  dineinRedMin: 12,
  pickupAmberMin: 8,
  pickupRedMin: 12,
  rechimeSec: 60,
};

/** Joiners the name and the screen spell differently (a middot, a comma, a dash, a line break). */
const norm = (s: string) =>
  s
    .replace(/[·,—\s]+/gu, " ")
    .trim()
    .normalize("NFC");

/** The text the link SHOWS, in DOM order — each text node a piece, never jsdom's run-on join. */
function shownText(el: HTMLElement): string {
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.textContent ?? "");
  return norm(out.join(" "));
}

const MODES = [
  ["English", "en", true],
  ["Both", "my", true],
  ["Burmese only", "my", false],
] as const;

describe("the counter card's name is the card's own text, in one run, in every mode", () => {
  for (const [what, lang, echoes] of MODES) {
    it(`${what}: the visible text is a contiguous run of the name, after the verb`, () => {
      render(
        <StaffLangProvider lang={lang} echoes={echoes}>
          <CounterOrderCard
            order={WALK_UP}
            serverNow="2026-09-09T01:05:00.000Z"
            lang={lang}
            thresholds={TH}
            frozen={false}
          />
        </StaffLangProvider>,
      );
      const link = screen.getByRole("link");
      const name = link.getAttribute("aria-label") ?? "";
      const verb = lang === "en" ? STAFF["reg.verb.resume"].en : STAFF["reg.verb.resume"].my;
      expect(name.startsWith(`${verb} — `)).toBe(true);
      // The subject half of the name IS the card's text — contiguous, and nothing added.
      expect(norm(name.slice(`${verb} — `.length))).toBe(shownText(link));
    });
  }

  it("Burmese only: the name carries no English echo the card no longer shows", () => {
    render(
      <StaffLangProvider lang="my" echoes={false}>
        <CounterOrderCard
          order={WALK_UP}
          serverNow="2026-09-09T01:05:00.000Z"
          lang="my"
          thresholds={TH}
          frozen={false}
        />
      </StaffLangProvider>,
    );
    const link = screen.getByRole("link");
    const name = link.getAttribute("aria-label") ?? "";
    // The two echoed pieces, and the fixture is honest: neither is in the K15-HIGH band, so their
    // English really is gone from the screen (`Chrome.test` pins the band's own behaviour).
    expect(link.textContent).not.toContain(STAFF["reg.row.walkup"].en);
    expect(link.textContent).not.toContain("2 items");
    expect(name).not.toContain(STAFF["reg.row.walkup"].en);
    expect(name).not.toContain("2 items");
    // …and the Burmese halves are still there, the count in Burmese numerals.
    expect(name).toContain(STAFF["reg.row.walkup"].my);
    expect(name).toContain("၂");
  });

  it("Both: the echoes are on screen AND in the name — the mode that must not move", () => {
    render(
      <StaffLangProvider lang="my">
        <CounterOrderCard
          order={WALK_UP}
          serverNow="2026-09-09T01:05:00.000Z"
          lang="my"
          thresholds={TH}
          frozen={false}
        />
      </StaffLangProvider>,
    );
    const link = screen.getByRole("link");
    const name = link.getAttribute("aria-label") ?? "";
    expect(link.textContent).toContain(STAFF["reg.row.walkup"].en);
    expect(name).toContain(STAFF["reg.row.walkup"].en);
    expect(name).toContain("2 items · $12.00 + tax");
  });
});

describe("Phase 2f — a counter order whose food went to the kitchen unpaid", () => {
  const SENT: CounterFloorRow = {
    ...WALK_UP,
    customerName: "Aye",
    unpaidSent: true,
    kitchen: {
      notSent: 0,
      inKitchen: 1,
      up: 0,
      upKeys: [],
      done: 1,
      oldestFireAt: "2026-09-09T00:40:00.000Z",
    },
  };
  for (const [what, lang, echoes] of MODES) {
    it(`${what}: the Unpaid flag and the kitchen row are drawn, and in the name in visible order`, () => {
      render(
        <StaffLangProvider lang={lang} echoes={echoes}>
          <CounterOrderCard
            order={SENT}
            serverNow="2026-09-09T01:05:00.000Z"
            lang={lang}
            thresholds={TH}
            frozen={false}
          />
        </StaffLangProvider>,
      );
      const link = screen.getByRole("link");
      const name = link.getAttribute("aria-label") ?? "";
      const verb = lang === "en" ? STAFF["reg.verb.resume"].en : STAFF["reg.verb.resume"].my;
      const unpaid = lang === "en" ? STAFF["settle.unpaid"].en : STAFF["settle.unpaid"].my;
      expect(link.querySelector(".counter-card-kitchen")!.textContent).toContain(unpaid);
      // The name IS the card's text, in one run — the new row included, in its drawn order.
      expect(norm(name.slice(`${verb} — `.length))).toBe(shownText(link));
      expect(name.indexOf(unpaid)).toBeGreaterThan(-1);
      // No dine-in wait pill on a counter card (its thresholds are the dine-in ones).
      expect(link.querySelector(".floor-wait")).toBeNull();
    });
  }

  it("with nothing sent there is no flag and no kitchen row", () => {
    render(
      <StaffLangProvider lang="en">
        <CounterOrderCard
          order={WALK_UP}
          serverNow="2026-09-09T01:05:00.000Z"
          lang="en"
          thresholds={TH}
          frozen={false}
        />
      </StaffLangProvider>,
    );
    expect(document.querySelector(".counter-card-kitchen")).toBeNull();
    expect(screen.getByRole("link").getAttribute("aria-label")).not.toContain(
      STAFF["settle.unpaid"].en,
    );
  });
});
