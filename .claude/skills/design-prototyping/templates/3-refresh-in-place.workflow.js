export const meta = {
  name: 'refresh-picks-round3',
  description: 'Apply the round-3 cross-moment amendments to the existing picked artboards (moments 1-8)',
  phases: [{ title: 'Refresh', detail: 'one agent per moment edits its picked artboards in place' }],
}

const BRIEF = args.brief
const PROJ = args.proj
const MOMENTS = [
  { id: 'm1', files: ['picked-m1-1.dc.html', 'picked-m1-2.dc.html', 'picked-m1-3.dc.html'] },
  { id: 'm2', files: ['picked-m2-1.dc.html', 'picked-m2-2.dc.html', 'picked-m2-3.dc.html'] },
  { id: 'm3', files: ['picked-m3-1.dc.html', 'picked-m3-2.dc.html', 'picked-m3-3.dc.html'] },
  { id: 'm4', files: ['picked-m4-1.dc.html', 'picked-m4-2.dc.html'] },
  { id: 'm5', files: ['picked-m5-1.dc.html', 'picked-m5-2.dc.html'] },
  { id: 'm6', files: ['picked-m6-1.dc.html', 'picked-m6-2.dc.html'] },
  { id: 'm7', files: ['picked-m7-1.dc.html', 'picked-m7-2.dc.html'] },
  { id: 'm8', files: ['picked-m8-1.dc.html', 'picked-m8-2.dc.html', 'picked-m8-3.dc.html'] },
]

phase('Refresh')
const out = await parallel(MOMENTS.map((m) => () => agent(
  `You are updating existing hi-fi design artboards so they match decisions made after they were drawn. Repo /home/user/mms-platform is READ-ONLY for you.

Read: ${BRIEF}/RULES.md and ${BRIEF}/RULES2.md (format rules — they still apply), ${BRIEF}/round3-amendments.txt — the section headed "######## ${m.id} ·" is YOUR list, and the "record" section's vocabulary points apply too — and in ${BRIEF}/round3-result.json the "vocab" field (the shared ONE PASS / ONE KITCHEN TRACK / ONE MOTION LANGUAGE rules) and the "decisions" D1–D5 (especially D3, the Undo word: ပြန်ယူ for taking back a Send on phones and the console; ပြန်ဖျက် for erasing a just-made mark).

Then open your artboards in ${PROJ}/: ${m.files.join(', ')}. For each, change ONLY what your amendments and the shared vocabulary require visually (for example: a pass prints its figure ONCE under the two-tongue label "စားပွဲ · Table" instead of "Table 7" plus "စားပွဲ 7"; the kitchen track is three segments where length is progress and colour is the stage — Sent --t2/--pass-ink-2, Cooking --tx/--pass-ink, Served --ok — never gold/accent; a ✓ appears only for Paid (dine-in) or Ready (pickup ticket); the phone's Send undo reads "Undo · ပြန်ယူ"; no looping or breathing motion except KDS Late; a CALL tile has no pulse). Use the Edit tool for targeted edits (never rewrite a file from scratch, never change layout, data or copy beyond what an amendment requires). If an amendment needs no visual change on a given artboard, leave that file untouched. Keep every RULES constraint (no fake chrome, real controls, contrast, Burmese only from shipped strings or existing drafts). Do not render or verify.

Finish with one line per file: name + "changed: <what>" or "unchanged".`,
  { label: `refresh:${m.id}`, phase: 'Refresh' },
).then((r) => ({ moment: m.id, report: r }))))
return out.filter(Boolean)
