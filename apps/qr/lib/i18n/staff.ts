import type { Entry } from "./types";

/**
 * P2 — the STAFF CHROME dictionary.
 *
 * STANDALONE, not spread into `DICT`, and the reason is mechanical rather than stylistic:
 * `lib/i18n/index.ts` is imported by CLIENT diner code (`components/Checkout.tsx`,
 * `components/SendToKitchenButton.tsx` both open `"use client"`), and `DICT` is one object literal
 * indexed dynamically — so nothing tree-shakes and a spread would ship every staff Burmese string in
 * the diner bundle. `lib/kiosk/strings.ts` stands outside for the same reason. Coverage is paid for
 * rather than given up: `strings.test.ts` walks this module through `ALL_MODULES`, so every content
 * rule that guards the diner dictionary guards this one too.
 *
 * REGISTER: terse operational kitchen/counter Burmese — a cook at the pass with both hands full, not
 * a host at a table. No နော် softeners here (the kiosk keeps those; so does `/board`, which guests
 * read). Vocabulary follows the S14a glossary — အော်ဒါ, never မှာယူမှု — plus the owner-corrected
 * မီးဖိုချောင် for "kitchen" (W21).
 *
 * NUMERALS (owner, 2026-09-05): Burmese numerals in PROSE counts — "အော်ဒါ ၃ ခု" — and Latin
 * everywhere a number is an identifier or an amount: money, clock times, table numbers, pickup
 * codes, and the KDS stat row (its column is `tabular-nums` and Padauk ships no tabular Myanmar
 * figures, so Burmese digits there would make the row ragged). No dictionary VALUE carries a MYANMAR
 * digit — counts arrive through the `{n}` / `{total}` slots and `tf()` converts them at render, so
 * the rule lives in one function with one guard (`strings.test.ts`, "NO dictionary value anywhere
 * carries a Myanmar digit") rather than in a hundred strings. Latin digits are a different matter and
 * one value has one: `kds.86`'s "86 this dish", where 86 is the kitchen VERB, not a number.
 *
 * ⚠️ Every MY value is a Claude-authored working draft pending Min's native check (K15), EXCEPT
 * where a `grounded:` comment names its in-repo source. Two are already settled and must NOT be
 * re-asked: `kds.title` (မီးဖိုချောင်, owner-corrected in W21) and the two `board.col.*` headings,
 * which have been on the wall since W3e and enter here VERBATIM — this slice does not reword them.
 */
export const STAFF = {
  // ── the language control itself ────────────────────────────────────────────
  // The autonyms မြန်မာ / English are component constants, NOT keys: a native-check pass must never
  // be able to "correct" one into the other language, which is the single edit that would make the
  // control unusable for the person who cannot read the other label.
  "shell.lang.group": { en: "Console language", my: "စက်၏ ဘာသာစကား" },
  "shell.lang.failed": { en: "Couldn’t save that — tap again.", my: "မသိမ်းနိုင်ပါ — ထပ်နှိပ်ပါ။" },
  // P7 — the way back to the DOORS from any staff screen: the staff bar's leading circle (1b), its
  // sr-only name; and the doors' own title. A 44px control: no echo.
  "shell.screens": { en: "Screens", my: "စခရင်များ" },
  // P7·1b — the staff bar's icon circles are NAMED by sr-only dictionary text (the glyph is the
  // visible half; a circle with no name is a button nobody can find by voice). Rendered through
  // <Chrome> so the Burmese arrives marked — never an aria-label, which rule 3 rightly refuses on a
  // control that has children. The Screens circle reuses `shell.screens`.
  "shell.lock": { en: "Lock this tablet", my: "ဒီတက်ဘလက်ကို လော့ခ်ချ" },
  "shell.locking": { en: "Locking…", my: "လော့ခ်ချနေသည်…" },
  // signin-3 — the Lock circle's two refusals as KEYS (the action answers reason codes now, never a
  // sentence): the sign-in service unreachable, and the no-PIN arm only a hand-built POST can reach
  // (the circle mounts only when a PIN exists). Claude-authored drafts pending K15.
  "shell.lock.err.outage": {
    en: "We can’t reach the sign-in service — the tablet wasn’t locked. Try again in a moment.",
    my: "အကောင့်ဝင် စနစ်နဲ့ ဆက်သွယ်မရလို့ တက်ဘလက်ကို လော့ခ်မချရသေးပါ။ ခဏနေ ထပ်စမ်းပါ။",
  },
  "shell.lock.err.noPin": {
    en: "Set a PIN before locking.",
    my: "မလော့ခ်ချခင် ပင်နံပါတ် အရင် သတ်မှတ်ပါ။",
  },
  // manager-9 — the shared sheet's ✕ on every console sheet, spoken as sr-only DOM text through
  // <Chrome> (§17's circle idiom). The busy twin is what the ✕ says while an irreversible write is
  // in flight and every exit is refused (§16). Claude-authored drafts pending K15.
  "shell.close": { en: "Close", my: "ပိတ်" },
  "shell.closeBusy": {
    en: "Close — finishing, please wait",
    my: "ပိတ် — ပြီးအောင် လုပ်နေပါတယ်၊ ခဏစောင့်ပါ",
  },
  "shell.a11y.tools": { en: "Console tools", my: "စက် ကိရိယာများ" },
  // P7·1b — the KDS text-size SHEET (the three chips left the header for the bar's Aa circle).
  "kds.size.title": { en: "Text size", my: "စာလုံး အရွယ်အစား" },

  // ── outage nouns (the `what` slot of every frozen-board and shell sentence) ─
  "what.console": { en: "the console", my: "ဒီစက်" },
  "what.floor": { en: "the floor", my: "ခန်းမ" },
  "what.kitchen": { en: "the kitchen board", my: "မီးဖိုချောင် ဘုတ်" }, // glossary: မီးဖိုချောင်
  "what.menuPrices": { en: "menu prices", my: "မီနူး ဈေးနှုန်း" },
  "what.table": { en: "this table", my: "ဒီစားပွဲ" }, // glossary: စားပွဲ
  "what.tips": { en: "today’s tips", my: "ဒီနေ့ အပိုကြေး" },
  "what.lock": { en: "the lock screen", my: "သော့ခတ် စခရင်" },
  "what.queue": { en: "the queue", my: "အော်ဒါတန်း" },
  "what.bags": { en: "the bags", my: "ပါဆယ်ထုပ်များ" }, // grounded: kiosk `toGo` (ပါဆယ်)
  "what.room": { en: "the room", my: "ခန်းမ" },
  "what.order": { en: "this order", my: "ဒီအော်ဒါ" },
  "what.list": { en: "this list", my: "ဒီစာရင်း" },
  // P5 ∩ P2 — the glossary page needs its own `what`, because `StaffOutageShell` takes a
  // dictionary KEY (P2 PR B) and not a free English string. MY reuses `pilot.night.glossary`'s
  // noun so the sheet is called one thing on both screens; Claude-authored draft pending K15.
  "what.glossary": { en: "the word-check sheet", my: "စာလုံး စစ်ဆေးစာရွက်" },

  // ── the outage voice (class A — stacked pair; read when nothing else works) ─
  "out.head.cant": {
    en: "We can’t reach the ordering system",
    my: "အော်ဒါစနစ်နဲ့ ဆက်သွယ်လို့ မရပါ",
  },
  "out.head.still": {
    en: "Still can’t reach the ordering system",
    my: "အော်ဒါစနစ်နဲ့ အခုထိ ဆက်သွယ်လို့ မရသေးပါ",
  },
  "out.head.notUpdating": { en: "Not updating right now", my: "အခု အသစ်မတက်ပါ" },
  "out.head.stillNotUpdating": { en: "Still not updating", my: "အခုထိ အသစ်မတက်သေးပါ" },
  "out.tail.paper": {
    en: "Take new orders on paper; nothing here is lost.",
    my: "အော်ဒါအသစ်တွေကို စာရွက်နဲ့ ယူထားပါ။ ဒီမှာရှိတာ ဘာမှ မပျောက်ပါ။",
  }, // K15-HIGH — the instruction that keeps service running when the system is down
  "out.tail.reconnecting": { en: "Reconnecting…", my: "ပြန်ဆက်နေပါတယ်…" },
  "out.frozen": {
    en: "{head} — showing {what} as of {t}. {tail}",
    my: "{head} — {what} ကို {t} အချိန်အတိုင်း ပြနေပါတယ်။ {tail}",
  },
  "out.write.failed": {
    en: "We can’t reach the ordering system — that change wasn’t saved. Keep it on paper for now.",
    my: "အော်ဒါစနစ်နဲ့ ဆက်သွယ်လို့ မရပါ — အဲဒီပြင်ဆင်မှု မသိမ်းရသေးပါ။ ခဏ စာရွက်နဲ့ ဆက်သွားပါ။",
  }, // K15-HIGH — the one sentence every staff mutation shows during an outage
  // A7b/M209 — the refusal for "we could not CHECK your access", distinct from the outage sentence
  // above (which says a change was not saved and to fall back to paper — both wrong here: no change
  // was attempted, and paper is not the answer to a role edit). K15 — new Burmese, needs Min's read.
  "out.authority.unconfirmed": {
    en: "We couldn’t confirm your access just now — try again in a moment.",
    my: "သင့်ရဲ့ ခွင့်ပြုချက်ကို ခုလောလောဆယ် အတည်မပြုနိုင်သေးပါ — ခဏနေ ထပ်စမ်းကြည့်ပါ။",
  },
  "out.shell.title": {
    en: "We can’t reach the ordering system",
    my: "အော်ဒါစနစ်နဲ့ ဆက်သွယ်လို့ မရပါ",
  },
  "out.shell.body": {
    en: "Your sign-in is fine — the system is unreachable, so {what} can’t load right now. Take new orders on paper; everything already recorded is safe.",
    my: "ကိုယ့်အကောင့် ကောင်းနေပါတယ် — စနစ်နဲ့ မဆက်နိုင်လို့ {what} ကို အခု မဖွင့်နိုင်သေးပါ။ အော်ဒါအသစ်တွေကို စာရွက်နဲ့ ယူထားပါ။ မှတ်ထားပြီးသားတွေ အားလုံး လုံခြုံပါတယ်။",
  }, // K15-HIGH — prevents the worst misread of an outage screen: "I've been logged out"
  "out.shell.escalated": {
    en: "Still down — keep running on paper. Nothing recorded is lost; this screen comes back the moment the system does.",
    my: "အခုထိ မရသေးပါ — စာရွက်နဲ့ ဆက်သွားပါ။ မှတ်ထားပြီးသားတွေ မပျောက်ပါ။ စနစ်ပြန်ကောင်းတာနဲ့ ဒီစခရင် ပြန်တက်ပါမယ်။",
  },
  // The ONE action on that screen. It was `RetryButton`'s hardcoded English default until a blind
  // audit read the card top to bottom: a Burmese heading, a Burmese body, and a button saying "Try
  // again" — the tap that gets the shift back. `packages/ui` now takes both as ReactNodes so the
  // shell can pass <Chrome>.
  "out.shell.retry": { en: "Try again", my: "ထပ်စမ်းပါ" },
  // counter-9 — what a loading skeleton says (`app/staff/**/loading.tsx`): one sentence, the
  // `{what}` a dictionary value like the outage shell's, so the counter and the kitchen never fork
  // an English "Loading…" of their own.
  "shell.loading": { en: "Loading {what}…", my: "{what} ဖွင့်နေပါတယ်…" },
  "out.shell.retrying": { en: "Trying…", my: "စမ်းနေပါတယ်…" },

  // ── KDS: identity ──────────────────────────────────────────────────────────
  "kds.title": { en: "Kitchen", my: "မီးဖိုချောင်" }, // OWNER-VERIFIED (W21) — do not re-ask on K15
  "kds.back": { en: "← Floor", my: "← ခန်းမ" },

  // ── KDS: station filter — LATIN IN BOTH TONGUES (owner, 2026-09-05) ────────
  // These four are English kitchen jargon, not sentences, and a wrong Burmese word here HIDES
  // TICKETS. They stay Latin the way `Scan & Go` and the tip percentages do, and are listed in
  // strings.test.ts's LATIN_BY_DESIGN with this reason. Translating them later costs one commit.
  "kds.station.all": { en: "All", my: "All" },
  "kds.station.wok": { en: "Wok", my: "Wok" },
  "kds.station.cold": { en: "Cold", my: "Cold" },
  "kds.station.drinks": { en: "Drinks", my: "Drinks" },

  // ── KDS: channel — where the food GOES (class C, chip-sized) ───────────────
  "kds.channel.dinein": { en: "Dine-in", my: "ဆိုင်မှာ စား" }, // grounded: kiosk `dineIn`
  "kds.channel.pickup": { en: "Pickup", my: "လာယူ" },
  "kds.channel.togo": { en: "To-go", my: "ပါဆယ်" }, // grounded: kiosk `toGo`

  // ── KDS: the card ──────────────────────────────────────────────────────────
  // {id} is the table number from the physical tent — Latin in both tongues, always.
  "kds.table": { en: "Table {id}", my: "စားပွဲ {id}" }, // grounded: kiosk `tableNumber`
  "kds.held": { en: "Held · ", my: "ဆိုင်းထား · " }, // K15-HIGH — a held card read as live is food cooked an hour early
  "kds.slot": {
    en: "Pickup {t} — fires automatically",
    my: "{t} လာယူ — အလိုအလျောက် စချက်ပါမယ်",
  }, // K15-HIGH
  "kds.fire": { en: "Fire now", my: "အခု စချက်" }, // K15-HIGH — no undo, only a second ticket
  "kds.bump": { en: "BUMP", my: "ပြီးပြီ" }, // K15-HIGH — the tap made most; a 6s undo is the only way back
  // The bump's accessible-name tail. The visible label leads the name (2.5.3), and this says WHICH
  // ticket and how much it clears — the two facts a cook needs before a tap that clears the card.
  "kds.bump.what": { en: "{x}, all {n} items done", my: "{x} — ပစ္စည်း {n} ခုလုံး ပြီးပြီ" },
  "kds.line.start": { en: "Start", my: "စလုပ်" },
  "kds.line.done": { en: "Done", my: "ပြီး" },
  "kds.line.bagit": { en: "Bag it", my: "ထုပ်ရန်" },
  "kds.line.cooking": { en: "Cooking", my: "ချက်နေဆဲ" },
  "kds.86": { en: "86 this dish", my: "ဒီဟင်း ဖြုတ်" }, // K15-HIGH — a 6s undo in the bar, then /staff/menu
  "kds.86.done": { en: "Off the menu", my: "မီနူးက ဖြုတ်ထားပြီ" }, // K15-HIGH — a statement, not a button

  // ── KDS: the status line and stats ─────────────────────────────────────────
  // Stat LABELS are Burmese; their VALUES stay Latin (tabular-nums column).
  "kds.stat.open": { en: "Open", my: "ဖွင့်ထား" },
  "kds.stat.oldest": { en: "Oldest", my: "အကြာဆုံး" },
  "kds.stat.late": { en: "Late", my: "နောက်ကျ" }, // K15-HIGH — the one stat that demands action now
  "kds.stat.avg": { en: "Avg today", my: "ဒီနေ့ ပျမ်းမျှ" },
  "kds.allclear": { en: "All clear", my: "ရှင်းပြီ" },
  "kds.open.one": { en: "{n} open ticket", my: "ဖွင့်ထားတဲ့ အော်ဒါ {n} ခု" },
  "kds.open.many": { en: "{n} open tickets", my: "ဖွင့်ထားတဲ့ အော်ဒါ {n} ခု" },
  "kds.held.count": { en: " · {n} held", my: " · ဆိုင်းထား {n} ခု" },
  "kds.new": { en: "{n} new →", my: "အသစ် {n} →" },

  // ── KDS: the all-day rail ──────────────────────────────────────────────────
  "kds.allday.chip": { en: "All-day", my: "စုစုပေါင်း" },
  "kds.allday.title": { en: "All day", my: "စုစုပေါင်း" },
  "kds.allday.empty": { en: "Nothing live.", my: "ဘာမှ မရှိပါ။" },
  // A4·1 (K31) — the served rail: what went OUT today, read-only, beside the all-day counts.
  "kds.served.chip": { en: "Served", my: "ထုတ်ပြီး" },
  // A line that went out and was then written off (a cooked loss) stays on the rail, marked.
  "kds.served.voided": { en: "Voided after service", my: "ထုတ်ပြီးမှ ပယ်ဖျက်" },
  "kds.served.title": { en: "Served today", my: "ဒီနေ့ ထုတ်ပြီးသမျှ" },
  "kds.served.empty": { en: "Nothing served yet today.", my: "ဒီနေ့ ဘာမှ မထုတ်ရသေးပါ။" },
  // The rail's read failed (ADVISORY — the live board above is unaffected). Said rather than an
  // empty history: "nothing served" over a full day's service is the fabricated-diagnosis class.
  // The capped read came back full: say what is shown against the day's real count (the stat cell's
  // `served_count`, same midnight), never a "today" heading over a list missing the morning.
  "kds.served.more": {
    en: "Showing the last {n} of {total} served today.",
    my: "ဒီနေ့ ထုတ်ပြီး {total} ခုထဲက နောက်ဆုံး {n} ခုကို ပြထားသည်။",
  },
  // The capped read came back full but the stats rpc answered nothing, so the day's count is
  // UNKNOWN — said as such, never "of 0" (Codex round 1 on A4·1).
  "kds.served.moreUnknown": {
    en: "Showing the last {n} served today — the day’s total couldn’t be read.",
    my: "ဒီနေ့ ထုတ်ပြီး နောက်ဆုံး {n} ခုကို ပြထားသည် — တစ်နေ့တာ စုစုပေါင်းကို မဖတ်နိုင်ပါ။",
  },
  "kds.served.unreadable": {
    en: "Couldn’t read what went out. The board above is live.",
    my: "ထုတ်ပြီးသမျှကို မဖတ်နိုင်ပါ။ အပေါ်က ဘုတ်က ပုံမှန်ပါ။",
  },

  // ── KDS: empty and frozen states ───────────────────────────────────────────
  "kds.empty": { en: "Nothing on the line", my: "ချက်စရာ ဘာမှ မရှိပါ" },
  "kds.empty.degraded": {
    en: "Nothing on the line as of the last update",
    my: "နောက်ဆုံး အချက်အလက်အရ ချက်စရာ ဘာမှ မရှိပါ",
  },
  "kds.empty.hint": {
    en: "Tickets appear the moment an order is sent or paid — dine-in sends, pickup and to-go land at checkout, scheduled orders wait as held cards until their fire time.",
    my: "အော်ဒါ ပို့တာ ဒါမှမဟုတ် ငွေရှင်းတာနဲ့ ဒီမှာ ချက်ချင်း ပေါ်ပါတယ် — ဆိုင်မှာစားက ပို့တဲ့အခါ၊ လာယူနဲ့ ပါဆယ်က ငွေရှင်းတဲ့အခါ၊ ချိန်းထားတဲ့ အော်ဒါတွေက စချက်ချိန်ရောက်တဲ့အထိ ဆိုင်းထားကတ်အဖြစ် စောင့်နေပါမယ်။",
  },
  "kds.empty.outage": {
    en: "New tickets won’t land here until this board is updating again. Take orders on paper — nothing already sent is lost.",
    my: "ဒီဘုတ် ပြန်အလုပ်လုပ်တဲ့အထိ အော်ဒါအသစ် ဒီမှာ မပေါ်ပါ။ အော်ဒါတွေကို စာရွက်နဲ့ ယူထားပါ — ပို့ပြီးသားတွေ ဘာမှ မပျောက်ပါ။",
  }, // K15-HIGH

  // ── KDS: controls ──────────────────────────────────────────────────────────
  "kds.sound.enable": { en: "Enable sound", my: "အသံ ဖွင့်" },
  // kitchen-8 — this device WANTED sound (armed last shift) and a reload disarmed it: a warn chip,
  // not a ghost identical to the filter beside it. Any tap on the board re-arms it silently.
  "kds.sound.off": { en: "Sound off — tap to turn on", my: "အသံ ပိတ်နေ — ဖွင့်ရန် နှိပ်ပါ" },
  "kds.recall": { en: "Recall", my: "ပြန်ခေါ်" }, // K15-HIGH — the second way back (2-minute window)
  "kds.undo": { en: "Undo", my: "ပြန်ဖျက်" }, // K15-HIGH — the only way back inside 6 seconds
  "kds.undo.bumped": { en: "{x} bumped", my: "{x} ပြီးသွားပြီ" },
  "kds.undo.86": { en: "{x} off the menu", my: "{x} မီနူးက ဖြုတ်ပြီ" }, // K15-HIGH — the undo bar's copy after an 86
  "kds.page": { en: "Page {n} of {total}", my: "စာမျက်နှာ {n} / {total}" },
  "kds.more": { en: "+{n} more", my: "နောက်ထပ် {n}" },

  // ── KDS: the ticket's age, SPOKEN (class D — the visible `3:42` / `2h 44m` / `1d+` is a Latin
  //    clock figure and `aria-hidden`; these carry the sentence, with prose-count numerals) ──────
  "kds.age.mmss": { en: "{m} minutes {s} seconds elapsed", my: "{m} မိနစ် {s} စက္ကန့် ကြာပြီ" },
  "kds.age.hm": { en: "{h} hours {m} minutes elapsed", my: "{h} နာရီ {m} မိနစ် ကြာပြီ" },
  "kds.age.days": { en: "More than a day elapsed", my: "တစ်ရက်ကျော် ကြာပြီ" },

  // ── KDS: live-region announcements (class D — primary tongue only) ─────────
  "kds.live.bumped": {
    en: "{x} bumped — undo available.",
    my: "{x} ပြီးသွားပြီ — ပြန်ဖျက်လို့ ရသေးတယ်။",
  },
  "kds.live.restored": { en: "{x} restored to the board.", my: "{x} ဘုတ်ပေါ် ပြန်တင်ပြီးပြီ။" },
  "kds.live.86": {
    en: "{x} off the menu — undo available.",
    my: "{x} မီနူးက ဖြုတ်ပြီ — ပြန်ဖျက်လို့ ရသေးတယ်။",
  },
  "kds.live.86.undone": { en: "{x} back on the menu.", my: "{x} မီနူးပေါ် ပြန်တင်ပြီးပြီ။" },

  // ── KDS: failures (read at the moment the tablet is not working) ──────────
  "kds.err.bump": {
    en: "Couldn’t bump {x} — try again.",
    my: "{x} ကို မပြီးအောင် မလုပ်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "kds.err.fire": {
    en: "Couldn’t fire {x} — try again.",
    my: "{x} ကို မစချက်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "kds.err.recall": {
    en: "Couldn’t recall {x} — try again.",
    my: "{x} ကို ပြန်မခေါ်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "kds.err.86": {
    en: "Couldn’t take {x} off the menu — try again.",
    my: "{x} ကို မီနူးက မဖြုတ်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "kds.err.86.undo": {
    en: "Couldn’t put {x} back — use the Menu screen.",
    my: "{x} ကို ပြန်မတင်နိုင်ပါ — မီနူး စခရင်မှာ လုပ်ပါ။",
  },
  "kds.err.line": {
    en: "Couldn’t update {x} — try again.",
    my: "{x} ကို မပြင်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  // kitchen-3 — the server's refusals, keyed so the region can say them in the device language.
  "kds.err.stale": { en: "{x} was already updated.", my: "{x} ကို ပြောင်းပြီးသားပါ။" },
  "kds.err.recall.window": {
    en: "The recall window has passed for {x}.",
    my: "{x} အတွက် ပြန်ခေါ်နိုင်ချိန် ကုန်သွားပြီ။",
  },
  "kds.err.fire.live": {
    en: "{x} is already in the kitchen.",
    my: "{x} က မီးဖိုချောင်မှာ ရောက်နေပြီ။",
  },
  "kds.err.86.gone": { en: "{x} is no longer on the menu.", my: "{x} က မီနူးမှာ မရှိတော့ပါ။" },
  "kds.err.invalid": {
    en: "That request didn’t make sense — reload the board.",
    my: "တောင်းဆိုချက် မမှန်ပါ — ဘုတ်ကို ပြန်ဖွင့်ပါ။",
  },

  // ── KDS: accessible names with no visible text to pair with ───────────────
  // These sit on glyph-only or region elements (a slider, a ‹ › pager, a <ul>), where WCAG 2.5.3
  // has no visible label to contain. Every LABELLED control's name comes from `lib/staff-labels.ts`.
  "kds.a11y.stats": { en: "Service stats", my: "ဝန်ဆောင်မှု စာရင်း" },
  "kds.a11y.stationFilter": { en: "Station filter", my: "စတေရှင် စစ်ထုတ်" },
  "kds.a11y.tickets": { en: "Open kitchen tickets", my: "ဖွင့်ထားတဲ့ မီးဖိုချောင် အော်ဒါများ" },
  "kds.a11y.lines": { en: "Items for {x}", my: "{x} အတွက် ပစ္စည်းများ" }, // P2n — the ticket's line list
  "kds.a11y.allDay": { en: "All-day counts", my: "စုစုပေါင်း အရေအတွက်" },
  "kds.a11y.served": { en: "Served today", my: "ဒီနေ့ ထုတ်ပြီးသမျှ" },
  "kds.a11y.railView": { en: "Rail view", my: "ဘေးဘား အမြင်" },
  "kds.a11y.volume": { en: "Chime volume", my: "အသံ အတိုးအကျယ်" },
  // A4·5 — the wall's link is a circle in this bar, named by sr-only text like the counter's
  // approvals circle (the glyph is a TV). It was the doors' `floor.nav.board` tile from P7 to
  // A4·5, and reachable only by bookmark before that.
  "kds.nav.wall": { en: "TV board", my: "တီဗီ ဘုတ်" },
  "kds.a11y.pager": { en: "Ticket pages", my: "အော်ဒါ စာမျက်နှာများ" },
  "kds.a11y.prevPage": { en: "Previous page", my: "ရှေ့ စာမျက်နှာ" },
  "kds.a11y.nextPage": { en: "Next page", my: "နောက် စာမျက်နှာ" },
  "kds.a11y.recall": { en: "Recall a bumped ticket", my: "ပြီးသွားတဲ့ အော်ဒါ ပြန်ခေါ်" },
  // P7 — the TEXT SIZE dial (aria-only group name + three 44px chips, so no echo on the chips).
  // 30px was derived from the font files; the right size is Mom's eyes at the pass, picked once.
  "kds.a11y.size": { en: "Text size", my: "စာလုံး အရွယ်အစား" },
  "kds.size.s": { en: "Small", my: "သေး" },
  "kds.size.m": { en: "Medium", my: "အလယ်" },
  "kds.size.l": { en: "Large", my: "ကြီး" },

  // ── the floor: the console home and the live table board ──────────────────
  // `floor.back` carries the same two words as `kds.back`. They are separate keys because K15 is a
  // per-key native check: the kitchen's only exit and one link in a console header may want
  // different wording, and one key would force them to move together.
  "floor.back": { en: "← Floor", my: "← ခန်းမ" },
  "floor.hi": { en: "Hi, {x}", my: "မင်္ဂလာပါ {x}" },
  // A4·2 — the counter's one screen: the Start zone's visible heading (its region name is
  // `reg.a11y.start`, the same words), the channel chip on a counter order's card, and its status.
  "floor.zone.start": { en: "Start an order", my: "အော်ဒါ စဖွင့်" },
  "floor.counter.chip": { en: "Counter", my: "ကောင်တာ" },
  // {n} is a COUNT (Burmese numerals). EN singular/plural pair — ONE Burmese value.
  "floor.counter.count.one": { en: "{n} counter order", my: "ကောင်တာ အော်ဒါ {n} ခု" },
  "floor.counter.count.many": { en: "{n} counter orders", my: "ကောင်တာ အော်ဒါ {n} ခု" },
  "floor.rows.none": {
    en: "No tables or counter orders",
    my: "စားပွဲ ဒါမှမဟုတ် ကောင်တာ အော်ဒါ မရှိပါ",
  },
  // A segment of the count line ("40 counter orders · the newest are not listed"): a FULL read.
  "floor.counter.truncated": { en: "the newest are not listed", my: "အသစ်ဆုံးတွေ မပါပါ" },

  // ── the floor: the per-table STATUS chip ──────────────────────────────────
  // ⚠️ THE VISIBLE CHIP AND THE ACCESSIBLE NAME READ THESE SAME KEYS (`FLOOR_STATUS_KEY` in
  // lib/staff-labels.ts). OPEN-ITEMS P2g was the other arrangement: `TableCard` interpolated the RAW
  // status key into the name, so a splitting table announced "settling" while the chip read
  // "Splitting" — a WCAG 2.5.3 mismatch in ENGLISH, live today. One key per state is the fix.
  // `settling` is the DB value; "Splitting" is the word the room uses, and the word wins.
  "floor.status.seated": { en: "Seated", my: "ထိုင်ပြီ" },
  "floor.status.ordering": { en: "Ordering", my: "မှာနေဆဲ" },
  "floor.status.paying": { en: "Paying", my: "ငွေရှင်းနေဆဲ" },
  "floor.status.settling": { en: "Splitting", my: "ခွဲရှင်းနေဆဲ" },
  "floor.status.paid": { en: "Paid", my: "ငွေရှင်းပြီး" },
  // A1 — the table ASKED for the register. "Pay at counter" (not "Paying"): nobody is paying yet,
  // the table is waiting for a person, and the chip is the register's queue.
  "floor.status.counter": { en: "Pay at counter", my: "ကောင်တာမှာ ရှင်းမယ်" },

  // ── the floor: the table card ─────────────────────────────────────────────
  // {id} is the number on the physical tent card and {m} is preformatted money — both Latin in
  // both tongues (lib/i18n/fill.ts owns that rule); {n} is a prose count, so Burmese numerals.
  "floor.table": { en: "Table {id}", my: "စားပွဲ {id}" }, // grounded: kiosk `tableNumber`
  "floor.counter": { en: "Counter order", my: "ကောင်တာ အော်ဒါ" }, // glossary: အော်ဒါ
  // TWO keys for one idea, and the reason is layout, not translation: the card's flag sits in ~12px
  // of space beside a 24px table number, while the accessible name has no such constraint and can
  // afford the noun that says WHICH thing is unregistered.
  "floor.unregistered": { en: "unregistered", my: "မှတ်ပုံမတင်" },
  "floor.unregisteredSticker": { en: "unregistered sticker", my: "မှတ်ပုံမတင် စတစ်ကာ" },
  "floor.tab": { en: "Tab", my: "စာရင်းဖွင့်" },
  "floor.tabSecured": { en: "Tab secured · card on file", my: "စာရင်း အာမခံပြီး · ကတ် သိမ်းထား" },
  "floor.tabOpen": { en: "tab open", my: "စာရင်း ဖွင့်ထား" },
  "floor.tabOverLimit": { en: "over tab limit", my: "စာရင်း ကန့်သတ် ကျော်" }, // K15-HIGH — the cue to check in with the table
  "floor.party": { en: "party of {n}", my: "{n} ယောက်" },
  "floor.card.item.one": { en: "{n} item", my: "ပစ္စည်း {n} ခု" },
  "floor.card.item.many": { en: "{n} items", my: "ပစ္စည်း {n} ခု" },
  // The pair below is the same sentence at two lengths: the CARD renders the amount through
  // `LiveMoney` (a rolling, flashing figure) and needs only the trailing words, while the
  // accessible name is a flat string and must carry the amount itself. A K15 correction to one
  // belongs on the other.
  "floor.card.soFarLabel": { en: "so far", my: "ယခုအထိ" },
  "floor.card.soFar": { en: "{m} so far", my: "ယခုအထိ {m}" },
  "floor.card.paid": { en: "{m} paid", my: "{m} ရှင်းပြီး" },
  // K33 — the card's settled row when money came back. `floor.status.paid` is the word beside the
  // figure on an unrefunded table; these replace it rather than joining it, because a card is read
  // in one glance and "Paid · Refunded" is two claims a glance cannot order.
  "floor.status.refunded": { en: "Refunded", my: "ပြန်အမ်းပြီး" },
  "floor.status.partlyRefunded": { en: "Partly refunded", my: "တစ်စိတ်တစ်ပိုင်း ပြန်အမ်းပြီး" },
  "floor.card.refunded": { en: "{m} refunded", my: "{m} ပြန်အမ်းပြီး" },
  "floor.card.empty": { en: "No items yet", my: "ဘာမှ မရှိသေးပါ" },

  // ── VERBS — the visible word on a control, and the word its accessible name leads with ──────
  // A `…verb…` segment is a real constraint, not a naming habit: `al()`'s `verb` arm accepts only
  // these keys, so the set of words that can be a control's LABEL is enumerable. That is what stops
  // an arbitrary key being borrowed as a verb and then drifting from the label it has to contain.
  "floor.verb.deactivate": { en: "Deactivate", my: "ရပ်ဆိုင်း" },
  "floor.verb.reactivate": { en: "Reactivate", my: "ပြန်ဖွင့်" },

  // ── the floor: modes (where the order came from) ──────────────────────────
  "floor.mode.dinein": { en: "Dine-in", my: "ဆိုင်မှာ စား" }, // grounded: kiosk `dineIn`
  "floor.mode.scango": { en: "Scan & Go", my: "Scan & Go" }, // LATIN BY DESIGN — the product's own name
  "floor.mode.pickup": { en: "Pickup", my: "လာယူ" },

  // ═══ P2 PR B · appr ═══════════════════════════════════════════════════════════
  // ── /staff/approvals — the manager approvals queue (P2 PR B) ───────────────
  // Register: a manager working a queue top-down between covers. The nouns follow the S14a
  // glossary (အော်ဒါ for the order, စားပွဲ for the table, မီးဖိုချောင် for the kitchen) and the
  // verbs reuse the words already on the kitchen board (ဖျက် from `kds.undo`, ပြီး from
  // `kds.line.done`) rather than inventing a second vocabulary for the same actions.
  "table.appr.eyebrow": { en: "Approvals", my: "ခွင့်ပြုချက်များ" },
  "table.appr.title": { en: "Pending requests", my: "စောင့်နေတဲ့ တောင်းဆိုချက်များ" },

  // ── the refunds-needed strip (money was taken with no order behind it) ─────
  "table.appr.a11y.refunds": { en: "Refunds needed", my: "ပြန်အမ်းရန် ရှိတာများ" },
  "table.appr.a11y.refundsList": { en: "Refunds to issue", my: "ပြန်အမ်းရမယ့် စာရင်း" },
  // EN singular/plural pair — ONE Burmese value (see STAFF_PLURAL_PAIRS).
  "table.appr.refunds.one": { en: "{n} refund needed", my: "ပြန်အမ်းရန် {n} ခု" },
  "table.appr.refunds.many": { en: "{n} refunds needed", my: "ပြန်အမ်းရန် {n} ခု" },
  // {x} is the payment processor's name — a slot rather than a literal, because a Latin run written
  // INSIDE a MY value is not a slot and nothing marks it (strings.test.ts pins that). The leading
  // em dash is punctuation carried in the value, as `kds.held` / `kds.held.count` already do.
  "table.appr.refundsHint": {
    en: "— money was taken (or a card hold abandoned) with no order behind it. Refund it in {x}, then mark it done here.",
    my: "— အော်ဒါ မရှိဘဲ ငွေယူထားတယ် (ဒါမှမဟုတ် ကတ်မှာ ငွေပိတ်ထားပြီး ပစ်ထားတယ်)။ {x} မှာ ပြန်အမ်းပြီး ဒီမှာ ပြီးကြောင်း မှတ်ပါ။",
  }, // K15-HIGH — the instruction that gets a guest's money back
  "table.appr.stripe": { en: "Stripe", my: "Stripe" }, // LATIN BY DESIGN — the processor's own name
  "table.appr.amountUnknown": { en: "amount unknown", my: "ပမာဏ မသိရ" },
  "table.appr.verb.markRefunded": { en: "Mark refunded", my: "ပြန်အမ်းပြီးကြောင်း မှတ်" },

  // ── the queue itself ───────────────────────────────────────────────────────
  "table.appr.open": { en: "Open requests", my: "ဖွင့်ထားတဲ့ တောင်းဆိုချက်များ" },
  "table.appr.allclear": { en: "All clear", my: "ရှင်းပြီ" },
  "table.appr.waiting": { en: "{n} waiting", my: "စောင့်နေတာ {n} ခု" },
  "table.appr.a11y.queue": {
    en: "Pending approval requests",
    my: "စောင့်နေတဲ့ ခွင့်ပြုချက် တောင်းဆိုချက်များ",
  },
  "table.appr.empty": { en: "Nothing to approve", my: "ခွင့်ပြုစရာ ဘာမှ မရှိပါ" },
  "table.appr.empty.degraded": {
    en: "Nothing to approve as of the last update",
    my: "နောက်ဆုံး အချက်အလက်အရ ခွင့်ပြုစရာ ဘာမှ မရှိပါ",
  },
  "table.appr.empty.hint": {
    en: "When a server asks to void or comp something they can’t do solo, it lands here for a manager to approve or deny — oldest first.",
    my: "စားပွဲထိုးက သူ့ဘာသာ မလုပ်နိုင်လို့ ဖျက်ဖို့ ဒါမှမဟုတ် အခမဲ့ပေးဖို့ တောင်းဆိုရင် မန်နေဂျာ ခွင့်ပြု ဒါမှမဟုတ် ငြင်းပယ်ဖို့ ဒီမှာ ရောက်လာပါမယ်။ အဟောင်းက အရင်ပြပါတယ်။",
  },
  "table.appr.empty.outage": {
    en: "New requests won’t appear here until this list is updating again. Anything already requested is still pending.",
    my: "ဒီစာရင်း ပြန်အလုပ်လုပ်တဲ့အထိ တောင်းဆိုချက်အသစ် ဒီမှာ မပေါ်ပါ။ တောင်းဆိုပြီးသားတွေ စောင့်ဆိုင်းဆဲ ရှိနေပါတယ်။",
  }, // K15-HIGH — read while the queue is frozen; must not sound like "nothing was requested"

  // ── the request card ───────────────────────────────────────────────────────
  // A counter/kiosk request has no tent card, so the table line is the bare noun.
  "table.appr.table": { en: "Table", my: "စားပွဲ" }, // glossary: စားပွဲ
  "table.appr.kind.comp": { en: "Comp", my: "အခမဲ့" },
  "table.appr.kind.void": { en: "Void", my: "ဖျက်" },
  // The CARD's accessible name. Two keys rather than one with a `{kind}` slot: the raw DB values are
  // `comp`/`void`, and interpolating one would put an English status key inside a Burmese name —
  // the OPEN-ITEMS P2g shape. {x} is the dish, verbatim in whatever script the catalog holds.
  "table.appr.card.comp": { en: "Comp request for {x}", my: "{x} အတွက် အခမဲ့ပေးရန် တောင်းဆိုချက်" },
  "table.appr.card.void": { en: "Void request for {x}", my: "{x} အတွက် ဖျက်ရန် တောင်းဆိုချက်" },
  "table.appr.cooked": { en: "cooked", my: "ချက်ပြီးသား" }, // K15-HIGH — the food is already gone; comping it costs the kitchen twice
  // The SEVEN reason codes the loss sheet can send, as words rather than as `service_recovery`.
  // Seven, not six: the void arm offers `sold_out` (W23a's dine-in 86) on top of the five the
  // comp arm shares or forks. Measured from `LossActionSheet.tsx`'s `REASONS` map, not counted by
  // eye — the figure read six here while `ApprovalsBoard.tsx:35` already said seven, and a blind
  // audit caught the two disagreeing inside one diff. Eight KEYS cover them: `quality`,
  // `other` and `mistake` are shared, and `guest_request` forks into `guestChanged`/`guestCourtesy`
  // because the same DB value means two different things to the guest.
  // The approvals queue reads `table.loss.reason.*` — the SHEET's keys. It had its own family until
  // the merge showed the two forking the Burmese for identical English on one audited record; see
  // ApprovalsBoard's REASON_KEY docblock.
  "table.appr.from": { en: "from {x}", my: "{x} က တောင်းထား" },

  // ── the decision controls ──────────────────────────────────────────────────
  "table.appr.verb.approve": { en: "Approve", my: "ခွင့်ပြု" },
  "table.appr.verb.deny": { en: "Deny", my: "ငြင်းပယ်" },
  // Three keys, not two with a `{kind}` slot — same reason as `table.appr.card.*` above, and it
  // keeps the English byte-identical to the pre-P2 line ("Approve this comp — …").
  // "PIN" is ပင်နံပါတ်: a bare Latin run inside a MY value is unmarkable (strings.test.ts).
  "table.appr.confirm.approveComp": {
    en: "Approve this comp — confirm with your PIN",
    my: "ဒီဟာကို အခမဲ့ပေးမယ် — ပင်နံပါတ်နဲ့ အတည်ပြုပါ",
  },
  "table.appr.confirm.approveVoid": {
    en: "Approve this void — confirm with your PIN",
    my: "ဒီဟာကို ဖျက်မယ် — ပင်နံပါတ်နဲ့ အတည်ပြုပါ",
  },
  "table.appr.confirm.deny": {
    en: "Deny this request — confirm with your PIN",
    my: "ဒီ တောင်းဆိုချက်ကို ငြင်းပယ်မယ် — ပင်နံပါတ်နဲ့ အတည်ပြုပါ",
  },
  "table.appr.verb.confirmApprove": { en: "Confirm approve", my: "ခွင့်ပြုကြောင်း အတည်ပြု" },
  "table.appr.verb.confirmDeny": { en: "Confirm deny", my: "ငြင်းပယ်ကြောင်း အတည်ပြု" },
  "table.appr.verb.cancel": { en: "Cancel", my: "မလုပ်တော့" },
  "table.appr.working": { en: "Working…", my: "လုပ်နေပါတယ်…" }, // as table.loss.working — 44 values use ပါတယ်, 3 used သည်
  // A4·3 — the card's six server verdicts, keys rather than the English literals they were.
  "table.appr.msg.already": {
    en: "Already resolved — refreshing.",
    my: "ဆုံးဖြတ်ပြီးသား — ပြန်ဖတ်နေပါတယ်။",
  },
  "table.appr.msg.stale": {
    en: "That item has since changed — refreshing.",
    my: "ဒီပစ္စည်း ပြောင်းသွားပြီ — ပြန်ဖတ်နေပါတယ်။",
  },
  "table.appr.msg.notOpen": {
    en: "That table is no longer open — deny it (a settled refund is handled separately).",
    my: "ဒီစားပွဲ ပိတ်သွားပြီ — ငြင်းပယ်လိုက်ပါ (ရှင်းပြီးသားကို ပြန်အမ်းတာ သီးသန့် လုပ်ပါတယ်)။",
  },
  "table.appr.msg.inFlight": {
    en: "That table is mid-payment — try again once they’ve finished.",
    my: "ဒီစားပွဲ ငွေရှင်းနေဆဲ — ပြီးမှ ထပ်ကြိုးစားပါ။",
  },
  "table.appr.msg.outage": {
    en: "We can’t reach the ordering system — nothing was recorded. This request is still pending; try again in a moment.",
    my: "အော်ဒါစနစ်နဲ့ မဆက်နိုင်ပါ — ဘာမှ မှတ်တမ်း မတင်ရသေးပါ။ ဒီတောင်းဆိုချက် စောင့်ဆိုင်းဆဲ ရှိပါတယ်၊ ခဏနေ ထပ်ကြိုးစားပါ။",
  }, // K15-HIGH — read mid-outage; must never imply the PIN or the request was the problem
  "table.appr.msg.failed": {
    en: "Couldn’t resolve that just now — please try again.",
    my: "အခု မဆုံးဖြတ်နိုင်သေးပါ — ထပ်ကြိုးစားပါ။",
  },
  // manager-3 — the refund strip's two-step: the question names the amount and the processor
  // (`{x}` = `table.appr.stripe`), the group is named by the payment intent (Latin, `{x}`), the
  // yes-verb is a stated word and the busy label a stated word too (§17 — never an ellipsis).
  "table.appr.confirmRefunded.q": {
    en: "Refunded {m} in {x}?",
    my: "{x} မှာ {m} ပြန်အမ်းပြီးပြီလား?",
  },
  "table.appr.confirmRefunded.qUnknown": {
    en: "Refunded this charge in {x}?",
    my: "ဒီငွေကို {x} မှာ ပြန်အမ်းပြီးပြီလား?",
  },
  "table.appr.verb.markRefunded.confirm": {
    en: "Yes, mark it done",
    my: "ဟုတ်ကဲ့၊ ပြီးပြီလို့ မှတ်",
  },
  "table.appr.marking": { en: "Marking…", my: "မှတ်နေပါတယ်…" },
  "table.appr.a11y.confirmRefunded": {
    en: "Confirm {x} refunded",
    my: "{x} ပြန်အမ်းပြီးကြောင်း အတည်ပြု",
  },
  "table.appr.refunds.outage": {
    en: "The refunds ledger can’t load right now — anything already recorded is still there.",
    my: "ပြန်အမ်းရန် စာရင်းကို အခု မဖတ်နိုင်သေးပါ — မှတ်ထားပြီးသားတွေ ရှိနေဆဲပါ။",
  },
  // The ledger loaded once and the latest poll could not read it (Codex round 3 on #283): the
  // last rows stay, and this line stands over them — or alone — so an empty strip never reads as
  // "nothing stranded" while the board cannot hear the feed.
  "table.appr.refunds.stale": {
    en: "The refunds ledger couldn’t refresh — showing the last good list; a newly stranded charge may be missing.",
    my: "ပြန်အမ်းရန် စာရင်းကို ပြန်မဖတ်နိုင်ပါ — နောက်ဆုံး ဖတ်နိုင်ခဲ့တဲ့ စာရင်းကို ပြထားပါတယ်၊ အသစ် ကျန်နေတဲ့ ငွေကောက်ခံမှု ပါမလာနိုင်ပါ။",
  },

  // ═══ P2 PR B · browse ═══════════════════════════════════════════════════════════
  // ── the staff order screen: the page header (app/staff/table/[id]/add) ─────
  // {id} is the table number off the physical tent card — Latin in both tongues.
  "browse.back.table": { en: "← Table {id}", my: "← စားပွဲ {id}" },
  "browse.title.counter": { en: "Counter order", my: "ကောင်တာ အော်ဒါ" }, // glossary: အော်ဒါ
  "browse.title.add": { en: "Add items", my: "ပစ္စည်း ထည့်ရန်" },
  "browse.sub.counter": {
    en: "Walk-up or phone order — review and settle from the order page.",
    my: "လမ်းလျှောက်လာ ဒါမှမဟုတ် ဖုန်းအော်ဒါ — အော်ဒါ စာမျက်နှာမှာ စစ်ပြီး ငွေရှင်းပါ။",
  },
  "browse.sub.table": {
    en: "Ordering for table {id}. Tap to add — it lands on the table’s order instantly.",
    my: "စားပွဲ {id} အတွက် မှာနေပါတယ်။ နှိပ်လိုက်တာနဲ့ စားပွဲရဲ့ အော်ဒါထဲ ချက်ချင်း ရောက်ပါမယ်။",
  },
  "browse.review": { en: "Review order & settle →", my: "အော်ဒါ စစ်ပြီး ငွေရှင်း →" },

  // ── the staff menu browser: the counter order's name strip ─────────────────
  "browse.name.label": { en: "Name for the order", my: "အော်ဒါအတွက် နာမည်" },
  "browse.name.placeholder": {
    en: "First name — it’s the pickup call-out",
    my: "နာမည်အရင် — လာယူချိန် လှမ်းခေါ်မယ့် နာမည်",
  },
  "browse.name.save": { en: "Save", my: "သိမ်း" },
  "browse.name.saving": { en: "Saving…", my: "သိမ်းနေပါတယ်…" },
  "browse.name.saved": { en: "Saved ✓", my: "သိမ်းပြီးပြီ ✓" },
  // {x} is the guest's own name, rendered verbatim in whatever script it arrives in.
  "browse.name.set": { en: "Order name: {x}.", my: "အော်ဒါ နာမည် — {x}။" },
  "browse.name.cleared": { en: "Order name cleared.", my: "အော်ဒါ နာမည် ရှင်းလိုက်ပြီ။" },
  "browse.name.failed": {
    en: "Couldn’t save the name — try again.",
    my: "နာမည် မသိမ်းနိုင်ပါ — ထပ်စမ်းပါ။",
  },

  // ── the staff menu browser: search, filters, list ──────────────────────────
  "browse.search.placeholder": { en: "Search the menu…", my: "မီနူး ရှာရန်…" },
  "browse.cat.all": { en: "All", my: "အားလုံး" }, // the category filter, NOT the KDS station chip
  // The row's sold-out FLAG, a statement about the dish. `browse.add.verb.soldOut` is the disabled
  // BUTTON's own word — two keys for one idea, the way floor.unregistered/…Sticker are, so a K15
  // correction to the badge cannot silently reword the control.
  "browse.soldOut": { en: "Sold out", my: "ဖြုတ်ထားပြီ" }, // the glossary's ဖြုတ်, as kds.86.done
  "browse.verb.choose": { en: "Choose…", my: "ရွေးရန်…" },
  // {n} is a prose count (Burmese numerals); {x} is the dish name, verbatim.
  "browse.added": { en: "Added {n} × {x}.", my: "{x} {n} ခု ထည့်ပြီးပြီ။" },
  "browse.empty": {
    en: "Nothing matches — clear the search or pick another category.",
    my: "ကိုက်တာ မရှိပါ — ရှာတာကို ရှင်းပါ ဒါမှမဟုတ် တခြား အမျိုးအစား ရွေးပါ။",
  },

  // ── the staff menu browser: names with no visible text to pair with ────────
  // The ellipsis is not decoration: the placeholder IS visible text in the control, so the name has
  // to contain it exactly for WCAG 2.5.3.
  "browse.a11y.search": { en: "Search the menu…", my: "မီနူး ရှာရန်…" },
  "browse.a11y.categories": { en: "Filter by category", my: "အမျိုးအစား အလိုက် စစ်ထုတ်" },
  "browse.a11y.items": { en: "Menu items", my: "မီနူး ပစ္စည်းများ" },

  // ── the add-to-table button (StaffAddButton) ───────────────────────────────
  "browse.add.verb.add": { en: "Add", my: "ထည့်" },
  "browse.add.verb.added": { en: "Added", my: "ထည့်ပြီးပြီ" },
  "browse.add.verb.soldOut": { en: "Sold out", my: "ဖြုတ်ထားပြီ" }, // ကုန်သွား is the LOSS reason
  // This console's OWN failure sentence — not a server-authored string, so it is a dictionary key
  // rather than something <OutageText> passes through as English forever.
  // Phase 2a (Codex round 1, P1) — replaces `browse.add.failed`: an add whose answer never arrived
  // (the action threw, or the write answered `unconfirmed`) may have LANDED. "Try again" read as
  // "nothing landed" and invited a second plate; the retry now resends the same add key, and the
  // sentence sends staff to the order first. MY is a Claude-authored K15 draft pending Min's check.
  "browse.add.unconfirmed": {
    en: "Couldn’t confirm that add — check the order before adding again.",
    my: "ထည့်ပြီးမပြီး မသေချာပါ — ထပ်မထည့်ခင် အော်ဒါကို စစ်ပါ။",
  }, // K15-HIGH — an add that may have landed; a blind re-add cooks and charges a second dish

  // ── the staff modifier sheet (StaffModSheet) ───────────────────────────────
  "browse.mod.required": { en: "required", my: "မဖြစ်မနေ" },
  "browse.mod.optional": { en: "optional", my: "ရွေးချယ်နိုင်" },
  "browse.mod.qty": { en: "Quantity", my: "အရေအတွက်" },
  "browse.mod.note": {
    en: "Kitchen note (allergy, request)",
    my: "မီးဖိုချောင် မှတ်ချက် (ဓာတ်မတည့်မှု၊ တောင်းဆိုချက်)",
  }, // glossary: မီးဖိုချောင်
  "browse.mod.notePlaceholder": { en: "e.g. peanut allergy", my: "ဥပမာ — မြေပဲ ဓာတ်မတည့်" },
  // {m} is preformatted money — Latin in both tongues.
  "browse.mod.add": { en: "Add · {m}", my: "ထည့် · {m}" },
  "browse.mod.adding": { en: "Adding…", my: "ထည့်နေပါတယ်…" },
  "browse.mod.pickRequired": {
    en: "Pick the required options first.",
    my: "မဖြစ်မနေ ရွေးရမယ့်အရာတွေကို အရင် ရွေးပါ။",
  },
  "browse.mod.a11y.less": { en: "One fewer", my: "တစ်ခု လျှော့" },
  "browse.mod.a11y.more": { en: "One more", my: "တစ်ခု ထပ်ထည့်" },
  // §17 — the name at a bound says WHY the tap is refused (`{n}` is the bound, a count).
  "browse.mod.a11y.lessMin": { en: "At the minimum of {n}", my: "အနည်းဆုံး {n} ဖြစ်ပြီ" },
  "browse.mod.a11y.moreMax": { en: "At the maximum of {n}", my: "အများဆုံး {n} ဖြစ်ပြီ" },

  // ═══ P2 PR B · detail ═══════════════════════════════════════════════════════════
  // ── the table drill-down (/staff/table/[id]) — the page and FloorDetailLive ────────────────
  // The closed-session surface: a cleared or expired table, reached from a bookmark or a stale tap.
  "table.detail.closed.title": { en: "This table is closed", my: "ဒီစားပွဲ ပိတ်ထားပြီ" },
  "table.detail.closed.body": {
    en: "It was cleared or its session expired. Head back to the floor for active tables.",
    my: "ရှင်းလိုက်ပြီ ဒါမှမဟုတ် အချိန်ကုန်သွားပြီ။ ဖွင့်ထားတဲ့ စားပွဲတွေအတွက် ခန်းမကို ပြန်သွားပါ။",
  },

  // ── the detail header ─────────────────────────────────────────────────────────────────────
  // Two badge words that already exist one namespace over as ACCESSIBLE-NAME fragments
  // (`floor.unregisteredSticker`, `floor.tabOpen`, both lowercase because they are read inside a
  // sentence). These are the VISIBLE badges on the drill-down, sentence-cased as they render today —
  // the English console stays byte-identical. Same MY wording as the floor's, deliberately.
  "table.detail.unregisteredBadge": { en: "Unregistered sticker", my: "မှတ်ပုံမတင် စတစ်ကာ" },
  "table.detail.tabOpen": { en: "Tab open", my: "စာရင်း ဖွင့်ထား" },
  // A1 — the drill-down's ask banner, above the settle controls. Present tense, the table's own
  // voice: they asked, they are waiting, the register acts. The relative time ("2m ago") is rendered
  // beside `counterAsked` by <RelativeTime> — since counter-8 through the `time.*` keys below, so
  // under `my` it arrives as its own marked Burmese run.
  "table.detail.counterAsk": {
    en: "They’d like to pay here at the counter",
    my: "ကောင်တာမှာ ငွေရှင်းချင်ပါတယ်",
  },
  "table.detail.counterAsked": { en: "asked", my: "တောင်းဆိုတာ" },
  "table.detail.guest.one": { en: "{n} guest", my: "ဧည့်သည် {n} ယောက်" },
  "table.detail.guest.many": { en: "{n} guests", my: "ဧည့်သည် {n} ယောက်" },
  // Each of these leads a <RelativeTime> node ("5m ago" · "၅ မိနစ်က"). It stays a PREFIX on purpose,
  // not a sentence with a slot: `{t}` is a Latin clock by contract (fill.ts), and the age is PROSE
  // in the reader's tongue — a marked run of its own, which no string slot can carry.
  "table.detail.tabOpened": { en: "tab opened", my: "စာရင်းဖွင့်တာ" },
  "table.detail.lastActivity": { en: "last activity", my: "နောက်ဆုံး လှုပ်ရှားမှု" },

  // ── counter-8 · the relative age (`<RelativeTime>`, `lib/relative-time.ts`) ─────────────────
  // Prose counts, so `{n}` — Burmese numerals under `my`. Read after a prefix ("last activity ·
  // 5m ago") on a card at `--fs-sm`, which is why the English keeps its terse card form.
  "time.justNow": { en: "just now", my: "အခုလေးတင်" },
  "time.minAgo": { en: "{n}m ago", my: "{n} မိနစ်က" },
  "time.hrAgo": { en: "{n}h ago", my: "{n} နာရီက" },
  "time.dayAgo": { en: "{n}d ago", my: "{n} ရက်က" },

  // ── the two advisory banners (server-discretion, S3.3) ────────────────────────────────────
  // TWO keys for one sentence because it carries TWO money figures and `{m}` fills globally: the
  // bolded lead-in takes the running subtotal, the body takes the ceiling.
  "table.detail.ceiling.at": { en: "Tab at {m}", my: "စာရင်း {m} ရောက်ပြီ" },
  "table.detail.ceiling.past": {
    en: "— past the {m} mark. Check in with the table, or ask them to secure the tab with a card on file.",
    my: "— {m} ကို ကျော်သွားပြီ။ စားပွဲကို သွားမေးပါ၊ ဒါမှမဟုတ် ကတ်နဲ့ စာရင်း အာမခံဖို့ ပြောပါ။",
  },
  "table.detail.nudge.party": {
    en: "Large party — consider suggesting a secure tab (a card on file) so they can order freely and settle once.",
    my: "အဖွဲ့ကြီးပါ — ကတ် သိမ်းပြီး စာရင်း အာမခံဖို့ အကြံပြုပါ။ လွတ်လွတ်လပ်လပ် မှာပြီး တစ်ခါတည်း ရှင်းလို့ ရပါတယ်။",
  },
  "table.detail.nudge.age": {
    en: "This tab's been open a while — consider suggesting they secure it with a card on file.",
    my: "ဒီစာရင်း ဖွင့်ထားတာ ကြာပြီ — ကတ် သိမ်းပြီး အာမခံဖို့ အကြံပြုပါ။",
  },

  // ── the party card ────────────────────────────────────────────────────────────────────────
  "table.detail.party.title": { en: "Party", my: "အဖွဲ့" },
  "table.detail.party.empty": { en: "No guests yet.", my: "ဧည့်သည် မရှိသေးပါ။" },
  "table.detail.host": { en: "host", my: "အိမ်ရှင်" },
  // {x} is a guest's name — verbatim, in whatever script the seat carries.
  "table.detail.hostOfRecord": {
    en: "Card on file — host of record: {x}.",
    my: "ကတ် သိမ်းထားပြီး — တာဝန်ခံ အိမ်ရှင်မှာ {x} ဖြစ်ပါတယ်။",
  },

  // ── the order card ────────────────────────────────────────────────────────────────────────
  "table.detail.order.title": { en: "Order so far", my: "ယခုအထိ အော်ဒါ" },
  // K33 — a SETTLED table's list is a record, not a running basket, so the heading stops saying
  // "so far". Claude-authored MY draft pending Min's native check (K15).
  "table.detail.order.settledTitle": { en: "Ordered", my: "မှာထားတဲ့ အော်ဒါ" },
  // K33 — a table that paid a round and kept ordering settles more than once. The record shows the
  // LATEST round, so when there are others it says so rather than letting the heading imply the
  // list is the whole meal. `{n}` is a prose count, so it takes the device's numerals.
  "table.detail.order.roundsNote": {
    en: "Latest of {n} rounds this table has paid for.",
    my: "ဒီစားပွဲ ရှင်းပြီးတဲ့ အကြိမ် {n} ထဲက နောက်ဆုံးအကြိမ်။",
  },
  // M212 — the same sentence when the read hit its bound. The count is a FLOOR, not a total, so the
  // "+" is doing real work: without it the screen states a number it cannot know. K15: the Burmese is
  // the checked string above with the same "+" inserted, for Min's native read.
  "table.detail.order.roundsNoteCapped": {
    en: "Latest of {n}+ rounds this table has paid for.",
    my: "ဒီစားပွဲ ရှင်းပြီးတဲ့ အကြိမ် {n}+ ထဲက နောက်ဆုံးအကြိမ်။",
  },
  "table.detail.addItems": { en: "+ Add items", my: "+ ပစ္စည်း ထည့်" },
  "table.detail.cart.empty": { en: "Nothing in the cart yet.", my: "အော်ဒါထဲမှာ ဘာမှ မရှိသေးပါ။" },
  // The read-only twin of `table.line.voided` — ONE wording, because they are the two branches
  // of a single list in a single card and the word for a voided line must not change with the
  // reader's write permission.
  "table.detail.line.voided": { en: "Voided", my: "ဖျက်ပြီး" },
  "table.detail.line.comped": { en: "Comped", my: "အခမဲ့ ပေး" }, // the အခမဲ့ root every other comp string uses
  // The money row. `{m}` is preformatted by `fmt()` and stays Latin; the item count is prose.
  "table.detail.subtotalSoFar": { en: "subtotal so far", my: "ယခုအထိ စုစုပေါင်း" },
  "table.detail.item.one": { en: "{n} item", my: "ပစ္စည်း {n} ခု" },
  "table.detail.item.many": { en: "{n} items", my: "ပစ္စည်း {n} ခု" },
  "table.detail.paid": { en: "{m} paid", my: "{m} ရှင်းပြီး" },
  // K33 — a refunded order must NEVER read as plainly paid, on any surface (registry M2 closed
  // exactly that on the guest receipt). The full case names the return and nothing else; the
  // partial case names what the guest is actually out of pocket FIRST, because that is the figure a
  // cashier is holding cash against, and the returned amount second.
  "table.detail.refunded.full": {
    en: "Refunded — {m} came back",
    my: "ပြန်အမ်းပြီး — {m} ပြန်ရပါပြီ",
  },
  "table.detail.refunded.partial": {
    en: "{m} paid · {r} came back",
    my: "{m} ရှင်းပြီး · {r} ပြန်အမ်းပြီး",
  },
  "table.detail.line.refunded": { en: "refunded {m}", my: "{m} ပြန်အမ်းပြီး" },
  "table.detail.pretaxNote": {
    en: "Running pre-tax subtotal — tax is added at settle.",
    my: "အခွန်မပါသေးတဲ့ စုစုပေါင်း — အခွန်ကို ငွေရှင်းချိန်မှာ ထည့်ပါမယ်။",
  },

  // ── settle, tab close and the counter handoff ─────────────────────────────────────────────
  "table.detail.trust.reader": {
    en: "Paying by card? Use the reader above, or the guest can close the tab from their phone.",
    my: "ကတ်နဲ့ ရှင်းမလား။ အပေါ်က ကတ်စက်နဲ့ ယူပါ၊ ဒါမှမဟုတ် ဧည့်သည်က သူ့ဖုန်းကနေ စာရင်းပိတ်နိုင်ပါတယ်။",
  },
  "table.detail.trust.phone": {
    en: "Paying by card? The guest closes the tab from their phone — it settles when that payment lands.",
    my: "ကတ်နဲ့ ရှင်းမလား။ ဧည့်သည်က သူ့ဖုန်းကနေ စာရင်းပိတ်ပါမယ် — ငွေရောက်တာနဲ့ ရှင်းပြီးပါမယ်။",
  },
  "table.detail.handoff.paid": { en: "Paid · {m}", my: "ရှင်းပြီး · {m}" },
  "table.detail.handoff.change": { en: "change {m}", my: "အကြွေ {m}" },
  "table.detail.handoff.callout": {
    en: "The pickup call-out — it’s on the kitchen ticket and the ready board.",
    my: "လာယူဖို့ ခေါ်မယ့် နံပါတ် — မီးဖိုချောင် အော်ဒါစာရွက်နဲ့ အော်ဒါ ဘုတ်မှာ ပါပါတယ်။",
  },
  "table.detail.payingPhone.tab": {
    en: "A guest is paying on their phone — editing and tab close are paused until that finishes.",
    my: "ဧည့်သည်တစ်ယောက် ဖုန်းကနေ ငွေရှင်းနေပါတယ် — ပြီးတဲ့အထိ ပြင်တာနဲ့ စာရင်းပိတ်တာကို ခဏရပ်ထားပါတယ်။",
  },
  "table.detail.payingPhone.cash": {
    en: "A guest is paying on their phone — editing and cash settle are paused until that finishes.",
    my: "ဧည့်သည်တစ်ယောက် ဖုန်းကနေ ငွေရှင်းနေပါတယ် — ပြီးတဲ့အထိ ပြင်တာနဲ့ ငွေသားရှင်းတာကို ခဏရပ်ထားပါတယ်။",
  },

  // ── accessible names with no visible label to contain (sx() only) ─────────────────────────
  "table.detail.a11y.guests": { en: "Guests at this table", my: "ဒီစားပွဲက ဧည့်သည်များ" },
  "table.detail.a11y.lines": { en: "Items on this order", my: "ဒီအော်ဒါက ပစ္စည်းများ" },
  "table.detail.a11y.openTab": { en: "Open a tab for this table", my: "ဒီစားပွဲအတွက် စာရင်းဖွင့်" },
  "table.detail.a11y.settle": { en: "Settle this table", my: "ဒီစားပွဲ ငွေရှင်း" },
  "table.detail.a11y.merge": { en: "Merge this table", my: "ဒီစားပွဲကို ပေါင်းစည်း" },
  "table.detail.a11y.paid": { en: "Order paid", my: "အော်ဒါ ငွေရှင်းပြီး" },

  // ═══ P2 PR B · expo ═══════════════════════════════════════════════════════════
  // ── expo / bagging station: aria-only names (no visible text to contain) ───
  // {x} is a call-out token rendered VERBATIM — "Table 7", a first name, or "#A12" — so it stays in
  // whatever script it arrives in and never becomes a count.
  "expo.a11y.bags": { en: "Bags waiting", my: "စောင့်နေတဲ့ ပါဆယ်ထုပ်များ" },

  // ── expo: the board's OWN chrome (ExpoBoard.tsx head row + empty state) ────
  // Same story as `floor.tables.*`: converted after a blind audit read the "until PR B converts
  // them" comment against the file. Grounded in `what.bags` (ပါဆယ်ထုပ်) and in the two verbs the
  // bump button already speaks — `စစ်ဆေးရန်` from `expo.a11y.cardVerify`, `လွှဲပေးရန်` from
  // `expo.a11y.cardHandOver` — so the count line and the button say one word for one action.
  "expo.title": { en: "Takeaway bags", my: "ပါဆယ်ထုပ်များ" },
  "expo.none": { en: "No bags waiting", my: "စောင့်နေတဲ့ ပါဆယ်ထုပ် မရှိပါ" },
  "expo.count.one": { en: "{n} bag waiting", my: "စောင့်နေတဲ့ ပါဆယ်ထုပ် {n} ခု" },
  "expo.count.many": { en: "{n} bags waiting", my: "စောင့်နေတဲ့ ပါဆယ်ထုပ် {n} ခု" },
  "expo.count.verify": { en: "{n} to verify", my: "စစ်ဆေးရန် {n} ခု" },
  "expo.count.handOver": { en: "{n} to hand over", my: "လွှဲပေးရန် {n} ခု" },
  // A4·2 · K30 (B) — the badge on a bag whose to-go food the kitchen has bumped (advisory).
  "expo.kitchenDone": { en: "Kitchen done", my: "မီးဖိုချောင် ပြီးပြီ" }, // glossary: မီးဖိုချောင်
  "expo.empty": { en: "Nothing to bag", my: "ထုပ်စရာ မရှိပါ" },
  "expo.emptyFrozen": {
    en: "Nothing to bag as of the last update",
    my: "နောက်ဆုံး အသစ်တက်ချိန်အထိ ထုပ်စရာ မရှိပါ",
  },
  "expo.emptySub": {
    en: "Bags appear here once a to-go or grocery order is paid.",
    my: "ပါဆယ် ဒါမှမဟုတ် ကုန်စုံ အော်ဒါ ငွေရှင်းပြီးတာနဲ့ ပါဆယ်ထုပ်က ဒီမှာ ပေါ်ပါမယ်။",
  },
  "expo.emptyFrozenSub": {
    en: "New bags won’t land here until this board is updating again. Nothing already paid for is lost.",
    my: "ဒီဘုတ် ပြန်အသစ်မတက်မချင်း ပါဆယ်ထုပ်အသစ်တွေ ဒီမှာ ရောက်မှာ မဟုတ်ပါ။ ငွေရှင်းပြီးသားတွေ မပျောက်ပါ။",
  },
  "expo.a11y.lines": { en: "Items in this order", my: "ဒီအော်ဒါထဲက ပစ္စည်းများ" }, // glossary: အော်ဒါ
  // The CARD's name tracks the stage the ticket is at NOW, not the one it just left: a ready grocery
  // ticket has already been verified, so it names the hand-over. Three keys rather than one with an
  // optional slot, because the two grocery stages and the bag are three different sentences.
  "expo.a11y.cardVerify": { en: "Verify · {x}", my: "စစ်ဆေးရန် · {x}" },
  "expo.a11y.cardHandOver": { en: "Hand over · {x}", my: "လွှဲပေးရန် · {x}" },
  "expo.a11y.cardBag": { en: "Bag for {x}", my: "{x} အတွက် ပါဆယ်ထုပ်" },

  // ── expo: VERBS — the word on the bump button, and the word its name leads with ──────────────
  // Four, because the counter's two stages mean different things for a bagged order and for a
  // Scan & Go basket the shopper already holds: bag → hand it over, versus check the exit pass →
  // record the walk-out. Each names the action ITS OWN tap performs (W9d, Codex).
  "expo.verb.verified": { en: "Verified", my: "စစ်ဆေးပြီး" },
  "expo.verb.bagged": { en: "Bagged & ready", my: "ထုပ်ပြီး၊ ယူလို့ရပြီ" }, // grounded: kds.line.bagit (ထုပ်), board.status (ယူလို့ရပြီ)
  "expo.verb.handedOver": { en: "Handed over", my: "လွှဲပေးပြီး" },
  // counter-6 / P2q — the card itself, in the device language: the tags, the pickup line, the
  // scan-and-go note, the destination chips. `{t}` and `{id}` are Latin-always slots (a clock, a
  // tent-card number); `{x}` is a name or a code, never a word.
  "expo.tag.here": { en: "Here now", my: "ရောက်နေပြီ" },
  "expo.tag.ready": { en: "Ready", my: "အဆင်သင့်" },
  "expo.tag.verified": { en: "Verified", my: "စစ်ဆေးပြီး" },
  "expo.pickup": { en: "Pickup {t}", my: "လာယူချိန် {t}" },
  // The product name rides `{x}` so <Chrome> marks it Latin inside the Burmese run.
  "expo.grocery.note": {
    en: "{x} — verify the exit pass; nothing to bag.",
    my: "{x} — ထွက်ခွင့်လက်မှတ်ကို စစ်ပါ၊ ထုပ်စရာ မရှိပါ။",
  },
  "expo.dest.togo": { en: "To-go", my: "ပါဆယ်" },
  "expo.dest.grocery": { en: "Grocery", my: "ကုန်စုံ" },
  // counter-1 — the picked-up window: the card's posture, the one way back, and what the region says.
  "expo.picked.pending": { en: "Picked up — undo?", my: "ယူသွားပြီ — ပြန်ဖျက်မလား" },
  "expo.live.picked": {
    en: "{x} picked up — undo available.",
    my: "{x} ယူသွားပြီ — ပြန်ဖျက်နိုင်သေးသည်။",
  },
  "expo.live.pickedTable": {
    en: "Table {id} picked up — undo available.",
    my: "စားပွဲ {id} ယူသွားပြီ — ပြန်ဖျက်နိုင်သေးသည်။",
  },
  "expo.live.pickedUndone": { en: "{x} is back on the counter.", my: "{x} ကောင်တာမှာ ပြန်ရှိပြီ။" },
  "expo.live.pickedUndoneTable": {
    en: "Table {id} is back on the counter.",
    my: "စားပွဲ {id} ကောင်တာမှာ ပြန်ရှိပြီ။",
  },
  // counter-6 / P2p — the lane's refusals, keyed per SUBJECT shape (see `lib/expo-errors.ts`).
  "expo.err.bagTable": {
    en: "Couldn’t update the bag for Table {id} — try again.",
    my: "စားပွဲ {id} အတွက် ထုပ်ကို မပြင်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "expo.err.bagFor": {
    en: "Couldn’t update the bag for {x} — try again.",
    my: "{x} အတွက် ထုပ်ကို မပြင်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "expo.err.verify": {
    en: "Couldn’t update {x} — try again.",
    my: "{x} ကို မပြင်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "expo.err.stale": {
    en: "{x} was already updated — refreshing.",
    my: "{x} ကို ပြောင်းပြီးသားပါ — ပြန်ဖတ်နေသည်။",
  },
  "expo.err.staleTable": {
    en: "Table {id} was already updated — refreshing.",
    my: "စားပွဲ {id} ကို ပြောင်းပြီးသားပါ — ပြန်ဖတ်နေသည်။",
  },
  "expo.err.invalid": {
    en: "That request didn’t make sense — reload the screen.",
    my: "တောင်းဆိုချက် မမှန်ပါ — စခရင်ကို ပြန်ဖွင့်ပါ။",
  },
  "expo.verb.pickedUp": { en: "Picked up", my: "ယူသွားပြီ" },

  // ═══ P2 PR B · home ═══════════════════════════════════════════════════════════
  // ── the console home: the More rows (lib/staff-more.ts → StaffDoors.tsx) ───────────────────
  // Since P7·1b these are 62px inset ROWS with an `aria-hidden` disclosure chevron, not pills, and
  // since counter-10 the values carry NO trailing `→`: the chevron is the disclosure, a screen
  // reader spoke the glyph as "right arrow" inside the bar circle's name (`floor.nav.approvals*`),
  // and the row read "Kitchen → ›". (`*.back` keys still carry their `←` — OPEN-ITEMS P2o.)
  //
  // Vocabulary is reused, never re-invented: ကောင်တာ from `floor.counter.chip`, မီးဖိုချောင် from
  // `kds.title` (owner-verified W21), ထုတ်ပေးရေး from `kds.station.expo` where it still applies, ခွင့်ပြုချက်များ from
  // `what.approvals`, ဧည့်သည် မှတ်ချက် from `floor.fb.title`, အပိုကြေး from `what.tips`, and
  // မီနူး ဈေးနှုန်း / မီနူး ရနိုင်မှု verbatim from `browse.price.title`/`titleAvail` — the pill and
  // the page it opens must not read as two different screens.
  "floor.nav.kitchen": { en: "Kitchen", my: "မီးဖိုချောင်" },
  // TWO keys rather than a count concatenated onto one label: the badge is a COUNT in prose, so it
  // rides an `{n}` slot and becomes Burmese numerals at render. NOT a `.one`/`.many` pair — English
  // reads "Approvals (1)" and "Approvals (3)" identically; the fork is has-a-count vs has-none.
  "floor.nav.approvals": { en: "Approvals", my: "ခွင့်ပြုချက်များ" },
  "floor.nav.approvalsCount": { en: "Approvals ({n})", my: "ခွင့်ပြုချက်များ ({n})" },
  // A4·3 — the zone's own heading (`floor.settled.head`) with an arrow: `reg.day.refunded.*` /
  // `reg.day.note` point staff at "Settled today" — the tile, the heading and the pointer are one name.
  "floor.nav.menuPrices": { en: "Menu prices", my: "မီနူး ဈေးနှုန်း" },
  "floor.nav.menuAvailability": { en: "Menu availability", my: "မီနူး ရနိုင်မှု" },
  "floor.nav.tips": { en: "Tips today", my: "ဒီနေ့ အပိုကြေး" },
  // "PIN" is ပင်နံပါတ် — a bare Latin run inside a MY value is unmarkable (`Chrome` marks only
  // INTERPOLATED values; strings.test.ts pins that). Same word as `table.appr.confirm.*`.
  "floor.nav.pin": { en: "Your PIN", my: "ကိုယ့် ပင်နံပါတ်" },
  "floor.nav.pinSet": { en: "Set a tablet PIN", my: "တက်ဘလက် ပင်နံပါတ် သတ်မှတ်" },
  // ── P7 — the two DOORS `/staff` opens on, and the More grid beneath them ──────────────────────
  // The kitchen door's title is `kds.title` itself (မီးဖိုချောင်, owner-verified in W21): the wall,
  // the pass and the door must say ONE word for the kitchen, so no second key exists for it. The
  // counter door names both of Dad's rooms — the register AND the tables — because that is what it
  // opens on. Every MY value here is a Claude-authored draft pending Min's native check (K15).
  "floor.door.counter": { en: "Counter & tables", my: "ကောင်တာနဲ့ စားပွဲများ" },
  "floor.door.kitchen.sub": {
    en: "The pass · tickets, bump, 86",
    my: "ဟင်းထွက်တဲ့နေရာ · တစ်ကတ်၊ ပြီးပြီ၊ ဖြုတ်",
  },
  "floor.door.counter.sub": {
    en: "Register · take an order, settle a table, apply a promo code",
    my: "ကောင်တာ · အော်ဒါယူ၊ စားပွဲ ငွေရှင်း၊ လျှော့ကုဒ် ထည့်",
  },
  // A tablet that has walked through a door says so on that door, and opens there next time.
  "floor.door.here": { en: "This tablet opens here", my: "ဒီတက်ဘလက် ဖွင့်တိုင်း ဒီစခရင် ရောက်မယ်" },
  // doors-1 — what a tapped door says while its cookie write is awaited (the `shell.locking`
  // idiom): spoken from the note slot, seen as the door's dim. Claude-authored draft pending K15.
  "floor.door.opening": { en: "Opening…", my: "ဖွင့်နေသည်…" },
  "floor.door.more": { en: "More", my: "နောက်ထပ်" },
  "floor.a11y.doors": { en: "Choose this tablet’s screen", my: "ဒီတက်ဘလက်ရဲ့ စခရင် ရွေးပါ" },
  // A4·2 — the one list holds tables AND counter orders; its name says so, like its heading.
  "floor.a11y.rows": { en: "Tables & counter orders", my: "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" },
  // A4·5 — the wall and the word-check sheet left this grid: the wall is a circle in the kitchen's
  // bar (`kds.nav.wall`), the sheet a print circle in the Menu screen's (`browse.price.wordCheck`).

  // ── the floor board: a region name with no visible label to pair with ─────

  // ── the floor: the tables board's OWN chrome (FloorBoard.tsx) ─────────────
  // The console's landing copy. It stayed English through the first cut of this slice under a
  // comment reading "until PR B converts them" — and this IS PR B; a blind audit read the comment
  // against the file and found the console home still saying "The floor is quiet" in English under
  // a Burmese greeting. Vocabulary is reused, never re-invented: `စားပွဲ` from `floor.table`,
  // `အသုံးပြုနေတဲ့ စားပွဲများ` verbatim from `floor.a11y.tables` one line up, `ခန်းမ` from `what.room`.
  // A4·2 — the one list carries the counter orders beside the tables, and the heading says so.
  "floor.tables.title": { en: "Tables & counter orders", my: "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" },
  "floor.tables.count.one": {
    en: "{n} active table",
    my: "အသုံးပြုနေတဲ့ စားပွဲ {n} ခု",
  },
  "floor.tables.count.many": {
    en: "{n} active tables",
    my: "အသုံးပြုနေတဲ့ စားပွဲ {n} ခု",
  },
  "floor.tables.empty": { en: "The floor is quiet", my: "ခန်းမ တိတ်ဆိတ်နေပါတယ်" },
  // Mid-freeze the empty state must not read as an all-clear about a room we cannot hear from.
  "floor.tables.emptyFrozen": {
    en: "No tables as of the last update",
    my: "နောက်ဆုံး အသစ်တက်ချိန်အထိ စားပွဲ မရှိပါ",
  },
  "floor.tables.emptySub": {
    en: "Active tables appear here the moment a guest scans in — party, what they’re ordering, and how long they’ve been seated. Counter orders appear the moment you start one above.",
    my: "ဧည့်သည် စကန်ဖတ်တာနဲ့ စားပွဲက ဒီမှာ ချက်ချင်း ပေါ်ပါမယ် — ဘယ်နှစ်ယောက်၊ ဘာမှာထားလဲ၊ ထိုင်နေတာ ဘယ်လောက်ကြာပြီလဲ။ အပေါ်မှာ အော်ဒါ စဖွင့်တာနဲ့ ကောင်တာ အော်ဒါလည်း ဒီမှာ ပေါ်ပါမယ်။",
  },
  "floor.tables.emptyFrozenSub": {
    en: "New tables won’t appear here until this board is updating again. Nothing already open is lost.",
    my: "ဒီဘုတ် ပြန်အသစ်မတက်မချင်း စားပွဲအသစ်တွေ ဒီမှာ ပေါ်မှာ မဟုတ်ပါ။ ဖွင့်ထားပြီးသားတွေ မပျောက်ပါ။",
  },

  // ── Settled today — the manager's zone of the counter screen (A4·3 · M204) ──
  // The list READS THE RECEIPT: every row label below is pinned to the artifact's own English in
  // `lib/settled-view.test.ts`, so a reworded receipt reddens the pin instead of drifting from it.
  "floor.settled.head": { en: "Settled today", my: "ဒီနေ့ ငွေရှင်းပြီး အော်ဒါများ" },
  "floor.settled.sub": {
    en: "Orders paid today, and earlier orders refunded here today, as the guest’s receipt shows them. Refunding a line returns its price + tax to the card and is logged with your name.",
    my: "ဒီနေ့ ငွေရှင်းပြီး အော်ဒါများနဲ့ ဒီနေ့ ဒီမှာ ပြန်အမ်းလိုက်တဲ့ ရှေ့ရက် အော်ဒါများ — ဧည့်သည့် ပြေစာမှာ ပြတဲ့အတိုင်း။ တစ်လိုင်းကို ပြန်အမ်းလိုက်ရင် အဲဒီဈေးနှုန်းနဲ့ အခွန်ကို ကတ်ထဲ ပြန်ထည့်ပေးပြီး ဘယ်သူလုပ်တယ်ဆိုတာ မှတ်တမ်းတင်ပါတယ်။",
  }, // K15-HIGH — the sentence that says a refund is logged to the person who taps it
  // EN singular/plural pair — ONE Burmese value (see STAFF_PLURAL_PAIRS).
  "floor.settled.count.one": { en: "{n} settled", my: "ရှင်းပြီး {n} ခု" },
  "floor.settled.count.many": { en: "{n} settled", my: "ရှင်းပြီး {n} ခု" },
  // The read is capped; a full page says so rather than passing part of the day off as the whole.
  "floor.settled.full": {
    en: "— the newest {n}; earlier ones are off this list",
    my: "— နောက်ဆုံး {n} ခုသာ၊ အစောပိုင်းဟာတွေ ဒီစာရင်းမှာ မပါ",
  },
  "floor.settled.none": {
    en: "Nothing settled yet today",
    my: "ဒီနေ့ ငွေရှင်းပြီး အော်ဒါ မရှိသေးပါ",
  },
  "floor.settled.none.hint": {
    en: "Orders paid today — and earlier orders refunded here today — land in this list the moment they settle, newest first.",
    my: "ဒီနေ့ ငွေရှင်းပြီး အော်ဒါတွေနဲ့ ဒီနေ့ ဒီမှာ ပြန်အမ်းလိုက်တဲ့ ရှေ့ရက် အော်ဒါတွေ ရှင်းပြီးတာနဲ့ ဒီစာရင်းမှာ ရောက်လာပါမယ် — အသစ်က အရင်။",
  },
  "floor.settled.outage": {
    en: "Today’s settled orders can’t load right now — the system is unreachable.",
    my: "ဒီနေ့ ငွေရှင်းပြီး အော်ဒါတွေကို အခု မဖတ်နိုင်သေးပါ — စနစ်နဲ့ မဆက်နိုင်ပါ။",
  },
  "floor.settled.stale": {
    en: "Couldn’t refresh — showing the list as of {t}.",
    my: "ပြန်မဖတ်နိုင်ပါ — {t} အချိန်က စာရင်းကို ပြထားပါတယ်။",
  },
  "floor.settled.verb.refresh": { en: "Refresh", my: "ပြန်ဖတ်" },
  "floor.settled.a11y.list": { en: "Orders settled today", my: "ဒီနေ့ ငွေရှင်းပြီး အော်ဒါစာရင်း" },
  "floor.settled.a11y.lines": { en: "Order lines", my: "အော်ဒါ လိုင်းများ" },
  "floor.settled.a11y.rows": { en: "Receipt totals", my: "ပြေစာ စုစုပေါင်းများ" },
  // The receipt's own identity line: its short code (an identifier — Latin), who it was for.
  "floor.settled.code": { en: "Receipt {id}", my: "ပြေစာ {id}" },
  "floor.settled.for": { en: "for {x}", my: "{x} အတွက်" },
  "floor.settled.slot": { en: "Pickup at {t}", my: "{t} မှာ လာယူမယ်" },
  // An earlier day's order the ledger admitted: when today its money moved (Codex round 1 on #283).
  "floor.settled.refundedAt": { en: "refunded {t}", my: "{t} မှာ ပြန်အမ်းပြီး" },
  // The receipt rows (`buildReceiptRows` · `buildRefundRows`) — EN pinned to the artifact's labels,
  // except `row.net`: the artifact says "You paid" to the guest, and a manager is not the guest.
  // The receipt's destination headings (`fulfillmentLabel`), only when an order spans two or more.
  "floor.settled.group.dinein": { en: "At your table", my: "စားပွဲမှာ" },
  "floor.settled.group.togo": { en: "To-go", my: "ပါဆယ်" }, // grounded: kiosk `toGo` (ပါဆယ်)
  "floor.settled.group.grocery": { en: "Grocery", my: "ကုန်စုံ" },
  "floor.settled.row.subtotal": { en: "Subtotal", my: "အခွန်မပါ စုစုပေါင်း" },
  "floor.settled.row.discount": { en: "Discount", my: "လျှော့ငွေ" },
  "floor.settled.row.service": { en: "Service charge (5%)", my: "ဝန်ဆောင်ခ (5%)" },
  "floor.settled.row.tax": { en: "Tax", my: "အခွန်" },
  "floor.settled.row.tip": { en: "Tip", my: "အပိုကြေး" },
  "floor.settled.row.total": { en: "Total", my: "စုစုပေါင်း" },
  "floor.settled.row.net": { en: "Guest paid", my: "ဧည့်သည် ပေးခဲ့တာ" },
  "floor.settled.tender.card": { en: "Card", my: "ကတ်" },
  // The settled-state line (`receiptStatusLabel`, pinned for the two states that carry a tender).
  "floor.settled.status.paid": { en: "Paid in full · {x}", my: "အပြည့် ရှင်းပြီး · {x}" },
  "floor.settled.status.partial": {
    en: "Partly refunded · {x}",
    my: "တစ်စိတ်တစ်ပိုင်း ပြန်အမ်းပြီး · {x}",
  },
  "floor.settled.status.full": { en: "Refunded in full", my: "အပြည့် ပြန်အမ်းပြီး" },
  "floor.settled.chip.partial": { en: "Partly refunded", my: "တစ်စိတ်တစ်ပိုင်း ပြန်အမ်းပြီး" },
  // M183 — how money goes back, from the order's own tender and PaymentIntent, never guessed.
  // Honest about what the screen keeps (Codex round 1 on #283, P1 → M218): no flow records a cash
  // refund yet, so the sentence must not read as if handing the money back is logged anywhere.
  "floor.settled.path.cash": {
    en: "Cash order — record it here first, then hand back the amount this screen confirms. The receipt and the takings follow.",
    my: "ငွေသား အော်ဒါ — ဒီမှာ အရင် မှတ်တမ်းတင်ပြီးမှ ဒီစခရင် အတည်ပြုတဲ့ ပမာဏကို ငွေအံဆွဲကနေ ပြန်အမ်းပါ။ ပြေစာနဲ့ ရငွေစာရင်းက လိုက်ပါလာပါမယ်။",
  }, // K15-HIGH — ⚠️ THE CLAUSE ORDER IS THE SAFETY PROPERTY (Codex round 2 on #286, P1). This said "hand it back from the drawer, THEN record it here", and that ordering hands a guest money before anything has authorized it: on a stale board the RPC answers `already_refunded` or `fully_refunded`, the sheet closes, and the payout exists nowhere. Recording first inverts the failure — the money stays in the till and the books carry a row to reconcile, instead of the money leaving with no trace. It is also the only order in which the manager can hand back the RIGHT number: the server clamps to the order's remaining pool, so the authoritative amount does not exist until the record does
  "floor.settled.path.dashboard": {
    en: "Paid by more than one card — refund each payer’s charge in {x}.",
    my: "ကတ် တစ်ခုထက်ပိုပြီး ရှင်းထားတာ — ပေးသူတစ်ယောက်ချင်းစီရဲ့ ငွေကို {x} မှာ ပြန်အမ်းပါ။",
  }, // K15-HIGH — the instruction that gets a split-payer's money back
  "floor.settled.path.exhausted": {
    en: "Everything this order can give back has been refunded.",
    my: "ဒီအော်ဒါက ပြန်အမ်းနိုင်သမျှ အားလုံး ပြန်အမ်းပြီးပါပြီ။",
  },
  "floor.settled.verb.refund": { en: "Refund", my: "ပြန်အမ်း" },
  "floor.settled.confirmed": {
    en: "Refunded {m} to the card.",
    my: "{m} ကို ကတ်ထဲ ပြန်အမ်းလိုက်ပါပြီ။",
  },
  // M218 (Codex round 1, P1) — the DRAWER's confirmation, and under record-first (round 2, P1) it is
  // also the INSTRUCTION: the amount here is the server's, after its clamp, so this banner is the
  // first place the right figure exists. Past tense would be a claim about a hand-back that has not
  // happened yet — and the manager, reading it, would not make it. Reuses မှတ်တမ်းတင် and အံဆွဲ from
  // `floor.settled.path.cash`.
  "floor.settled.confirmed.cash": {
    en: "Recorded — now hand back {m} from the drawer.",
    my: "မှတ်တမ်းတင်ပြီးပါပြီ — အခု အံဆွဲကနေ {m} ပြန်အမ်းပါ။",
  },

  // ── the refund sheet (one paid line; reason + the manager's own PIN) ────────
  "floor.refund.title": { en: "Refund {x}", my: "{x} ပြန်အမ်း" },
  "floor.refund.amount": { en: "Refund {m}", my: "{m} ပြန်အမ်း" },
  "floor.refund.note": {
    en: "Price + tax, back to the card. Tips — and the service charge on older orders — aren’t included.",
    my: "ဈေးနှုန်းနဲ့ အခွန်ကို ကတ်ထဲ ပြန်ထည့်ပါမယ်။ အပိုကြေးနဲ့ အော်ဒါဟောင်းတွေရဲ့ ဝန်ဆောင်ခ မပါဝင်ပါ။",
  }, // K15-HIGH — what a refund does and does not give back
  // M218 — the same sentence for the DRAWER path. Same two exclusions, same shape; only the
  // destination changes, because on a cash line the money leaves the till by hand and no card is
  // involved. Reuses အပိုကြေး / ဝန်ဆောင်ခ / အခွန် from the card note verbatim; the one new idea is
  // ငွေအံဆွဲကနေ, which `floor.settled.path.cash` already says on the screen behind this sheet.
  "floor.refund.note.cash": {
    en: "Price + tax, to hand back from the drawer once this is recorded. Tips — and the service charge on older orders — aren’t included.",
    my: "ဈေးနှုန်းနဲ့ အခွန်ကို မှတ်တမ်းတင်ပြီးမှ ငွေအံဆွဲကနေ ပြန်အမ်းရပါမယ်။ အပိုကြေးနဲ့ အော်ဒါဟောင်းတွေရဲ့ ဝန်ဆောင်ခ မပါဝင်ပါ။",
  }, // K15-HIGH — what a CASH refund does and does not give back, in the record-first order the screen behind it states
  "floor.refund.clamped": {
    en: "This order has {m} left to give back, so this line refunds {m} — not its full price + tax.",
    my: "ဒီအော်ဒါမှာ ပြန်အမ်းနိုင်တာ {m} ပဲ ကျန်လို့ ဒီလိုင်းကို {m} ပြန်အမ်းပါမယ် — ဈေးနှုန်းနဲ့ အခွန် အပြည့် မဟုတ်ပါ။",
  }, // K15-HIGH — the clamp explained before the tap, in the figure the server will charge back
  "floor.refund.reason": { en: "Reason", my: "အကြောင်းအရင်း" },
  // The refund reasons `refundLineInput` accepts; `sold_out` and `other` reuse the loss sheet's words.
  "floor.refund.reason.unhappy": { en: "Not happy with it", my: "မကျေနပ်လို့" },
  "floor.refund.reason.wrongItem": { en: "Wrong item", my: "မှားပြီး ရောက်လာတာ" },
  "floor.refund.reason.tooSlow": { en: "Took too long", my: "ကြာလွန်းလို့" },
  "floor.refund.reason.duplicate": { en: "Duplicate charge", my: "နှစ်ခါ ကောက်မိတာ" },
  "floor.refund.pin": { en: "Your manager PIN", my: "ကိုယ့် မန်နေဂျာ ပင်နံပါတ်" },
  "floor.refund.working": { en: "Refunding…", my: "ပြန်အမ်းနေပါတယ်…" },
  "floor.refund.err.notPaid": {
    en: "That order isn’t in a refundable state.",
    my: "ဒီအော်ဒါက ပြန်အမ်းလို့ရတဲ့ အခြေအနေ မဟုတ်ပါ။",
  },
  "floor.refund.err.split": {
    en: "Paid by more than one card — refund each payer in {x}.",
    my: "ကတ် တစ်ခုထက်ပိုပြီး ရှင်းထားတာ — ပေးသူတစ်ယောက်ချင်းစီကို {x} မှာ ပြန်အမ်းပါ။",
  },
  "floor.refund.err.stripe": {
    en: "The refund didn’t go through at the card processor — try again.",
    my: "ကတ်ကုမ္ပဏီမှာ ပြန်အမ်းတာ မအောင်မြင်ပါ — ထပ်ကြိုးစားပါ။",
  },
  "floor.refund.err.notManager": {
    en: "Manager access is required to refund.",
    my: "ပြန်အမ်းဖို့ မန်နေဂျာ လုပ်ပိုင်ခွင့် လိုပါတယ်။",
  },
  "floor.refund.err.failed": {
    en: "Couldn’t refund that line — try again.",
    my: "ဒီလိုင်းကို ပြန်မအမ်းနိုင်ပါ — ထပ်ကြိုးစားပါ။",
  },
  // M218 — the ONE refund error where money has already moved. Every other arm here refused before
  // anything left; this one is reached only when the drawer is open and the database cannot record
  // it. So it does not say "try again" — it says the hand-back happened and is not on the books.
  "floor.refund.err.cashNotReady": {
    en: "Not recorded — this screen can’t record a cash refund yet. Don’t hand anything back; tell the owner.",
    my: "မမှတ်တမ်းတင်ရသေးပါ — ငွေသား ပြန်အမ်းတာကို ဒီစခရင်က မမှတ်တမ်းတင်နိုင်သေးပါ။ ဘာမှ ပြန်မအမ်းပါနဲ့ — ပိုင်ရှင်ကို ပြောပါ။",
  }, // K15-HIGH — the sentence that stands between a hand-back and an unrecorded loss. Under record-first it can PREVENT the loss rather than document it: nothing has left the till when this renders, so it says don't start

  // ═══ P2 PR B · lines ═══════════════════════════════════════════════════════════
  // ── the table drill-down: one cart line (StaffLineEditor) ──────────────────
  // Terminal badges. No echo at the call site — a badge cannot legibly stack two scripts.
  "table.line.comped": { en: "Comped · free", my: "အခမဲ့ ပေးထား" },
  "table.line.soldOut": { en: "Sold out", my: "ဖြုတ်ထားပြီ" }, // grounded: browse.price.soldOut
  "table.line.approvalRequested": { en: "Approval requested", my: "ခွင့်ပြုချက် တောင်းထားပြီ" },

  // The two per-line VERBS. Each is the button's visible word AND the head of its accessible name
  // (al()'s `verb` arm), so a K15 correction moves both halves in one edit.
  "table.line.verb.voidComp": { en: "Void / Comp", my: "ဖျက် / အခမဲ့" }, // K15-HIGH — opens the loss sheet; the line leaves the bill
  "table.line.verb.addNote": { en: "Note", my: "မှတ်ချက်" },
  "table.line.verb.editNote": { en: "Edit note", my: "မှတ်ချက် ပြင်" },

  // The W3b kitchen-note editor. {x} is the dish name, rendered verbatim in whatever script the
  // catalog holds it in.
  "table.line.noteLabel": {
    en: "Kitchen note for {x}",
    my: "{x} အတွက် မီးဖိုချောင် မှတ်ချက်",
  }, // glossary: မီးဖိုချောင်
  "table.line.notePlaceholder": {
    en: "e.g. No peanuts — allergy",
    my: "ဥပမာ — မြေပဲ မထည့်ရ၊ ဓာတ်မတည့်",
  }, // grounded: browse.mod.notePlaceholder
  "table.line.save": { en: "Save", my: "သိမ်း" }, // grounded: browse.price.verb.save
  // §17 — the busy label is a stated word, never "…" (the accessible name was literally an ellipsis).
  "table.line.saving": { en: "Saving…", my: "သိမ်းနေပါတယ်…" },

  // ── the loss sheet: void / comp a fired line (LossActionSheet) ─────────────
  // Aria-only names for the two segmented groups. Neither group has visible text of its own, so
  // 2.5.3 has nothing to contain and these can afford the noun that says WHICH choice is being made
  // — the same trade `floor.unregisteredSticker` makes against `floor.unregistered`.
  "table.loss.a11y.action": {
    en: "Void or comp this item",
    my: "ဒီပစ္စည်းကို ဖျက် ဒါမှမဟုတ် အခမဲ့ပေး",
  },
  "table.loss.a11y.reason": {
    en: "Reason for this void or comp",
    my: "ဒီ ဖျက်/အခမဲ့ အတွက် အကြောင်းအရင်း",
  },

  "table.loss.cooking": { en: "already cooking", my: "ချက်နေဆဲ" }, // K15-HIGH — the cue that this loss is real food
  "table.loss.seg.void": { en: "Void (remove)", my: "ဖျက် (ပြန်နုတ်)" },
  "table.loss.seg.comp": { en: "Comp (free)", my: "အခမဲ့ (ငွေမယူ)" },
  "table.loss.hint.void": {
    en: "Cancels the item and removes it from the bill. The kitchen won’t make it.",
    my: "ပစ္စည်းကို ဖျက်ပြီး စာရင်းထဲက ထုတ်ပါမယ်။ မီးဖိုချောင်က မချက်တော့ပါ။",
  }, // K15-HIGH — the one sentence that separates void from comp
  "table.loss.hint.comp": {
    en: "The guest isn’t charged, but the kitchen still makes it.",
    my: "ဧည့်သည်ဆီက ငွေမယူပါ။ ဒါပေမဲ့ မီးဖိုချောင်က ဆက်ချက်ပါမယ်။",
  }, // K15-HIGH

  // The reason codes — server-audited, so the word a cook picks IS the loss record.
  "table.loss.reasonLegend": { en: "Reason", my: "အကြောင်းအရင်း" },
  "table.loss.reason.mistake": { en: "Ordered by mistake", my: "မှားပြီး မှာမိတာ" },
  "table.loss.reason.kitchenError": {
    en: "Kitchen made it wrong",
    my: "မီးဖိုချောင်က မှားချက်မိတာ",
  },
  "table.loss.reason.soldOut": { en: "We ran out", my: "ကုန်သွားတာ" },
  "table.loss.reason.quality": { en: "Quality / guest unhappy", my: "အရည်အသွေး / ဧည့်သည် မကျေနပ်" },
  "table.loss.reason.guestChanged": {
    en: "Guest changed their mind",
    my: "ဧည့်သည် စိတ်ပြောင်းသွားတာ",
  },
  "table.loss.reason.serviceRecovery": { en: "Making it right", my: "ပြန်ဖြေရှင်းပေးတာ" },
  "table.loss.reason.guestCourtesy": { en: "Guest courtesy", my: "ဧည့်သည်ကို ဂုဏ်ပြု" },
  "table.loss.reason.other": { en: "Other", my: "အခြား" },
  "table.loss.reasonRequired": {
    en: "Pick a reason to continue.",
    my: "ဆက်သွားဖို့ အကြောင်းအရင်း ရွေးပါ။",
  },

  // manager-6 / P2t — the sheet's title and the twelve refusals that reached its live region as
  // English literals. The title is two whole keys, not a verb slot: the verb sits in a different
  // place in each tongue. `in_flight` reuses `table.appr.msg.inFlight`; "pick a reason" reuses
  // `table.loss.reasonRequired`; the "use Void" hint quotes the segment's own word through `{x}`.
  "table.loss.title.void": { en: "Void “{x}”", my: "“{x}” ဖျက်" },
  "table.loss.title.comp": { en: "Comp “{x}”", my: "“{x}” အခမဲ့" },
  "table.loss.msg.notOpen": {
    en: "This table’s order is no longer open.",
    my: "ဒီစားပွဲရဲ့ အော်ဒါ ပိတ်သွားပြီ။",
  },
  "table.loss.msg.notFound": {
    en: "That item isn’t on this table anymore.",
    my: "ဒီပစ္စည်း ဒီစားပွဲမှာ မရှိတော့ပါ။",
  },
  "table.loss.msg.failed": {
    en: "Couldn’t do that just now — please try again.",
    my: "အခု မလုပ်နိုင်သေးပါ — ထပ်ကြိုးစားပါ။",
  },
  "table.loss.msg.alreadyPending": {
    en: "A manager request is already open for this item.",
    my: "ဒီပစ္စည်းအတွက် မန်နေဂျာ တောင်းဆိုချက် ဖွင့်ထားပြီးသား။",
  },
  "table.loss.msg.noApprovalNeeded": {
    en: "This one doesn’t need a manager — use “{x}”.",
    my: "ဒီဟာ မန်နေဂျာ မလိုပါ — “{x}” ကို သုံးပါ။",
  },
  "table.loss.msg.sendFailed": {
    en: "Couldn’t send that request — please try again.",
    my: "တောင်းဆိုချက် မပို့နိုင်သေးပါ — ထပ်ကြိုးစားပါ။",
  },
  "table.loss.managerLegend": { en: "Manager approval", my: "မန်နေဂျာ ခွင့်ပြုချက်" },
  "table.loss.sending": { en: "Sending…", my: "ပို့နေပါတယ်…" },
  "table.loss.working": { en: "Working…", my: "လုပ်နေပါတယ်…" },
  // Two whole keys per action rather than one with a {x} verb slot: the verb sits in a different
  // place in each tongue (Burmese is SOV), so a shared template would read wrong in one of them.
  "table.loss.requestApproval.void": {
    en: "Request a manager’s approval to void",
    my: "ဖျက်ဖို့ မန်နေဂျာ ခွင့်ပြုချက် တောင်းမယ်",
  },
  "table.loss.requestApproval.comp": {
    en: "Request a manager’s approval to comp",
    my: "အခမဲ့ပေးဖို့ မန်နေဂျာ ခွင့်ပြုချက် တောင်းမယ်",
  },
  "table.loss.confirm.void": { en: "Void item", my: "ပစ္စည်း ဖျက်" }, // K15-HIGH — the tap that removes a fired line
  "table.loss.confirm.comp": { en: "Comp item", my: "ပစ္စည်း အခမဲ့ပေး" }, // K15-HIGH — the tap that gives food away
  "table.loss.confirmApproval.void": { en: "Void with approval", my: "ခွင့်ပြုချက်နဲ့ ဖျက်" }, // K15-HIGH
  "table.loss.confirmApproval.comp": { en: "Comp with approval", my: "ခွင့်ပြုချက်နဲ့ အခမဲ့ပေး" }, // K15-HIGH
  "table.loss.noManager": {
    en: "No manager here? Request approval",
    my: "မန်နေဂျာ မရှိဘူးလား? ခွင့်ပြုချက် တောင်းပါ",
  },

  // ═══ P2 PR B · menu ═══════════════════════════════════════════════════════════
  // ── /staff/menu — the price + availability screen (W17b · W23a) ───────────
  // MONEY SURFACE. Every amount reaches these strings through an `{m}` / `{old}` slot already
  // formatted by `dollars()` (Latin, integer cents), so no value here carries a digit of either
  // script and nothing recomputes an amount.
  "browse.price.title": { en: "Menu prices", my: "မီနူး ဈေးနှုန်း" },
  "browse.price.titleAvail": { en: "Menu availability", my: "မီနူး ရနိုင်မှု" },
  "browse.price.leadManager": {
    en: "One price per dish — dine-in and to-go ring the same amount, the way the register does. A change takes effect on the next order; lines already in a cart keep the price they were quoted, and paid orders never change. Every edit is recorded with your name.",
    my: "ဟင်းတစ်မျိုးကို ဈေးတစ်ခုတည်း — ဆိုင်မှာစားရော ပါဆယ်ရော အတူတူ၊ ကောင်တာမှာလိုပဲ။ ပြောင်းလိုက်ရင် နောက်အော်ဒါကစပြီး သက်ရောက်ပါတယ်။ အော်ဒါထဲ ရောက်နေပြီးသားတွေက ပြောထားတဲ့ ဈေးအတိုင်းပဲ၊ ငွေရှင်းပြီးသား အော်ဒါတွေလည်း မပြောင်းပါ။ ဘယ်သူ ပြင်တယ်ဆိုတာ အကုန် မှတ်ထားပါတယ်။",
  },
  "browse.price.leadServer": {
    en: "Take a dish off the menu the moment you run out — nobody can order it until someone puts it back, and there is no timer that does it for you. Prices are managers only. Every change is recorded with your name.",
    my: "ကုန်သွားတာနဲ့ ဟင်းကို မီနူးက ချက်ချင်း ဖြုတ်ပါ — တစ်ယောက်ယောက် ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။ အလိုအလျောက် ပြန်တင်ပေးမယ့် အချိန်တိုင်း မရှိပါ။ ဈေးနှုန်းက မန်နေဂျာ သီးသန့်။ ဘယ်သူ ပြောင်းတယ်ဆိုတာ အကုန် မှတ်ထားပါတယ်။",
  },
  "browse.price.find": { en: "Find a dish", my: "ဟင်း ရှာပါ" },
  "browse.price.noMatch": {
    en: "No dish matches “{x}”.",
    my: "“{x}” နဲ့ ကိုက်ညီတဲ့ ဟင်း မရှိပါ။",
  },

  // The sold-out flag on a row. Leading " · " sits INSIDE the value, the way `kds.held` carries its
  // own separator; {t} is a clock time and stays Latin in both tongues.
  "browse.price.soldOut": { en: " · sold out", my: " · ဖြုတ်ထားပြီ" },
  // menu-4 — {t} is the clock alone on the same service day and `Sep 15, 6:40 PM` on any other
  // (`lib/sold-out-since.ts` decides; the row tints the older one). ONE key on purpose: the
  // sentence is the same, only the stamp grows a day.
  "browse.price.soldOutSince": {
    en: " · sold out since {t}",
    my: " · {t} ကတည်းက ဖြုတ်ထားပြီ",
  },
  // The sold-out chip beside the search (the audit's "find the flags that outlived their shift"
  // affordance). {n} is a prose count → Burmese numerals.
  "browse.price.soldOutOnly": { en: "Sold out ({n})", my: "ဖြုတ်ထားတာ ({n})" },
  // The empty state UNDER the chip: the needle searched only what is off the menu, and the
  // sentence must say so — `browse.price.noMatch` while the chip hides a matching dish is false.
  "browse.price.noMatchSoldOut": {
    en: "No sold-out dish matches “{x}”.",
    my: "“{x}” နဲ့ ကိုက်ညီတဲ့ ဖြုတ်ထားတဲ့ ဟင်း မရှိပါ။",
  },

  // ── VERBS — the visible word on a control, and the word its name leads with ─
  // `86` is kitchen jargon on a 44px pill and stays the English console's word verbatim; the Burmese
  // is the glossary's ဖြုတ်, the same verb `kds.86` uses.
  "browse.price.verb.eightySix": { en: "86", my: "ဖြုတ်" },
  "browse.price.verb.putBack": { en: "Put back", my: "ပြန်တင်" },
  "browse.price.verb.edit": { en: "Edit", my: "ပြင်" },
  "browse.price.verb.cancel": { en: "Cancel", my: "မလုပ်တော့" },
  "browse.price.verb.save": { en: "Save", my: "သိမ်း" },
  // The confirm group's visible lead AND the word its accessible name leads with (rule 3c makes
  // those one edit). K15-HIGH — the last screen before a price every future guest pays.
  "browse.price.verb.confirm": { en: "Confirm the new price", my: "ဈေးအသစ် အတည်ပြု" },

  // ── the two-step price confirm ─────────────────────────────────────────────
  // {old} is the price on screen now and {m} the price about to be set — both preformatted by
  // `dollars()`, both Latin in both tongues. Two money slots in one sentence because Burmese is SOV
  // and the amounts cannot be split across elements without stranding the verb.
  "browse.price.confirmQ": {
    en: "Change {x} from {old} to {m}?",
    my: "{x} ကို {old} ကနေ {m} ပြောင်းမလား။",
  }, // K15-HIGH
  "browse.price.confirmDetail": {
    en: "Every new order pays the new price. Lines already in a cart keep what they were quoted, and paid orders never change.",
    my: "အော်ဒါအသစ်တိုင်း ဈေးအသစ်နဲ့ ရှင်းရပါမယ်။ အော်ဒါထဲ ရောက်နေပြီးသားတွေက ပြောထားတဲ့ ဈေးအတိုင်းပဲ၊ ငွေရှင်းပြီးသား အော်ဒါတွေ မပြောင်းပါ။",
  },
  "browse.price.keep": { en: "Keep {m}", my: "{m} အတိုင်း ထား" }, // K15-HIGH — the way out
  "browse.price.set": { en: "Set {m}", my: "{m} သတ်မှတ်" }, // K15-HIGH — the tap that charges it
  "browse.price.saving": { en: "Saving…", my: "သိမ်းနေပါတယ်…" },
  // menu-5 — WHY Save is refused, said beside the field (`lib/menu-price-draft.ts` decides). {m}
  // is a preformatted amount or the example shape `14.50`, Latin in both tongues.
  "browse.price.draft.below": { en: "Lowest price is {m}", my: "အနိမ့်ဆုံး ဈေးက {m} ပါ" },
  "browse.price.draft.above": { en: "Highest price is {m}", my: "အမြင့်ဆုံး ဈေးက {m} ပါ" },
  "browse.price.draft.nan": { en: "Numbers only, like {m}", my: "ဂဏန်းသာ ရိုက်ပါ၊ {m} လိုမျိုး" },
  "browse.price.draft.unchanged": {
    en: "That’s the current price",
    my: "အခု ဈေးအတိုင်းပဲ ဖြစ်နေပါတယ်",
  },
  "browse.price.draft.empty": {
    en: "Enter a price, like {m}",
    my: "ဈေး ရိုက်ထည့်ပါ၊ {m} လိုမျိုး",
  },

  // ── the view's ONE live region ─────────────────────────────────────────────
  "browse.price.live.off": {
    en: "{x} is off the menu — nobody can order it until you put it back.",
    my: "{x} ကို မီနူးက ဖြုတ်ပြီ — ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။",
  }, // K15-HIGH
  "browse.price.live.on": {
    en: "{x} is back on the menu.",
    my: "{x} ကို မီနူးမှာ ပြန်တင်ပြီးပြီ။",
  },
  "browse.price.live.saved": {
    en: "{x} is now {m}. Lines already in a cart keep the price they were quoted.",
    my: "{x} က အခု {m} ဖြစ်ပါပြီ။ အော်ဒါထဲ ရောက်နေပြီးသားတွေက ပြောထားတဲ့ ဈေးအတိုင်းပဲ။",
  }, // K15-HIGH — the only confirmation that a charged amount moved
  "browse.price.err.flipUnknown": {
    en: "Couldn’t reach the menu — {x} may or may not have changed. Check the row and try again.",
    my: "မီနူးနဲ့ ဆက်သွယ်လို့ မရပါ — {x} ပြောင်းသွားလား မသေချာပါ။ အတန်းကို ကြည့်ပြီး ထပ်စမ်းပါ။",
  },
  "browse.price.err.saveUnknown": {
    en: "Couldn’t reach the menu — the save may not have landed. Check the price and try again.",
    my: "မီနူးနဲ့ ဆက်သွယ်လို့ မရပါ — သိမ်းတာ မရောက်သေးတာ ဖြစ်နိုင်ပါတယ်။ ဈေးကို ကြည့်ပြီး ထပ်စမ်းပါ။",
  },

  // ── names with no visible text to pair with ────────────────────────────────
  // TWO names because the PAGE has two headings: a server sees "Menu availability" (they are not
  // offered the price editor at all) and a manager sees "Menu prices". One unconditional name left
  // a server on a page headed one thing whose only list announced the other. The literal had the
  // same defect; moving it into a key was the moment to split it.
  "browse.price.a11y.list": { en: "Menu prices", my: "မီနူး ဈေးနှုန်းများ" },
  // A4·5 — the printed word-check sheet (`/staff/glossary`) is this screen's action, a print
  // circle in the bar named by sr-only text; its words are `pilot.gloss.title`'s, the sheet's own.
  "browse.price.wordCheck": { en: "Word check", my: "စာလုံး စစ်ဆေးစာရွက်" },
  "browse.price.a11y.listAvail": { en: "Menu availability", my: "မီနူး ရနိုင်မှု" },
  // The price field's sr-only <label>. It carries the dish, so it is `tf()`/<Chrome>, never `sx()`.
  "browse.price.a11y.newPrice": {
    en: "New price for {x}, in dollars",
    my: "{x} အတွက် ဈေးအသစ်၊ ဒေါ်လာနဲ့",
  },

  // ═══ P2 PR B · people ═══════════════════════════════════════════════════════════
  // ── the floor: guest feedback triage (a zone of /staff/tips since A4·5) ──
  // The star name is aria-ONLY and takes TWO count slots, so it goes through `tf`, not `sx` —
  // `sx()` takes no vars. Both {n} and {total} are prose counts and become Burmese numerals.
  "floor.fb.title": { en: "Guest feedback", my: "ဧည့်သည် မှတ်ချက်" },
  "floor.fb.empty": {
    en: "No feedback yet. Diners are asked to rate after every order.",
    my: "မှတ်ချက် မရှိသေးပါ။ အော်ဒါတိုင်း ပြီးတိုင်း ဧည့်သည်တွေကို အဆင့်ပေးဖို့ တောင်းပါတယ်။",
  },
  // P5 ∩ P2 — the READ-FAILED sentence, distinct from `floor.fb.empty` because "no feedback yet" on
  // a read that never happened is a fabricated verdict (M116/M119). MY is a Claude-authored working
  // draft pending Min's native check (K15); it reuses `pilot.night.unavailable`'s shape deliberately
  // — one screen, one way of saying "we could not read this" — while naming a different subject, so
  // the two do not collide.
  "floor.fb.unavailable": {
    en: "We can’t read the feedback list right now — nothing is lost. Try again in a moment.",
    my: "ဧည့်သည် မှတ်ချက်စာရင်းကို အခု မဖတ်နိုင်သေးပါ။ ဘာမှ မပျောက်ပါ — ခဏနေ ထပ်စမ်းပါ။",
  },
  // The EN pair fixes a live agreement bug: the one-arm read "1 recent rating need follow-up".
  // ⚠️ "recent" is `မကြာသေးမီက` — the RETROSPECTIVE form — in all six keys that carry it, here and at
  // `floor.orders.*`. The first cut of this block wrote `မကြာမီက` on four of them, which is the
  // PROSPECTIVE word ("before long"), on screens that are entirely about the past; two independent
  // audits found it as a fork before either noticed the meaning. No guard catches it: the collision
  // test fires on two keys SHARING a Burmese value, not on one English word wearing two Burmese
  // coats. Reuse this form; do not invent a third.
  "floor.fb.low.one": {
    en: "{n} recent rating needs follow-up.",
    my: "မကြာသေးမီက အဆင့် {n} ခု ပြန်လိုက်ဖို့ လိုပါတယ်။",
  },
  "floor.fb.low.many": {
    en: "{n} recent ratings need follow-up.",
    my: "မကြာသေးမီက အဆင့် {n} ခု ပြန်လိုက်ဖို့ လိုပါတယ်။",
  },
  "floor.fb.allGood": {
    en: "All recent ratings look good.",
    my: "မကြာသေးမီက အဆင့်တွေ အားလုံး ကောင်းပါတယ်။",
  },
  "floor.fb.followUp": { en: "Needs follow-up", my: "ပြန်လိုက်ရန်" },
  "floor.fb.a11y.list": { en: "Recent guest feedback", my: "မကြာသေးမီက ဧည့်သည် မှတ်ချက်များ" },
  "floor.fb.a11y.stars": { en: "{n} of {total} stars", my: "ကြယ် {total} ထဲမှ {n} ကြယ်" },

  // ── the floor: tips today (/staff/tips) ───────────────────────────────────
  // {m} is preformatted money and stays Latin; {n} is a prose count and becomes Burmese numerals.
  // {x} in `staffFallback` is the shortened staff id — data, rendered verbatim.
  "floor.tips.title": { en: "Tips today", my: "ဒီနေ့ အပိုကြေး" },
  "floor.tips.sub.all": {
    en: "Everything guests tipped since midnight, and who took it.",
    my: "သန်းခေါင်ကတည်းက ဧည့်သည်တွေ ပေးထားတဲ့ အပိုကြေး အားလုံးနဲ့ ဘယ်သူ ယူသွားလဲ။",
  },
  "floor.tips.sub.self": {
    en: "What you were handed since midnight.",
    my: "သန်းခေါင်ကတည်းက ကိုယ် ရခဲ့တာတွေ။",
  },
  "floor.tips.sub.real": {
    en: "Real amounts only — nothing here is an estimate or a projection.",
    my: "အမှန်တကယ် ပမာဏတွေသာ — ဒီမှာ ခန့်မှန်းချက် တစ်ခုမှ မပါပါ။",
  },
  "floor.tips.total.all": { en: "All tips today", my: "ဒီနေ့ အပိုကြေး အားလုံး" },
  "floor.tips.total.self": { en: "Your tips today", my: "ဒီနေ့ ကိုယ်ရတဲ့ အပိုကြေး" },
  "floor.tips.people": { en: "Handed to a person", my: "လူတစ်ယောက် လက်ခံထားတာ" },
  "floor.tips.people.empty.all": {
    en: "Nobody has settled a tipped order yet today.",
    my: "ဒီနေ့ အပိုကြေးပါတဲ့ အော်ဒါ ဘယ်သူမှ မရှင်းရသေးပါ။",
  },
  "floor.tips.people.empty.self": {
    en: "You haven’t settled a tipped order yet today.",
    my: "ဒီနေ့ အပိုကြေးပါတဲ့ အော်ဒါ ကိုယ် မရှင်းရသေးပါ။",
  },
  "floor.tips.a11y.people": { en: "Tips by person", my: "လူအလိုက် အပိုကြေး" },
  // The name lookup is deliberately non-fatal, so the fallback is CHROME, not data — it was the one
  // authored string on this page built outside JSX, where no guard reaches it.
  "floor.tips.staffFallback": { en: "Staff #{x}", my: "ဝန်ထမ်း #{x}" },
  "floor.tips.you": { en: " · you", my: " · ကိုယ်" },
  "floor.tips.orders.one": { en: "{n} order", my: "အော်ဒါ {n} ခု" },
  "floor.tips.orders.many": { en: "{n} orders", my: "အော်ဒါ {n} ခု" },
  "floor.tips.phone": { en: "Paid on a phone", my: "ဖုန်းနဲ့ ရှင်းထား" },
  "floor.tips.phone.empty": {
    en: "No tips from phone payments yet today.",
    my: "ဒီနေ့ ဖုန်းနဲ့ ရှင်းတာကနေ အပိုကြေး မရသေးပါ။",
  },
  // ONE sentence, split at the <strong> that emphasises the amount: `Chrome`'s slot filler emits
  // text and <span lang="en">, never arbitrary markup, so the emphasis can only survive as a split.
  // Both halves are echo={false} — an English echo between the two halves would break the sentence
  // in BOTH tongues, and the amount itself is Latin and identical either way.
  "floor.tips.shared.lead": {
    en: "Guests who paid on their own phones tipped",
    my: "ကိုယ်ပိုင်ဖုန်းနဲ့ ရှင်းသွားတဲ့ ဧည့်သည်တွေ ပေးထားတဲ့ အပိုကြေး",
  },
  "floor.tips.shared.tail.one": {
    en: "across {n} order. Nobody handed this to anyone, so it isn’t credited to a person — how it’s shared is the owner’s call, and this screen won’t guess at it.",
    my: "— အော်ဒါ {n} ခုမှ။ ဘယ်သူ့လက်ကိုမှ တိုက်ရိုက် မရောက်လို့ ဘယ်သူ့အတွက်မှ မမှတ်ထားပါ — ဘယ်လို ခွဲဝေမလဲဆိုတာ ပိုင်ရှင် ဆုံးဖြတ်မှာပါ။ ဒီစခရင်ကလည်း မခန့်မှန်းပါ။",
  },
  "floor.tips.shared.tail.many": {
    en: "across {n} orders. Nobody handed this to anyone, so it isn’t credited to a person — how it’s shared is the owner’s call, and this screen won’t guess at it.",
    my: "— အော်ဒါ {n} ခုမှ။ ဘယ်သူ့လက်ကိုမှ တိုက်ရိုက် မရောက်လို့ ဘယ်သူ့အတွက်မှ မမှတ်ထားပါ — ဘယ်လို ခွဲဝေမလဲဆိုတာ ပိုင်ရှင် ဆုံးဖြတ်မှာပါ။ ဒီစခရင်ကလည်း မခန့်မှန်းပါ။",
  },
  "floor.tips.selfNote": {
    en: "You’re seeing your own line. Managers see the whole team’s.",
    my: "ကိုယ့်စာကြောင်းကိုပဲ မြင်နေတာပါ။ မန်နေဂျာတွေက အဖွဲ့တစ်ခုလုံးကို မြင်ပါတယ်။",
  },

  // ── the team roster — a manager zone of the sign-in screen since A4·4 (/staff/login#team-h) ──
  // `ownersOnly` is the non-owner DEAD END. Its language control is mounted there too: a person who
  // cannot read English must not land on that screen with no way to change the console's language.
  "floor.team.title": { en: "Team", my: "ဝန်ထမ်းများ" },
  "floor.team.sub": {
    en: "Add staff by email — they’ll sign in with a one-time code. Deactivate to offboard without losing history.",
    my: "အီးမေးလ်နဲ့ ဝန်ထမ်း ထည့်ပါ — တစ်ကြိမ်သုံး ကုဒ်နဲ့ ဝင်ပါလိမ့်မယ်။ မှတ်တမ်း မပျောက်စေဘဲ ထုတ်ဖို့ ရပ်ဆိုင်းပါ။",
  },
  "floor.team.managersOnly": { en: "Managers only", my: "မန်နေဂျာများသာ" },
  "floor.team.managersOnly.body": {
    en: "Managing the team is limited to managers and the owner.",
    my: "ဝန်ထမ်း စီမံခန့်ခွဲမှုကို မန်နေဂျာနဲ့ ပိုင်ရှင်တွေသာ လုပ်နိုင်ပါတယ်။",
  },
  "floor.team.a11y.roster": { en: "Staff", my: "ဝန်ထမ်း စာရင်း" },
  // A4·4 — the roster is a zone of the sign-in screen; a failed read prints this under the zone's
  // heading instead of throwing the whole screen (the person's own card is above it).
  // ⚠️ It promises NOTHING about the card above it. The first draft said "Your PIN and sign-out
  // above still work" — but `listStaff` and `getStaffAuth` read the SAME `staff` table through the
  // SAME client, so the fault that prints this line is the fault that makes `setPin` answer
  // `outage` (blind pass, CRITICAL). Copy promises only what the code keeps.
  "floor.team.outage": {
    en: "We can’t reach the ordering system — the roster can’t load right now. Try again in a moment.",
    my: "အော်ဒါ စနစ်နဲ့ ဆက်သွယ်မရလို့ ဝန်ထမ်း စာရင်းကို အခု မဖွင့်နိုင်သေးပါ။ ခဏနေ ထပ်စမ်းပါ။",
  },
  // The SUCCESS half of TeamManager's one live region. The failure half is <OutageText>; wrapping a
  // success literal in it would pass it through as English forever while looking converted.
  "floor.team.added": {
    en: "Added — they can now sign in with a one-time code.",
    my: "ထည့်ပြီးပါပြီ — တစ်ကြိမ်သုံး ကုဒ်နဲ့ ဝင်နိုင်ပါပြီ။",
  },
  // A6 — the role control. `roleChanged` is the SUCCESS half of the same one live region as
  // `floor.team.added`; the failure half stays <OutageText>.
  "floor.team.roleChanged": {
    en: "Role updated.",
    my: "ရာထူး ပြောင်းပြီးပါပြီ။",
  },
  // signin-2 — the two refusals the add form can explain itself, SAID in the view's live region
  // with focus moved to the field (the greyed submit they replace explained nothing, and a disabled
  // default button blocks Enter too — `SignedInCard`'s rule). Claude-authored drafts pending K15.
  "floor.team.err.name": { en: "Enter their name.", my: "သူ့နာမည် ထည့်ပါ။" },
  "floor.team.err.email": {
    en: "Enter the email they’ll sign in with.",
    my: "သူ ဝင်မယ့် အီးမေးလ် ထည့်ပါ။",
  },

  // ═══ P2 PR B · reg ═══════════════════════════════════════════════════════════
  // ── the register (FOH counter): identity and the page's own frame ─────────
  // `reg.back` carries the same two words as `kds.back`/`floor.back` and stays its OWN key for the
  // reason stated there: K15 is a per-key native check, and the counter's exit may want different
  // wording from the kitchen's. The arrow lives INSIDE the value — it is part of the label, not a
  // decorative glyph beside it.
  // A4·2 — the register is a ZONE of the counter's one screen now (`/staff/register` redirects), so
  // it has no title and no back link of its own; `reg.sub` is the line under the Start heading.
  "reg.sub": {
    en: "Walk-up and phone orders, entered here and paid at the counter.",
    my: "လမ်းလျှောက်လာနဲ့ ဖုန်း အော်ဒါတွေကို ဒီမှာ သွင်းပြီး ကောင်တာမှာ ငွေရှင်းပါတယ်။",
  },

  // ── the register: the Start zone (RegisterStart.tsx) ──────────────────────
  // The three arms are ACTION labels; `reg.row.walkup` below is the same English word as a NOUN on a
  // queue row. Two keys on purpose — a native check that lengthens the button ("လမ်းလျှောက်လာ
  // အော်ဒါ") must not also rewrite the name printed on an unnamed order.
  "reg.start.walkup": { en: "Walk-up", my: "လမ်းလျှောက်လာ" },
  "reg.start.phone": { en: "Phone order", my: "ဖုန်း အော်ဒါ" }, // glossary: အော်ဒါ
  "reg.start.table": { en: "Start a table", my: "စားပွဲ ဖွင့်" }, // glossary: စားပွဲ
  "reg.phone.label": { en: "Caller’s name", my: "ခေါ်သူ့ နာမည်" },
  "reg.phone.placeholder": { en: "First name", my: "နာမည်" },
  "reg.table.label": { en: "Table number", my: "စားပွဲ နံပါတ်" },
  // {id} is an EXAMPLE table number — Latin in both tongues, and a slot rather than a literal
  // because no dictionary VALUE may carry a digit of either script.
  "reg.table.placeholder": { en: "e.g. {id}", my: "ဥပမာ {id}" },
  "reg.go": { en: "Start", my: "စဖွင့်" },
  "reg.going": { en: "Starting…", my: "ဖွင့်နေပါတယ်…" },
  // The ONE client-authored failure the Start zone raises itself. It needs its own key because
  // <OutageText> only swaps the write-outage twin and would pass this through as English forever.
  "reg.err.table": { en: "Enter the table number.", my: "စားပွဲ နံပါတ် ထည့်ပါ။" },

  // ── the register: the open-counter queue ──────────────────────────────────
  "reg.row.walkup": { en: "Walk-up", my: "လမ်းလျှောက်လာ" },
  "reg.row.kiosk": { en: "Kiosk", my: "အော်ဒါစက်" }, // the SAME word settle.cash.kiosk* uses
  // {n} is a prose count (Burmese numerals); {m} is preformatted money (Latin, always).
  "reg.row.one": { en: "{n} item · {m} + tax", my: "ပစ္စည်း {n} ခု · {m} + အခွန်" },
  "reg.row.many": { en: "{n} items · {m} + tax", my: "ပစ္စည်း {n} ခု · {m} + အခွန်" },
  // The queue row's verb. The row's VISIBLE label is the guest's name and the line meta — the
  // `recall` inversion — so the verb leads the announcement and the visible text is what the name
  // must contain. `al(lang, {kind:"verb"})` builds it from the very same renders the row shows.
  // ဆက်လုပ်, not ပြန်ဖွင့် — `floor.verb.reactivate` ("Reactivate", a staff member) already reads
  // ပြန်ဖွင့်, and two CONTROL labels that do different things should not read identically even on
  // different screens. The surface-scoped collision guard in strings.test.ts deliberately does not
  // flag this one (cross-surface sharing is the namespace working as intended); it was found by
  // reading the whole corpus at once, which is what the printed K15 glossary will make routine.
  "reg.verb.resume": { en: "Resume", my: "ဆက်လုပ်" },

  // ── the register: the day's takings (the Z-report-lite, manager+) ─────────
  "reg.day.title": { en: "Today’s takings", my: "ဒီနေ့ ရငွေ" },
  "reg.day.cash": { en: "Cash", my: "ငွေသား" },
  "reg.day.terminal": { en: "Card · reader", my: "ကတ် · ဖတ်စက်" },
  "reg.day.card": { en: "Card · online", my: "ကတ် · အွန်လိုင်း" },
  "reg.day.orders.one": { en: "{n} order", my: "အော်ဒါ {n} ခု" },
  "reg.day.orders.many": { en: "{n} orders", my: "အော်ဒါ {n} ခု" },
  "reg.day.tips": { en: "incl. {m} tips", my: "အပိုကြေး {m} ပါဝင်" },
  // M218 — the two figures the drawer needs now that a cash refund can be RECORDED: what went back
  // out of the till today, and what should be in it after that. Both ride the cash cell beside the
  // tip breakdown, and both carry `{m}` — a preformatted AMOUNT, so its numerals stay Latin (the
  // dictionary's money rule) while the words around them follow the device language. The Burmese
  // reuses ပြန်အမ်း (`floor.settled.verb.refund`) and အံဆွဲ (`floor.settled.path.cash`) — the words
  // the same manager already reads one screen away.
  "reg.day.handedBack": { en: "{m} handed back", my: "{m} ပြန်အမ်းပြီး" },
  "reg.day.inDrawer": { en: "{m} in drawer", my: "အံဆွဲထဲ {m}" },
  // M218 (Codex round 3, P2) — the OTHER side of the signed net. `inDrawer` with a negative figure
  // reads "-$15.00 in drawer", which is not a number anyone can count a till to. Below zero the day
  // gave back more cash than it took, so the drawer is SHORT by the positive magnitude. Reuses
  // အံဆွဲ from `reg.day.inDrawer` and လိုနေ (short/lacking) as the one new idea.
  "reg.day.short": { en: "{m} short in drawer", my: "အံဆွဲထဲ {m} လိုနေ" },
  "reg.day.refunded.one": {
    en: "{n} order paid today and since fully refunded ({m}) — not counted above. An earlier day’s order refunded here today shows under Settled today, not in these totals.",
    my: "ဒီနေ့ ငွေရှင်းပြီးမှ အပြည့် ပြန်အမ်းလိုက်တဲ့ အော်ဒါ {n} ခု ({m}) — အပေါ်က စာရင်းမှာ မပါပါ။ ရှေ့ရက်က အော်ဒါကို ဒီနေ့ ဒီမှာ ပြန်အမ်းထားရင် ဒီစုစုပေါင်းမှာ မဟုတ်ဘဲ ဒီနေ့ ငွေရှင်းပြီး အော်ဒါများ စာရင်းမှာ ပြပါတယ်။",
  },
  "reg.day.refunded.many": {
    en: "{n} orders paid today and since fully refunded ({m}) — not counted above. An earlier day’s order refunded here today shows under Settled today, not in these totals.",
    my: "ဒီနေ့ ငွေရှင်းပြီးမှ အပြည့် ပြန်အမ်းလိုက်တဲ့ အော်ဒါ {n} ခု ({m}) — အပေါ်က စာရင်းမှာ မပါပါ။ ရှေ့ရက်က အော်ဒါကို ဒီနေ့ ဒီမှာ ပြန်အမ်းထားရင် ဒီစုစုပေါင်းမှာ မဟုတ်ဘဲ ဒီနေ့ ငွေရှင်းပြီး အော်ဒါများ စာရင်းမှာ ပြပါတယ်။",
  },
  // Zone-neutral (Codex round 2 on #283): the takings floor on the CONFIGURED service zone
  // (`readServiceDay`), so the note must not name a city the owner's setting may not be.
  "reg.day.note": {
    en: "Since the service day began. Order totals by status — line-level refunds aren’t netted out; Settled today, below, shows each one on its order.",
    my: "ဒီနေ့ ဝန်ဆောင်မှုနေ့ စကတည်းက။ အော်ဒါ စုစုပေါင်းကို အခြေအနေအလိုက် ခွဲပြထားပါတယ် — တစ်လိုင်းချင်း ပြန်အမ်းငွေတွေ မနုတ်ထားပါ။ အောက်က ဒီနေ့ ငွေရှင်းပြီး အော်ဒါများ စာရင်းမှာ အော်ဒါတစ်ခုချင်းအလိုက် ပြပါတယ်။",
  },
  "reg.day.outage": {
    en: "Today’s takings can’t load right now — the system is unreachable.",
    my: "ဒီနေ့ ရငွေကို အခု မဖတ်နိုင်သေးပါ — စနစ်နဲ့ မဆက်နိုင်ပါ။",
  },

  // ── the register: accessible names with no visible text to pair with ──────
  "reg.a11y.start": { en: "Start an order", my: "အော်ဒါ စဖွင့်" },

  // ═══ P2 PR B · settle ═══════════════════════════════════════════════════════════
  // ── settling a cart: cash, the card on file, the reader, clear and merge ──
  // The money surfaces. Every value rides a slot NAMED for what it is — {m} the total, {tip} the tip
  // beside it, {id} the table being settled, {into} the table a merge moves INTO — and every one of
  // them stays LATIN in both tongues. These are the strings a cashier reads while counting notes, so
  // a Burmese numeral in a total is a mis-read waiting to happen. Only WORDS are translated here,
  // and no key carries a digit of either script.
  "settle.cancel": { en: "Cancel", my: "မလုပ်တော့ပါ" }, // grounded: common `cancel`
  "settle.back": { en: "Back", my: "နောက်သို့" }, // grounded: kiosk `back`
  "settle.confirm": { en: "Confirm", my: "အတည်ပြု" },

  // ── cash settle (the two-step confirm at the counter and at the table) ────
  "settle.cash.trigger": { en: "Settle in cash · {m}", my: "ငွေသားနဲ့ ရှင်း · {m}" },
  "settle.cash.triggerTab": { en: "Close tab · cash · {m}", my: "စာရင်းပိတ် · ငွေသား · {m}" },
  // K29(b) — the cash confirm is the shared sheet now; its title names the act WITHOUT the amount
  // (the question below carries it, tip-inclusive, and a title that quoted the pre-tip figure would
  // put two different numbers on one sheet). Grounded: the two trigger keys above, amount dropped.
  "settle.cash.title": { en: "Settle in cash", my: "ငွေသားနဲ့ ရှင်း" },
  "settle.cash.titleTab": { en: "Close tab · cash", my: "စာရင်းပိတ် · ငွေသား" },
  "settle.cash.take": { en: "Take {m} in cash?", my: "ငွေသား {m} လက်ခံမလား?" }, // K15-HIGH — the amount actually collected
  "settle.cash.tipBreakdown": { en: "({m} + {tip} tip)", my: "({m} + အပိုကြေး {tip})" },
  "settle.cash.closesTab": { en: "This closes the tab.", my: "ဒါနဲ့ စာရင်း ပိတ်ပါမယ်။" },
  "settle.cash.closesOrder": { en: "This closes the order.", my: "ဒါနဲ့ အော်ဒါ ပိတ်ပါမယ်။" }, // glossary: အော်ဒါ
  "settle.cash.settling": { en: "Settling…", my: "ရှင်းနေပါတယ်…" },
  "settle.cash.settleAmount": { en: "Settle {m}", my: "{m} ရှင်း" }, // K15-HIGH — the tap that takes the money
  "settle.cash.hint": {
    en: "Includes sales tax. A cash tip is handled separately.",
    my: "ရောင်းခွန် ပါဝင်ပါတယ်။ ငွေသား အပိုကြေးကို သီးခြား ကိုင်တွယ်ပါတယ်။",
  }, // grounded: cart `rowTax` (ရောင်းခွန်)

  // ── cash settle: the tip the cashier was handed ──────────────────────────
  "settle.cash.tipLabel": { en: "Cash tip (optional)", my: "ငွေသား အပိုကြေး (ထည့်ချင်မှ)" },
  "settle.cash.tipNone": { en: "None", my: "မထည့်ပါ" }, // grounded: kiosk `noTip`
  // {x}, not {n}: the example is typed into an inputMode="decimal" field that strips everything
  // outside [0-9.], so a Burmese numeral here would be an example nobody can actually enter.
  "settle.cash.example": { en: "e.g. {x}", my: "ဥပမာ {x}" },
  "settle.cash.kioskChose": {
    en: "The guest chose {m} at the kiosk — confirm or change it.",
    my: "ဧည့်သည်က အော်ဒါစက်မှာ {m} ရွေးထားပါတယ် — အတည်ပြုပါ ဒါမှမဟုတ် ပြင်ပါ။",
  },
  "settle.cash.kioskNoTip": {
    en: "The guest chose no tip at the kiosk.",
    my: "ဧည့်သည်က အော်ဒါစက်မှာ အပိုကြေး မထည့်ဘူးလို့ ရွေးထားပါတယ်။",
  },
  "settle.cash.overCap": {
    en: "That’s over the {m} cap — check the amount.",
    my: "{m} ကန့်သတ်ချက် ကျော်နေပါတယ် — ပမာဏ ပြန်စစ်ပါ။",
  }, // K15-HIGH — the only thing standing between a fat finger and a recorded tip

  // ── cash settle: the counter handoff (tendered → change) ─────────────────
  "settle.cash.tenderedLabel": { en: "Cash tendered (optional)", my: "လက်ခံရရှိငွေ (ထည့်ချင်မှ)" },
  "settle.cash.change": { en: "Change: {m}", my: "ပြန်အမ်းငွေ: {m}" }, // K15-HIGH — money handed back across the counter
  "settle.cash.notEnough": { en: "Not enough yet.", my: "ငွေ မလုံလောက်သေးပါ။" },

  // ── closing a secure tab against the card on file ────────────────────────
  "settle.card.trigger": {
    en: "Close tab · card on file · {m}",
    my: "စာရင်းပိတ် · သိမ်းထားကတ် · {m}",
  },
  "settle.card.chargeQ": {
    en: "Charge the card on file {m}?",
    my: "သိမ်းထားတဲ့ ကတ်ကနေ {m} ဖြတ်မလား?",
  }, // K15-HIGH — an off-session charge the guest is not standing there to approve
  "settle.card.charging": { en: "Charging…", my: "ဖြတ်နေပါတယ်…" },
  "settle.card.chargeAmount": { en: "Charge {m}", my: "{m} ဖြတ်" },
  "settle.card.hint": {
    en: "Charges the saved card for the final total. No tip is added — a tip stays cash or in person.",
    my: "နောက်ဆုံး စုစုပေါင်းအတွက် သိမ်းထားတဲ့ ကတ်ကနေ ဖြတ်ပါမယ်။ အပိုကြေး မထည့်ပါ — အပိုကြေးက ငွေသား ဒါမှမဟုတ် လူချင်း ပေးပါ။",
  },

  // ── the card reader (terminal) ───────────────────────────────────────────
  "settle.reader.trigger": { en: "Card on the reader · {m}", my: "ကတ်ကို စက်မှာ ကပ် · {m}" },
  "settle.reader.starting": { en: "Starting the reader…", my: "ကတ်စက် စဖွင့်နေပါတယ်…" },
  "settle.reader.hint": {
    en: "Sends the charge to the card reader — the guest taps or inserts there.",
    my: "ငွေဖြတ်မှုကို ကတ်စက်ဆီ ပို့ပါမယ် — ဧည့်သည်က အဲဒီမှာ ကပ် ဒါမှမဟုတ် ထိုးပါမယ်။",
  },
  "settle.reader.startFailed": {
    en: "Couldn’t start the card payment — try again, or settle by cash.",
    my: "ကတ်နဲ့ ငွေရှင်းတာ မစနိုင်ပါ — ထပ်စမ်းပါ၊ ဒါမှမဟုတ် ငွေသားနဲ့ ရှင်းပါ။",
  },
  "settle.reader.onReader": { en: "On the reader", my: "ကတ်စက်ပေါ်မှာ" },
  "settle.reader.paid": { en: "Paid", my: "ငွေရှင်းပြီး" }, // grounded: floor.status.paid
  "settle.reader.failedTitle": { en: "Payment didn’t go through", my: "ငွေရှင်းလို့ မရပါ" }, // K15-HIGH — the cue not to hand the food over
  "settle.reader.canceledTitle": { en: "Canceled", my: "ဖျက်လိုက်ပြီ" },
  "settle.reader.cancelBtn": { en: "Cancel the reader", my: "ကတ်စက်ကို ဖျက်" },
  "settle.reader.canceling": { en: "Canceling…", my: "ဖျက်နေပါတယ်…" },
  "settle.reader.cancelFailed": {
    en: "Couldn’t cancel just now — try again.",
    my: "အခု မဖျက်နိုင်ပါ — ထပ်စမ်းပါ။",
  },
  "settle.reader.backToSettle": { en: "Back to settle", my: "ငွေရှင်းဆီ ပြန်" },

  // ── clearing a table on turnover ─────────────────────────────────────────
  // {id} is the number off the physical tent card — Latin in both tongues.
  "settle.clear.btn": { en: "Clear table", my: "စားပွဲ ရှင်း" }, // glossary: စားပွဲ
  "settle.clear.question": { en: "Clear table {id}?", my: "စားပွဲ {id} ရှင်းမလား?" },
  // ⚠️ NAMES THE TABLE. `settle.cash.settling` is the bare ရှင်းနေပါတယ်… and both controls mount on
  // FloorDetailLive, so an identical busy line made "take the guest's cash" and "close the session
  // and route away" indistinguishable under `my`. Nothing catches a duplicate MY value outside a
  // declared plural pair.
  "settle.clear.clearing": { en: "Clearing…", my: "စားပွဲ ရှင်းနေပါတယ်…" },
  "settle.clear.midPayment": {
    en: "Can’t clear while this table is mid-payment.",
    my: "ဒီစားပွဲ ငွေရှင်းနေဆဲမို့ မရှင်းနိုင်ပါ။",
  }, // grounded: floor.status.paying (ငွေရှင်းနေဆဲ)

  // ── merging one table's order into another ───────────────────────────────
  "settle.merge.btn": { en: "Merge with another table", my: "တခြား စားပွဲနဲ့ ပေါင်း" },
  "settle.merge.into": {
    en: "Merge Table {id} into…",
    my: "စားပွဲ {id} ကို ဘယ်စားပွဲထဲ ပေါင်းမလဲ…",
  },
  "settle.merge.loading": { en: "Loading tables…", my: "စားပွဲများ ဖွင့်နေပါတယ်…" },
  "settle.merge.noCandidates": {
    en: "No other open tables of the same kind to merge into.",
    my: "အမျိုးအစားတူ ဖွင့်ထားတဲ့ တခြားစားပွဲ မရှိပါ။",
  },
  "settle.merge.loadFailed": {
    en: "Couldn’t load tables. Try again.",
    my: "စားပွဲများ မဖွင့်နိုင်ပါ။ ထပ်စမ်းပါ။",
  },
  // {id} = the source table, {into} = the target. Two different Latin tokens, so two slots, each
  // named for its role: `fill` substitutes by NAME, and one slot cannot carry two values.
  "settle.merge.move.one": {
    en: "Move {n} item from Table {id} into Table {into}?",
    my: "စားပွဲ {id} က ပစ္စည်း {n} ခုကို စားပွဲ {into} ထဲ ရွှေ့မလား?",
  },
  "settle.merge.move.many": {
    en: "Move {n} items from Table {id} into Table {into}?",
    my: "စားပွဲ {id} က ပစ္စည်း {n} ခုကို စားပွဲ {into} ထဲ ရွှေ့မလား?",
  },
  "settle.merge.closes": { en: "This closes Table {id}.", my: "စားပွဲ {id} ကို ပိတ်လိုက်ပါမယ်။" },
  "settle.merge.merging": { en: "Merging…", my: "ပေါင်းနေပါတယ်…" },
  // {into}, not {id}: every other key here uses {id} for the SOURCE table. Rendered the same today,
  // but the slot name is what the next editor and the printed K15 glossary read.
  "settle.merge.confirmBtn": { en: "Merge into Table {into}", my: "စားပွဲ {into} ထဲ ပေါင်း" },

  // ── aria-only names: regions and panels with no visible label of their own ─
  "settle.a11y.tipQuick": { en: "Quick tip amounts", my: "အပိုကြေး အမြန်ရွေး" },
  "settle.a11y.confirmCard": {
    en: "Confirm charging the card on file",
    my: "သိမ်းထားတဲ့ ကတ်ကို ဖြတ်တာ အတည်ပြု",
  },
  // Carries {id}, so it is filled with tf() at the call site rather than sx() — sx() takes no vars.
  "settle.a11y.confirmClear": {
    en: "Confirm clearing table {id}",
    my: "စားပွဲ {id} ရှင်းတာ အတည်ပြု",
  },
  "settle.a11y.pickTable": { en: "Pick a table to merge into", my: "ပေါင်းမယ့် စားပွဲ ရွေး" },
  "settle.a11y.mergeTargets": {
    en: "Tables you can merge into",
    my: "ပေါင်းလို့ရတဲ့ စားပွဲများ",
  },
  "settle.a11y.confirmMerge": { en: "Confirm merge", my: "ပေါင်းတာ အတည်ပြု" },
  "settle.a11y.readerPanel": { en: "Card reader payment", my: "ကတ်စက်နဲ့ ငွေရှင်း" },

  // ── /board — the wall TV. Guests read this, so the warm register stays. ────
  // The two column headings are VERBATIM from ReadyBoard.tsx (W3e) — on the wall since then, still
  // unchecked on K15, and this slice does not reword them.
  "board.col.preparing": { en: "Preparing", my: "ပြင်ဆင်နေသည်" },
  "board.col.ready": { en: "Ready", my: "ယူသွားနိုင်ပါပြီ" },
  // K32 (A4·1) — how long a Ready bag has waited, a count the SERVER derives from the DB clock.
  // `{mins}` is NOT a count slot, so the digits stay Latin in both languages — the pulse's minute
  // count beside it is Latin by construction, and one wall renders a duration one way.
  "board.card.wait": { en: "{mins} min", my: "{mins} မိနစ်" },
  "board.card.justNow": { en: "Just now", my: "ခုလေးတင်" },
  // K28(b) — the shelf wait's ceiling on the guest wall: past an hour the figure is not information
  // (`shelfWait`, lib/kds-time.ts). Claude-authored draft pending K15.
  "board.card.waitLong": { en: "Over an hour", my: "တစ်နာရီကျော်" },
  "board.connecting": { en: "Connecting…", my: "ဆက်သွယ်နေပါတယ်…" },
  "board.reconnecting": {
    en: "Reconnecting — showing the last update",
    my: "ပြန်ဆက်နေပါတယ် — နောက်ဆုံး အချက်အလက်ကို ပြထားပါတယ်",
  },
  "board.status": {
    en: "{n} ready · {total} preparing",
    my: "ယူလို့ရပြီ {n} ခု · ပြင်ဆင်နေဆဲ {total} ခု",
  },
  "board.empty": {
    en: "Ready orders light up here.",
    my: "ယူလို့ရပြီးတဲ့ အော်ဒါတွေ ဒီမှာ ပေါ်ပါမယ်။",
  },
  "board.sound": { en: "Enable sound", my: "အသံ ဖွင့်" },
  // board-4 — the chip is a TOGGLE now (it used to unmount on the tap that armed it): the pressed
  // state's word, and the one sentence the status node says when the TV's browser refuses audio.
  // Claude-authored drafts pending K15.
  "board.sound.on": { en: "Sound on", my: "အသံ ဖွင့်ထား" },
  "board.sound.refused": {
    en: "This screen can’t play sound — check the TV’s audio.",
    my: "ဒီစခရင်က အသံ မထွက်နိုင်ပါ — တီဗွီ အသံကို စစ်ပါ။",
  },
  // board-5 — the unlinked screen's one instruction, through the dictionary (it was a bare English
  // sentence under a Burmese refusal); `{x}` is the Latin path, which <Chrome> marks `lang="en"`.
  // Claude-authored draft pending K15.
  "board.signin": {
    en: "Or open {x} on this screen.",
    my: "ဒါမှမဟုတ် ဒီစခရင်မှာ {x} ကို ဖွင့်ပါ။",
  },
  // Phase 0 — the unlinked board's ONE action. It used to print the sign-in path as plain text on a
  // wall with a remote; now it is a link a manager can follow. Claude-authored draft pending K15.
  "board.signin.cta": { en: "Sign in to set up this screen", my: "ဒီစခရင်ကို ပြင်ဆင်ဖို့ ဝင်ပါ" },
  "board.offline": {
    en: "Can’t reach the ordering system — this screen isn’t updating. Trying again…",
    my: "အော်ဒါစနစ်နဲ့ ဆက်သွယ်လို့ မရပါ — ဒီစခရင် အသစ်မတက်ပါ။ ထပ်ကြိုးစားနေပါတယ်…",
  },
  "board.offline.still": {
    en: "Still can’t reach the ordering system — this screen isn’t updating. Call orders out from the kitchen for now.",
    my: "အော်ဒါစနစ်နဲ့ အခုထိ ဆက်သွယ်လို့ မရသေးပါ — ဒီစခရင် အသစ်မတက်ပါ။ ခဏ မီးဖိုချောင်ကနေ လှမ်းခေါ်ပေးပါ။",
  },
  "board.notConfigured": {
    en: "The order-ready board isn’t configured — ask a manager to set it up on this screen.",
    my: "အော်ဒါ ဘုတ်ကို မပြင်ဆင်ရသေးပါ — မန်နေဂျာကို ဒီစခရင်မှာ ပြင်ဆင်ပေးဖို့ ပြောပါ။",
  },
  "board.denied": {
    en: "This screen isn’t authorized for the order-ready board.",
    my: "ဒီစခရင်ကို အော်ဒါ ဘုတ်အတွက် ခွင့်မပြုထားပါ။",
  },

  // ── promo (P3) — the register's apply/remove on the table drill-down ───────
  // The one staff surface where a MONEY value changes on a tap, so the copy follows the money rules
  // rather than the chrome ones: {m} is preformatted money and stays Latin in both tongues, {x} is
  // the code itself (a Latin identifier), and NOTHING here claims a discount the totals do not
  // already carry — `promo.zero` and `promo.noItems` exist precisely so an applied code that is
  // currently worth nothing says so instead of implying a saving.
  "promo.h": { en: "Promo code", my: "လျှော့ကုဒ်" },
  "promo.none": { en: "No code on this order.", my: "ဒီအော်ဒါမှာ ကုဒ် မရှိပါ။" },
  "promo.field": { en: "Code", my: "ကုဒ်" },
  "promo.apply": { en: "Apply", my: "ထည့်ပါ" },
  "promo.applying": { en: "Applying…", my: "ထည့်နေပါတယ်…" },
  "promo.remove": { en: "Remove {x}", my: "{x} ကို ဖြုတ်ပါ" },
  "promo.removing": { en: "Removing…", my: "ဖြုတ်နေပါတယ်…" },
  // K15-HIGH — this is the sentence a cashier reads before taking cash, so it must be the DELIVERED
  // figure, never the apply-time quote. {m} arrives already formatted.
  "promo.worth": { en: "{m} off this order", my: "ဒီအော်ဒါ {m} လျှော့" },
  // NO "right now": the causes are not all transient. `mms_promo_discount_live` returns 0 when the
  // code is switched off or PAST `valid_until` (permanent) as much as when a void dropped the basket
  // under its minimum or M22's reward-first clamp already covered it (transient). A sentence that
  // implies "check back in a minute" on a code that expired last week is copy the code does not keep.
  "promo.zero": {
    en: "On the order, but it isn’t taking anything off.",
    my: "အော်ဒါမှာ ရှိပေမဲ့ လျှော့ဈေး မရပါ။",
  },
  "promo.noItems": {
    en: "On the order — nothing to price yet.",
    my: "အော်ဒါမှာ ရှိပါတယ် — ဈေးတွက်စရာ မရှိသေးပါ။",
  },

  // ── promo refusals (P3) — one key per StaffPromoReason, picked at the render site ───────────────
  // A NEW action, so it returns a stable reason rather than inheriting the plain-English `error:`
  // contract the six staff server modules carry (OPEN-ITEMS P2c defers converting those). The person
  // applying this code at the register reads Burmese; a refusal he cannot read is the pilot failing
  // at the surface it exists to test. `outage` is deliberately absent — it renders the existing
  // `out.write.failed`, the sentence every other staff mutation already shows.
  "promo.err.invalid": { en: "That code isn’t valid.", my: "ဒီကုဒ် မမှန်ပါ။" },
  "promo.err.inactive": { en: "That code is switched off.", my: "ဒီကုဒ်ကို ပိတ်ထားပါတယ်။" },
  "promo.err.notStarted": { en: "That code isn’t live yet.", my: "ဒီကုဒ် မစသေးပါ။" },
  "promo.err.expired": { en: "That code has expired.", my: "ဒီကုဒ် သက်တမ်းကုန်သွားပါပြီ။" },
  "promo.err.minNotMet": {
    en: "The order is under this code’s minimum.",
    my: "အော်ဒါက ဒီကုဒ်ရဲ့ အနည်းဆုံးပမာဏထက် နည်းနေပါတယ်။",
  },
  "promo.err.exhausted": { en: "That code is all used up.", my: "ဒီကုဒ် ကုန်သွားပါပြီ။" },
  "promo.err.sessionLimit": {
    en: "This table has already used that code.",
    my: "ဒီစားပွဲက ဒီကုဒ်ကို သုံးပြီးသွားပါပြီ။",
  },
  "promo.err.rateLimited": {
    en: "Too many tries — wait a moment.",
    my: "အကြိမ် များနေပါပြီ — ခဏ စောင့်ပါ။",
  },
  "promo.err.tableClosed": { en: "That table is closed.", my: "ဒီစားပွဲ ပိတ်သွားပါပြီ။" },
  "promo.err.noOrder": {
    en: "This table has no open order.",
    my: "ဒီစားပွဲမှာ ဖွင့်ထားတဲ့ အော်ဒါ မရှိပါ။",
  },
  "promo.err.cartClosed": { en: "That order is no longer open.", my: "ဒီအော်ဒါ မဖွင့်ထားတော့ပါ။" },
  // The apply refuses OVER an existing code rather than replacing it silently (staff-promo.ts), so
  // this sentence has to name the recovery — the Remove button is on this same card.
  "promo.err.codeApplied": {
    en: "Another code is already on this order — remove it first.",
    my: "ဒီအော်ဒါမှာ တခြားကုဒ် ရှိနေပါပြီ — အရင် ဖြုတ်ပါ။",
  },
  // K15-HIGH — the money refusal. A promo must not move while a payment is open on it, and this is
  // the sentence that explains why the tap did nothing.
  "promo.err.locked": {
    en: "Someone’s paying — wait for that to finish.",
    my: "ငွေရှင်းနေတုန်း ရှိပါတယ် — ပြီးအောင် စောင့်ပါ။",
  },
  "promo.err.signin": { en: "Staff sign-in required.", my: "ဝန်ထမ်း အကောင့် ဝင်ဖို့ လိုပါတယ်။" },
  "promo.err.error": { en: "That didn’t save — try again.", my: "မသိမ်းရသေးပါ — ထပ်စမ်းပါ။" },

  // ── P6 — the KITCHEN PULSE band on the same wall TV ────────────────────────────────────────────
  // FOUR new keys and no more, because the band deliberately speaks the words the PASS already
  // speaks: its heading and region name are `kds.title` (မီးဖိုချောင်, owner-verified in W21), its
  // table chip is `kds.table`, its cooking status is `kds.line.cooking`, its rail heading is
  // `kds.allday.title`, its overflow is `kds.more`, its quiet state is `kds.allclear`, and its rail
  // region name is `kds.a11y.allDay`. Drafting a second Burmese word for "kitchen" or for "all day"
  // would put two words for one thing in front of the same two people — the wall and the pass are
  // read by Mom and Dad in the same shift, and a K15 correction has to land in ONE place.
  //
  // What genuinely has no twin at the pass is below. Every MY value is a Claude-authored working
  // draft pending Min's native check (K15).
  "board.pulse.oldest": { en: "Oldest (min)", my: "အကြာဆုံး (မိနစ်)" },
  // ⚠️ NOT "Ready", in either tongue, and the word IS the design decision. Nothing in this schema
  // records that a plate reached a table — `bumped_at` means the PASS finished the food and there is
  // no runner event anywhere — so "Ready" would assert a fact the database does not hold. It is also
  // aimed at the wrong reader: this screen hangs in a dining room, a guest reads "Ready" as an
  // instruction, and dine-in is table service, so there is nothing for them to do. `board.col.ready`
  // (ယူသွားနိုင်ပါပြီ, "you can take it away") is right for the takeaway column beside it and would
  // be a lie here. The kitchen's own word for what the stamp holds is that the food has come out.
  "board.pulse.up": { en: "Food up", my: "ဟင်းထွက်ပြီ" },
  "board.pulse.unavailable": {
    en: "Can’t read the kitchen right now.",
    my: "မီးဖိုချောင် အခြေအနေကို အခု မဖတ်နိုင်သေးပါ။",
  },
  // Aria-only (no visible text of its own), so it goes through `sx()` — see lib/staff-labels.ts.
  "board.a11y.tables": { en: "Table status", my: "စားပွဲ အခြေအနေ" },

  // ── P5 · the pilot loop: the printed word-check sheet and tonight's numbers ────────────────
  // Two surfaces, one namespace. `pilot.gloss.*` is the sheet Mom and Dad mark up over dessert —
  // the instrument that turns K15 from a blocker into pilot OUTPUT — and `pilot.night.*` is the
  // read-only nightly sheet beneath the tips on /staff/tips. Both are read by the two people whose language
  // this whole arc exists for, so both are Burmese-primary with the English echo beside.
  "pilot.gloss.title": { en: "Word check", my: "စာလုံး စစ်ဆေးစာရွက်" },
  // ⚠️ THE SCOPE IS IN THE SENTENCE, and it was not in the first draft. "Every Burmese word this
  // console shows" was FALSE: the dish and option names P1 put on the kitchen ticket as its PRIMARY
  // line come from `menu_items.name_my` / the modifier catalog, not from this dictionary, and no
  // derivation of `STAFF` can reach them. A sheet that claims completeness and omits the console's
  // largest Burmese surface sends a corrector away believing the check is done.
  "pilot.gloss.lede": {
    en: "Every Burmese word the console’s own buttons, labels and messages show. Read each line; where a word is wrong, write the right one beside it.",
    my: "ဒီစက်ရဲ့ ခလုတ်၊ အညွှန်း၊ စာသားတွေမှာ ပြတဲ့ မြန်မာစာလုံး အားလုံး။ တစ်ကြောင်းစီ ဖတ်ပြီး မှားနေတာရှိရင် ဘေးမှာ မှန်တာ ရေးပါ။",
  },
  // …and the omission is NAMED, because this sheet teaches its reader that absences get explained
  // (the autonym note does exactly that), which makes an unexplained one read as "there is nothing
  // else". The dish names are not unchecked — they are checked where they are READ.
  "pilot.gloss.scope": {
    en: "Dish and option names are NOT on this sheet. Those come from the menu, not from the console, and they get checked where they are read — on the kitchen ticket, with the English beneath each one.",
    my: "ဟင်းအမည်နဲ့ ရွေးချယ်စရာ အမည်တွေကို ဒီစာရွက်မှာ မထည့်ထားပါ။ အဲဒါတွေက မီနူးထဲကလာတာ၊ ဒီစက်ကလာတာ မဟုတ်ပါ — ဖတ်တဲ့နေရာမှာပဲ စစ်ပါတယ်၊ မီးဖိုချောင် အော်ဒါစာရွက်ပေါ်မှာ တစ်ခုစီအောက်က အင်္ဂလိပ်စာနဲ့အတူ။",
  },
  // The braces are machine slots. A corrector who translates `{n}` breaks a string — `strings.test.ts`
  // catches it at CI rather than at the pass, but the paper is where it should never be written.
  "pilot.gloss.slots": {
    en: "Keep anything in curly braces exactly as it is — {n}, {t} and {x} are where the app puts a number, a time or a name. Change the words around them, never the braces.",
    my: "တွန့်ကွင်းထဲက အရာတွေကို ရှိတဲ့အတိုင်း ထားပါ — {n}၊ {t}၊ {x} နေရာတွေမှာ အက်ပ်က ဂဏန်း၊ အချိန်၊ နာမည် ထည့်ပါတယ်။ ဘေးက စကားလုံးတွေကိုပဲ ပြင်ပါ၊ တွန့်ကွင်းကို မပြင်ပါနဲ့။",
  },
  "pilot.gloss.print": { en: "Print", my: "ပုံနှိပ်" },
  // gloss-1 — the sheet is a sub-page of the Menu screen (its print circle opens it), so its bar
  // leads with the way back up, the console's own arrow pill (`floor.back`'s shape).
  "pilot.gloss.back": { en: "← Menu", my: "← မီနူး" },
  // ⚠️ Neither heading may be `မြန်မာ` or `English` on its own — those two strings are the language
  // control’s own labels, and `autonyms.test.ts` refuses them as dictionary VALUES so a corrector
  // can never meet one on the printed sheet with a box beside it.
  "pilot.gloss.col.my": { en: "Burmese now", my: "အခု မြန်မာစာ" },
  "pilot.gloss.col.en": { en: "English now", my: "အခု အင်္ဂလိပ်စာ" },
  "pilot.gloss.col.fix": { en: "Correction", my: "ပြင်ဆင်ချက်" },
  "pilot.gloss.band.high": { en: "Read these first", my: "ဒါတွေ အရင်ဖတ်ပါ" },
  "pilot.gloss.band.high.why": {
    en: "A wrong word here stops service: a held ticket read as live, a bump with no way back, an outage nobody knows what to do about.",
    my: "ဒီမှာ စာလုံးမှားရင် အလုပ် ရပ်သွားပါတယ် — ဆိုင်းထားတဲ့ အော်ဒါကို လက်ရှိလို့ ဖတ်မိတာ၊ ပြန်မရတော့တဲ့ ပြီးပြီနှိပ်မိတာ၊ စနစ်ပျက်တဲ့အခါ ဘာလုပ်ရမှန်း မသိတာ။",
  },
  "pilot.gloss.band.rest": { en: "The rest", my: "ကျန်တာများ" },
  "pilot.gloss.locked.settled": {
    en: "Already checked — leave this one",
    my: "စစ်ပြီးသား — ဒါကို မပြင်ပါနဲ့",
  },
  "pilot.gloss.locked.latin": {
    en: "Kept in English on purpose — don’t translate",
    my: "အင်္ဂလိပ်လို တမင် ထားတာ — မဘာသာပြန်ပါနဲ့",
  },
  "pilot.gloss.autonyms": {
    en: "The two language buttons are not on this sheet, and must not be. Each one names its own language, so correcting either into the other leaves whoever cannot read that language with no way back.",
    my: "ဘာသာစကား ခလုတ်နှစ်ခုကို ဒီစာရွက်မှာ မထည့်ထားပါ၊ မထည့်သင့်ပါ။ တစ်ခုစီက သူ့ဘာသာစကားကို သူ့ဘာသာနဲ့ ခေါ်တာဖြစ်လို့ တစ်ခုကို တစ်ခုအဖြစ် ပြင်လိုက်ရင် အဲဒီဘာသာစကား မဖတ်တတ်သူ ပြန်ပြောင်းလို့ မရတော့ပါ။",
  },
  "pilot.gloss.count": {
    en: "{n} to check · {total} in all",
    my: "စစ်ရန် {n} ကြောင်း · စုစုပေါင်း {total} ကြောင်း",
  },
  "pilot.gloss.sign": { en: "Checked by", my: "စစ်ဆေးသူ" },
  "pilot.gloss.date": { en: "Date", my: "ရက်စွဲ" },

  "pilot.night.title": { en: "Tonight", my: "ဒီည" },
  "pilot.night.since": { en: "Since midnight — {t}", my: "သန်းခေါင်ကတည်းက — {t}" },
  "pilot.night.promo": { en: "{x} discounts given", my: "{x} လျှော့ဈေး ပေးထားတာ" },
  "pilot.night.orders": { en: "Orders paid", my: "ငွေရှင်းပြီး အော်ဒါ" },
  "pilot.night.money": { en: "Taken today", my: "ဒီနေ့ ရငွေ" },
  "pilot.night.money.cash": { en: "Cash", my: "ငွေသား" },
  "pilot.night.money.card": { en: "Card · online", my: "ကတ် · အွန်လိုင်း" },
  "pilot.night.money.reader": { en: "Card · reader", my: "ကတ် · စက်" },
  // ⚠️ VERBATIM FROM THE AUTHORITY, because quoting a figure without its caveat changes what the
  // figure says. `/staff/register` labels these buckets "Order totals by status — line-level refunds
  // aren’t netted out", and M2 is why: a partial refund leaves `status='paid'`, so the bucket is
  // GROSS of it. Dropping that line made "Taken today" read as a drawer figure it is not.
  "pilot.night.money.where": {
    en: "Order totals by status — line-level refunds are NOT taken off these. The register has the full report.",
    my: "အခြေအနေအလိုက် အော်ဒါ စုစုပေါင်း — တစ်မျိုးချင်း ပြန်အမ်းတာတွေကို ဒီကနေ မနုတ်ထားပါ။ အပြည့်အစုံကို ကောင်တာ စာမျက်နှာမှာ ကြည့်ပါ။",
  },
  "pilot.night.money.refunded": {
    en: "{n} paid today and since fully refunded ({m}) — not counted above.",
    my: "ဒီနေ့ ရှင်းပြီး နောက်မှ ငွေအပြည့် ပြန်အမ်းထားတာ {n} ခု ({m}) — အပေါ်မှာ မရေတွက်ပါ။",
  },
  "pilot.night.ratings": { en: "Ratings tonight", my: "ဒီည အမှတ်ပေးချက်" },
  "pilot.night.ratings.low": { en: "{n} need following up", my: "{n} ခု လိုက်ကြည့်ရန်" },
  "pilot.night.recovery": { en: "Charged with no order", my: "အော်ဒါ မရှိဘဲ ငွေဖြတ်ထားတာ" },
  "pilot.night.recovery.none": { en: "None — nothing to chase.", my: "မရှိပါ — လိုက်စရာ မရှိပါ။" },
  "pilot.night.recovery.some": {
    en: "{n} waiting on the approvals screen.",
    my: "ခွင့်ပြုချက် စာမျက်နှာမှာ {n} ခု စောင့်နေပါတယ်။",
  },
  // ⚠️ The one figure on this card that is NOT tonight's, said on the card rather than in a docblock.
  // Day-scoping it would be worse — an orphan charge from Tuesday is still owed back on Friday — but
  // a card headed "Since midnight" must not let an all-time number pass as tonight's.
  "pilot.night.recovery.scope": {
    en: "All time, not only tonight — a charge from any day is owed back until someone clears it.",
    my: "ဒီညတစ်ညတည်း မဟုတ်ဘဲ အားလုံးပါ — ဘယ်နေ့ကမဆို တစ်ယောက်ယောက် မရှင်းပေးမချင်း ပြန်အမ်းရဦးမယ်။",
  },
  "pilot.night.unattributed": { en: "No channel recorded", my: "ဘယ်ကလာမှန်း မမှတ်ရသေးပါ" },
  "pilot.night.stripe": {
    en: "Compare this against {brand} by hand before you close — this screen cannot see {brand}.",
    my: "မပိတ်ခင် {brand} နဲ့ လက်နဲ့ တိုက်စစ်ပါ — ဒီစခရင်က {brand} ကို မမြင်ပါ။",
  },
  // ⚠️ IT QUALIFIES THE DISCOUNT COUNT AND NOTHING ELSE, and it renders beside that figure. Written
  // first as a bare "not counted above" under the recovery block, where the things above it were the
  // orders and the takings — and a split-settled table IS in both: `mms_fulfill_split_order` writes a
  // real `qr_orders` row with `status='paid'`. What it does not write is a `promo_redemptions` row.
  "pilot.night.split": {
    en: "Missing from this one: a table that split its bill. A split settle records no discount use — its order and its money ARE counted.",
    my: "ဒီဂဏန်းမှာ မပါတာ — ဘေလ်ခွဲပြီး ရှင်းတဲ့ စားပွဲ။ ခွဲရှင်းတာက လျှော့ပေးမှတ်တမ်း မတင်ပါ — အော်ဒါနဲ့ ငွေကတော့ ရေတွက်ထားပါတယ်။",
  },
  // A zero under "discounts given" has two opposite meanings — "guests did not use it" and "the code
  // does not work" — and a reader assumes the first. These three say the second, each for the state
  // that causes it. The facts come from the row; no verdict on whether a code APPLIES is made here
  // (that is `mms_promo_check`'s, and a second copy of it on a reporting screen would drift).
  "pilot.night.promo.unset": {
    en: "{x} isn’t set up yet — there is no code to give.",
    my: "{x} ကို မပြင်ဆင်ရသေးပါ — ပေးစရာ ကုဒ် မရှိသေးပါ။",
  },
  "pilot.night.promo.off": {
    en: "{x} is switched off — it isn’t discounting anything.",
    my: "{x} ကို ပိတ်ထားပါတယ် — ဘာမှ လျှော့မပေးတော့ပါ။",
  },
  // {n}/{total} are counts (Burmese numerals under my); the window end is a preformatted date.
  "pilot.night.promo.budget": {
    en: "{n} of {total} used all-time",
    my: "စတင်ကတည်းက သုံးပြီး {n} / {total}",
  },
  "pilot.night.promo.until": { en: "Runs until {t}", my: "{t} အထိ" },
  // The campaign state printed BESIDE tonight's count, not instead of it — terse, because it rides
  // in a chip next to the figure rather than replacing it (`promoFigure`, `pilot-night.ts`).
  "pilot.night.promo.chip.off": { en: "Switched off", my: "ပိတ်ထားသည်" },
  "pilot.night.promo.chip.unset": { en: "No code set up", my: "ကုဒ် မပြင်ဆင်ရသေး" },
  // The register mints a `pickup` session for a counter walk-in (`register.ts`), so this bucket is
  // not purely phone-ahead demand. Said on the screen rather than left for the reader to assume.
  // `summarizeDay`'s cashCents ALREADY contains the cash tips (the RPC folds the tip into the order
  // total), so this is a breakdown of the drawer, never an addition to it — the same sentence
  // `/staff/register` prints beside the same bucket.
  "pilot.night.money.cashtip": {
    en: "Cash includes {m} in tips.",
    my: "ငွေသားထဲမှာ ဝန်ဆောင်ခ {m} ပါဝင်ပါတယ်။",
  },
  "pilot.night.orders.counter": {
    en: "{x} includes counter orders.",
    my: "{x} ထဲမှာ ကောင်တာက အော်ဒါတွေ ပါဝင်ပါတယ်။",
  },
  "pilot.night.unreadable": {
    en: "Tonight’s numbers can’t be read right now. Nothing is lost — try again in a moment.",
    my: "ဒီည ဂဏန်းတွေကို အခု မဖတ်နိုင်သေးပါ။ ဘာမှ မပျောက်ပါ — ခဏနေ ထပ်စမ်းပါ။",
  },
  "pilot.night.glossary": {
    en: "Print the word-check sheet",
    my: "စာလုံး စစ်ဆေးစာရွက် ပုံနှိပ်ရန်",
  },
  // ═══ P7 · PR 2 · the front door ═══════════════════════════════════════════════
  // `entry.*` — the sign-in and the lock screen: the two surfaces a person reaches BEFORE any gate,
  // so the bar's language control is the only control on the tablet that works for them, and the
  // copy beneath it was the last English body under a Burmese switch (OPEN-ITEMS P2m). EN values
  // are the shipped sentences verbatim; every MY value is a Claude-authored draft pending K15.
  // Register: the same terse operational voice — ပါတယ် endings, no softeners.
  "entry.login.title": { en: "Staff sign-in", my: "ဝန်ထမ်း အကောင့်ဝင်ရန်" },
  "entry.login.head": { en: "Sign in to the floor", my: "ခန်းမသို့ ဝင်ပါ" },
  "entry.login.sub.email": {
    en: "Enter your staff email and we’ll send a one-time code.",
    my: "ဝန်ထမ်း အီးမေးလ် ရိုက်ထည့်ပါ — တစ်ခါသုံး ကုဒ် ပို့ပေးပါမယ်။",
  },
  "entry.login.sub.code": {
    en: "Enter the code we emailed you.",
    my: "အီးမေးလ်ထဲက ကုဒ်ကို ရိုက်ထည့်ပါ။",
  },
  "entry.login.denied": {
    en: "You’re signed in, but this account isn’t set up as staff. Ask an owner to add you — or sign out and use another email.",
    my: "အကောင့် ဝင်ထားပေမယ့် ဒီအကောင့်ကို ဝန်ထမ်းအဖြစ် မသတ်မှတ်ရသေးပါ။ ပိုင်ရှင်ကို ထည့်ပေးဖို့ ပြောပါ — ဒါမှမဟုတ် အကောင့်ထွက်ပြီး တခြား အီးမေးလ်နဲ့ ဝင်ပါ။",
  }, // K15-HIGH — the one sentence a wrong account sees, and its only way out
  "entry.signOut": { en: "Sign out", my: "အကောင့် ထွက်" },
  // {x} is the provider's own name ("Google") — a brand term handed in by the component, never a
  // dictionary value, so <Chrome> wraps it lang="en" inside the Burmese run.
  "entry.login.google": { en: "Continue with {x}", my: "{x} နဲ့ ဆက်လုပ်" },
  "entry.login.starting": { en: "Starting…", my: "စတင်နေပါတယ်…" },
  "entry.login.or": { en: "or use your email", my: "ဒါမှမဟုတ် အီးမေးလ်နဲ့ ဝင်ပါ" },
  "entry.login.email.label": { en: "Staff email", my: "ဝန်ထမ်း အီးမေးလ်" },
  "entry.login.send": { en: "Send code", my: "ကုဒ် ပို့" },
  "entry.login.sending": { en: "Sending…", my: "ပို့နေပါတယ်…" },
  "entry.login.useGoogle": { en: "Use {x} instead", my: "{x} နဲ့ ဝင်ပါ" },
  // {n} is a COUNT (seconds), so it takes the device's numerals — "၄၅ စက္ကန့်" beside "45s".
  "entry.login.resendIn": { en: "Resend in {n}s", my: "{n} စက္ကန့်အကြာ ပြန်ပို့နိုင်" },
  "entry.login.code.label": { en: "Sign-in code", my: "ဝင်ရန် ကုဒ်" },
  "entry.login.verify": { en: "Sign in", my: "ဝင်ပါ" },
  // ONE busy word for the code check and the PIN check: two keys on one surface may not share a
  // Burmese value while their English differs (strings.test), and "Verifying…" / "Checking…"
  // would have.
  "entry.checking": { en: "Checking…", my: "စစ်နေပါတယ်…" },
  "entry.login.otherEmail": { en: "Use a different email", my: "တခြား အီးမေးလ် သုံးမယ်" },
  "entry.login.sent": {
    en: "We sent a sign-in code to {x}.",
    my: "{x} သို့ ဝင်ရန် ကုဒ် ပို့လိုက်ပါပြီ။",
  },
  // W10b's attribution rule, kept: a transport shape names the SERVICE, never the person's address
  // or code. Three outage twins for three moments, because each says what is still fine.
  "entry.login.err.googleOutage": {
    en: "We can’t reach the sign-in service right now — it’s not you. Try again in a moment.",
    my: "အကောင့်ဝင် စနစ်နဲ့ ခဏ ဆက်သွယ်မရပါ — သင့်အမှား မဟုတ်ပါ။ ခဏနေ ထပ်စမ်းပါ။",
  },
  "entry.login.err.google": {
    en: "Couldn’t start {x} sign-in. Try again.",
    my: "{x} နဲ့ ဝင်ခြင်း မစနိုင်ပါ။ ထပ်စမ်းပါ။",
  },
  "entry.login.err.rateLimited": {
    en: "Too many code requests right now. Use “Continue with {x}” above, or try again later.",
    my: "ကုဒ် တောင်းတာ များနေပါပြီ။ အပေါ်က {x} ခလုတ်ကို သုံးပါ၊ ဒါမှမဟုတ် နောက်မှ ထပ်စမ်းပါ။",
  },
  "entry.login.err.sendOutage": {
    en: "We can’t reach the sign-in service right now — your email is fine. Try again in a moment.",
    my: "အကောင့်ဝင် စနစ်နဲ့ ခဏ ဆက်သွယ်မရပါ — သင့်အီးမေးလ်က မှန်ပါတယ်။ ခဏနေ ထပ်စမ်းပါ။",
  },
  "entry.login.err.send": {
    en: "We couldn’t send a code to that email. Check it’s your staff address and try again.",
    my: "ဒီအီးမေးလ်သို့ ကုဒ် မပို့နိုင်ပါ။ ဝန်ထမ်း အီးမေးလ် ဟုတ်မဟုတ် စစ်ပြီး ထပ်စမ်းပါ။",
  },
  "entry.login.err.verifyOutage": {
    en: "We can’t reach the sign-in service right now — your code may still be good. Try again in a moment.",
    my: "အကောင့်ဝင် စနစ်နဲ့ ခဏ ဆက်သွယ်မရပါ — သင့်ကုဒ်က အသုံးဝင်နေနိုင်ပါသေးတယ်။ ခဏနေ ထပ်စမ်းပါ။",
  },
  "entry.login.err.verify": {
    en: "That code didn’t match or has expired. Request a new one.",
    my: "ကုဒ် မကိုက်ပါ ဒါမှမဟုတ် သက်တမ်း ကုန်သွားပါပြီ။ အသစ် ထပ်တောင်းပါ။",
  },
  // ONE sign-out failure pair for the login's wrong-account escape AND the lock screen's
  // forgotten-PIN escape — the same sentence on the same surface must be the same key.
  "entry.err.signOutOutage": {
    en: "We can’t reach the sign-in service — couldn’t sign out just now. Try again in a moment.",
    my: "အကောင့်ဝင် စနစ်နဲ့ ဆက်သွယ်မရလို့ အခု အကောင့် မထွက်နိုင်သေးပါ။ ခဏနေ ထပ်စမ်းပါ။",
  },
  "entry.err.signOut": {
    en: "Couldn’t sign out just now — try again.",
    my: "အခု အကောင့် မထွက်နိုင်သေးပါ — ထပ်စမ်းပါ။",
  },
  // the lock screen — the one screen a person can reach without being able to change anything else
  "entry.lock.title": { en: "Tablet locked", my: "တက်ဘလက် လော့ခ်ချထား" },
  "entry.lock.hi": { en: "Welcome back, {x}", my: "ပြန်လာတာ ကြိုဆိုပါတယ် {x}" },
  "entry.lock.sub": { en: "Enter your PIN to resume.", my: "ဆက်လုပ်ဖို့ ပင်နံပါတ် ရိုက်ထည့်ပါ။" },
  "entry.lock.unlock": { en: "Unlock", my: "လော့ခ်ဖွင့်" },
  "entry.lock.forgot": {
    en: "Forgot PIN? Sign out",
    my: "ပင်နံပါတ် မေ့သွားရင် — အကောင့် ထွက်ပါ",
  }, // K15-HIGH — the only way off a locked tablet without the PIN

  // ═══ A4·4 · the signed-in state — the old /staff/profile, on the sign-in screen ══════════════
  // Rendered by `SignedInCard`: who you are · your PIN · sign out, last. EN values are the profile
  // page's shipped sentences verbatim (K25 named this the only console page with no Burmese below
  // the bar); every MY value is a Claude-authored draft pending K15.
  // {x} is the person's own name — Latin, so <Chrome> wraps it lang="en" inside the Burmese run.
  "entry.me.head": { en: "Signed in as {x}", my: "{x} အဖြစ် ဝင်ထားပါတယ်" },
  "entry.pin.head.set": { en: "Set a tablet PIN", my: "တက်ဘလက် ပင်နံပါတ် သတ်မှတ်ပါ" },
  "entry.pin.head.change": { en: "Change your PIN", my: "ကိုယ့် ပင်နံပါတ် ပြောင်းပါ" },
  // {min} and {max} are COUNTS (digits), so they take the device's numerals — "၄–၈ လုံး".
  "entry.pin.why": {
    en: "A {min}–{max} digit PIN lets you lock and resume the floor tablet without signing in by email again. It’s yours alone — never share it.",
    my: "{min}–{max} လုံး ပင်နံပါတ်နဲ့ အီးမေးလ် ပြန်မဝင်ဘဲ ခန်းမ တက်ဘလက်ကို လော့ခ်ချပြီး ပြန်ဖွင့်နိုင်ပါတယ်။ ကိုယ့်အတွက်သာ — ဘယ်သူ့ကိုမှ မပြောပါနဲ့။",
  },
  // The first-time field is labelled by `pin.label` ("PIN"); a rotation names the NEW one.
  "entry.pin.new": { en: "New PIN", my: "ပင်နံပါတ် အသစ်" },
  "entry.pin.confirm": { en: "Confirm PIN", my: "ပင်နံပါတ် ထပ်ရိုက်ပါ" },
  "entry.pin.set": { en: "Set PIN", my: "ပင်နံပါတ် သတ်မှတ်" },
  "entry.pin.update": { en: "Update PIN", my: "ပင်နံပါတ် ပြောင်း" },
  "entry.pin.saving": { en: "Saving…", my: "သိမ်းနေပါတယ်…" },
  "entry.pin.remove": { en: "Remove PIN", my: "ပင်နံပါတ် ဖယ်ရှား" },
  "entry.pin.removing": { en: "Removing…", my: "ဖယ်ရှားနေပါတယ်…" },
  // The two refusals the card can explain BEFORE the server is asked (it has both fields); the
  // three after are the action's own reason codes, every one a key so the region is never English
  // under the Burmese switch (P2m's defect, on the last surface that had it).
  "entry.pin.err.length": {
    en: "PIN must be {min}–{max} digits.",
    my: "ပင်နံပါတ်က {min}–{max} လုံး ဖြစ်ရပါမယ်။",
  },
  "entry.pin.err.mismatch": { en: "Those PINs don’t match.", my: "ပင်နံပါတ် နှစ်ခု မတူပါ။" },
  "entry.pin.err.trivial": {
    en: "Choose a less guessable PIN.",
    my: "ခန့်မှန်းရ ပိုခက်တဲ့ ပင်နံပါတ် ရွေးပါ။",
  },
  // W10b — the PIN surface is NOT order flow: "keep it on paper" is nonsense advice for a PIN
  // change, so it carries its own outage sentence (the old `PIN_OUTAGE`, verbatim).
  "entry.pin.err.outage": {
    en: "We can’t reach the sign-in service — that didn’t save. Try again in a moment.",
    my: "အကောင့်ဝင် စနစ်နဲ့ ဆက်သွယ်မရလို့ မသိမ်းရသေးပါ။ ခဏနေ ထပ်စမ်းပါ။",
  },
  "entry.pin.err.save": {
    en: "Couldn’t save your PIN. Try again.",
    my: "ပင်နံပါတ် မသိမ်းနိုင်ပါ။ ထပ်စမ်းပါ။",
  },
  "entry.pin.err.remove": {
    en: "Couldn’t remove your PIN. Try again.",
    my: "ပင်နံပါတ် မဖယ်ရှားနိုင်ပါ။ ထပ်စမ်းပါ။",
  },
  "entry.pin.saved.set": {
    en: "PIN set — you can now lock the tablet.",
    my: "ပင်နံပါတ် သတ်မှတ်ပြီးပါပြီ — တက်ဘလက်ကို လော့ခ်ချနိုင်ပါပြီ။",
  },
  "entry.pin.saved.updated": { en: "PIN updated.", my: "ပင်နံပါတ် ပြောင်းပြီးပါပြီ။" },
  "entry.pin.removed": { en: "PIN removed.", my: "ပင်နံပါတ် ဖယ်ရှားပြီးပါပြီ။" },

  // ═══ P7 · PR 2 · PIN — one vocabulary ════════════════════════════════════════
  // `pin.*` is read on THREE surfaces — the lock screen (your own PIN), the loss sheet and the
  // approvals queue (a manager's PIN) — so it is its own namespace rather than a copy under each,
  // which is the "name it ONCE" rule applied to words. `ManagerPinStepUp.tsx` renders every failure
  // through these keys; the lock screen reads the same ones.
  "pin.label": { en: "PIN", my: "ပင်နံပါတ်" },
  "pin.wrong.one": {
    en: "Wrong PIN — {n} try left.",
    my: "ပင်နံပါတ် မှားပါတယ် — {n} ကြိမ် ကျန်ပါသေးတယ်။",
  },
  "pin.wrong.many": {
    en: "Wrong PIN — {n} tries left.",
    my: "ပင်နံပါတ် မှားပါတယ် — {n} ကြိမ် ကျန်ပါသေးတယ်။",
  },
  "pin.wrong": { en: "Wrong PIN.", my: "ပင်နံပါတ် မှားပါတယ်။" },
  // {x} is the remaining time, PRE-FORMATTED in the device language by `lockoutDuration` from the
  // two unit keys below — so under `my` it arrives as Burmese script ("၁ မိနစ် ၀၅ စက္ကန့်") and needs
  // no wrap, and under `en` as "1m 05s". A `{t}` slot would be wrong: that is a CLOCK, always Latin.
  // This ONE sentence is the whole lockout: it says "too many" itself and it IS the countdown, so
  // when the countdown reaches zero the region EMPTIES — nothing stays behind claiming a refusal
  // over a field that just re-opened (blind pass, CRITICAL: a separate "Too many tries." did).
  "pin.lockedFor": {
    en: "Too many tries — try again in {x}.",
    my: "စမ်းတာ များသွားပါပြီ — {x} အကြာမှာ ထပ်စမ်းပါ။",
  }, // K15-HIGH — a lockout misread as "the tablet is locked" sends someone to sign out
  "pin.unit.min": { en: "{n}m", my: "{n} မိနစ်" },
  "pin.unit.sec": { en: "{n}s", my: "{n} စက္ကန့်" },
  "pin.noPin.self": {
    en: "No PIN is set on this account. Sign out to continue.",
    my: "ဒီအကောင့်မှာ ပင်နံပါတ် မသတ်မှတ်ရသေးပါ။ ဆက်လုပ်ဖို့ အကောင့် ထွက်ပါ။",
  },
  // A4·4 — the profile page is gone; the PIN lives on the sign-in screen, reached from the doors'
  // "Your PIN" tile (`floor.nav.pinSet` — the same words, so the sentence points at a real tile).
  "pin.noPin.profile": {
    en: "You don’t have a PIN set. Set one under “Set a tablet PIN” first.",
    my: "ပင်နံပါတ် မသတ်မှတ်ရသေးပါ။ “တက်ဘလက် ပင်နံပါတ် သတ်မှတ်” အောက်မှာ အရင် သတ်မှတ်ပါ။",
  },
  "pin.noPin.manager": {
    en: "That manager hasn’t set a PIN yet.",
    my: "အဲဒီ မန်နေဂျာက ပင်နံပါတ် မသတ်မှတ်ရသေးပါ။",
  },
  "pin.outage": {
    en: "We can’t reach the ordering system — your PIN wasn’t checked, and no attempt was used. Try again in a moment.",
    my: "အော်ဒါ စနစ်နဲ့ ဆက်သွယ်မရပါ — ပင်နံပါတ်ကို မစစ်ရသေးပါ၊ အကြိမ်လည်း မကုန်ပါ။ ခဏနေ ထပ်စမ်းပါ။",
  }, // K15-HIGH — an outage must never read as a wrong PIN
  "pin.checkFailed": {
    en: "Couldn’t check that PIN. Try again.",
    my: "ပင်နံပါတ်ကို မစစ်နိုင်ပါ။ ထပ်စမ်းပါ။",
  },
  "pin.rateLimited": {
    en: "Too many PIN attempts — wait a few minutes, then try again.",
    my: "ပင်နံပါတ် စမ်းတာ များနေပါပြီ — မိနစ်အနည်းငယ် စောင့်ပြီး ထပ်စမ်းပါ။",
  },
  "pin.needsManager": {
    en: "A manager needs to approve this — tap your name and enter your PIN.",
    my: "မန်နေဂျာ ခွင့်ပြုဖို့ လိုပါတယ် — ကိုယ့်နာမည်ကို နှိပ်ပြီး ပင်နံပါတ် ရိုက်ထည့်ပါ။",
  },
  "pin.manager.label": { en: "Manager", my: "မန်နေဂျာ" },
  "pin.manager.loading": { en: "Loading…", my: "ဖွင့်နေပါတယ်…" },
  "pin.manager.none": { en: "No managers available", my: "မန်နေဂျာ မရှိပါ" },
  "pin.manager.pick": { en: "Tap your name", my: "ကိုယ့်နာမည်ကို နှိပ်ပါ" },
  "pin.manager.noneNote": {
    en: "A manager has to approve this — none are signed in right now.",
    my: "မန်နေဂျာ ခွင့်ပြုဖို့ လိုပါတယ် — အခု ဘယ်မန်နေဂျာမှ အကောင့် မဝင်ထားပါ။",
  },
  "pin.badApprover.self": {
    en: "Pick a manager other than yourself to approve.",
    my: "ခွင့်ပြုဖို့ ကိုယ်တိုင် မဟုတ်တဲ့ တခြား မန်နေဂျာကို ရွေးပါ။",
  },
  "pin.badApprover.requester": {
    en: "Pick a manager other than whoever requested this.",
    my: "တောင်းဆိုသူ မဟုတ်တဲ့ တခြား မန်နေဂျာကို ရွေးပါ။",
  },

  // ═══ P7 · PR 2 · the staff error boundary ════════════════════════════════════
  // `app/staff/error.tsx` — the "couldn't load" voice beside the outage shell's "can't reach"
  // voice. It catches what a page throws, so it is the screen a kitchen tablet shows when a deploy
  // replaced its chunks — and it was the last English takeover in the console.
  "out.err.title": { en: "This screen couldn’t load", my: "ဒီစခရင် မဖွင့်နိုင်ပါ" },
  "out.err.body": {
    en: "It’s on our end — your sign-in is fine. Try again in a moment; if it keeps failing, take new orders on paper. Everything already recorded is safe.",
    my: "ကျွန်တော်တို့ဘက်က ပြဿနာပါ — သင့်အကောင့် ဝင်ထားဆဲပါ။ ခဏနေ ထပ်စမ်းပါ၊ ဆက်မရရင် အော်ဒါအသစ်တွေကို စာရွက်နဲ့ ယူပါ။ မှတ်ထားပြီးသမျှ လုံခြုံပါတယ်။",
  }, // K15-HIGH — the paper instruction, and "you're not logged out"
  "out.err.bodySustained": {
    en: "This keeps failing — your sign-in is fine, it’s on our end. Take new orders on paper; everything already recorded is safe.",
    my: "ဆက်တိုက် မရဖြစ်နေပါတယ် — သင့်အကောင့် ဝင်ထားဆဲပါ၊ ကျွန်တော်တို့ဘက်က ပြဿနာပါ။ အော်ဒါအသစ်တွေကို စာရွက်နဲ့ ယူပါ၊ မှတ်ထားပြီးသမျှ လုံခြုံပါတယ်။",
  }, // K15-HIGH — the same instruction once "in a moment" has stopped being true
  "out.err.escalated": {
    en: "Still failing — keep running on paper. Nothing recorded is lost; this screen comes back as soon as our side does.",
    my: "မရသေးပါ — စာရွက်နဲ့ ဆက်လုပ်ပါ။ မှတ်ထားသမျှ မပျောက်ပါ၊ ကျွန်တော်တို့ဘက် ပြန်ကောင်းတာနဲ့ ဒီစခရင် ပြန်လာပါမယ်။",
  },
  // The way out is the DOORS by name (`?doors=1` always wins over a remembered door) — never
  // "the floor", which on a kitchen tablet is the P7a mislabel this arc removed.
  "out.err.back": { en: "← Screens", my: "← စခရင်များ" },
  // ═══ P7 · PR 3 · the Help door ════════════════════════════════════════════
  // `help.*` — ONE gold circle in the bar on the kitchen board, the counter and the takeaway board,
  // opening one sheet: "How this screen works" (four cards with pictures, opening itself the first
  // time a device sees the screen), the board's text size, and — PR 4 — "Something's wrong". The
  // cards are named by convention (`lib/help.ts`): `help.how.<screen>.<n>` is the sentence,
  // `.more` the line beneath. Every MY value is a Claude-authored draft pending K15. Every sentence
  // states what the CODE does — a card that promised a control the screen does not have would be
  // the worst copy on the console, so each was written against the component it explains.
  "help.title": { en: "Help", my: "အကူအညီ" },
  "help.sub": {
    en: "One door for everything that isn’t cooking",
    my: "ချက်တာကလွဲပြီး ကျန်တာအားလုံး ဒီတစ်နေရာတည်း",
  },
  "help.row.how": { en: "How this screen works", my: "ဒီစခရင် ဘယ်လို သုံးရမလဲ" },
  "help.row.how.sub": {
    en: "{n} things, with pictures — it opens itself the first time",
    my: "{n} ချက် · ပုံနဲ့ — ပထမဆုံးအကြိမ် သူ့ဘာသာ ပွင့်ပါမယ်",
  },
  // {x} is the size's own name (a dictionary value, Burmese under my); {px} is "34 px", Latin by
  // nature (a measurement), which <Chrome> wraps lang="en" inside the Burmese run.
  "help.row.size.sub": {
    en: "Now: {x} · {px} — this tablet remembers",
    my: "အခု · {x} · {px} — ဒီတက်ဘလက် မှတ်ထားပါမယ်",
  },
  "help.size.lede": {
    en: "Pick once — this tablet remembers. The whole board changes behind this sheet.",
    my: "တစ်ခါ ရွေးလိုက်ပါ — ဒီတက်ဘလက် မှတ်ထားပါမယ်။ ဒီစာရွက်နောက်ကွယ်မှာ ဘုတ်တစ်ခုလုံး ပြောင်းသွားပါမယ်။",
  },
  // {n} is a COUNT (tickets across the board) — Burmese numerals under my.
  "help.size.across": { en: "{px} · {n} across", my: "{px} · တစ်တန်း {n} ခု" },
  // The sample word the three sizes are shown on: a dish every cook here reads a hundred times a day.
  "help.size.sample": { en: "Mohinga", my: "မုန့်ဟင်းခါး" },
  "help.how.title.kitchen": {
    en: "How the kitchen board works",
    my: "မီးဖိုချောင် ဘုတ် ဘယ်လို သုံးရမလဲ",
  },
  "help.how.title.counter": { en: "How the counter works", my: "ကောင်တာ ဘယ်လို သုံးရမလဲ" },
  // the kitchen board — bump · undo · 86 · fire (the canvas's four, verified against KdsBoard.tsx)
  "help.how.kitchen.1": {
    en: "Food up? Tap the green button. The ticket clears.",
    my: "ဟင်းထွက်ပြီလား? အစိမ်းရောင် ခလုတ်ကို နှိပ်ပါ။ တစ်ကတ် ပျောက်သွားပါမယ်။",
  }, // K15-HIGH — the one instruction the pass runs on
  "help.how.kitchen.1.more": {
    en: "Every line on the ticket goes at once.",
    my: "တစ်ကတ်ပေါ်က ဟင်းအားလုံး တစ်ပြိုင်နက် ထွက်သွားပါမယ်။",
  },
  // {n} is the undo window in seconds, handed in from the board's own constant — never typed here.
  "help.how.kitchen.2": {
    en: "Tapped by mistake? You have {n} seconds to undo.",
    my: "မှားနှိပ်မိရင် {n} စက္ကန့်အတွင်း ပြန်ဖျက်လို့ ရပါတယ်။",
  },
  // Not "the dark bar": `.kds-undo` is `--tx` on `--pg`, and the board is always Night, so the bar
  // is the PALE one on that screen. The sentence names its place, not a colour it does not have.
  "help.how.kitchen.2.more": {
    en: "The bar at the bottom brings the ticket back.",
    my: "အောက်ခြေက ဘားက တစ်ကတ်ကို ပြန်ခေါ်ပေးပါမယ်။",
  },
  // Phase 2b — the 86 moved behind the line's ⋯ ("More", its spoken name — a screen reader voices
  // the glyph as "midline horizontal ellipsis", so the card names the word, the picture maps it to
  // ⋯). Re-drafted: Claude-authored MY pending Min's native check (K15), re-queued.
  "help.how.kitchen.3": {
    en: "Out of a dish? Tap More on its line, then 86 it — guests can’t order it any more.",
    my: "ဟင်းကုန်ရင် အဲဒီဟင်းရဲ့ နောက်ထပ် ကို နှိပ်ပြီး ဖြုတ်လိုက်ပါ — ဧည့်သည်တွေ မမှာနိုင်တော့ပါ။",
  }, // K15-HIGH — a wrong word here hides a dish from every guest, or keeps selling one that is gone
  // `setItemSoldOut` is server-and-up (app/staff/menu), so the put-back is not a manager's job —
  // the first draft said it was, and would have had Mom wait for someone she did not need.
  "help.how.kitchen.3.more": {
    en: "Anyone can put it back from the Menu page.",
    my: "မီနူး စာမျက်နှာကနေ ဘယ်သူမဆို ပြန်တင်လို့ ရပါတယ်။",
  },
  "help.how.kitchen.4": {
    en: "A dashed card is a scheduled pickup. Fire it when it’s time.",
    my: "အစက်အပြောက် ကတ်က ကြိုမှာထားတဲ့ အော်ဒါပါ။ ချက်ချိန်ရောက်မှ နှိပ်ပါ။",
  }, // K15-HIGH — fired an hour early is food cooked an hour early
  "help.how.kitchen.4.more": {
    en: "Until then it waits — nothing is cooking.",
    my: "အဲဒီအထိ စောင့်နေပါမယ် — ဘာမှ မချက်ရသေးပါ။",
  },
  // the counter — start · a table · the bags · paper · the doors · the lock (verified against
  // app/staff/page.tsx). A4·2 folded the takeaway board into this screen: the bump card (3) is
  // COMPOSED from the board's two bump SENTENCES, verbatim in both tongues (their two sub-lines did
  // not survive the fold); the paper card (4) moved whole; the scan-and-go card went with the sheet.
  "help.how.counter.1": {
    en: "Someone at the counter? Tap Walk-up to start their order.",
    my: "ကောင်တာမှာ လူရောက်ပြီလား? အော်ဒါ စဖို့ လမ်းလျှောက်လာ ကို နှိပ်ပါ။",
  },
  "help.how.counter.1.more": {
    en: "Phone order and Start a table sit beside it — each opens the order screen.",
    my: "ဖုန်း အော်ဒါ နဲ့ စားပွဲ ဖွင့် က ဘေးမှာ ရှိပါတယ် — တစ်ခုချင်းက အော်ဒါ စခရင်ကို ဖွင့်ပေးပါမယ်။",
  },
  "help.how.counter.2": {
    en: "Tap a table to see its order.",
    my: "စားပွဲတစ်ခုကို နှိပ်ရင် အော်ဒါကို မြင်ရပါမယ်။",
  },
  "help.how.counter.2.more": {
    en: "Add dishes, take payment, or merge it — all from there.",
    my: "ဟင်း ထပ်ထည့်၊ ငွေ လက်ခံ၊ စားပွဲ ပေါင်း — အားလုံး အဲဒီကနေပါ။",
  },
  "help.how.counter.3": {
    en: "Bag packed? Tap Bagged & ready.",
    my: "ထုပ်ပြီးပြီလား? ထုပ်ပြီး၊ ယူလို့ရပြီ ကို နှိပ်ပါ။",
  },
  "help.how.counter.3.more": {
    en: "Guest has it? Tap Picked up. The card clears.",
    my: "ဧည့်သည် ယူသွားပြီလား? ယူသွားပြီ ကို နှိပ်ပါ။ ကတ် ပျောက်သွားပါမယ်။",
  },
  "help.how.counter.4": {
    en: "Board says it isn’t updating? Keep going on paper.",
    my: "ဘုတ်က အသစ်မတက်ဘူးလို့ ပြရင် စာရွက်နဲ့ ဆက်လုပ်ပါ။",
  }, // K15-HIGH — the paper instruction, on the screen that hands food to guests
  "help.how.counter.4.more": {
    en: "Nothing already recorded is lost — it catches up when we’re back.",
    my: "မှတ်ထားပြီးသမျှ မပျောက်ပါ — ပြန်ကောင်းတာနဲ့ အလိုလို ပြန်တက်လာပါမယ်။",
  },
  "help.how.counter.5": {
    en: "The grid circle takes you to the two doors.",
    my: "အကွက်ပုံ အဝိုင်းက တံခါးနှစ်ပေါက်ဆီ ခေါ်သွားပါမယ်။",
  },
  "help.how.counter.5.more": {
    en: "Kitchen or Counter — this tablet remembers the last one.",
    my: "မီးဖိုချောင် ဒါမှမဟုတ် ကောင်တာ — နောက်ဆုံး ရွေးထားတာကို ဒီတက်ဘလက် မှတ်ထားပါမယ်။",
  },
  "help.how.counter.6": {
    en: "Stepping away? Tap the lock — it shows once you have a PIN.",
    my: "ခဏ ထွက်မလား? သော့ပုံ အဝိုင်းကို နှိပ်ပါ — ပင်နံပါတ် ရှိမှ ပေါ်ပါမယ်။",
  },
  "help.how.counter.6.more": {
    en: "Your PIN opens it again. Set one on your profile.",
    my: "သင့်ပင်နံပါတ်နဲ့ ပြန်ဖွင့်လို့ ရပါတယ်။ ကိုယ့်အချက်အလက် စာမျက်နှာမှာ သတ်မှတ်ပါ။",
  },
  // {n} and {total} are counts — "အဆင့် ၂ / ၄" under my.
  "help.step": { en: "Step {n} of {total}", my: "အဆင့် {n} / {total}" },
  "help.next": { en: "Next", my: "ရှေ့ဆက်" },
  "help.back": { en: "Back", my: "နောက်သို့" },
  "help.done": { en: "Got it", my: "ရပြီ" },
  "help.footer": {
    en: "Open this any time from the gold Help circle.",
    my: "ရွှေရောင် အကူအညီ အဝိုင်းကနေ အချိန်မရွေး ပြန်ဖွင့်လို့ ရပါတယ်။",
  },
  "help.a11y.rows": { en: "Help topics", my: "အကူအညီ ခေါင်းစဉ်များ" },
  "help.a11y.pager": { en: "Steps", my: "အဆင့်များ" },

  // ── P7·4 — "Something's wrong": the report row in the Help sheet ─────────────────────────────
  // Every MY value a Claude-authored draft pending K15. The row, the field, what is sent with it,
  // the outcome sentences, the reporter's own list and its status chips.
  "report.row": { en: "Something’s wrong", my: "တစ်ခုခု မှားနေတယ်" },
  "report.row.sub": {
    en: "A few words — it reaches the team",
    my: "စကားလုံး အနည်းငယ် — အဖွဲ့ဆီ ရောက်ပါမယ်",
  },
  "report.lede": {
    en: "What happened? A few words is enough — the rest is sent with it.",
    my: "ဘာဖြစ်သွားလဲ? စကားလုံး အနည်းငယ်နဲ့ လုံလောက်ပါတယ် — ကျန်တာ အတူ ပို့ပေးပါမယ်။",
  },
  "report.field": { en: "What happened", my: "ဘာဖြစ်သွားလဲ" },
  "report.attached": { en: "Sent with it", my: "အတူ ပို့မယ့် အချက်အလက်" },
  "report.attached.screen": { en: "Screen: {x}", my: "စခရင် · {x}" },
  "report.attached.time": { en: "Time: {t}", my: "အချိန် · {t}" },
  "report.attached.connection": { en: "Connection: {x}", my: "ချိတ်ဆက်မှု · {x}" },
  "report.attached.version": { en: "Version: {x}", my: "ဗားရှင်း · {x}" },
  "report.attached.more": {
    en: "Plus device details and this session’s ids.",
    my: "ထပ်ပြီး စက်အချက်အလက်နဲ့ ခြေရာခံ နံပါတ်များ။",
  },
  "report.conn.live": { en: "updating", my: "အသစ်တက်နေ" },
  "report.conn.notUpdating": { en: "not updating", my: "အသစ်မတက်ပါ" },
  "report.conn.page": { en: "page loaded", my: "စာမျက်နှာ ဖွင့်ထား" },
  "report.send": { en: "Send", my: "ပို့မယ်" },
  "report.sending": { en: "Sending…", my: "ပို့နေသည်…" },
  "report.empty": { en: "Write a few words first.", my: "စကားလုံး အနည်းငယ် အရင် ရေးပါ။" },
  "report.sent": { en: "Got it — we’re on it.", my: "ရပြီ — ကျွန်တော်တို့ ကြည့်ပေးပါမယ်။" }, // K15-HIGH — the one sentence that tells Mom the problem is now ours
  "report.sent.sub": {
    en: "Report {x} is saved. Your reports are listed below.",
    my: "အစီရင်ခံစာ {x} သိမ်းပြီးပါပြီ။ သင့်အစီရင်ခံစာတွေက အောက်မှာပါ။",
  },
  "report.mine": { en: "Your reports", my: "သင့် အစီရင်ခံစာများ" },
  "report.mine.none": { en: "None yet.", my: "မရှိသေးပါ။" },
  "report.mine.loading": { en: "Loading…", my: "ဖွင့်နေသည်…" },
  "report.mine.failed": {
    en: "Couldn’t load your reports — try again.",
    my: "သင့်အစီရင်ခံစာတွေ မဖွင့်နိုင်ပါ — ထပ်ကြိုးစားပါ။",
  },
  "report.status.open": { en: "Received", my: "လက်ခံရရှိပြီ" },
  "report.status.triaged": { en: "Being looked at", my: "ကြည့်နေပါပြီ" },
  "report.status.fixed": { en: "Fixed", my: "ပြင်ပြီးပါပြီ" },
  "report.issue": { en: "On the team’s list", my: "အဖွဲ့ စာရင်းထဲ ရောက်ပြီ" },
  "report.err.outage": {
    en: "Couldn’t send right now — try again in a moment.",
    my: "အခု မပို့နိုင်ပါ — ခဏနေ ထပ်ကြိုးစားပါ။",
  }, // K15-HIGH — a failure sentence on the screen that reports failures
  "report.err.auth": { en: "Sign in again to send this.", my: "ဒါကို ပို့ဖို့ ပြန်ဝင်ပါ။" },
  "report.err.rate": {
    en: "You’ve sent a few just now — give it a moment.",
    my: "ခုနကပဲ အနည်းငယ် ပို့ထားပြီးပြီ — ခဏ စောင့်ပါ။",
  },
  "report.off": {
    en: "Reports aren’t switched on for this app yet — tell a manager in person.",
    my: "ဒီအက်ပ်မှာ အစီရင်ခံစာ မဖွင့်ရသေးပါ — မန်နေဂျာကို လူချင်း ပြောပါ။",
  },
  "report.err.save": {
    en: "Couldn’t save the report — try again.",
    my: "အစီရင်ခံစာ မသိမ်းနိုင်ပါ — ထပ်ကြိုးစားပါ။",
  },
  "report.a11y.attached": {
    en: "Sent with the report",
    my: "အစီရင်ခံစာနဲ့ အတူ ပို့မယ့် အချက်အလက်",
  },
  "report.a11y.mine": { en: "Your reports", my: "သင့် အစီရင်ခံစာများ" },
  // ── Phase 2a · send ──
  // The table page's "Send to kitchen" (P2k) — `useStaffSend` + `StaffSendButton`, reused by the
  // order pad in 2c, so the namespace is `table.send.*`. Every MY value in this block is a
  // Claude-authored K15 draft pending Min's native check, EXCEPT where a `grounded:` comment names its
  // in-repo source. Counts ride {n}/{total} (Burmese digits under `my`); a dish or host name rides
  // {x}. The take-back verb is ပြန်ယူ ("take back"), NOT kds.undo's ပြန်ဖျက် — that shares its root
  // with the Void beside it on this page (ဖျက်), and the owner chose ပြန်ယူ for this control.
  "table.send.cta.one": { en: "Send to kitchen · {n} item", my: "မီးဖိုချောင် ပို့ · {n} ခု" }, // K15-HIGH — the tap that starts cooking
  "table.send.cta.many": { en: "Send to kitchen · {n} items", my: "မီးဖိုချောင် ပို့ · {n} ခု" }, // K15-HIGH — the tap that starts cooking
  "table.send.sending": { en: "Sending…", my: "ပို့နေပါတယ်…" }, // grounded: table.loss.sending
  // The verb ALONE is the control's name; the countdown is a separate aria-hidden span
  // (`table.send.undoLeft`), so the accessible name does not change every second.
  "table.send.undo": { en: "Undo", my: "ပြန်ယူ" }, // K15-HIGH — the only way to take a mis-sent round back
  "table.send.undoLeft": { en: "· {n}s", my: "· {n} စက္ကန့်" },
  "table.send.undoing": { en: "Bringing it back…", my: "ပြန်ယူနေပါတယ်…" },
  "table.send.sent.one": {
    en: "Sent {n} item to the kitchen.",
    my: "မီးဖိုချောင်ကို {n} ခု ပို့ပြီးပြီ။",
  },
  "table.send.sent.many": {
    en: "Sent {n} items to the kitchen.",
    my: "မီးဖိုချောင်ကို {n} ခု ပို့ပြီးပြီ။",
  },
  "table.send.undone": {
    en: "Brought back — not sent. Change it, then send again.",
    my: "ပြန်ယူပြီးပြီ — မပို့ရသေးပါ။ ပြင်ပြီး ထပ်ပို့ပါ။",
  },
  "table.send.allSent": {
    en: "Everything’s been sent to the kitchen.",
    my: "အားလုံး မီးဖိုချောင်ကို ပို့ပြီးပြီ။",
  },
  "table.send.hostNote": {
    en: "{x} sends from their phone — send here only if the table asks.",
    my: "{x} က ဖုန်းကနေ ပို့ပါတယ် — စားပွဲက ပြောမှ ဒီကနေ ပို့ပါ။",
  },
  "table.send.hostNote.anon": {
    en: "The table’s host sends from their phone — send here only if the table asks.",
    my: "စားပွဲ အိမ်ရှင်က ဖုန်းကနေ ပို့ပါတယ် — စားပွဲက ပြောမှ ဒီကနေ ပို့ပါ။",
  },
  // {n} = the dishes staff added here; {total} = the table's OWN unsent dishes the same Send fires
  // (`mms_fire_cart` cannot fire a subset) — {total} because only {n}/{total} take Burmese digits.
  "table.send.mixedNote": {
    en: "You added {n} here — Send also sends the table’s {total} not yet sent.",
    my: "ဒီမှာ {n} ခု ထည့်ထားတယ် — ပို့ရင် စားပွဲက မပို့ရသေးတဲ့ {total} ခုပါ တစ်ခါတည်း ပါသွားမယ်။",
  }, // K15-HIGH — says the Send fires the diners' round too
  "table.send.counterAskNote": {
    en: "They’ve asked to pay — check with the table: send these {n}, or remove any they don’t want.",
    my: "ငွေရှင်းမယ်လို့ ပြောထားပြီ — စားပွဲကို မေးပါ၊ ဒီ {n} ခု ပို့မလား၊ မလိုတာ ဖယ်မလား။",
  }, // K15-HIGH — the question to ask before food is cooked for a table on its way out
  "table.send.paying": {
    en: "A payment is under way — these go to the kitchen when it goes through.",
    my: "ငွေပေးချေနေဆဲပါ — ငွေဝင်တာနဲ့ မီးဖိုချောင်ကို ရောက်ပါမယ်။",
  },
  "table.send.hold.note": {
    en: "Save the note on {x} first — it goes to the kitchen with the dish.",
    my: "{x} ရဲ့ မှတ်ချက်ကို အရင် သိမ်းပါ — ဟင်းနဲ့အတူ မီးဖိုချောင် ရောက်ရမှာပါ။",
  }, // K15-HIGH — the allergy note that would otherwise be lost at the fire
  "table.send.hold.writing": {
    en: "One moment — a change is still saving.",
    my: "ခဏ — ပြင်ထားတာ သိမ်းနေတုန်းပါ။",
  },
  "table.send.togoAtPay.one": {
    en: "{n} to-go item — the kitchen starts it when the table pays.",
    my: "ပါဆယ် {n} ခု — ငွေရှင်းတာနဲ့ မီးဖိုချောင်က စချက်ပါမယ်။",
  },
  "table.send.togoAtPay.many": {
    en: "{n} to-go items — the kitchen starts them when the table pays.",
    my: "ပါဆယ် {n} ခု — ငွေရှင်းတာနဲ့ မီးဖိုချောင်က စချက်ပါမယ်။",
  },
  "table.send.counterAtPay": {
    en: "The kitchen starts this order when it’s paid.",
    my: "ငွေရှင်းပြီးမှ မီးဖိုချောင်က ဒီအော်ဒါကို စချက်ပါမယ်။",
  }, // K15-HIGH — why a counter order has no Send (it cooks at payment)
  "table.send.err.nothing": { en: "Nothing new to send.", my: "ပို့စရာ အသစ် မရှိပါ။" },
  "table.send.err.closed": {
    en: "This order is settled or closed — nothing to send.",
    my: "ဒီအော်ဒါ ရှင်းပြီး ဒါမှမဟုတ် ပိတ်ပြီးပြီ — ပို့စရာ မရှိပါ။",
  },
  "table.send.err.counter": {
    en: "Counter orders go to the kitchen when they’re paid.",
    my: "ကောင်တာ အော်ဒါတွေက ငွေရှင်းပြီးမှ မီးဖိုချောင် ရောက်ပါတယ်။",
  },
  "table.send.err.expired": {
    en: "Too late to bring it back — the kitchen has it. Use Void / Comp on the dish if it shouldn’t be made.",
    my: "ပြန်ယူဖို့ နောက်ကျသွားပြီ — မီးဖိုချောင် ရောက်သွားပြီ။ မချက်စေချင်ရင် ဟင်းပေါ်က ဖျက် / အခမဲ့ ကို နှိပ်ပါ။",
  }, // K15-HIGH — the kitchen already has it; the only way left is the loss path
  "table.send.err.failed": { en: "Couldn’t send — try again.", my: "မပို့နိုင်ပါ — ထပ်စမ်းပါ။" },
  "table.send.err.unknown": {
    en: "Couldn’t confirm the send — check the order above before you send again.",
    my: "ပို့ပြီးမပြီး မသေချာပါ — ထပ်မပို့ခင် အပေါ်က အော်ဒါကို စစ်ပါ။",
  }, // K15-HIGH — a send that may have landed; a blind re-send cooks twice
  "table.send.err.undoFailed": {
    en: "Couldn’t bring it back — try again before the time runs out.",
    my: "ပြန်မယူနိုင်ပါ — အချိန်မကုန်ခင် ထပ်စမ်းပါ။",
  },
  // Blind review — an undo whose answer never arrived is an UNKNOWN outcome (it may have landed), and
  // a retry that finds the batch no longer fired is `gone`, not "too late". Both point at the dishes
  // ABOVE the slot, which say where each one is.
  "table.send.err.undoUnknown": {
    en: "Couldn’t confirm the take-back — check the dishes above. If they still say sent, tap Undo again.",
    my: "ပြန်ယူပြီးမပြီး မသေချာပါ — အပေါ်က ဟင်းတွေကို စစ်ပါ။ ပို့ပြီးလို့ ပြနေသေးရင် ပြန်ယူ ကို ထပ်နှိပ်ပါ။",
  }, // K15-HIGH — a take-back that may have landed; "couldn't" would hide a dish that is no longer cooking
  "table.send.gone": {
    en: "Nothing from that send is still with the kitchen — the dishes above show where each one is.",
    my: "အဲဒီတစ်ခါ ပို့ထားတာ မီးဖိုချောင်မှာ ဘာမှ မကျန်တော့ပါ — ဟင်းတစ်ခုချင်း ဘယ်မှာလဲဆိုတာ အပေါ်မှာ ပြထားပါတယ်။",
  }, // K15-HIGH — tells staff no dish from the send is cooking; wrong, a dish is made nobody expects
  // The line tags (K25 for this surface): the one word that separates sent from unsent, in the
  // device language instead of the English `STAFF_STATE_COPY` they replace.
  "table.line.notSent": { en: "Not sent", my: "မပို့ရသေး" }, // K15-HIGH — marks the dishes the kitchen has not got
  "table.line.state.fired": { en: "Sent", my: "ပို့ပြီး" }, // K15-HIGH — the dish the kitchen has
  "table.line.state.inProgress": { en: "Cooking", my: "ချက်နေဆဲ" }, // grounded: kds.line.cooking
  "table.line.state.served": { en: "Served", my: "ထုတ်ပြီး" }, // grounded: kds.served.chip
  // The add page's bridge to the Send (removed with `browse.review` by the 2c order pad).
  "browse.reviewUnsent": { en: "Review · {n} not sent →", my: "စစ်ရန် · {n} ခု မပို့ရသေး →" },

  // ── Phase 2a · register ──
  // A secure-tab close whose Server Action REJECTED (the connection dropped): the off-session charge
  // may or may not have landed, and `closeSecureTab`'s unknown-outcome arm HOLDS the freeze — so the
  // write-outage twin ("that change wasn’t saved") would be false here. Same promise as that server
  // arm's own sentence. Claude-authored MY draft pending Min's native check (K15).
  "settle.card.unknown": {
    en: "The connection dropped, so we don’t know if the card was charged. Don’t take cash or another card yet — if the charge went through, this tab settles itself in a minute. If it doesn’t, try again.",
    my: "ချိတ်ဆက်မှု ပြတ်သွားလို့ ကတ်ကနေ ဖြတ်ပြီးပြီလား မသိရပါ။ ငွေသား ဒါမှမဟုတ် တခြားကတ် မယူပါနဲ့ဦး — ဖြတ်ပြီးသားဆိုရင် ဒီစာရင်း တစ်မိနစ်အတွင်း သူ့ဘာသာ ပိတ်သွားပါမယ်။ မပိတ်ရင် ထပ်စမ်းပါ။",
  }, // K15-HIGH — read while a charge's outcome is unknown; a misread collects the guest twice

  // ── Phase 2b · kitchen ──
  // The 86 moved behind a per-line ⋯ (K22: a test pass 86'd a live dish off a one-tap band). All
  // three are Claude-authored MY drafts pending Min's native check (K15).
  // The ⋯'s sr-only name. {x} is the dish as the ticket renders it (Burmese-first). A "More" control,
  // not a menu of "options" holding one action. grounded: floor.door.more (နောက်ထပ်) +
  // table.line.noteLabel ({x} အတွက်).
  "kds.line.more": { en: "More for {x}", my: "{x} အတွက် နောက်ထပ်" },
  // The sheet's hint above the 86. It promises exactly what `setItemSoldOut` does: the dish's
  // `is_sold_out` flips, and no line on ANY ticket is touched. grounded: help.how.kitchen.3
  // (မမှာနိုင်တော့ပါ), kds.live.restored (ဘုတ်ပေါ်), "orders" (အော်ဒါတွေ), help.how.title.counter (ကောင်တာ).
  "kds.86.hint": {
    en: "Guests can’t order it any more. Orders already on the board stay — tell the counter if you can’t make them.",
    my: "ဧည့်သည်တွေ မမှာနိုင်တော့ပါ။ ဘုတ်ပေါ်က အော်ဒါတွေကတော့ ဆက်ရှိနေမယ် — မလုပ်ပေးနိုင်ရင် ကောင်တာကို ပြောပါ။",
  }, // K15-HIGH — the last thing read before a dish leaves every guest's menu
  // The sr-only prefix on a ticket's kitchen note (the note is the line's description). The " — "
  // after it is punctuation in the component, not dictionary text. grounded: browse.mod.note.
  "kds.note.sr": { en: "Kitchen note", my: "မီးဖိုချောင် မှတ်ချက်" },
  // ── Phase 2b · feedback ──
  // The bar's status slot (feed pages) and the offline row (feedless pages), then the counter
  // lane's thumb-zone Undo pill. Every MY value in this block is a Claude-authored K15 draft
  // pending Min's native check, EXCEPT where a `grounded:` comment names its in-repo source.
  // The slot's words — "Live" is sr-only at every width (only the bad states are read at arm's
  // length); the other two are drawn beside the mark.
  "shell.live.live": { en: "Live", my: "အသစ်တက်နေ" }, // grounded: report.conn.live
  "shell.live.stale": { en: "Not updating", my: "အသစ်မတက်ပါ" }, // grounded: report.conn.notUpdating
  "shell.live.offline": { en: "Offline", my: "အော့ဖ်လိုင်း" },
  // The feedless page's row. No paper tail — that is a BOARD sentence (`out.tail.paper`); a menu or
  // a lock screen has nothing to keep on paper.
  "shell.net.offline": {
    en: "This device is offline — changes won’t save.",
    my: "ဒီစက် အင်တာနက် မရှိပါ — ပြင်ဆင်မှုတွေ မသိမ်းနိုင်ပါ။",
  }, // K15-HIGH — the one reason a manager's price or 86 toggle is refused on a dead wifi
  // The lane's Undo pill (live={false}: the lane's own region speaks the pick). The pill's text
  // names what was picked; its action is `kds.undo` verbatim.
  "expo.toast.picked": { en: "{x} picked up", my: "{x} ယူသွားပြီ" }, // grounded: expo.live.picked
  "expo.toast.pickedTable": { en: "Table {id} picked up", my: "စားပွဲ {id} ယူသွားပြီ" }, // grounded: expo.live.pickedTable
  "expo.toast.handedOver": { en: "{x} handed over", my: "{x} လွှဲပေးပြီး" }, // grounded: expo.verb.handedOver
  // A scan-and-go hand-over is spoken as what the button said ("Handed over"), not "picked up".
  "expo.live.handedOver": {
    en: "{x} handed over — undo available.",
    my: "{x} လွှဲပေးပြီး — ပြန်ဖျက်နိုင်သေးသည်။",
  }, // grounded: expo.verb.handedOver + expo.live.picked's tail
} as const satisfies Record<string, Entry>;

export type StaffKey = keyof typeof STAFF;

/**
 * EN plural pairs. Burmese has no plural inflection, so both keys of a pair carry the SAME MY value
 * — enumerated here rather than inferred, and guarded both ways in `strings.test.ts` (every listed
 * pair shares its MY value; every `…One` key has a listed `…Many`). Precedent: `cart.ts`'s
 * `countItem`/`countItems`.
 */
export const STAFF_PLURAL_PAIRS: ReadonlyArray<readonly [StaffKey, StaffKey]> = [
  ["floor.tables.count.one", "floor.tables.count.many"],
  ["floor.counter.count.one", "floor.counter.count.many"],
  ["floor.settled.count.one", "floor.settled.count.many"],
  ["expo.count.one", "expo.count.many"],
  ["kds.open.one", "kds.open.many"],
  ["floor.card.item.one", "floor.card.item.many"],
  ["table.appr.refunds.one", "table.appr.refunds.many"],
  ["table.detail.guest.one", "table.detail.guest.many"],
  ["table.detail.item.one", "table.detail.item.many"],
  ["floor.fb.low.one", "floor.fb.low.many"],
  ["floor.tips.orders.one", "floor.tips.orders.many"],
  ["floor.tips.shared.tail.one", "floor.tips.shared.tail.many"],
  ["reg.row.one", "reg.row.many"],
  ["reg.day.orders.one", "reg.day.orders.many"],
  ["reg.day.refunded.one", "reg.day.refunded.many"],
  ["settle.merge.move.one", "settle.merge.move.many"],
  ["pin.wrong.one", "pin.wrong.many"],
  // ── Phase 2a · send ──
  ["table.send.cta.one", "table.send.cta.many"],
  ["table.send.sent.one", "table.send.sent.many"],
  ["table.send.togoAtPay.one", "table.send.togoAtPay.many"],
];

/**
 * Keys whose MY value is deliberately Latin. Each needs a reason, and the Myanmar-script rule in
 * `strings.test.ts` reads THIS list rather than being loosened.
 */
export const STAFF_LATIN_BY_DESIGN: Readonly<Record<string, string>> = {
  "kds.station.all": "Station jargon kept Latin by owner decision — a wrong word hides tickets.",
  "kds.station.wok": "Station jargon kept Latin by owner decision — a wrong word hides tickets.",
  "kds.station.cold": "Station jargon kept Latin by owner decision — a wrong word hides tickets.",
  "kds.station.drinks": "Station jargon kept Latin by owner decision — a wrong word hides tickets.",
  "floor.mode.scango":
    "The product's own name for the grocery mode, printed on the aisle signage and the shelf tags — a brand term, not a sentence. Same treatment the diner surfaces already give it.",
  "table.appr.stripe":
    'The payment processor\'s own name — the word a manager types into a browser to find the refund screen, and the label on the screen they land on. It reaches the sentence through an {x} slot, so <Chrome> wraps it lang="en" inside the Burmese run rather than typesetting it in Padauk.',
};

/**
 * Look up a key with no slots. The return is `string`, not the literal union: indexing with a
 * `"en" | "my"` union resolves to the INTERSECTION of both literal types, which is `never` for every
 * entry whose two tongues differ. `tf`'s slot inference reads `(typeof STAFF)[K]["en"]` directly, so
 * the literal types are still doing their real work there.
 */
export function ts(lang: "en" | "my", key: StaffKey): string {
  return STAFF[key][lang];
}

/**
 * P5 — the strings a wrong word takes SERVICE down over, not just legibility.
 *
 * These are the 52 the printed word-check sheet puts in its first band, so that ten minutes with
 * the sheet buys the corrections that matter most: a held ticket read as live is food cooked an hour
 * early, a bump misread is a ticket cleared with a 6-second way back, and the outage sentences are
 * the only instruction anyone has when nothing else on the tablet works.
 *
 * ⚠️ THE SET IS DERIVED, NOT AUTHORED. It began as thirteen KDS/outage keys because that was the
 * whole marked population when P5 was written against `5715781`. The merges that landed P2 PR B
 * (#260) and P3 (#261) added markers on the register's money sentences, the loss/approval
 * confirmations and the promo refusals — every one a string a wrong word takes SERVICE down over,
 * so they belong in the first band by the same rule. The list below was regenerated by running the
 * SAME AST walk `autonyms.test.ts` uses over this file, not by hand: transcribing it is how the two
 * halves drift, and the guard asserts equality in BOTH directions precisely to catch that.
 *
 * ⚠️ DATA AND COMMENT MUST AGREE, and `lib/i18n/autonyms.test.ts` is what makes that true rather than
 * hoped: it PARSES this module (the TypeScript compiler, so a comment inside a string cannot
 * satisfy it) for every entry carrying a trailing `K15-HIGH` marker and asserts the two sets are
 * EQUAL — both directions. A key marked in a comment but missing here is a string Mom is never asked
 * about; a key listed here with no marker is a claim about severity with nothing behind it.
 */
export const STAFF_K15_HIGH: ReadonlySet<StaffKey> = new Set<StaffKey>([
  "browse.price.confirmQ",
  "browse.price.keep",
  "browse.price.live.off",
  "browse.price.live.saved",
  "browse.price.set",
  "browse.price.verb.confirm",
  "entry.lock.forgot",
  "entry.login.denied",
  "floor.refund.clamped",
  "floor.refund.err.cashNotReady",
  "floor.refund.note",
  "floor.refund.note.cash",
  "floor.settled.path.cash",
  "floor.settled.path.dashboard",
  "floor.settled.sub",
  "floor.tabOverLimit",
  "help.how.counter.4",
  "help.how.kitchen.1",
  "help.how.kitchen.3",
  "help.how.kitchen.4",
  "kds.86",
  "kds.86.done",
  "kds.bump",
  "kds.empty.outage",
  "kds.fire",
  "kds.held",
  "kds.recall",
  "kds.slot",
  "kds.stat.late",
  "kds.undo",
  "kds.undo.86",
  "out.err.body",
  "out.err.bodySustained",
  "out.shell.body",
  "out.tail.paper",
  "out.write.failed",
  "pin.lockedFor",
  "pin.outage",
  "promo.err.locked",
  "promo.worth",
  "settle.card.chargeQ",
  "settle.cash.change",
  "settle.cash.overCap",
  "settle.cash.settleAmount",
  "settle.cash.take",
  "settle.reader.failedTitle",
  "table.appr.cooked",
  "table.appr.empty.outage",
  "table.appr.msg.outage",
  "table.appr.refundsHint",
  "table.line.verb.voidComp",
  "table.loss.confirm.comp",
  "table.loss.confirm.void",
  "table.loss.confirmApproval.comp",
  "table.loss.confirmApproval.void",
  "table.loss.cooking",
  "table.loss.hint.comp",
  "table.loss.hint.void",
  "report.err.outage",
  "report.sent",
  // ── Phase 2a · send ──
  "table.send.cta.one",
  "table.send.cta.many",
  "table.send.undo",
  "table.send.mixedNote",
  "table.send.counterAskNote",
  "table.send.hold.note",
  "table.send.counterAtPay",
  "table.send.err.expired",
  "table.send.err.unknown",
  "browse.add.unconfirmed",
  "table.send.err.undoUnknown",
  "table.send.gone",
  "table.line.notSent",
  "table.line.state.fired",
  // ── Phase 2a · register ──
  "settle.card.unknown",
  // ── Phase 2b · kitchen ──
  "kds.86.hint",
  // ── Phase 2b · feedback ──
  "shell.net.offline",
]);

/**
 * P5 — the strings the native check must NOT re-ask, each with the reason it is closed.
 *
 * The module docblock above already says these three are settled; this is that sentence as data, so
 * the printed sheet can render them as read-only rows instead of leaving a corrector to discover the
 * rule from a source comment they will never see. Re-asking is not a harmless duplicate question: a
 * fresh answer to `kds.title` would overwrite an OWNER-VERIFIED correction, and the two board
 * headings have been on the wall since W3e — rewording them changes what the ROOM reads, which is a
 * different decision from checking a translation.
 *
 * Guarded like `STAFF_LATIN_BY_DESIGN`: every listed key must exist, so the list cannot outlive its
 * reason.
 */
export const STAFF_SETTLED: Readonly<Record<string, string>> = {
  "kds.title": "Owner-corrected in W21 — မီးဖိုချောင် is the word this kitchen uses.",
  "board.col.preparing": "On the wall since W3e — the room has been reading it for months.",
  "board.col.ready": "On the wall since W3e — the room has been reading it for months.",
};

/** The three values `table_sessions.mode` may hold, which are also `KitchenChannel`'s three. */
export type StaffChannel = "dinein" | "pickup" | "scango";

/**
 * P5 — mode → channel key, in ONE place.
 *
 * `KdsBoard.tsx` carried this map privately and the pilot's nightly sheet needs the same three
 * words, so a second copy would be two bindings for one vocabulary — the drift the "name it ONCE"
 * rule exists for (`scango` reads "To-go", which is not a mapping either surface should re-derive).
 * The type is spelled out locally rather than imported from `kitchen-types` so this module keeps no
 * dependency: it is imported by client code, and `lib/i18n/index.ts`'s own docblock explains why
 * that matters.
 */
export const STAFF_CHANNEL_KEY: Readonly<Record<StaffChannel, StaffKey>> = {
  dinein: "kds.channel.dinein",
  pickup: "kds.channel.pickup",
  scango: "kds.channel.togo",
};
