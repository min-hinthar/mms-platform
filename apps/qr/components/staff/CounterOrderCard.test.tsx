/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegisterQueueRow } from "@/lib/register-queue";
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

const WALK_UP: RegisterQueueRow = {
  sessionId: "s-1",
  customerName: null,
  itemCount: 2,
  subtotalCents: 1200,
  startedAt: "2026-09-09T01:00:00.000Z",
  source: "register",
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
          <CounterOrderCard order={WALK_UP} serverNow="2026-09-09T01:05:00.000Z" lang={lang} />
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
        <CounterOrderCard order={WALK_UP} serverNow="2026-09-09T01:05:00.000Z" lang="my" />
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
        <CounterOrderCard order={WALK_UP} serverNow="2026-09-09T01:05:00.000Z" lang="my" />
      </StaffLangProvider>,
    );
    const link = screen.getByRole("link");
    const name = link.getAttribute("aria-label") ?? "";
    expect(link.textContent).toContain(STAFF["reg.row.walkup"].en);
    expect(name).toContain(STAFF["reg.row.walkup"].en);
    expect(name).toContain("2 items · $12.00 + tax");
  });
});
