/**
 * T20 — the half of the pay-lock impostor the seat derivation does not reach.
 *
 * `lockedByYou` fixed WHO the app believes holds the lock: it compares seat ids, so a tablemate who
 * names themselves "You" can no longer make a peer's lock read as the viewer's own. What that does
 * not fix is the SENTENCE. The peer branch renders `${name} is checking out`, and with that name the
 * banner reads **"You is checking out — the order's locked for a moment."** Ungrammatical, and it
 * still opens with the word the attack is built on: a hurried diner reads the first word, not the
 * verb agreement. The label was still attacker-controlled after the fact was not.
 *
 * Presence names arrive with almost no filtering by design — `setName` clamps length only, and
 * `cleanPresence` strips control and format characters — because a table's guests get to call
 * themselves what they like. So the narrowing happens where the name is put into a sentence about
 * the reader, and only for the forms that make the sentence read as first or second person.
 *
 * ⚠️ THE FALLBACK IS "Someone", WHICH IS ALREADY THE HONEST ANSWER HERE — it is what the banner
 * shows while presence has not yet resolved the seat. Refusing a name never invents a different
 * diner; it declines to name this one, which is exactly the state the surface already handles.
 *
 * The list is deliberately tiny and letters-only-normalized rather than clever. A blocklist that
 * tries to cover every confusable string would start eating real names (Yu, Youn, Mei are names
 * people have); these five are the forms that would be READ AS THE READER in "<x> is checking out".
 */

/** Normalized forms that make a peer's name read as the person looking at the screen. */
const FIRST_OR_SECOND_PERSON = new Set(["you", "youre", "u", "me", "i"]);

/**
 * The name to put in "<name> is checking out". Returns the peer's own name unless it would read as
 * the reader, and `"Someone"` for that case, for an unresolved seat, and for a blank name.
 *
 * ⚠️ BLANKNESS IS JUDGED ON THE TRIMMED NAME, NEVER ON THE ASCII PROJECTION — Codex round 2 on #249,
 * and the first draft got this exactly backwards in a bilingual app. It tested the letters-only
 * projection for emptiness, so a name written in Burmese, Chinese or any non-Latin script projected
 * to `""` and was replaced with "Someone". Since this helper backs both the lock banner and every
 * peer avatar's accessible label, that erased the real name of most of the guests this app is built
 * for — a defence against one contrived name that silently misnamed the ordinary case.
 *
 * The projection now does one job only: recognising the handful of Latin spellings that would make
 * the sentence read as the reader. An empty projection means "nothing Latin to compare", which is
 * not a reason to refuse a name.
 */
export function peerDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed === "") return "Someone";
  const latin = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  if (latin !== "" && FIRST_OR_SECOND_PERSON.has(latin)) return "Someone";
  return trimmed;
}
