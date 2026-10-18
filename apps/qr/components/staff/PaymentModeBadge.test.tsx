/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_MODE_COPY, PaymentModeBadge } from "./PaymentModeBadge";
import { STAFF } from "@/lib/i18n/staff";
import type { PaymentModeStatus } from "@/lib/stripe-env";

/**
 * The payments badge, rendered: its words per state, and — the claim the owner's ask rests on —
 * that nothing about a credential reaches the markup, whatever the environment holds.
 */
vi.mock("server-only", () => ({}));

const STATUSES = Object.keys(PAYMENT_MODE_COPY) as PaymentModeStatus[];
const LANGS = ["en", "my"] as const;

/** Every variable the badge's reader resolves. Fake values: Stripe's prefixes, never a key. */
const ENV = [
  "STRIPE_SECRET_KEY_TEST",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production",
  "STRIPE_WEBHOOK_SECRET_TEST",
  "STRIPE_WEBHOOK_SECRET",
] as const;
function env(values: Partial<Record<(typeof ENV)[number], string>>) {
  for (const name of ENV) vi.stubEnv(name, values[name] ?? "");
}
beforeEach(() => env({}));
afterEach(() => vi.unstubAllEnvs());

const html = (status: PaymentModeStatus, lang: "en" | "my" = "en") =>
  renderToStaticMarkup(<PaymentModeBadge lang={lang} status={status} />);

describe("PaymentModeBadge — the words per state", () => {
  it("covers all six states", () => {
    expect(STATUSES.sort()).toEqual(
      ["live", "mismatch", "test", "unconfigured", "unknown", "webhook_mismatch"].sort(),
    );
  });

  it("live is the calm badge alone — no sentence, no fix line", () => {
    const out = html("live");
    expect(out).toContain(STAFF["shell.pay.live"].en);
    expect(out).not.toContain("staff-paymode-note");
  });

  it("test says plainly that no real money is taken, and asks no one to fix anything", () => {
    const out = html("test");
    expect(out).toContain(STAFF["shell.pay.test"].en);
    expect(out).toContain(STAFF["shell.pay.test.note"].en);
    expect(out).not.toContain("staff-paymode-note-warn");
    expect(out).not.toContain("Tell the owner");
  });

  it.each([
    ["mismatch", "shell.pay.mismatch.note"],
    ["webhook_mismatch", "shell.pay.webhook.note"],
    ["unconfigured", "shell.pay.unconfigured.note"],
    ["unknown", "shell.pay.unknown.note"],
  ] as const)("%s names what is wrong and who fixes it, in the warn ink", (status, note) => {
    const out = html(status);
    expect(out).toContain(STAFF[note].en);
    expect(out).toContain("staff-paymode-note-warn");
    expect(out).toContain("Tell the owner to check the Stripe settings in Vercel.");
  });

  it("each state reads differently — colour is never the only signal", () => {
    const texts = STATUSES.map((s) => html(s).replace(/<[^>]+>/g, ""));
    expect(new Set(texts).size).toBe(STATUSES.length);
  });

  it("is static text: no live region, no control", () => {
    for (const s of STATUSES)
      for (const lang of LANGS) {
        const out = html(s, lang);
        expect(out).not.toMatch(/aria-live|role="(status|alert)"|<button|<a /);
      }
  });

  it("Burmese marks its runs and keeps the two Latin names marked inside them", () => {
    const out = html("mismatch", "my");
    expect(out).toContain('lang="my"');
    expect(out).toContain(STAFF["shell.pay.check"].my);
    expect(out).toContain('<span lang="en">Stripe</span>');
    expect(out).toContain('<span lang="en">Vercel</span>');
  });
});

describe("no credential reaches the markup", () => {
  // Each environment drives the REAL reader (`readPaymentMode`, lib/stripe.ts) into a different
  // state; the badge it feeds must carry none of the values, and no Stripe prefix at all. What bites
  // here is the reader's `toBe(expected)` (an object or a value returned instead of the enum); the
  // markup regex is the backstop for a future prop, since the badge itself has no env access.
  const SCENARIOS: [string, Partial<Record<(typeof ENV)[number], string>>, PaymentModeStatus][] = [
    [
      "live",
      {
        STRIPE_SECRET_KEY: "sk_live_FAKEsecret",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_FAKEpublish",
        STRIPE_WEBHOOK_SECRET: "whsec_FAKEsigning",
      },
      "live",
    ],
    [
      "both sets present (_TEST wins)",
      {
        STRIPE_SECRET_KEY_TEST: "sk_test_FAKEsecret",
        STRIPE_SECRET_KEY: "sk_live_FAKEsecret",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_FAKEpublish",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_FAKEpublish",
        STRIPE_WEBHOOK_SECRET_TEST: "whsec_FAKEsigning",
      },
      "test",
    ],
    [
      "half-done cutover",
      {
        STRIPE_SECRET_KEY: "sk_live_FAKEsecret",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_FAKEpublish",
        STRIPE_WEBHOOK_SECRET: "whsec_FAKEsigning",
      },
      "mismatch",
    ],
    [
      "webhook leftover",
      {
        STRIPE_SECRET_KEY: "sk_live_FAKEsecret",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_FAKEpublish",
        STRIPE_WEBHOOK_SECRET_TEST: "whsec_FAKEsigning",
      },
      "webhook_mismatch",
    ],
    ["nothing set", {}, "unconfigured"],
    [
      "no mode marker",
      {
        STRIPE_SECRET_KEY: "sk_mock_FAKEsecret",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_FAKEpublish",
        STRIPE_WEBHOOK_SECRET: "whsec_FAKEsigning",
      },
      "unknown",
    ],
  ];

  it.each(SCENARIOS)("%s", async (_name, values, expected) => {
    env(values);
    vi.resetModules();
    const { readPaymentMode } = await import("@/lib/stripe");
    const status = readPaymentMode();
    expect(status).toBe(expected);
    for (const lang of LANGS) {
      const out = html(status, lang);
      expect(out).not.toMatch(/sk_|pk_|rk_|whsec_|FAKE/);
    }
  });
});
