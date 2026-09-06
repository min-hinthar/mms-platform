import { Fragment } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { readStaffLang } from "@/lib/staff-lang-server";
import { buildGlossary, scriptRuns, type GlossaryRow } from "@/lib/glossary";
import { Chrome } from "@/components/staff/Chrome";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { PrintSheetButton } from "@/components/staff/PrintSheetButton";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import type { StaffLang } from "@/lib/staff-lang";

// `noindex` follows the durable receipt's precedent (`app/track/page.tsx`): a printable document
// carrying the console's whole vocabulary should never become a search destination, even though
// `requireStaffPage` already gates it.
export const metadata = {
  title: "Word check — Mandalay Morning Star",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * P5 — the printed word-check sheet (`docs/PILOT_PLAN.md` §3 P5, §5 step 5).
 *
 * This is the instrument that turns K15 from a blocker into pilot OUTPUT. Every Burmese string in
 * the staff console is a Claude-authored working draft; nobody in the loop can review them, and the
 * two people who can are going to be standing in their own restaurant for two weeks with the console
 * in front of them. So the sheet goes to THEM, on paper, over dessert — and each correction that
 * comes back is one K15 line closed.
 *
 * IT IS A PAGE AND NOT A GENERATED FILE, and that is the stronger reading of the brief's own
 * requirement ("generated from `lib/i18n/staff.ts` so it can never drift from the shipped strings").
 * A committed artifact drifts and is kept honest by a freshness check somebody has to run; a page
 * that imports the dictionary cannot drift at all, and what prints tonight is what deployed tonight.
 *
 * IT IS NOT LITERALLY ONE PAGE OF PAPER, and pretending otherwise would be the wrong trade. Every
 * string in the dictionary needs a hand-writable box beside it, and at one physical page they would
 * be unreadable and unwritable. So the FIRST band — the lines a wrong word takes service down over —
 * gets page one to itself (`break-after: page`), and the rest follows. If the family has ten
 * minutes, page one is the ten minutes that matter. The sheet PRINTS its own counts (measured from
 * the dictionary at render), so no number about its size is written down anywhere to rot.
 *
 * ⚠️ WHAT IS ABSENT IS SAID ON THE PAPER — all of it. Three things are not on this sheet and each
 * has a printed reason: the DISH AND OPTION names (they come from `menu_items` / the modifier
 * catalog, not from this dictionary, and no derivation of `STAFF` can reach them — they are checked
 * where they are read, on the kitchen ticket, with the English beneath); the BRACED SLOTS, which are
 * machine placeholders a corrector must keep; and the two language-button autonyms below. The first
 * of those was missing from the first draft while the lede claimed "every Burmese word this console
 * shows" — a sheet that teaches its reader that absences are explained makes an unexplained one read
 * as "there is nothing else".
 *
 * ⚠️ THE TWO LANGUAGE-BUTTON AUTONYMS ARE DELIBERATELY ABSENT, and the sheet SAYS SO. They are
 * component constants in `StaffLangSwitch` precisely so a native-check pass cannot correct one into
 * the other language — the single edit that would leave whoever cannot read the other label with no
 * way back. An unexplained absence would read as an oversight and get written into the margin, so
 * the omission is stated on the paper where the corrector will meet it.
 */
export default async function GlossaryPage() {
  const caller = await requireStaffPage();
  // W10b — an unknowable auth answer keeps the URL and renders the outage shell, never a login
  // redirect that costs the person their place.
  if (!caller) return <StaffOutageShell what="what.glossary" />;

  const lang = await readStaffLang();
  const glossary = buildGlossary();
  const high = glossary.bands.find((b) => b.id === "high");
  const rest = glossary.bands.find((b) => b.id === "rest");

  return (
    <main className="pgl">
      <div className="pgl-bar print-hide">
        <Link href="/staff" className="pgl-back">
          <Chrome lang={lang} k="kds.back" echo="inline" />
        </Link>
        <div className="pgl-bar-right">
          <PrintSheetButton lang={lang} />
          <StaffLangSwitch lang={lang} />
        </div>
      </div>

      <header className="pgl-head">
        <h1 className="pgl-title">
          <Chrome lang={lang} k="pilot.gloss.title" echo="stack" />
        </h1>
        <p className="pgl-lede">
          <Chrome lang={lang} k="pilot.gloss.lede" echo="stack" />
        </p>
        <p className="pgl-count">
          <Chrome
            lang={lang}
            k="pilot.gloss.count"
            vars={{ n: glossary.openForCorrection, total: glossary.total }}
            echo="inline"
          />
        </p>
        {/* Three notes, and each explains an ABSENCE or a rule the paper cannot enforce. They are
            boxed rather than footnoted because an unexplained gap gets written into the margin, and
            a margin note against a decision already made is worse than no sheet. */}
        <p className="pgl-note">
          <Chrome lang={lang} k="pilot.gloss.scope" echo="stack" />
        </p>
        <p className="pgl-note">
          <Chrome lang={lang} k="pilot.gloss.slots" echo="stack" />
        </p>
        <p className="pgl-note">
          <Chrome lang={lang} k="pilot.gloss.autonyms" echo="stack" />
        </p>
      </header>

      {high && high.rows.length > 0 && (
        <section className="pgl-band pgl-band-high" aria-labelledby="pgl-band-high">
          <h2 className="pgl-band-title" id="pgl-band-high">
            <Chrome lang={lang} k="pilot.gloss.band.high" echo="stack" />
          </h2>
          <p className="pgl-band-why">
            <Chrome lang={lang} k="pilot.gloss.band.high.why" echo="stack" />
          </p>
          <SheetTable lang={lang} rows={high.rows} labelledBy="pgl-band-high" />
          <SignOff lang={lang} />
        </section>
      )}

      {rest && rest.rows.length > 0 && (
        <section className="pgl-band" aria-labelledby="pgl-band-rest">
          <h2 className="pgl-band-title" id="pgl-band-rest">
            <Chrome lang={lang} k="pilot.gloss.band.rest" echo="stack" />
          </h2>
          <SheetTable lang={lang} rows={rest.rows} labelledBy="pgl-band-rest" />
          <SignOff lang={lang} />
        </section>
      )}
    </main>
  );
}

function SheetTable({
  lang,
  rows,
  labelledBy,
}: {
  lang: StaffLang;
  rows: readonly GlossaryRow[];
  labelledBy: string;
}) {
  return (
    // Named by its band heading — a table with column headers but no accessible name announces as
    // a bare "table", and this page has two of them with identical columns.
    <table className="pgl-table" aria-labelledby={labelledBy}>
      <thead>
        <tr>
          <th scope="col" className="pgl-col-my">
            <Chrome lang={lang} k="pilot.gloss.col.my" echo={false} />
          </th>
          <th scope="col">
            <Chrome lang={lang} k="pilot.gloss.col.en" echo={false} />
          </th>
          <th scope="col">
            <Chrome lang={lang} k="pilot.gloss.col.fix" echo={false} />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={row.locked ? "pgl-row pgl-row-locked" : "pgl-row"}>
            <td>
              {/* The mark is DERIVED in `lib/glossary.ts`, where a value can falsify it — see
                  `GlossaryRow.myLang`. Four values here are Latin by design and must not be
                  announced as Burmese. */}
              <span className="pgl-my" lang={row.myLang}>
                {row.my}
              </span>
              {/* The key is what makes a correction traceable back to the string it belongs to — a
                  margin note reading "the bump one" is not a change anybody can safely apply. */}
              <code className="pgl-key">{row.key}</code>
            </td>
            <td className="pgl-en">{row.en}</td>
            <td>
              {row.locked ? (
                <span className="pgl-lock">
                  <Chrome
                    lang={lang}
                    k={
                      row.locked.kind === "settled"
                        ? "pilot.gloss.locked.settled"
                        : "pilot.gloss.locked.latin"
                    }
                    echo="stack"
                  />
                  <span className="pgl-lock-why">
                    {scriptRuns(row.locked.why).map((run, i) =>
                      run.my ? (
                        <span key={i} lang="my">
                          {run.text}
                        </span>
                      ) : (
                        <Fragment key={i}>{run.text}</Fragment>
                      ),
                    )}
                  </span>
                </span>
              ) : (
                // An empty ruled box. Deliberately NOT an <input>: this sheet is written on with a
                // pen, and a form field would promise a save path that K13 says does not exist for
                // this pilot. An honest blank box promises nothing.
                <span className="pgl-box" aria-hidden />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Repeated per band because each band is its own sheet of paper once this prints. */
function SignOff({ lang }: { lang: StaffLang }) {
  return (
    <p className="pgl-sign">
      <span>
        <Chrome lang={lang} k="pilot.gloss.sign" echo="inline" />
        <span className="pgl-rule" aria-hidden />
      </span>
      <span>
        <Chrome lang={lang} k="pilot.gloss.date" echo="inline" />
        <span className="pgl-rule" aria-hidden />
      </span>
    </p>
  );
}
