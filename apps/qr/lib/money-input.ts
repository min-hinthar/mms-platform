/**
 * Phase 2a · register — the ONE reading of a money amount a human TYPES on a staff surface (the
 * cash tip, the cash tendered). Integer cents throughout; nothing here touches `parseFloat`.
 *
 * TWO HALVES, AND THE SPLIT IS THE FIX. The W21d comma rule used to run PER KEYSTROKE inside
 * `CashSettleButton`: "5," has no digit after the comma yet, so the comma was judged grouping and
 * DELETED — the next two keys then built "500", and a cashier typing a $5 tip as "5,00" recorded
 * $500 (under the $1,000 cap, so nothing refused it). A keystroke cannot know what the next key
 * will be, so it must not decide what a comma means:
 *
 *  - `sanitizeMoneyInput` runs per keystroke and only REFUSES characters. It never rewrites or
 *    drops a comma the dot has not yet made meaningless, so the text the cashier sees is the text
 *    they typed.
 *  - `parseMoneyCents` runs on the WHOLE string, at read time, and is where the comma is decided.
 */

/** Longest text the field keeps — far past any cap, short enough that no parse walks a novel. */
const MAX_CHARS = 12;

/**
 * Per-keystroke filter: keeps ASCII digits, ONE `.`, and commas typed BEFORE the dot; refuses a
 * third digit after the dot; caps the text at 12 characters. Keystroke-stable: feeding it its own
 * output plus one character never changes what was already there.
 */
export function sanitizeMoneyInput(raw: string): string {
  let out = "";
  let dot = false;
  let decimals = 0;
  for (const ch of raw) {
    if (out.length >= MAX_CHARS) break;
    if (ch >= "0" && ch <= "9") {
      if (dot) {
        if (decimals >= 2) continue; // a third decimal digit is refused, never rounded
        decimals += 1;
      }
      out += ch;
    } else if (ch === ".") {
      if (dot) continue;
      dot = true;
      out += ch;
    } else if (ch === ",") {
      // After the dot a comma cannot be a decimal separator or US grouping — refuse it. Before the
      // dot it is KEPT, whatever it turns out to mean: that is decided on the whole string.
      if (dot) continue;
      out += ch;
    }
  }
  return out;
}

/**
 * Whole-string read → integer cents, or `null` when the text is not an amount (empty, only
 * separators, or more than seven whole-dollar digits).
 *
 * The W21d disambiguation, verbatim, now on the whole string: with a dot present, commas are
 * grouping ("1,234.56"); comma-only text is a DECIMAL comma when 1–2 digits end it ("5,00",
 * "5,5"); otherwise commas are grouping ("1,234").
 */
export function parseMoneyCents(text: string): number | null {
  const normalized = text.includes(".")
    ? text.replace(/,/g, "")
    : text.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const m = /^(\d{0,7})(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!m) return null;
  const whole = m[1] ?? "";
  const frac = m[2] ?? "";
  if (whole.length + frac.length === 0) return null;
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Integer cents → the field's text: 2000 → "20.00". */
export function centsToField(cents: number): string {
  return `${Math.floor(cents / 100)}.${pad2(cents % 100)}`;
}

/** A banknote-style label: whole dollars drop the cents ("$20"), anything else keeps them ("$13.47"). */
export function noteLabel(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${centsToField(cents)}`;
}
