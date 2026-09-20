/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffLangProvider } from "./StaffLangProvider";
import { RelativeTime } from "./RelativeTime";
import { localizeCount, tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";

/**
 * counter-8 — the age on every card is the dictionary's, in the console's tongue. The thresholds
 * are `lib/relative-time.test.ts`'s; this suite pins the RENDER: a marked Burmese run with Burmese
 * numerals under `my`, a bare text node under `en`, the machine stamp kept, and the tick.
 */
const NOW = "2026-09-20T18:00:00.000Z";
const T0 = Date.parse(NOW);
const ago = (min: number) => new Date(T0 - min * 60_000).toISOString();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = (lang: "en" | "my", iso: string) =>
  render(
    <StaffLangProvider lang={lang}>
      <RelativeTime iso={iso} serverNow={NOW} />
    </StaffLangProvider>,
  ).container.querySelector("time")!;

describe("RelativeTime — the dictionary's age", () => {
  it("under my: a marked Burmese run with Burmese numerals, on a <time> that keeps the stamp", () => {
    vi.useFakeTimers({ now: T0 });
    const t = mount("my", ago(5));
    expect(t.getAttribute("datetime")).toBe(ago(5));
    const run = t.querySelector('[lang="my"]');
    expect(run).not.toBeNull();
    expect(run!.textContent).toBe(tf("my", "time.minAgo", { n: 5 }));
    expect(run!.textContent).toContain(localizeCount(5, "my"));
    // MUTATION: render `5m ago` outside <Chrome> — a Latin digit appears and this reddens.
    expect(t.textContent).not.toMatch(/[0-9A-Za-z]/);
  });

  it("under en: the terse card form as a bare text node (the pre-P2 markup)", () => {
    vi.useFakeTimers({ now: T0 });
    const t = mount("en", ago(5));
    expect(t.textContent).toBe("5m ago");
    expect(t.children).toHaveLength(0);
  });

  it("paints from the server clock, then ticks from the device's", async () => {
    vi.useFakeTimers({ now: T0 });
    const t = mount("en", ago(0.5));
    expect(t.textContent).toBe(ts("en", "time.justNow"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    // The 30 s tick landed: 60 s old is a minute.
    expect(t.textContent).toBe("1m ago");
  });
});
