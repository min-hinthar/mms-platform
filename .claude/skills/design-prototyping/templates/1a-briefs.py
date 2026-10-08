"""Turn 1-diverge's result into one brief per moment for 1b-draw.

Usage: python3 1a-briefs.py <diverge-result.json> <brief-dir> [selection.json]

<diverge-result.json> is the workflow's return value ({results: [{moment, concepts, judgement}]}).
[selection.json] optionally picks which concept screens to draw, per moment and angle:
  {"m1": {"quiet": [0, 2], "guided": [1, 4], "glanceable": [0, 2]}, ...}
Without it, each concept's first two screens are drawn. Writes <brief-dir>/brief-<id>.md, a
<brief-dir>/<id>.json copy of the moment's result (2-refine reads `.judgement` from it), and
<brief-dir>/titles.json (artboard file -> concept, angle, screen title) for the canvas index.
"""
import json, sys

src, base = sys.argv[1], sys.argv[2]
sel = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
SHORT = {"quiet": "quiet", "guided": "guided", "glanceable": "glance"}


def lst(x):
    return "\n".join("- " + str(i) for i in x) if isinstance(x, list) else str(x)


data = json.load(open(src))
results = data.get("results", data)
titles = {}
for res in results:
    m = res["moment"]
    mid = m["id"]
    json.dump(res, open(f"{base}/{mid}.json", "w"), indent=1, ensure_ascii=False)
    out = [f"# Moment {mid}: {m['title']}\n", f"Device: {m['device']}\n",
           "## Who\n" + m["who"] + "\n", "## Today\n" + m["today"] + "\n",
           "## Binding rules\n" + m["binding_rules"] + "\n"]
    for c in res["concepts"]:
        k = c["angle_key"]
        pick = sel.get(mid, {}).get(k, [0, 1])
        out.append(f"\n\n========================================\n## CONCEPT ({k.upper()}): {c['name']}\n")
        out.append("Angle: " + c["angle"] + "\n")
        out.append("One-liner: " + c["one_liner"] + "\n")
        out.append("A11y notes: " + lst(c.get("a11y", "")) + "\n")
        out.append("All screens in this concept: " + " | ".join(s["title"] for s in c["screens"]) + "\n")
        for n, i in enumerate(pick, 1):
            if i >= len(c["screens"]):
                sys.exit(f"{mid}/{k}: screen index {i} out of range ({len(c['screens'])} screens)")
            s = c["screens"][i]
            fn = f"{mid}-{SHORT[k]}-{n}.dc.html"
            titles[fn] = (c["name"], k, s["title"])
            out.append(f"\n### ARTBOARD {fn}  <-  brief screen: {s['title']}\n")
            out.append("LAYOUT:\n" + s["layout"] + "\n")
            out.append("COPY (English):\n" + lst(s.get("copy_en", "")) + "\n")
            out.append("COPY (Burmese drafts):\n" + lst(s.get("copy_my", "")) + "\n")
    j = res["judgement"]
    out.append("\n\n========================================\n## Judges' notes (context only — never put on an artboard)\n")
    out.append("Recommended: " + j["recommended"] + "\n\nGrafts: " + j["grafts"] + "\n")
    open(f"{base}/brief-{mid}.md", "w").write("\n".join(out))
json.dump(titles, open(f"{base}/titles.json", "w"), indent=1, ensure_ascii=False)
for fn, (n, k, t) in titles.items():
    print(fn, "|", n, "|", t[:90])
