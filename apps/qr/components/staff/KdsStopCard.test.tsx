/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KdsStopCard, type KdsStopLine } from "./KdsStopCard";
import { StaffLangProvider } from "./StaffLangProvider";
import { tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";

/**
 * PD5 / m7 — the "stop cooking" card's SHAPE, pinned from props (PATH_DESIGN reconciliation 1): ALARM
 * tier without motion, struck rows, the warn word, "Got it" until tapped — never dashed, never cream,
 * never a stub. The data read is PD7's; this suite renders the component alone.
 */
afterEach(cleanup);

const lines: KdsStopLine[] = [
  { id: "l1", name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", qty: 2, modifiers: [], modifiersMy: [] },
  {
    id: "l2",
    name: "Shan Noodles",
    nameMy: null,
    qty: 1,
    modifiers: ["Spicy"],
    modifiersMy: [null],
  },
];
const mount = (lang: "en" | "my" = "my", onAck = vi.fn(), busy = false) => ({
  onAck,
  ...render(
    <StaffLangProvider lang={lang}>
      <ul>
        <KdsStopCard table={7} lines={lines} onAck={onAck} busy={busy} />
      </ul>
    </StaffLangProvider>,
  ),
});
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

describe("KdsStopCard — the reserved shape", () => {
  it("is named by the one warn word, draws the table and every dish struck, and offers Got it", () => {
    const { container, getByRole } = mount("my");
    const card = container.querySelector("li.kds-ticket")!;
    expect(card.getAttribute("aria-label")).toBe(tf("my", "kds.stop", { id: 7 }));
    expect(card.querySelector(".kds-strip")?.textContent).toContain("စားပွဲ");
    expect(card.querySelector(".kds-stop-word")?.textContent).toContain("ချက်တာ ရပ်ပါ");
    // K15-HIGH: the English stays beside the Burmese (the shared tablet's cross-check).
    expect(card.querySelector(".kds-stop-word")?.textContent).toContain("stop cooking");
    const struck = card.querySelectorAll(".kds-stop-line");
    expect(struck).toHaveLength(2);
    expect(struck[0]!.textContent).toContain("မုန့်ဟင်းခါး");
    expect(struck[1]!.textContent).toContain("Shan Noodles");
    // The rows are not controls: nothing on a dish nobody will eat is tappable.
    expect(card.querySelectorAll(".kds-lines button")).toHaveLength(0);
    const ack = getByRole("button", { name: new RegExp(ts("my", "help.done")) });
    expect(ack.className).toContain("kds-stop-ack");
  });

  it("Got it is the card's one act: it fires the acknowledgement, and busy refuses it without native disabled (§17)", () => {
    const live = mount("en");
    fireEvent.click(live.getByRole("button", { name: /Got it/ }));
    expect(live.onAck).toHaveBeenCalledTimes(1);
    cleanup();
    const held = mount("en", vi.fn(), true);
    const btn = held.getByRole("button", { name: /Got it/ });
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(held.onAck).not.toHaveBeenCalled();
  });

  it("ALARM tier WITHOUT motion: the warn tint without the pulse class, never dashed, never cream, never a stub", () => {
    const { container } = mount("en");
    const card = container.querySelector("li.kds-ticket")!;
    const strip = card.querySelector("header")!;
    expect(strip.className).toBe("kds-strip kds-strip-stop");
    expect(strip.className).not.toContain("kds-strip-pulse");
    expect(card.className).not.toContain("kds-ticket-held");
    expect(card.querySelector(".kds-round")).toBeNull();
    expect(card.querySelector(".kds-flash")).toBeNull();
    // The stylesheet, every block that names each selector (never the first by position — a later
    // block could re-declare what the first refused; comments stripped first): no stop strip
    // declares an animation, the stop card's border is solid (the held card's `border-style: dashed`
    // is the one dashed ticket), Got it never takes the pill's cream ground, and the rows are struck.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const blocks = (selector: string) =>
      [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter((m) => m[1]!.split(",").some((s) => s.trim() === selector))
        .map((m) => m[2]!);
    const stopStrips = blocks(".kds-strip-stop");
    expect(stopStrips.length).toBeGreaterThan(0);
    for (const b of stopStrips) expect(b).not.toMatch(/animation/);
    expect(stopStrips.some((b) => /--kds-strip-bg:\s*color-mix\([^)]*--warn/.test(b))).toBe(true);
    const stopCards = blocks(".kds-ticket-stop");
    expect(stopCards.length).toBeGreaterThan(0);
    for (const b of stopCards) expect(b).not.toMatch(/dashed/);
    const acks = blocks(".kds-stop-ack");
    expect(acks.length).toBeGreaterThan(0);
    for (const b of acks) expect(b).not.toMatch(/background:\s*var\(--tx\)/);
    expect(acks.some((b) => /background:\s*var\(--sf\)/.test(b))).toBe(true);
    expect(blocks(".kds-stop-line").some((b) => /line-through/.test(b))).toBe(true);
  });
});
