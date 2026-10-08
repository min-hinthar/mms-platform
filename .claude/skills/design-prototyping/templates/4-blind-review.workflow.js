export const meta = {
  name: 'blind-review-round3',
  description: 'One capped blind adversarial pass over the round-3 docs delta: three lenses, one auditor each',
  phases: [{ title: 'Audit', detail: 'three blind auditors, one lens each, bundle only' }],
}
const FINDINGS = {
  type: 'object',
  properties: {
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
  required: ['verdict', 'findings'],
}
const BASE = `Audit the change bundle at /home/user/mms-platform/.review-bundle/ — start with PROMPT.md and MANIFEST.md; the diff is DIFF.patch and the full text of every changed file is under FILES/. You may read the rest of the repository at /home/user/mms-platform to verify any claim against source. You have been told nothing about the change's intent; judge only what the files say. Report only defects you can evidence by quoting both sides (the claim and the contradicting source or passage). Cap your work at about 15 minutes. Your single lens:`
const LENSES = [
  { key: 'product-truth', text: 'PRODUCT TRUTH — every claim about the current code (file:line references, function and flag names, statuses, shipped strings, behaviour) must match the repository source. Flag any claim the code contradicts, any cited line that does not hold what is claimed, and any shipped string quoted wrongly.' },
  { key: 'money', text: 'MONEY SEMANTICS — any described payment gating, refusal order, fail-open/fail-closed choice, flip or cutover condition, or settle path that would let money move wrongly, strand a charge, gate a door that must never be gated, or that contradicts another part of the same record (including docs/ENV.md and docs/OPEN-ITEMS.md).' },
  { key: 'consistency', text: 'INTERNAL CONSISTENCY — contradictions between the record (docs/PATH_DESIGN_2026-10-07.md), the per-moment specs under docs/path-design-2026-10-07/, the OPEN-ITEMS rows, the rulings file, ENV, HANDOFF and CHANGELOG: who owns what, what is decided versus left open, what wins over what, counts, and words (including the Burmese words used for each act).' },
]
phase('Audit')
const results = await parallel(LENSES.map(l => () =>
  agent(`${BASE} ${l.text}`, { label: `audit:${l.key}`, phase: 'Audit', schema: FINDINGS, agentType: 'adversarial-auditor' })
    .then(r => r && { lens: l.key, ...r })))
return results.filter(Boolean)
