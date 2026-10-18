import { createHash, timingSafeEqual } from "node:crypto";

/**
 * M160(b) · owner ruling #13 — the cron route's door: `Authorization: Bearer ${CRON_SECRET}`, the
 * header Vercel Cron sends when `CRON_SECRET` is set in the project.
 *
 * ⚠️ FAILS CLOSED WHEN THE SECRET IS UNSET. The route sweeps Stripe and may write orders, so an
 * unset secret must never read as "no auth required": `unconfigured` refuses every caller, and the
 * route says why in its log. A secret shorter than `CRON_SECRET_MIN_LENGTH` counts as unset — a
 * guessable token on a public URL is the same open door.
 *
 * The comparison hashes both sides to equal-length digests and compares those in constant time, so
 * neither the secret's length nor a matching prefix leaks through timing.
 */
export const CRON_SECRET_MIN_LENGTH = 16;

export type CronAuthVerdict = "ok" | "unconfigured" | "denied";

export function cronAuthVerdict(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): CronAuthVerdict {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) return "unconfigured";
  if (!authorization) return "denied";
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const given = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, given) ? "ok" : "denied";
}
