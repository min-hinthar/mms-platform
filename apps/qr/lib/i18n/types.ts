/**
 * W5/W16b — the bilingual dictionary's pure types. No machinery (the whole "engine" is a typed
 * `{en, my}` lookup — Burmese needs no plurals, no ICU, no library). The W5 locale CARRIERS
 * (cookie, storage key, isLocale) were retired with the toggle (W16b): the app is always
 * bilingual, and `t(locale, key)` keeps its signature so every render site speaks BOTH tongues.
 */

export type Locale = "en" | "my";

export type Entry = { en: string; my: string };
