import { COMMON } from "./common";
import { CART } from "./cart";
import type { Locale } from "./types";

export type { Locale, Entry } from "./types";
export { LOCALE_COOKIE, LOCALE_STORAGE_KEY, isLocale } from "./types";
export { CART_MONEY_KEYS } from "./cart";

/**
 * W5 — the app dictionary: one merged, `as const`-shaped map so a missing key is a COMPILE error
 * (strictly stronger than the v7.2 prototype's silent-passthrough `T()`), and EN/MY parity holds
 * by construction (every entry is `{en, my}` — the guards in strings.test.ts walk the real data).
 * Per-surface modules keep authoring + the K15 native check owner-reviewable; new surfaces join
 * the spread as the W5-L3…L5 rollout lands.
 */
export const DICT = { ...COMMON, ...CART } as const;

export type DictKey = keyof typeof DICT;

export function t(locale: Locale, key: DictKey): string {
  return DICT[key][locale];
}
