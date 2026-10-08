export const meta = {
  name: 'refresh-picks-in-place',
  description: "Apply a later round's cross-moment amendments to the existing picked artboards, in place",
  phases: [{ title: 'Refresh', detail: 'one agent per moment edits its picked artboards in place' }],
}

const REPO = args.repo
const BRIEF = args.brief
const PROJ = args.proj
// args.moments: [{ id, files: [...] }] — the artboards to refresh; args.amendments: a text file
// whose "######## <id> ·" sections list each moment's changes (Codex round 5 on #319).
const MOMENTS = args.moments
const AMEND = args.amendments
// The round's own shared vocabulary (2-refine's `vocab`) and its decisions (D1…Dn, verbatim), as
// text. They replace a hard-coded round3-result.json and its D1–D5, which would have refreshed every
// later round's artboards to round 3's words (Codex round 6 on #319).
const VOCAB = args.vocab
const DECISIONS = args.decisions
const text = (v) => typeof v === 'string' && v.trim().length > 0
if (!REPO) throw new Error('3-refresh needs args.repo: the repository root (e.g. the output of `git rev-parse --show-toplevel`)')
if (!BRIEF || !PROJ || !AMEND || !Array.isArray(MOMENTS) || MOMENTS.length === 0) {
  throw new Error('3-refresh needs args.brief, args.proj, args.amendments and args.moments [{ id, files }]')
}
if (!text(VOCAB) || !text(DECISIONS)) {
  throw new Error("3-refresh needs args.vocab (the round's shared vocabulary, as text — 2-refine returns it as `vocab`) and args.decisions (the round's decisions, D1…Dn, as text)")
}

phase('Refresh')
const out = await parallel(MOMENTS.map((m) => () => agent(
  `You are updating existing hi-fi design artboards so they match decisions made after they were drawn. Repo ${REPO} is READ-ONLY for you.

Read: ${BRIEF}/RULES.md and ${BRIEF}/RULES2.md (format rules — they still apply), ${AMEND} — the section headed "######## ${m.id} ·" is YOUR list (and any section that names every moment applies too) — then this round's shared vocabulary and decisions, below. Where they name a word (an Undo word, a dismiss word, a label), use exactly that word.

THE SHARED VOCABULARY (this round's):
${VOCAB}

THE DECISIONS (this round's, newest wins):
${DECISIONS}

Then open your artboards in ${PROJ}/: ${m.files.join(', ')}. For each, change ONLY what your amendments, the shared vocabulary and the decisions require visually. Use the Edit tool for targeted edits (never rewrite a file from scratch, never change layout, data or copy beyond what an amendment requires). If an amendment needs no visual change on a given artboard, leave that file untouched. Keep every RULES constraint (no fake chrome, real controls, contrast, Burmese only from shipped strings or existing drafts). Do not render or verify.

Finish with one line per file: name + "changed: <what>" or "unchanged".`,
  { label: `refresh:${m.id}`, phase: 'Refresh' },
).then((r) => r && { moment: m.id, report: r })))
// A null report stays null (Codex round 6 on #319): wrapping it as { moment, report: null } made it
// truthy, so the check below passed a moment whose agent returned nothing.
const missing = MOMENTS.filter((_, i) => !out[i]).map((m) => m.id)
if (missing.length) throw new Error(`refresh failed for ${missing.join(', ')}`)
return out
