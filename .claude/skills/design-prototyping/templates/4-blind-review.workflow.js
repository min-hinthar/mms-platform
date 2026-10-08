export const meta = {
  name: 'design-blind-review',
  description: "One capped blind adversarial pass over a design round's docs delta: three lenses, one auditor each",
  phases: [{ title: 'Audit', detail: 'three blind auditors, one lens each, bundle only' }],
}
const FINDINGS = {
  type: 'object',
  properties: {
    // The bundle's base..head, copied from PROMPT.md's `Base: <sha> to HEAD <sha>` line (MANIFEST.md
    // prints no SHA). A verdict posted as Codex's stand-in must name the exact head it covers (G3).
    reviewed: { type: 'string', pattern: '^[0-9a-f]{7,40}\\.\\.[0-9a-f]{7,40}$' },
    verdict: { type: 'string', enum: ['APPROVE', 'APPROVE_WITH_FIXES', 'REJECT'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MED', 'LOW'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'claim', 'evidence', 'fix'],
      },
    },
  },
  required: ['reviewed', 'verdict', 'findings'],
}
// The repository root comes from args.repo, never a hard-coded checkout path (Codex round 6 on #319).
const REPO = args.repo
if (!REPO) throw new Error('4-blind-review needs args.repo: the repository root holding .review-bundle/ (run `pnpm review:bundle` there first)')
// The round's record and spec dir are arguments too: a lens told to check the 2026-10-07 record while
// a later round's docs are under review would report a complete pass over the wrong files (the blind
// pass on #320).
const RECORD = args.record // e.g. docs/PATH_DESIGN_<date>.md
const SPECS = args.specs // e.g. docs/path-design-<date>/
if (!RECORD || !SPECS) throw new Error("4-blind-review needs args.record (the round's record, docs/PATH_DESIGN_<date>.md) and args.specs (its spec dir, docs/path-design-<date>/)")
// Optional: the head the bundle must be of (`git rev-parse HEAD`). A bundle written before the last
// push reviews a SHA that is not the one about to merge.
const EXPECT_HEAD = args.head
if (EXPECT_HEAD && !/^[0-9a-f]{7,40}$/.test(EXPECT_HEAD)) throw new Error(`args.head must be a commit SHA (7-40 hex), got ${EXPECT_HEAD}`)
const BASE = `Audit the change bundle at ${REPO}/.review-bundle/ — start with PROMPT.md and MANIFEST.md; the diff is DIFF.patch and the full text of every changed file is under FILES/. You may read the rest of the repository at ${REPO} to verify any claim against source. You have been told nothing about the change's intent; judge only what the files say. Report only defects you can evidence by quoting both sides (the claim and the contradicting source or passage). Cap your work at about 15 minutes. Copy the two SHAs on PROMPT.md's "Base: … to HEAD …" line into \`reviewed\` as <base>..<head>, exactly as printed but without the backticks. Your single lens:`
const LENSES = [
  { key: 'product-truth', text: 'PRODUCT TRUTH — every claim about the current code (file:line references, function and flag names, statuses, shipped strings, behaviour) must match the repository source. Flag any claim the code contradicts, any cited line that does not hold what is claimed, and any shipped string quoted wrongly.' },
  { key: 'money', text: 'MONEY SEMANTICS — any described payment gating, refusal order, fail-open/fail-closed choice, flip or cutover condition, or settle path that would let money move wrongly, strand a charge, gate a door that must never be gated, or that contradicts another part of the same record (including docs/ENV.md and docs/OPEN-ITEMS.md).' },
  { key: 'consistency', text: `INTERNAL CONSISTENCY — contradictions between the record (${RECORD}), the per-moment specs under ${SPECS}, the OPEN-ITEMS rows, the rulings file, ENV, HANDOFF and CHANGELOG: who owns what, what is decided versus left open, what wins over what, counts, and words (including the Burmese words used for each act).` },
]
phase('Audit')
const results = await parallel(LENSES.map(l => () =>
  agent(`${BASE} ${l.text}`, { label: `audit:${l.key}`, phase: 'Audit', schema: FINDINGS, agentType: 'adversarial-auditor' })
    .then(r => r && { lens: l.key, ...r })))
// Every declared lens must report: a pass that silently lost its money auditor is not a three-lens
// pass (Codex round 4 on #319). Re-run the workflow; finished lenses replay from cache.
const missing = LENSES.filter((_, i) => !results[i]).map((l) => l.key)
if (missing.length) throw new Error(`blind review incomplete, no result from: ${missing.join(', ')}`)
// Every lens must have read the same bundle, and (given args.head) a bundle of that head: the posted
// verdict names this SHA, and the owner's bypass merge is tied to it (OWNER_RULINGS §G, G3).
const SHA_PAIR = /^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/
const bad = results.filter((r) => !SHA_PAIR.test(r.reviewed || '')).map((r) => `${r.lens}: ${r.reviewed}`)
if (bad.length) throw new Error(`a lens did not report the bundle's base..head: ${bad.join('; ')}`)
const reviewed = [...new Set(results.map((r) => r.reviewed))]
if (reviewed.length !== 1) throw new Error(`lenses disagree on the bundle reviewed: ${reviewed.join(' vs ')}`)
const head = SHA_PAIR.exec(reviewed[0])[2]
if (EXPECT_HEAD && !(EXPECT_HEAD.startsWith(head) || head.startsWith(EXPECT_HEAD))) {
  throw new Error(`the bundle is of ${head}, not args.head ${EXPECT_HEAD}: re-run \`pnpm review:bundle\` on that head`)
}
return { reviewed: reviewed[0], head, lenses: results }
