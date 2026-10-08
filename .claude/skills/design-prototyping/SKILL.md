---
name: design-prototyping
description: The standard design-thinking prototyping loop for the MMS QR app (owner, 2026-10-08 — "make this standard for future design-thinking prototyping"). Use whenever the owner asks for design thinking, prototypes, UI/UX elevation of diner or staff paths, new moments (a board, a guide, a flow), or to decide open design questions. It runs map → diverge → owner pick → refine → canvas → record → blind review → Codex → merge, with rounds after that (Codex out of quota: the blind review of the exact head stands in, and the owner merges that head by admin bypass).
---

# Design-thinking prototyping — the MMS standard

The 2026-10-07/08 path-design work (#319, `docs/PATH_DESIGN_2026-10-07.md`) is the worked example. The
owner liked three things about it and asked for them every time: **the workflows** (fan-out agents that
diverge, refine, critique and draw), **the outputs** (an interactive canvas of hi-fi screens plus a
record the streams build from), and **the collaboration** (a few sharp questions, then trust). This file
is that loop, with the sharp edges it hit.

## The loop

| Step | What happens | Output |
| ---- | ------------ | ------ |
| 0 · Frame | Read `docs/DESIGN-LANGUAGE.md`, `docs/prototype/v7.2.html`, `docs/context/RUBRIC.md`, the open rows in `docs/OPEN-ITEMS.md` and the stream cards. Map the diner and staff paths and pick the moments that matter (≤8 a round). | One brief per moment, claims checked against the code at a named SHA (file:line) |
| 1 · Diverge | A workflow draws three directions per moment (the 2026-10-07 set: Quiet · Guided · Glanceable), two screens each, then judges score them. | `.dc.html` artboards on a canvas; scores, a pick and grafts per moment |
| 2 · Owner pick | ONE `AskUserQuestion`: the direction, plus up to three product questions whose answers change the build. The recommended option first. | The owner's picks (option labels are picks, never quotes) |
| 3 · Refine | A workflow per moment: synthesize the picked concept + grafts + owner answers into a spec; ONE consistency agent across all moments (one vocabulary); an adversarial critic per spec; then draw the refined screens. | Specs with appendix A (consistency) · B (critic's blocking fixes) · C (suggestions); refined artboards |
| 4 · Publish | Put the refined screens on the canvas's first page; the newest page is the launch page. | The owner's canvas link |
| 5 · Record | A docs-only PR: the record, one spec per moment, OPEN-ITEMS rows naming the stream that builds each, a rulings section, HANDOFF pointer, CHANGELOG, ENV when a runbook changes. | The PR |
| 6 · Review | `pnpm review:bundle` → one capped blind pass (≤3 lenses: product truth · money · consistency) → verify each finding against source → fix → post the verdict naming the head SHA it reviewed. `@codex review` is asked on the draft at open (WORKFLOW §Review); fix-or-justify every thread, reply, resolve. **Codex out of quota** (it answers with its usage-limit message): do not loop on `@codex review` or wait for the quota. This step's blind pass stands in only for the exact head it reviewed (a later fix commit: the lead's carry procedure in WORKFLOW §Review step 5 (g) — not an owner ruling): post its verdict naming that SHA, with `verify-slice` and the rest of CI green on the same SHA ([WORKFLOW.md](../../../docs/WORKFLOW.md) §Review step 5 (g); OWNER_RULINGS_2026-10-07 §G, G3). | Reviewed head |
| 7 · Merge | Only on the owner's go, with CI green on the head. A record that is `.md`-only (no `CLAUDE.md` or `.claude/**`) skips the Codex wait under ruling #1's waiver while no check is enforced; once `codex-review` is required it stays red on such a PR until Codex reviews the head, so the PR is listed `#N @ SHA · .md-only` and the OWNER merges it by admin bypass (#2). A round that also edits `CLAUDE.md` or `.claude/**` (this skill, say) is not `.md`-only: it waits for Codex's review of the head — or, with Codex out of quota, step 6's stand-in verdict on that SHA and the owner's admin-bypass merge, by hand, never the agent's (G3). | Merged record |
| N · Rounds | The owner answers, delegates or asks for more. Decisions go in a newest-wins section (D1…Dn); new moments get a spec + screens; every earlier spec gets a section of amendments; existing screens are refreshed IN PLACE. | Same PR or the next |

### The two registers (owner, 2026-10-07)

**Diner moments are guided; staff moments are glanceable** — "I actually love all 3 directions but could
be more enhanced, elevated, world-class design-thinking." So the refine step grafts the best of every
direction into the picked one; it never just ships the winner. Premium iOS cues the owner named:
wallet-style passes, one pass that carries the progress, animated step guides.

### What made it world-class (keep every one)

- **One vocabulary across moments** — one pass, one kitchen track, one motion language, one Undo form, one
  dismiss word — set by the consistency agent and written into the record, so N moments never invent N
  looks for one counter.
- **Every claim about the product is checked against the code** at a named SHA, with file:line.
- **Guides teach only what ships**, and a guide's picture is the real screen it teaches. The round-3
  canvas pass caught a guide drawing the guest's pass where Dad's pane shows its own.
- **Every state names its carrier.** A flag that rides a guest's presence dies when they lock their
  phone (Codex r3 on #319). Say whether each state is durable, server-backed or ephemeral.
- **Every runbook step must be possible in the state it runs in.** #319's first draft made a real Apple
  Pay sale a PRECONDITION of flipping the flag that refuses that sale; the blind pass caught it.
- **Money semantics get the same rigor as code:** where each refusal sits relative to
  `supersedeCartIntent`, what holds a door, what fails closed. A design record is a contract the money
  streams will build.
- **Burmese is never invented.** New Burmese is a K15 draft for the native sitting; English-only otherwise.
- **The owner is asked once, sharply.** Defaults are decided and recorded; only what changes the build
  goes to the owner, in a "What still goes to the owner" section.

## Mechanics

**Canvas.** `Artifact` `action: "quickstart"`, `intent: "design"` → the Design type. Files live under
`project/` (`canvas.json` v3 with `pages`, `boards`, `order`, `launch`). Artboards follow
[`references/artboard-rules.md`](references/artboard-rules.md) (phone 390×844, tablet 1366×1024, literal
token hex, no device chrome, no emoji, Latin digits) and, for the TV board and interactive guides,
[`references/artboard-rules-tv-guides.md`](references/artboard-rules-tv-guides.md) (1920×1080 Night;
`state` + `sc-if` steps; every keyframe escorted by reduced motion). Publish to the existing `url` with
`root` = the canvas dir, a `file_path` (one page or data file is REQUIRED — `files` alone is refused) and
`files` for the rest; send only changed files. Re-read `canvas.json` before republishing it. The artifact
is private to the owner — never commit its URL; find it with `Artifact` `action: "list"` by title. A
watch subscription can fail (`mint_failed`): never claim to be watching unless the result says so.

**Workflows** (ultracode, or the owner asking). Templates from the 2026-10-07 run, parameterized by
`args` (`repo` = the repository root, e.g. `git rev-parse --show-toplevel` — required by 1-diverge,
3-refresh and 4-blind-review, which never assume a checkout path; `brief` = the brief dir, `proj` = the
canvas `project/` dir, `lens` = the design-lens brief):

- [`templates/1-diverge.workflow.js`](templates/1-diverge.workflow.js) — map paths → pick moments → three concepts per moment (each at least two screens) → judges. It fails before diverging unless all six path maps, the visual system and a non-empty pick came back. It draws nothing: save its return value as JSON, run [`templates/1a-briefs.py`](templates/1a-briefs.py) on it (one `brief-<id>.md` per moment), then [`templates/1b-draw.workflow.js`](templates/1b-draw.workflow.js) draws the artboards.
- [`templates/2-refine.workflow.js`](templates/2-refine.workflow.js) — synthesize → consistency → critique → draw. Pass the round's own `args.common` (owner answers, defaults, rules) and `args.moments`; the 2026-10-07 values inside are an example and run only on `args.useExample`. A missing consistency result fails the run (there is no "keep each spec" fallback), and so does a missing critic or draw for any moment.
- [`templates/2b-appendix.py`](templates/2b-appendix.py) — writes 2-refine's shared vocabulary (into every appendix A, ahead of that moment's amendments), its amendments and the critic fixes into each spec as appendices A/B/C that win over its body, so the spec and the drawn screens agree. Run it before writing the record.
- [`templates/3-refresh-in-place.workflow.js`](templates/3-refresh-in-place.workflow.js) — one agent per moment edits existing artboards to a later round's amendments; pass `args.repo`, `args.moments` (`[{ id, files }]`), `args.amendments`, `args.vocab` (that round's shared vocabulary as text — 2-refine returns it as `vocab`) and `args.decisions` (that round's decisions, D1…Dn, as text). It fails if any moment's agent returns no report.
- [`templates/4-blind-review.workflow.js`](templates/4-blind-review.workflow.js) — the capped blind pass: three lenses, one `adversarial-auditor` each, bundle only (`args.repo`/.review-bundle/), with the round's record and spec dir as `args.record` and `args.specs`. It fails unless every lens reports. `args.head` is REQUIRED: the PR's head SHA read from GitHub (`pull_request_read` `get` → `head.sha`, or `git ls-remote origin refs/pull/<N>/head`) — never the local `git rev-parse HEAD`, which a push from another checkout leaves stale while the bundle, written from the same checkout, still agrees with it. Fetch and check out that head before `pnpm review:bundle`. It returns `{ verdict, reviewed, head, lenses }`: `verdict` is the worst lens verdict (a CRITICAL finding counts as REJECT, as the auditor's own rule says); `reviewed` is the bundle's `<base>..<head>` (PROMPT.md's `Base: … to HEAD …` line), the head a posted verdict names. It fails if the lenses disagree on it, or if the bundle is not of `args.head`. A verdict other than APPROVE stands in for Codex (WORKFLOW §Review step 5(g)) only once every finding is fixed or justified on the PR.

Every template fails loudly when an agent returns nothing (a moment, a lens, a judgement) or a path argument it names is missing, rather than returning a partial result that reads as complete. Generation workflows (diverge, refine, draw, refresh) are not review rounds and may fan out (one agent
per moment per direction). The REVIEW stays under CLAUDE.md's HARD CAP: one blind pass, ≤3 lenses,
≤10 agents; then mechanical gates and a hand-read — never another agent round, except one more capped
pass over the files Codex named when Codex's round on the head comes back RED (LEARNINGS #218).

**The record's shape** (copy `docs/PATH_DESIGN_2026-10-07.md`): the owner's words verbatim and their
picks; a decisions table (decision · who decided · who builds); the shared vocabulary; cross-spec
reconciliations; required corrections (Codex, blind pass), which win over the specs; one section per
moment; "What still goes to the owner"; then each later round as a newest-wins section. Specs live in
`docs/path-design-<date>/mN-<slug>.md`, each ending in appendices that win over its body. OPEN-ITEMS
gets one `PDn` row per moment naming the stream(s); a design that changes a money door names the
OPEN-ITEMS row and ENV step it touches.

## Sharp edges (hit on #319)

- **The container restarts mid-run.** Keep every multi-file edit as a script in the scratchpad (rerunnable),
  commit and push early, and relaunch a review a restart killed (a killed pass is not a stalled one).
- **Prettier re-pads markdown tables**, so exact-match edits miss. Use
  [`templates/fixlib.py`](templates/fixlib.py): a whitespace-tolerant replace that fails loudly unless it
  matches exactly once.
- **OPEN-ITEMS tables differ in width** (the Money table has 5 columns: ID · Sev · Item · Status ·
  Source). Append into the Item cell, never after the last `|`.
- **`pnpm check:docs` counts TRACKED files** — `git add` new docs before running it, then refresh the
  count lines it names.
- **Bot noise:** Vercel's preview comment and your own replies come back as PR events. Skip them.
- **A Codex round can find product holes, not just doc ones** (a to-go draft that would let a phone pay
  before the dish was cooked). Verify each against the code, decide as a designer, then record the
  decision in the record, the OPEN-ITEMS row and the affected spec.
