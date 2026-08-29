import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs so `actions/github-script` can `require()` it from the workflow
// without a build step. The predicate is tested here because `scripts/` is not a suite root (the
// orphan guard in verify:slice enumerates exactly `apps/qr` and `packages/ui/src`).
import { hasCodexReview, CODEX_LOGIN } from "../../../scripts/codex-review-gate.mjs";

/**
 * The Codex gate's decision, made falsifiable.
 *
 * A required check that answers "yes" for the wrong reason is worse than no check: it converts an
 * unread review into a green tick. This repo has shipped that exact class before — a grep whose
 * unbounded slice matched a NEIGHBOURING function's gate, a count that passed vacuously on an empty
 * population — so every way this predicate could wrongly pass gets an assertion that goes red when
 * it does.
 *
 * The cases that matter are the near-misses, not the happy path: a review of the PREVIOUS head (the
 * one that let three P2s onto `main` from #239), and a human writing the word "Codex".
 */

const HEAD = "9155abfa7c28b3f4092dd590373c8ef182ef46e2";
const OTHER = "2b2aeb131c8ade3008cc984c6a7ad7bc359d0d48";
const review = (commit_id: string, login = CODEX_LOGIN) => ({ user: { login }, commit_id });
const comment = (body: string, login = CODEX_LOGIN) => ({ user: { login }, body });

describe("hasCodexReview — the gate opens only for a review of THIS commit", () => {
  it("opens on a submitted review pinned to the head", () => {
    expect(hasCodexReview({ headSha: HEAD, reviews: [review(HEAD)], comments: [] })).toEqual({
      reviewed: true,
      via: "review",
    });
  });

  it("opens on the no-findings comment, matched by the abbreviated sha it prints", () => {
    // Codex's real wording when it finds nothing — it carries no commit_id field, only this line.
    const body =
      "Codex Review: Didn't find any major issues. Chef's kiss.\n\n**Reviewed commit:** `9155abfa7c`";
    expect(hasCodexReview({ headSha: HEAD, reviews: [], comments: [comment(body)] })).toEqual({
      reviewed: true,
      via: "comment",
    });
  });

  it("STAYS SHUT for a review of the previous head — the whole reason this exists", () => {
    // #239: Codex reviewed the head, the PR merged nine minutes earlier, three P2s reached `main`.
    // A gate that accepted any Codex review would have been green for that merge.
    expect(hasCodexReview({ headSha: HEAD, reviews: [review(OTHER)], comments: [] })).toEqual({
      reviewed: false,
      via: null,
    });
  });

  it("stays shut for a no-findings comment naming a different commit", () => {
    const body = "**Reviewed commit:** `2b2aeb131c`";
    expect(hasCodexReview({ headSha: HEAD, reviews: [], comments: [comment(body)] })).toEqual({
      reviewed: false,
      via: null,
    });
  });

  it("stays shut when a HUMAN says the word — authorship is checked, not vocabulary", () => {
    expect(
      hasCodexReview({
        headSha: HEAD,
        reviews: [review(HEAD, "min-hinthar")],
        comments: [comment(`Codex reviewed this. **Reviewed commit:** \`${HEAD}\``, "min-hinthar")],
      }),
    ).toEqual({ reviewed: false, via: null });
  });

  it("stays shut on a Codex comment that names no commit at all", () => {
    // "@codex review" acknowledgements and follow-ups carry the login but assert nothing about a sha.
    expect(hasCodexReview({ headSha: HEAD, reviews: [], comments: [comment("On it.")] })).toEqual({
      reviewed: false,
      via: null,
    });
  });

  it("stays shut when the head is unknown or malformed — never pass on a payload it cannot read", () => {
    for (const headSha of ["", "not-a-sha", undefined as unknown as string])
      expect(hasCodexReview({ headSha, reviews: [review(HEAD)], comments: [] })).toEqual({
        reviewed: false,
        via: null,
      });
  });

  it("stays shut on empty input — 'nobody reviewed' and 'nothing was fetched' must not agree", () => {
    expect(hasCodexReview({ headSha: HEAD, reviews: [], comments: [] })).toEqual({
      reviewed: false,
      via: null,
    });
  });

  it("is case-insensitive on the sha, since Codex prints it lowercase and the API does too", () => {
    expect(
      hasCodexReview({ headSha: HEAD.toUpperCase(), reviews: [review(HEAD)], comments: [] })
        .reviewed,
    ).toBe(true);
  });
});
