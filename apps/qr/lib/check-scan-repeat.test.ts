import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * `check:scan-repeat` aimed at its own matcher, in CI (blind pass 2 on #329: "the red-first claims
 * for propositions 4 and 5 are prose only"). The gate PARSES the grocery page and the sheets it
 * renders; each row below is a COMMITTED mutation of that real source — an evasion that ships the
 * wrong behaviour under text a scanning guard would accept — and the gate must refuse it, naming
 * the proposition. The baseline row proves the copy itself is clean, so a red row is the mutation's.
 *
 * Each row copies the tree the gate reads into a temp root, applies its exact find → replace edits in
 * order (each find must match exactly once, or the row fails as stale — a fixture that no longer
 * applies proves nothing), and runs `scripts/check-scan-repeat.mjs` there through `SCAN_REPEAT_ROOT`.
 * A row is ONE edit, or — when the evasion MOVES code — the `edits` that move it.
 */

const execFileP = promisify(execFile);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GATE = path.join(REPO, "scripts", "check-scan-repeat.mjs");
const PAGE = "apps/qr/app/grocery/page.tsx";
/** What the gate reads: the page, and the sheet components it imports from `@/components/grocery`
 *  (proposition 5 reads each page-owned sheet's own file). A sheet imported from anywhere else makes
 *  the BASELINE row fail on a missing file — widen this list then, never silently. */
const TREE = ["apps/qr/app/grocery", "apps/qr/components/grocery"];

type Edit = { find: string; replace: string };
type Fixture = {
  name: string;
  file?: string;
  /** The proposition the gate must name. */
  expect: RegExp;
} & (Edit | { edits: Edit[] });

async function runGate(mutate?: { file: string; edits: Edit[] }) {
  const root = mkdtempSync(path.join(os.tmpdir(), "scan-repeat-"));
  try {
    return await gateIn(root, mutate);
  } finally {
    // Each row removes its own copy: one teardown of every copy at once outran a hook's timeout
    // on a loaded machine.
    rmSync(root, { recursive: true, force: true });
  }
}

async function gateIn(root: string, mutate?: { file: string; edits: Edit[] }) {
  for (const rel of TREE)
    cpSync(path.join(REPO, rel), path.join(root, rel), {
      recursive: true,
      filter: (src) => !src.includes(`${path.sep}node_modules`),
    });
  if (mutate) {
    const target = path.join(root, mutate.file);
    let text = readFileSync(target, "utf8");
    for (const edit of mutate.edits) {
      const hits = text.split(edit.find).length - 1;
      if (hits !== 1)
        throw new Error(`stale fixture: the find matches ${hits} times in ${mutate.file}`);
      text = text.replace(edit.find, () => edit.replace);
    }
    writeFileSync(target, text);
  }
  try {
    const { stdout } = await execFileP(process.execPath, [GATE], {
      cwd: REPO,
      env: { ...process.env, SCAN_REPEAT_ROOT: root },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

// ── (6) the add-Undo writes from the add's own confirmed qty and speaks from its follow-up read ──
const UNDO: Fixture[] = [
  {
    name: "the Undo's target from the client view (`linesRef`)",
    find: "    const target = undoTargetQty(u);",
    replace:
      "    const target = Math.max(0, (linesRef.current.find((l) => l.lineId === u.lineId)?.qty ?? 1) - 1);",
    expect: /proposition 6: `undoAdd` reads the client view \(`linesRef`\)/,
  },
  {
    name: "the record rebuilt around the client view's qty",
    find: "    const target = undoTargetQty(u);",
    replace:
      "    const target = undoTargetQty({ ...u, confirmedQty: lines.find((l) => l.lineId === u.lineId)?.qty ?? 1 });",
    expect: /proposition 6: `undoAdd` must make exactly ONE live `setQty/,
  },
  {
    name: "a fixed qty written alongside a parked rule-following write",
    find: "      await ledger.track(setQty(u.lineId, target));",
    replace:
      "      if (false) await ledger.track(setQty(u.lineId, target));\n      await ledger.track(setQty(u.lineId, 0));",
    expect: /proposition 6: `undoAdd` must make exactly ONE live `setQty/,
  },
  {
    name: 'a hand-written "Removed" over the read',
    find: "flash(undoSentence(undoOutcome(u, read), u.name));",
    replace: "flash(read ? `Removed ${u.name}` : undoSentence(undoOutcome(u, read), u.name));",
    expect: /proposition 6: `undoAdd` hand-writes a "Removed/,
  },
  {
    name: "the words from the intended target, not the read (`undoOutcome` dropped)",
    find: "flash(undoSentence(undoOutcome(u, read), u.name));",
    replace:
      'flash(undoSentence(target === 0 ? { kind: "removed" } : { kind: "stepped", qty: target }, u.name));',
    expect: /proposition 6: `undoAdd` never calls `undoOutcome/,
  },
  {
    name: "a hand-built Undo record",
    find: "          setUndo(u);",
    replace: "          setUndo(u && { ...u, confirmedQty: 1 });",
    expect: /proposition 6: `setUndo\(u && \{/,
  },
  {
    name: "the record built by `undoFromAdd` over the client view",
    find: "            ? undoFromAdd({ barcode, lines: r.lines, openedAt: now, miss: sheet.miss })",
    replace:
      "            ? undoFromAdd({ barcode, lines: linesRef.current, openedAt: now, miss: sheet.miss })",
    expect: /proposition 6: .*undoFromAdd must take the add's OWN response/,
  },
  {
    name: "a write of the item that does not retire its Undo (a Browse add inside the window)",
    find: "      setUndo((prev) => undoAfterWrite(prev, barcode));\n",
    replace: "",
    expect:
      /proposition 6: `scanAdd\(cartId, barcode, scanId\)` writes barcode without first retiring/,
  },
  {
    name: "the retirement parked under a condition",
    find: "      setUndo((prev) => undoAfterWrite(prev, barcode));\n",
    replace: '      if (via === "search") setUndo((prev) => undoAfterWrite(prev, barcode));\n',
    expect:
      /proposition 6: `scanAdd\(cartId, barcode, scanId\)` writes barcode without first retiring/,
  },
  {
    name: "a replay that does not retire the Undo",
    find: "        setUndo((prev) => undoAfterWrite(prev, entry.barcode)); // a replay writes this item too\n",
    replace: "",
    expect:
      /proposition 6: `scanAdd\(entry.cartId, entry.barcode, entry.scanId\)` writes entry.barcode/,
  },
  {
    name: "the stepper retiring ANOTHER item's Undo",
    find: "      setUndo((prev) => undoAfterWrite(prev, line.barcode));",
    replace: '      setUndo((prev) => undoAfterWrite(prev, lastScanned?.code ?? ""));',
    expect:
      /proposition 6: `setQty\(line.lineId, nextQty\)` writes line.barcode without first retiring/,
  },
  // f. the write ledger (Codex on #329's head ff29547): the mint is gated, every write tallied
  {
    name: "the Undo minted UNGATED — a replay that crossed the add goes unseen",
    find: "          const u = undoMayMint(writesRef.current, barcode, mark)\n            ? undoFromAdd({ barcode, lines: r.lines, openedAt: now, miss: sheet.miss })\n            : null;",
    replace:
      "          const u = undoFromAdd({ barcode, lines: r.lines, openedAt: now, miss: sheet.miss });",
    expect:
      /proposition 6: `undoFromAdd\(\{ barcode, lines: r\.lines, openedAt: now, miss: [^`]*` mints an Undo UNGATED/,
  },
  {
    name: "the mint's mark taken BEFORE its own start (it would count itself as another writer)",
    find: "      writesRef.current = writeStarted(writesRef.current, barcode);\n      const mark = writeMark(writesRef.current, barcode);",
    replace:
      "      const mark = writeMark(writesRef.current, barcode);\n      writesRef.current = writeStarted(writesRef.current, barcode);",
    expect: /the mint's `writeMark` must be taken AFTER this add's own `writeStarted`/,
  },
  {
    name: "a replay that never joins the ledger",
    find: "        writesRef.current = writeStarted(writesRef.current, entry.barcode);\n",
    replace: "",
    expect:
      /proposition 6: `scanAdd\(entry\.cartId, entry\.barcode, entry\.scanId\)` is not on the write ledger/,
  },
  {
    name: "a stepper whose landing is not in a finally (a throw would leave it in flight)",
    find: "      } finally {\n        writesRef.current = writeLanded(writesRef.current, line.barcode);\n      }",
    replace: "      }\n      writesRef.current = writeLanded(writesRef.current, line.barcode);",
    expect: /proposition 6: `setQty\(line\.lineId, nextQty\)` is not on the write ledger/,
  },
  {
    name: "the add's start HOISTED above its early returns — it never lands (the blind pass on f0d013f)",
    find: "      if (!cartId) {",
    replace:
      "      writesRef.current = writeStarted(writesRef.current, barcode);\n      if (!cartId) {",
    // The original start stays below, so this is the hoisted one's shape: the guard must look at
    // the start it binds — the FIRST, above the `return`s.
    expect: /`writeStarted` is not RIGHT ABOVE the try that\n {2}lands it/,
  },
  {
    name: "an await between the stepper's start and its try (a rejection leaves it in flight)",
    find: "      writesRef.current = writeStarted(writesRef.current, line.barcode);\n      try {",
    replace:
      "      writesRef.current = writeStarted(writesRef.current, line.barcode);\n      await Promise.resolve();\n      try {",
    expect: /`writeStarted` is not RIGHT ABOVE the try that\n {2}lands it/,
  },
  {
    name: "the add's landing tallied under ANOTHER item",
    find: "      } finally {\n        writesRef.current = writeLanded(writesRef.current, barcode);\n      }",
    replace:
      "      } finally {\n        writesRef.current = writeLanded(writesRef.current, scanId);\n      }",
    expect: /proposition 6: `scanAdd\(cartId, barcode, scanId\)` is not on the write ledger/,
  },
];

// ── (4) the charge takes the sighted code; "Add another" only behind the chip's own predicate ──
const SIGHTED: Fixture[] = [
  {
    name: "the camera charges the JUDGED code",
    find: "        r = await ledger.track(scanAdd(cartId, barcode, scanId));",
    replace:
      "        r = await ledger.track(scanAdd(cartId, judgedBarcode(pairingRef.current, barcode), scanId));",
    expect: /barcode argument must be the enclosing function's own parameter/,
  },
  {
    name: "the sighted code reassigned through a `for … of` head",
    find: "      const scanId = crypto.randomUUID();",
    replace:
      "      for (barcode of [judgedBarcode(pairingRef.current, barcode)]) break;\n      const scanId = crypto.randomUUID();",
    expect: /HEAD of a `for \(… of\/in …\)`/,
  },
  {
    name: "the sighted code reassigned by destructuring",
    find: "      const scanId = crypto.randomUUID();",
    replace:
      "      [barcode] = [judgedBarcode(pairingRef.current, barcode)];\n      const scanId = crypto.randomUUID();",
    expect: /`barcode` is ASSIGNED inside the charging function/,
  },
  {
    name: "onScan hands add() a judged code",
    find: 'const onScan = useCallback((code: string) => void add(code, "scan"), [add]);',
    replace:
      'const onScan = useCallback(\n    (code: string) => void add(judgedBarcode(pairingRef.current, code), "scan"),\n    [add],\n  );',
    expect: /proposition 4: .* must pass its own function's parameter/,
  },
  {
    name: "the stage handed a function other than the decoded-code door",
    find: "              onScan={onScan}",
    replace: '              onScan={(code) => void add(code, "browse")}',
    expect: /<ScanStage> must take `onScan=\{onScan\}`/,
  },
  {
    name: 'a second camera door (Add another relabelled "scan")',
    find: '      await add(code, "rescan");',
    replace: '      await add(code, "scan");',
    expect: /expected exactly ONE live `add\(…, "scan"\)`/,
  },
  {
    name: "`add` aliased and called where the guard cannot see the code",
    find: 'const onScan = useCallback((code: string) => void add(code, "scan"), [add]);',
    replace:
      'const onScan = useCallback((code: string) => void add(code, "scan"), [add]);\n  const charge = add;',
    expect: /`add` escapes as a value/,
  },
  {
    name: "Add another without the chip's predicate",
    find: '    if (!lastScanned || chipNow !== "add-another" || addingBarcode || busyLine) return;',
    replace: "    if (!lastScanned || addingBarcode || busyLine) return;",
    expect: /`addAnother` charges without a TOP-LEVEL early return/,
  },
  {
    name: "Add another's predicate parked behind `false &&`",
    find: '    if (!lastScanned || chipNow !== "add-another" || addingBarcode || busyLine) return;',
    replace:
      '    if (false && chipNow !== "add-another") return;\n    if (!lastScanned || addingBarcode || busyLine) return;',
    expect: /`addAnother` charges without a TOP-LEVEL early return/,
  },
  {
    name: "Add another's predicate nested where it may never run",
    find: '    if (!lastScanned || chipNow !== "add-another" || addingBarcode || busyLine) return;',
    replace:
      '    if (!lastScanned || addingBarcode || busyLine) return;\n    if (busyLine) {\n      if (chipNow !== "add-another") return;\n    }',
    expect: /`addAnother` charges without a TOP-LEVEL early return/,
  },
  {
    name: "Add another charges the judged code",
    find: "    const code = lastScanned.code;",
    replace: "    const code = judgedBarcode(pairingRef.current, lastScanned.code);",
    expect: /the "rescan" door must be `addAnother` charging `lastScanned.code`/,
  },
  {
    name: "the chip's predicate blind to the pairing",
    find: "    ? chipFactsFor(lastScanned.code, lastScanned.viaPairing, {",
    replace: "    ? chipFactsFor(lastScanned.code, false, {",
    expect: /`addAnother` charges without a TOP-LEVEL early return/,
  },
  {
    name: "the chip told a different action than the one Add another is gated on",
    find: "                      action: chipNow,",
    replace: '                      action: chipFacts ? "add-another" : "none",',
    expect: /the chip's `action` must be `chipNow`/,
  },
  {
    name: "the toast hand-writes the Add another clause",
    find: "          flash(repeatSentence(verdict, action, viaPairing));",
    replace:
      "          flash(`${repeatSentence(verdict, action, viaPairing)} Tap “Add another” for a second.`);",
    expect: /the page hand-writes the “Add another” clause/,
  },
];

// ── (5) every sheet's cover outlasts its exit: lifted only by its exit end, or the fail-safe ──
const COVERED: Fixture[] = [
  {
    name: "the DoorSheet's cover dropped (the exemption the blind pass refused)",
    find: "  const { covering: doorCovering } = useStageCover(doorSheetOpen);",
    replace: "",
    expect:
      /<DoorSheet> \(open: doorSheetOpen\) needs exactly ONE `useStageCover\(doorSheetOpen\)`/,
  },
  {
    name: "a cover the stage is never told",
    find: "                nameCovering ||\n",
    replace: "",
    expect: /the stage is not told <GroceryNameSheet>'s cover/,
  },
  {
    name: "the DoorSheet's cover given an exit end it has no way to receive",
    find: "  const { covering: doorCovering } = useStageCover(doorSheetOpen);",
    replace:
      "  const { covering: doorCovering, exitEnd: doorExitEnd } = useStageCover(doorSheetOpen);",
    expect: /<DoorSheet> reports only its open state and exposes no exit end/,
  },
  {
    name: "a cover read off the hook without the destructuring",
    find: "  const { covering: doorCovering } = useStageCover(doorSheetOpen);",
    replace: "  const doorCovering = useStageCover(doorSheetOpen).covering;",
    expect:
      /proposition 5: `useStageCover\(doorSheetOpen\)` — a useStageCover\(\) result must be ONE/,
  },
  {
    name: "the exit end called at the close's START",
    find: "  const closeNameSheet = useCallback(() => {",
    replace: "  const closeNameSheet = useCallback(() => {\n    nameExitEnd();",
    expect: /`nameExitEnd` is referenced OUTSIDE <GroceryNameSheet>'s exit end/,
  },
  {
    name: "the exit end aliased and called early",
    find: "  const closeNameSheet = useCallback(() => {",
    replace:
      "  const lift = nameExitEnd;\n  const closeNameSheet = useCallback(() => {\n    lift();",
    expect: /`nameExitEnd` is referenced OUTSIDE <GroceryNameSheet>'s exit end/,
  },
  {
    name: "the exit end inside a callback that never runs",
    find: "      nameExitEnd();",
    replace: "      const later = () => nameExitEnd();",
    expect: /`nameExitEnd\(\)` is not ONE reachable top-level statement/,
  },
  {
    name: "the exit end after an early return",
    find: "      nameExitEnd();",
    replace: "      if (!closedByAddRef.current) return;\n      nameExitEnd();",
    expect: /`nameExitEnd\(\)` is not ONE reachable top-level statement/,
  },
  {
    name: "the exit end parked under `if (false)`",
    find: "      nameExitEnd();",
    replace: "      if (false) nameExitEnd();",
    expect: /`nameExitEnd\(\)` is not ONE reachable top-level statement/,
  },
  {
    name: "the handler's name declared twice (picked by position before)",
    find: "  const closeNameSheet = useCallback(() => {",
    replace:
      "  const closeNameSheet = useCallback(() => {\n    const nameSheetCloseFocus = () => {};\n    void nameSheetCloseFocus;",
    expect: /onCloseAutoFocus names `nameSheetCloseFocus`, declared 2 times/,
  },
  {
    name: "the Name sheet no longer forwards its exit end to the Sheet",
    file: "apps/qr/components/grocery/GroceryNameSheet.tsx",
    find: "      onCloseAutoFocus={onCloseAutoFocus}\n",
    replace: "",
    expect: /GroceryNameSheet.tsx's <Sheet> does not take `onCloseAutoFocus=\{onCloseAutoFocus\}`/,
  },
];

// ── (7) a queued sheet tap writes nothing, whatever the radio; a replayed sheet add closes its sheet ──
/** `add`'s queued-sheet-tap refusal, verbatim — the rows below move or bend it. */
const REFUSAL =
  '      if (sheet && sheetTapWaits(pendingRef.current, barcode)) {\n        say("Already saved — we’ll check it when you’re back online.");\n        return;\n      }\n';
const WAITS: Fixture[] = [
  {
    name: "CODEX R4 — the refusal back inside the offline branch (a tap after reconnect charges live)",
    edits: [
      { find: REFUSAL, replace: "" },
      {
        find: "        queueOffline(barcode, scanId, via, say, sheet);\n        return;",
        replace: `  ${REFUSAL.replace(/\n(?=.)/g, "\n  ")}        queueOffline(barcode, scanId, via, say, sheet);\n        return;`,
      },
    ],
    expect: /proposition 7: `add`'s queued-sheet-tap refusal must be a TOP-LEVEL/,
  },
  {
    name: "the refusal made the radio's again by a conjunct",
    find: "      if (sheet && sheetTapWaits(pendingRef.current, barcode)) {",
    replace:
      "      if (sheet && !navigator.onLine && sheetTapWaits(pendingRef.current, barcode)) {",
    expect: /proposition 7: `add`'s queued-sheet-tap refusal must be a TOP-LEVEL/,
  },
  {
    name: "the refusal parked behind `false &&`",
    find: "      if (sheet && sheetTapWaits(pendingRef.current, barcode)) {",
    replace: "      if (false && sheet && sheetTapWaits(pendingRef.current, barcode)) {",
    expect: /proposition 7: `add`'s queued-sheet-tap refusal must be a TOP-LEVEL/,
  },
  {
    name: "the refusal announces and falls through to the write",
    find: '        say("Already saved — we’ll check it when you’re back online.");\n        return;\n',
    replace: '        say("Already saved — we’ll check it when you’re back online.");\n',
    expect: /proposition 7: `add`'s queued-sheet-tap refusal must be a TOP-LEVEL/,
  },
  {
    name: "the refusal moved below the queue and the charge",
    edits: [
      { find: REFUSAL, replace: "" },
      {
        find: "      if (cartIdRef.current !== cartId) return;\n",
        replace: `      if (cartIdRef.current !== cartId) return;\n${REFUSAL}`,
      },
    ],
    expect: /proposition 7: `add`'s queued-sheet-tap refusal must be a TOP-LEVEL/,
  },
  {
    name: "the refusal asks about a code other than the one written",
    find: "sheetTapWaits(pendingRef.current, barcode)",
    replace: 'sheetTapWaits(pendingRef.current, lastScanned?.code ?? "")',
    expect: /proposition 7: `add`'s queued-sheet-tap refusal must be a TOP-LEVEL/,
  },
  {
    name: "CODEX R4 — a delivered replay that never closes its sheet (the row re-arms)",
    find: "          if (answer.close) {\n            closeSheetOnOk(performance.now());\n            closed.add(ask);\n          }\n",
    replace: "          if (answer.close) closed.add(ask);\n",
    expect: /proposition 7: a delivered replay never closes its sheet/,
  },
  {
    name: "the close gated on something other than the replay's answer to close",
    find: "          if (answer.close) {",
    replace: "          if (answer.speak) {",
    expect: /proposition 7: a delivered replay never closes its sheet/,
  },
  {
    name: "the replay's verdict hard-coded instead of read off its result",
    find: "            classifyReplay(r),",
    replace: "            classifyReplay({ ok: true }),",
    expect: /proposition 7: `drainNow` must answer a queued sheet add/,
  },
];

const FIXTURES: Fixture[] = [...SIGHTED, ...COVERED, ...UNDO, ...WAITS];

// Each row spawns node, which loads TypeScript and parses the page: measured 1.5–5 s per row at load
// ~9 and up to 25 s at load 35 on the shared agent machine (2026-10-09). The rows run concurrently and
// carry a spawn-sized timeout.
const SPAWN_MS = 60_000;

describe("check:scan-repeat — the copy of the real tree is clean (the baseline every row is red against)", () => {
  it(
    "passes unmutated",
    async () => {
      const r = await runGate();
      expect(r.out).toMatch(/scan repeat gate … \S*clean/);
      expect(r.code).toBe(0);
    },
    SPAWN_MS,
  );
});

describe.concurrent("check:scan-repeat refuses each committed evasion", () => {
  for (const f of FIXTURES)
    it(
      f.name,
      async () => {
        const edits = "edits" in f ? f.edits : [{ find: f.find, replace: f.replace }];
        const r = await runGate({ file: f.file ?? PAGE, edits });
        expect(r.code).toBe(1);
        expect(r.out).toMatch(f.expect);
      },
      SPAWN_MS,
    );
});
