# Retrospective: the path-design wave (2026-10-08 → 10-11)

**Who wrote it and how.** One lead session ran parallel stream agents in worktrees. Between them they built PD1–PD12 plus follow-ups as #326–#348, then wrote the handoff (#349). This retrospective is **measured, not remembered**. Five read-only measurers pulled the GitHub REST API, Actions jobs and step logs, git replays of every merge commit, the session transcripts and the prod PostHog/Vercel signals. Three designers then proposed changes from different angles, and one adversarial critic re-measured the claims and pruned and sequenced the result. The critic's verdicts win where they differ from a proposal. The measurement scripts are still in session scratch, so committing them as `pnpm retro` is item 8 of the plan.

The owner asked for this: "radically improve design-plannings, orchestrations, workflows, agents, subagents, trees, PR, CI, automatic GitHub issues creation and resolution from staff and customer feedbacks … be bold … be self-improving."

## The baselines the next wave must beat

The numbers that are not cumulative-to-date are wave-scoped (#326–#348). The other prod and repo figures are cumulative or windowed as stated.

| Measure                                                   | This wave                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| PRs merged · elapsed                                      | 23 in 77.2 h                                                                                                                   |
| Hours open (median · p90 · max)                           | 13.85 · 47.6 · 60.08 (#329); ready → merge median 5.79                                                                         |
| Merge heads that Codex had reviewed before the merge      | **8 of 23**                                                                                                                    |
| Codex usage-limit replies · quota flips (available → out) | 75 on 20 of 23 PRs · 12                                                                                                        |
| Codex findings                                            | 99 (4.30 per PR; P1 18)                                                                                                        |
| Blind passes                                              | 33: **29 REJECT · 4 APPROVE**                                                                                                  |
| Own commits made after the first review signal            | **195 of 310 (63%)**                                                                                                           |
| Merge-main commits · merges that conflicted               | 63 (2.74 per PR) · 69 of 73, 41 of them only in ledger files                                                                   |
| CI runs on merge-main heads                               | 55 of 134 runs (41%), 674 of 1,604 run-minutes (42%)                                                                           |
| Real CI failures                                          | 7 of 134 runs (5.2%); 24 of the 31 "failures" were the by-design draft red                                                     |
| Mutation battery                                          | 3,270 → 4,171 mutants (+27.6% in 3.5 days); 86% of runner-minutes                                                              |
| Full batteries per PR · battery wall-minutes per PR       | median 3 (max 8) · median 42.1                                                                                                 |
| Share of battery time in the files a PR changed           | median 2.8% (p75 14.1%, max 30.9%)                                                                                             |
| Shard cost model vs measured cost                         | `.tsx` = 9× a `.ts`, measured 4.13×; slowest shard 18.6 min, replay at measured cost 10.2                                      |
| SQL lane (`migrations-check + types-fresh`)               | 10.9–13.3 min → 20.0–23.8 min; mode-authority max 640 s of its 900-s timeout                                                   |
| Commits that only re-wrote prose counts                   | 145 of 311 wave-branch commits; 19 of 19 CLAUDE.md commits on main numbers-only; OPEN-ITEMS churn 84% re-padding               |
| Memory reaching sessions                                  | SessionStart prints up to ~435 KB and the harness injects a 2 KB preview (20 of 21 starts); 76% of 398 LEARNINGS name no guard |
| Instruction freshness                                     | the root checkout sat 22 commits behind main, so every subagent got the 10-09 `CLAUDE.md`                                      |
| Field signal                                              | 0 GitHub issues ever; 1 staff report (emailed, no issue); 1 guest feedback row; 0 OPEN-ITEMS rows sourced from the field       |

## What worked: keep it

- **Worktree-per-stream parallelism shipped.** 23 PRs landed in 77 h. Main's push CI is green on all 24 completed runs since #320, so no defect reached `main`.
- **The two reviewers are complementary, not redundant.** Only 5 of 123 review-fix commits answered both of them. On #348, Codex was clean twice while the blind pass found two criticals: a wrong Invite instruction and a scroll region no keyboard could reach.
- **The mutation battery caught what no reviewer saw.** #347's round-4 fix made an old mutant survive, and shard 6 was the only signal.
- **One-file prod applies with object verification.** Eight applies, no incident beyond the DROP stall. The lead re-measured that no out-of-order pair restates a shared function.

## What hurt: ranked by measured cost

1. **Ledger conflicts and count churn drove the merge train.** 41% of CI and 2.74 merge-main commits per PR went to prose counts, CHANGELOG ordering, OPEN-ITEMS padding, LEARNINGS keys, DESIGN-LANGUAGE section numbers and the 34k-line mutant registry.
2. **The full battery runs on every head, on unbalanced shards.** That cost a median 42 wall-minutes per PR, even though the files a PR changes hold a median 2.8% of the battery's time.
3. **Governance by prose.** 15 of 23 merges went in against the written Codex rule with no mechanical signal. The delegation that justified them lived in a spec and HANDOFF, not in the rulings, and the rule itself is restated in 3 blocks of about 11 KB each.
4. **Memory that never loads, and stale instructions.** LEARNINGS reached sessions as a 2 KB preview. The injected `CLAUDE.md` came from a checkout 22 commits behind.
5. **Reviews in the wrong order.** 63% of commits came after the first review. The blind pass's REJECT carries no information as a verdict; it is a findings list.
6. **No field loop.** The staff-report → GitHub-issue pipeline is built (`lib/staff-report-actions.ts`, `lib/github-issues.ts`) and has never fired: `GITHUB_ISSUES_TOKEN` is unset (C17) and the label does not exist. The guest low-rating path promises follow-up that only a PostHog event receives. 21 Stripe webhook signature rejections in 30 days reached no one.

## The plan: the next PRs, in order

The critic sequenced these. Each states its smallest first step, and none of them weakens a "never" rule.

0. **Clear the decks.** Merge #349. Fix and land Dependabot #323 (Next 16.2.9 → 16.3.8, esbuild, vitest; red since 10-08). Add a `.github/dependabot.yml`, and make shards fail fast when `pnpm install` fails.
1. **Make ledger conflicts impossible.** Land this while nothing else is open.
   - A `check:docs` ban on prose counts, red-first.
   - `pnpm state`, which writes the live counts to the job summary and a generated block.
   - `docs/OPEN-ITEMS.md` into `.prettierignore` (the `MENU_REFERENCE.md` precedent) and one collapse of its padding.
   - `docs/changelog.d/` fragments.
   - New LEARNINGS as slug-keyed fragment files.

   Measured replay: 53 of the 70 conflicted merges become clean.

2. **One sanctioned merge path.**
   - `pnpm merge` runs locally on the owner's token, so merges still trigger workflows. It does a SHA-guarded squash and enforces a freshness rule: if the latest CI predates main, close and reopen to re-test without re-arming `codex-review`. It posts a receipt.
   - `merge-audit.yml` in report-only mode.
   - A scoped, expiring delegation record that the gate reads.

   This needs the owner's ruling on G3 first.

3. **Memory that loads.**
   - Measure the harness's whole-injection threshold.
   - Ship a hand-curated digest under it.
   - Pin the root checkout to `origin/main` with a SessionStart fast-forward when clean, with all branch work in worktrees. The lead did this by hand at the wave's end.
   - Every new learning carries `enforced_by:` (a guard, test or workflow) or `expires:`.
4. **Mutants where they pay.**
   - `scripts/mutant-costs.json` from measured shard logs: slowest shard 17.7 → 10.2 min at 12 shards.
   - `verify:slice --affected=<ref>`: a touched module's whole set, red-first. It must select `m270/kds-board/news-outlives-ack` on `7e21a03`'s diff.
   - One changed-set job on draft heads only. Stay at 12 shards: the measured concurrency peak is 22 jobs.
5. **The SQL lane as a matrix.** `verify-mode-authority --shard/--list`, proven disjoint, then 3 legs with the aggregate name unchanged. 22 → about 9 min, before the 900-s timeout bites.
6. **Reviewers in the order they pay.** The owner must approve this, because it changes WORKFLOW §Review only and CLAUDE.md links to it.
   - The blind pass runs on the draft and returns a JSON findings ledger instead of a verdict.
   - Codex runs once on the converged head, with a second round on a P1 or a migration.
   - Quota-aware asking.
   - A post-merge Codex sweep at receipt time that files a follow-up for any finding landing after `merged_at` (the #335 → #342 case).
7. **The lead's playbook as a skill.**
   - CPU leases: `flock`, 2 heavy slots, `VITEST_MAX_WORKERS`.
   - Per-agent output directories, so measurers stop overwriting each other.
   - `report.json` posted as a PR comment, so a container restart loses nothing.
   - Worktree GC.
   - "No stacking; foundation first."
8. **`pnpm retro`.** Commit the measurement scripts and this table's baselines, and run it at every wave's end. A regression against the baseline is the next wave's first PR. Record each session's model usage from `get_session` and set a per-PR token budget: runner minutes are free on this public repo, and the model is the real spend.
9. **Prod-migration safety without a staging project.**
   - An apply lint: no top-level DROP/DELETE. A drop goes to the owner as a decision.
   - Applies named by their repo version.
   - A schema-fingerprint parity check toward M125.
10. **Deterministic jsdom timing.** A `VITEST_TIMER_SKEW` run of changed component suites, red-first on `99b354e`, and one shared settle helper.

## Staff and guest feedback → issues → fixes

The repo is public, and a staff message can name a guest or hold untranslated Burmese, so intake is private by default. Feedback text is **untrusted data**: it never reaches a tool that can write.

1. **Switch on what exists (owner settings, zero app code).** A private intake repo (`mms-intake`), the token (C17), and the labels synced from a manifest. Prove red-first that the label attaches with an Issues-only token, since GitHub drops labels silently for callers without push access.
2. **Make the promises true.**
   - Route a guest's low rating to a person via `after()`.
   - Join the error digest to every report.
   - Put Help doors on 7 more staff pages, the floor drill-down first, where clears, losses and settlement happen.
3. **Close the reporter's loop.** Intake issue events write the report's status. "Fixed" shows only once Vercel's production deployment contains the fix commit, so Mom and Dad see it in their own language.
4. **Zero-token nightly signal collector.** PostHog and Vercel counts become one deduped issue per fingerprint. **First investigate the Stripe signature stream once.** The samples share one event id, and QR and delivery share one Stripe account, which looks like an endpoint or secret misconfiguration, not a reason to page someone every night.
5. **Quarantined nightly Claude triage.** A Read-only subagent clusters and dedupes against a compact OPEN-ITEMS index (39× smaller than the table), and a deterministic script files the issues.
6. **A human-gated resolver.** The owner's `ready-for-agent` label opens one fresh cloud session and one scope-checked DRAFT PR through the normal gate. The scope check refuses money, auth and migration paths. The resolver never merges and never applies a migration.
7. **Feed design.** Clustered field evidence becomes the design-prototyping loop's map input. The critic dropped a structured device-sitting capture mode as premature; revisit it once intake carries volume.

## Owner decisions this plan waits on

1. **G3.** Did 2026-10-09's "merge all" cover red-`codex-review` heads? Write the answer into OWNER_RULINGS, including whether a scoped, expiring delegation mechanism should exist at all (plan item 2).
2. Ratify the gate and merge calls listed in HANDOFF's top block.
3. The reviewer reorder (plan item 6).
4. The private intake repo and its token (C17); branch protection (C28).
5. Dependabot #323, and one look at the Stripe signature stream.

## The self-improvement rule

A lesson that is only prose decays. Every new learning names its guard (`enforced_by`) or its expiry (`expires`). Every wave ends with `pnpm retro` against the table above, and the worst regression opens the next wave.
