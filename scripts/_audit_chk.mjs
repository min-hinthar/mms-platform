import ts from "typescript";
import { readFileSync } from "node:fs";
const f = "lib/i18n/staff.ts";
const sf = ts.createSourceFile(f, readFileSync(f,"utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const entries = [];
function visit(n){
  if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name)) && n.name.text.startsWith("settle.")
      && ts.isObjectLiteralExpression(n.initializer)) {
    const o = {};
    for (const p of n.initializer.properties) {
      if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) o[p.name.getText(sf)] = p.initializer.text;
    }
    entries.push([n.name.text, o, sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1]);
  }
  ts.forEachChild(n,(c)=>{visit(c);});
}
visit(sf);
const MY = /[က-႟ꩠ-ꩿꧠ-꧿]/;
const LATIN_DIGIT = /[0-9]/, MY_DIGIT = /[၀-၉]/;
const slots = s => [...s.matchAll(/\{([a-z]+)\}/g)].map(m=>m[1]).sort();
let bad = 0;
console.log("settle.* keys:", entries.length);
for (const [k,v,line] of entries) {
  const problems = [];
  if (!v.en || !v.my) problems.push("missing half");
  if (v.my === v.en) problems.push("my === en");
  if (!MY.test(v.my)) problems.push("no Myanmar script in my");
  if (LATIN_DIGIT.test(v.my) || MY_DIGIT.test(v.my)) problems.push("digit in my value");
  if (LATIN_DIGIT.test(v.en)) problems.push("digit in en value");
  if (/မှာယူမှု/.test(v.my)) problems.push("uses မှာယူမှု");
  const se = JSON.stringify([...new Set(slots(v.en))]), sm = JSON.stringify([...new Set(slots(v.my))]);
  if (se !== sm) problems.push(`slot mismatch en=${se} my=${sm}`);
  if (problems.length) { bad++; console.log(`  ✗ ${f}:${line} ${k} — ${problems.join("; ")}`); }
}
console.log(bad === 0 ? "ALL CLEAN" : `${bad} problems`);
// order-glossary check
const usesOrderWord = entries.filter(([k,v])=>/အော်ဒါ/.test(v.my)).map(([k])=>k);
console.log("keys using အော်ဒါ:", usesOrderWord.join(", "));
