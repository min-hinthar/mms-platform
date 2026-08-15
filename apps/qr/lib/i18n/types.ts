/**
 * W5 — the app-wide EN↔MY locale (S2). Pure types + the carrier names; no machinery (the whole
 * "engine" is a typed `{en, my}` lookup — Burmese needs no plurals, no ICU, no library).
 */

export type Locale = "en" | "my";

export type Entry = { en: string; my: string };

/** The SSR-visible carrier (read in the root layout for `<html lang>` + the provider seed).
 *  NOT httpOnly — the client toggle writes it synchronously for the instant flip. */
export const LOCALE_COOKIE = "mms_locale";

/** The device mirror. ⚠️ EXEMPT from the K7 handover clear (lib/device-session.ts): a language is
 *  a PERSON's setting, not an order pointer — see the survivors list there. */
export const LOCALE_STORAGE_KEY = "mms.qr.locale";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "my";
}
