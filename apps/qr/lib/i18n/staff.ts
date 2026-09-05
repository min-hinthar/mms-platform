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
 * figures, so Burmese digits there would make the row ragged). No dictionary VALUE carries a digit
 * of either script: counts arrive through the `{n}` / `{total}` slots and `tf()` converts them at
 * render, so the rule lives in one function with one guard rather than in a hundred strings.
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

  // ── outage nouns (the `what` slot of every frozen-board and shell sentence) ─
  "what.console": { en: "the console", my: "ဒီစက်" },
  "what.floor": { en: "the floor", my: "ခန်းမ" },
  "what.kitchen": { en: "the kitchen board", my: "မီးဖိုချောင် ဘုတ်" }, // glossary: မီးဖိုချောင်
  "what.expo": { en: "the expo board", my: "ထုတ်ပေးရေး ဘုတ်" },
  "what.register": { en: "the register", my: "ကောင်တာ" },
  "what.menuPrices": { en: "menu prices", my: "မီနူး ဈေးနှုန်း" },
  "what.table": { en: "this table", my: "ဒီစားပွဲ" }, // glossary: စားပွဲ
  "what.approvals": { en: "approvals", my: "ခွင့်ပြုချက်များ" },
  "what.feedback": { en: "feedback", my: "ဧည့်သည် မှတ်ချက်" },
  "what.orders": { en: "orders", my: "အော်ဒါများ" }, // glossary: အော်ဒါ
  "what.team": { en: "the team page", my: "ဝန်ထမ်း စာမျက်နှာ" },
  "what.profile": { en: "your profile", my: "သင့်အချက်အလက်" },
  "what.tips": { en: "today’s tips", my: "ဒီနေ့ အပိုကြေး" },
  "what.lock": { en: "the lock screen", my: "သော့ခတ် စခရင်" },
  "what.queue": { en: "the queue", my: "အော်ဒါတန်း" },
  "what.bags": { en: "the bags", my: "ပါဆယ်ထုပ်များ" }, // grounded: kiosk `toGo` (ပါဆယ်)
  "what.room": { en: "the room", my: "ခန်းမ" },
  "what.order": { en: "this order", my: "ဒီအော်ဒါ" },
  "what.list": { en: "this list", my: "ဒီစာရင်း" },

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
  "out.shell.title": {
    en: "We can’t reach the ordering system",
    my: "အော်ဒါစနစ်နဲ့ ဆက်သွယ်လို့ မရပါ",
  },
  "out.shell.body": {
    en: "Your sign-in is fine — the system is unreachable, so {what} can’t load right now. Take new orders on paper; everything already recorded is safe.",
    my: "သင့်အကောင့် ကောင်းနေပါတယ် — စနစ်နဲ့ မဆက်နိုင်လို့ {what} ကို အခု မဖွင့်နိုင်သေးပါ။ အော်ဒါအသစ်တွေကို စာရွက်နဲ့ ယူထားပါ။ မှတ်ထားပြီးသားတွေ အားလုံး လုံခြုံပါတယ်။",
  }, // K15-HIGH — prevents the worst misread of an outage screen: "I've been logged out"
  "out.shell.escalated": {
    en: "Still down — keep running on paper. Nothing recorded is lost; this screen comes back the moment the system does.",
    my: "အခုထိ မရသေးပါ — စာရွက်နဲ့ ဆက်သွားပါ။ မှတ်ထားပြီးသားတွေ မပျောက်ပါ။ စနစ်ပြန်ကောင်းတာနဲ့ ဒီစခရင် ပြန်တက်ပါမယ်။",
  },

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
  "kds.86": { en: "86 this dish", my: "ဒီဟင်း ဖြုတ်" }, // K15-HIGH — undone on a DIFFERENT screen
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
  "kds.recall": { en: "Recall", my: "ပြန်ခေါ်" }, // K15-HIGH — the second way back (2-minute window)
  "kds.undo": { en: "Undo", my: "ပြန်ဖျက်" }, // K15-HIGH — the only way back inside 6 seconds
  "kds.undo.bumped": { en: "{x} bumped", my: "{x} ပြီးသွားပြီ" },
  "kds.page": { en: "Page {n} of {total}", my: "စာမျက်နှာ {n} / {total}" },
  "kds.more": { en: "+{n} more", my: "နောက်ထပ် {n}" },

  // ── KDS: live-region announcements (class D — primary tongue only) ─────────
  "kds.live.bumped": {
    en: "{x} bumped — undo available.",
    my: "{x} ပြီးသွားပြီ — ပြန်ဖျက်လို့ ရသေးတယ်။",
  },
  "kds.live.restored": { en: "{x} restored to the board.", my: "{x} ဘုတ်ပေါ် ပြန်တင်ပြီးပြီ။" },

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
  "kds.err.line": {
    en: "Couldn’t update {x} — try again.",
    my: "{x} ကို မပြင်နိုင်ပါ — ထပ်စမ်းပါ။",
  },

  // ── KDS: accessible names with no visible text to pair with ───────────────
  // These sit on glyph-only or region elements (a slider, a ‹ › pager, a <ul>), where WCAG 2.5.3
  // has no visible label to contain. Every LABELLED control's name comes from `lib/staff-labels.ts`.
  "kds.a11y.stats": { en: "Service stats", my: "ဝန်ဆောင်မှု စာရင်း" },
  "kds.a11y.stationFilter": { en: "Station filter", my: "စတေရှင် စစ်ထုတ်" },
  "kds.a11y.tickets": { en: "Open kitchen tickets", my: "ဖွင့်ထားတဲ့ မီးဖိုချောင် အော်ဒါများ" },
  "kds.a11y.allDay": { en: "All-day counts", my: "စုစုပေါင်း အရေအတွက်" },
  "kds.a11y.volume": { en: "Chime volume", my: "အသံ အတိုးအကျယ်" },
  "kds.a11y.pager": { en: "Ticket pages", my: "အော်ဒါ စာမျက်နှာများ" },
  "kds.a11y.prevPage": { en: "Previous page", my: "ရှေ့ စာမျက်နှာ" },
  "kds.a11y.nextPage": { en: "Next page", my: "နောက် စာမျက်နှာ" },
  "kds.a11y.recall": { en: "Recall a bumped ticket", my: "ပြီးသွားတဲ့ အော်ဒါ ပြန်ခေါ်" },

  // ── /board — the wall TV. Guests read this, so the warm register stays. ────
  // The two column headings are VERBATIM from ReadyBoard.tsx (W3e) — on the wall since then, still
  // unchecked on K15, and this slice does not reword them.
  "board.col.preparing": { en: "Preparing", my: "ပြင်ဆင်နေသည်" },
  "board.col.ready": { en: "Ready", my: "ယူသွားနိုင်ပါပြီ" },
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
  "board.unlinked": {
    en: "This screen isn’t linked yet — ask a manager to set it up.",
    my: "ဒီစခရင်ကို မချိတ်ရသေးပါ — မန်နေဂျာကို ချိတ်ပေးဖို့ ပြောပါ။",
  },
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
  "board.unavailable": {
    en: "We can’t read the board right now.",
    my: "ဘုတ်ကို အခု မဖတ်နိုင်သေးပါ။",
  },

  // ── P5 · the pilot loop: the printed word-check sheet and tonight's numbers ────────────────
  // Two surfaces, one namespace. `pilot.gloss.*` is the sheet Mom and Dad mark up over dessert —
  // the instrument that turns K15 from a blocker into pilot OUTPUT — and `pilot.night.*` is the
  // read-only nightly sheet on /staff/feedback. Both are read by the two people whose language
  // this whole arc exists for, so both are Burmese-primary with the English echo beside.
  "pilot.gloss.title": { en: "Word check", my: "စာလုံး စစ်ဆေးစာရွက်" },
  "pilot.gloss.lede": {
    en: "Every Burmese word this console shows. Read each line; where a word is wrong, write the right one beside it.",
    my: "ဒီစက် ပြတဲ့ မြန်မာစာလုံး အားလုံး။ တစ်ကြောင်းစီ ဖတ်ပြီး မှားနေတာရှိရင် ဘေးမှာ မှန်တာ ရေးပါ။",
  },
  "pilot.gloss.print": { en: "Print", my: "ပုံနှိပ်" },
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
  "pilot.night.money.where": {
    en: "The register has the full report, refunds included.",
    my: "အပြည့်အစုံကို ကောင်တာ စာမျက်နှာမှာ ကြည့်ပါ — ငွေပြန်အမ်းတာတွေပါ ပါပါတယ်။",
  },
  "pilot.night.ratings": { en: "Ratings tonight", my: "ဒီည အမှတ်ပေးချက်" },
  "pilot.night.ratings.low": { en: "{n} need following up", my: "{n} ခု လိုက်ကြည့်ရန်" },
  "pilot.night.recovery": { en: "Charged with no order", my: "အော်ဒါ မရှိဘဲ ငွေဖြတ်ထားတာ" },
  "pilot.night.recovery.none": { en: "None — nothing to chase.", my: "မရှိပါ — လိုက်စရာ မရှိပါ။" },
  "pilot.night.recovery.some": {
    en: "{n} waiting on the approvals screen.",
    my: "ခွင့်ပြုချက် စာမျက်နှာမှာ {n} ခု စောင့်နေပါတယ်။",
  },
  "pilot.night.unattributed": { en: "No channel recorded", my: "ဘယ်ကလာမှန်း မမှတ်ရသေးပါ" },
  "pilot.night.stripe": {
    en: "Compare this against Stripe by hand before you close — this screen cannot see Stripe.",
    my: "မပိတ်ခင် Stripe နဲ့ လက်နဲ့ တိုက်စစ်ပါ — ဒီစခရင်က Stripe ကို မမြင်ပါ။",
  },
  "pilot.night.split": {
    en: "A table that split its bill is not counted above: a split settle records no discount use.",
    my: "ဘေလ်ခွဲပြီး ရှင်းတဲ့ စားပွဲကို အပေါ်မှာ မရေတွက်ပါ — ခွဲရှင်းတာက လျှော့ပေးမှတ်တမ်း မတင်ပါ။",
  },
  "pilot.night.unreadable": {
    en: "Tonight’s numbers can’t be read right now. Nothing is lost — try again in a moment.",
    my: "ဒီည ဂဏန်းတွေကို အခု မဖတ်နိုင်သေးပါ။ ဘာမှ မပျောက်ပါ — ခဏနေ ထပ်စမ်းပါ။",
  },
  "pilot.night.glossary": {
    en: "Print the word-check sheet",
    my: "စာလုံး စစ်ဆေးစာရွက် ပုံနှိပ်ရန်",
  },
} as const satisfies Record<string, Entry>;

export type StaffKey = keyof typeof STAFF;

/**
 * EN plural pairs. Burmese has no plural inflection, so both keys of a pair carry the SAME MY value
 * — enumerated here rather than inferred, and guarded both ways in `strings.test.ts` (every listed
 * pair shares its MY value; every `…One` key has a listed `…Many`). Precedent: `cart.ts`'s
 * `countItem`/`countItems`.
 */
export const STAFF_PLURAL_PAIRS: ReadonlyArray<readonly [StaffKey, StaffKey]> = [
  ["kds.open.one", "kds.open.many"],
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
 * These are the thirteen the printed word-check sheet puts in its first band, so that ten minutes
 * with the sheet buys the corrections that matter most: a held ticket read as live is food cooked an
 * hour early, a bump misread is a ticket cleared with a 6-second way back, and the outage sentences
 * are the only instruction anyone has when nothing else on the tablet works.
 *
 * ⚠️ DATA AND COMMENT MUST AGREE, and `staff-markers.test.ts` is what makes that true rather than
 * hoped: it PARSES this module (the TypeScript compiler, so a comment inside a string cannot
 * satisfy it) for every entry carrying a trailing `K15-HIGH` marker and asserts the two sets are
 * EQUAL — both directions. A key marked in a comment but missing here is a string Mom is never asked
 * about; a key listed here with no marker is a claim about severity with nothing behind it.
 */
export const STAFF_K15_HIGH: ReadonlySet<StaffKey> = new Set<StaffKey>([
  "out.tail.paper",
  "out.write.failed",
  "out.shell.body",
  "kds.held",
  "kds.slot",
  "kds.fire",
  "kds.bump",
  "kds.86",
  "kds.86.done",
  "kds.stat.late",
  "kds.empty.outage",
  "kds.recall",
  "kds.undo",
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
