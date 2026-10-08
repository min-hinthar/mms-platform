"""Write 2-refine's consistency amendments and critic fixes into each refined spec.

Usage: python3 2b-appendix.py <refine-result.json> <brief-dir> <out-dir> [slugs.json]

<refine-result.json> is 2-refine's return value ({vocab, amendments, results}). Each refined spec
<brief-dir>/picked-<id>.md gains appendices A (the shared vocabulary, then that moment's consistency
amendments), B (the critic's blocking fixes) and C (suggestions) — the same changes the drawn screens took — and is written to
<out-dir>/<slug>.md, where [slugs.json] maps ids to file slugs ({"m1": "m1-tablemate-send"}; the id
is used when absent). The appendix states that it wins over the spec body, so the spec the streams
build from and the screens on the canvas never disagree. Run it before writing the record.
"""
import json, sys

src, brief, out = sys.argv[1], sys.argv[2], sys.argv[3]
slugs = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}
r = json.load(open(src))
# The shared vocabulary goes into EVERY appendix A (Codex round 6 on #319): the drawn screens took it,
# so a spec without it would let a stream build a moment in its own words. No vocabulary, no appendix.
vocab = (r.get("vocab") or "").strip()
if not vocab:
    sys.exit("no shared vocabulary in the refine result — re-run 2-refine's consistency pass first")
amend = {a["moment"]: a["changes"] for a in r.get("amendments", [])}
for x in r["results"]:
    m = x["moment"]
    c = x.get("critic")
    if not c:
        sys.exit(f"{m}: no critic result — re-run 2-refine for it before writing appendices")
    spec = open(f"{brief}/picked-{m}.md").read().rstrip() + "\n"
    app = ["", "---", "",
           "## Appendix — what changed after this spec (applied in the drawn screens)", "",
           "The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn",
           "with both applied. **Where an item below contradicts the spec above, the item below wins.**", "",
           "### A · System amendments (the cross-moment consistency pass)", "",
           "**The shared vocabulary (every moment takes it):** " + vocab, "",
           "**This moment's amendments:**", ""]
    ch = amend.get(m) or []
    app += [f"{i}. {t}" for i, t in enumerate(ch, 1)] if ch else ["None beyond the shared vocabulary."]
    app += ["", f"### B · The adversarial critic's blocking fixes (verdict: {c['verdict']})", ""]
    if c["blocking"]:
        for i, b in enumerate(c["blocking"], 1):
            app += [f"{i}. **{b['issue']}**", f"   - Evidence: {b['evidence']}", f"   - Fix: {b['fix']}"]
    else:
        app += ["None."]
    app += ["", "### C · The critic's suggestions (not blocking; take them where the build agrees)", ""]
    app += [f"- {s}" for s in c["suggestions"]] or ["None."]
    slug = slugs.get(m, m)
    open(f"{out}/{slug}.md", "w").write(spec + "\n".join(app) + "\n")
    print(slug, len(spec), len(ch), len(c["blocking"]))
