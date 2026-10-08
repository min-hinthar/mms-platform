export const meta = {
  name: 'draw-concepts',
  description: 'Draw every concept artboard each moment brief names, onto the canvas project dir',
  phases: [{ title: 'Draw', detail: 'one agent per moment draws its ARTBOARD sections' }],
}

// args: { brief: <dir with RULES.md, RULES2.md and brief-<id>.md>, proj: <canvas project/ dir>,
//         moments: ['m1', 'm2', ...] }. Run 1a-briefs.py on 1-diverge's result first.
const BRIEF = args.brief
const PROJ = args.proj
const MOMENTS = args.moments
if (!BRIEF || !PROJ || !Array.isArray(MOMENTS) || MOMENTS.length === 0) {
  throw new Error('1b-draw needs args.brief, args.proj and args.moments (ids, each with a brief-<id>.md)')
}

phase('Draw')
const out = await parallel(MOMENTS.map((id) => () => agent(
  `Read ${BRIEF}/RULES.md in full (and ${BRIEF}/RULES2.md if the brief names a TV frame or an interactive guide), then ${BRIEF}/brief-${id}.md. Each "### ARTBOARD <file>" section is one screen: write each with the Write tool into ${PROJ}/ at exactly that file name, following its LAYOUT and its COPY verbatim (never invent Burmese). Never render, never read your files back, never touch the repo, never publish. Reply with one line per file: the path and a <=12-word description.`,
  { label: `draw:${id}`, phase: 'Draw' },
)))
const missing = MOMENTS.filter((_, i) => !out[i])
if (missing.length) throw new Error(`draw failed for ${missing.join(', ')}: re-run (finished moments replay from cache)`)
return out
