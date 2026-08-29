/**
 * Has Codex reviewed THIS commit? — the pure half of `.github/workflows/require-codex-review.yml`.
 *
 * The workflow does the IO (fetch the PR, its reviews, its comments) and calls this; the decision
 * lives here so it can be falsified in a test rather than only in production. That split is the
 * whole point: this repo has shipped guards that were "green for the wrong reason" — a grep whose
 * pattern matched a neighbouring function, a count that passed vacuously on an empty population —
 * and a gate nobody can make fail is decoration. `codex-review-gate.test.ts` makes each of the five
 * ways this could wrongly pass go red.
 */

/** Codex's bot login. Anything from another author is somebody typing, not a review. */
export const CODEX_LOGIN = "chatgpt-codex-connector[bot]";

/**
 * The commit line Codex prints in its no-findings comment: `**Reviewed commit:** \`ebe0ea3056\``.
 * Abbreviated to 10 characters in practice; the bound is 7–40 so a format change in either direction
 * still parses rather than silently un-gating the merge.
 */
const REVIEWED_COMMIT = /Reviewed commit:\s*\**\s*`?([0-9a-f]{7,40})`?/i;

/**
 * @param {object} input
 * @param {string} input.headSha            the FULL sha the PR would merge right now
 * @param {{user?: {login?: string}, commit_id?: string}[]} input.reviews
 * @param {{user?: {login?: string}, body?: string}[]} input.comments
 * @returns {{ reviewed: boolean, via: "review" | "comment" | null }}
 */
export function hasCodexReview({ headSha, reviews = [], comments = [] }) {
  // A gate that answers "yes" for an unknown head is worse than no gate — it would pass every PR
  // whose payload shape drifted. No head, no pass.
  if (typeof headSha !== "string" || !/^[0-9a-f]{7,40}$/i.test(headSha)) {
    return { reviewed: false, via: null };
  }
  const head = headSha.toLowerCase();

  // A submitted review PINNED to this commit. `commit_id` is what makes this a gate and not a
  // formality: Codex reviewing an earlier head says nothing about the code about to land, which is
  // exactly the case that shipped three P2s on #239.
  if (reviews.some((r) => r?.user?.login === CODEX_LOGIN && r?.commit_id?.toLowerCase() === head)) {
    return { reviewed: true, via: "review" };
  }

  // Or the no-findings comment, which names the commit in prose instead of a field. Matched on the
  // sha it prints — NEVER on the word "Codex" appearing somewhere, which any of us could satisfy by
  // writing this sentence.
  const commented = comments.some((c) => {
    if (c?.user?.login !== CODEX_LOGIN) return false;
    const m = REVIEWED_COMMIT.exec(c?.body ?? "");
    return !!m && head.startsWith(m[1].toLowerCase());
  });
  return commented ? { reviewed: true, via: "comment" } : { reviewed: false, via: null };
}
