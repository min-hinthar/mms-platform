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
  "what.profile": { en: "your profile", my: "ကိုယ့်အချက်အလက်" },
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

  // ── the floor: the console home and the live table board ──────────────────
  // `floor.back` carries the same two words as `kds.back`. They are separate keys because K15 is a
  // per-key native check: the kitchen's only exit and one link in a console header may want
  // different wording, and one key would force them to move together.
  "floor.back": { en: "← Floor", my: "← ခန်းမ" },
  "floor.hi": { en: "Hi, {x}", my: "မင်္ဂလာပါ {x}" },
  "floor.eyebrow": { en: "Floor", my: "ခန်းမ" },
  "floor.a11y.tools": { en: "Staff tools", my: "ဝန်ထမ်း ကိရိယာများ" },

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

  // ═══ P2 PR B · browse ═══════════════════════════════════════════════════════════
  // ── the staff order screen: the page header (app/staff/table/[id]/add) ─────
  // {id} is the table number off the physical tent card — Latin in both tongues.
  "browse.back.register": { en: "← Register", my: "← ကောင်တာ" },
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
  // This console's OWN failure sentence — a thrown Server Action, not a server-authored string, so
  // it is a dictionary key rather than something <OutageText> passes through as English forever.
  "browse.add.failed": { en: "Couldn’t add that — try again.", my: "မထည့်နိုင်ပါ — ထပ်စမ်းပါ။" },

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
  "table.detail.guest.one": { en: "{n} guest", my: "ဧည့်သည် {n} ယောက်" },
  "table.detail.guest.many": { en: "{n} guests", my: "ဧည့်သည် {n} ယောက်" },
  // Each of these leads an English RelativeTime node ("5m ago") that this slice does not own, so the
  // label is a PREFIX rather than a sentence with a {t} slot.
  "table.detail.tabOpened": { en: "tab opened", my: "စာရင်းဖွင့်တာ" },
  "table.detail.lastActivity": { en: "last activity", my: "နောက်ဆုံး လှုပ်ရှားမှု" },

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
  "expo.verb.pickedUp": { en: "Picked up", my: "ယူသွားပြီ" },

  // ═══ P2 PR B · home ═══════════════════════════════════════════════════════════
  // ── the console home: the tool nav (app/staff/page.tsx) ───────────────────
  // Ten 44px pills, so every one renders `echo={false}` — two scripts cannot legibly stack in a
  // chip. The `→` lives INSIDE the value, the way `floor.back`/`kds.back` carry their `←`: it is
  // part of the label a person reads, not a decorative glyph beside it.
  //
  // Vocabulary is reused, never re-invented: ကောင်တာ from `what.register`, မီးဖိုချောင် from
  // `kds.title` (owner-verified W21), ထုတ်ပေးရေး from `what.expo`, ခွင့်ပြုချက်များ from
  // `what.approvals`, ဧည့်သည် မှတ်ချက် from `what.feedback`, အပိုကြေး from `what.tips`, and
  // မီနူး ဈေးနှုန်း / မီနူး ရနိုင်မှု verbatim from `browse.price.title`/`titleAvail` — the pill and
  // the page it opens must not read as two different screens.
  "floor.nav.register": { en: "Register →", my: "ကောင်တာ →" },
  "floor.nav.kitchen": { en: "Kitchen →", my: "မီးဖိုချောင် →" },
  "floor.nav.expo": { en: "Expo →", my: "ထုတ်ပေးရေး →" },
  // TWO keys rather than a count concatenated onto one label: the badge is a COUNT in prose, so it
  // rides an `{n}` slot and becomes Burmese numerals at render. NOT a `.one`/`.many` pair — English
  // reads "Approvals (1)" and "Approvals (3)" identically; the fork is has-a-count vs has-none.
  "floor.nav.approvals": { en: "Approvals →", my: "ခွင့်ပြုချက်များ →" },
  "floor.nav.approvalsCount": { en: "Approvals ({n}) →", my: "ခွင့်ပြုချက်များ ({n}) →" },
  "floor.nav.feedback": { en: "Feedback →", my: "ဧည့်သည် မှတ်ချက် →" },
  // အော်ဒါနဲ့ ပြန်အမ်းငွေ is the phrase `reg.day.refunded.*`/`reg.day.note` already point staff at
  // ("check Orders & refunds for those") — the pill, the page title and the pointer are one name.
  "floor.nav.orders": { en: "Orders & refunds →", my: "အော်ဒါနဲ့ ပြန်အမ်းငွေ →" },
  "floor.nav.menuPrices": { en: "Menu prices →", my: "မီနူး ဈေးနှုန်း →" },
  "floor.nav.menuAvailability": { en: "Menu availability →", my: "မီနူး ရနိုင်မှု →" },
  "floor.nav.tips": { en: "Tips today →", my: "ဒီနေ့ အပိုကြေး →" },
  // "PIN" is ပင်နံပါတ် — a bare Latin run inside a MY value is unmarkable (`Chrome` marks only
  // INTERPOLATED values; strings.test.ts pins that). Same word as `table.appr.confirm.*`.
  "floor.nav.pin": { en: "Your PIN →", my: "ကိုယ့် ပင်နံပါတ် →" },
  "floor.nav.pinSet": { en: "Set a tablet PIN →", my: "တက်ဘလက် ပင်နံပါတ် သတ်မှတ် →" },
  "floor.nav.team": { en: "Manage staff →", my: "ဝန်ထမ်း စီမံ →" },

  // ── the floor board: a region name with no visible label to pair with ─────
  "floor.a11y.tables": { en: "Active tables", my: "အသုံးပြုနေတဲ့ စားပွဲများ" },

  // ── the floor: the tables board's OWN chrome (FloorBoard.tsx) ─────────────
  // The console's landing copy. It stayed English through the first cut of this slice under a
  // comment reading "until PR B converts them" — and this IS PR B; a blind audit read the comment
  // against the file and found the console home still saying "The floor is quiet" in English under
  // a Burmese greeting. Vocabulary is reused, never re-invented: `စားပွဲ` from `floor.table`,
  // `အသုံးပြုနေတဲ့ စားပွဲများ` verbatim from `floor.a11y.tables` one line up, `ခန်းမ` from `what.room`.
  "floor.tables.title": { en: "Tables", my: "စားပွဲများ" },
  "floor.tables.none": { en: "No active tables", my: "အသုံးပြုနေတဲ့ စားပွဲ မရှိပါ" },
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
    en: "Active tables appear here the moment a guest scans in — party, what they’re ordering, and how long they’ve been seated.",
    my: "ဧည့်သည် စကန်ဖတ်တာနဲ့ စားပွဲက ဒီမှာ ချက်ချင်း ပေါ်ပါမယ် — ဘယ်နှစ်ယောက်၊ ဘာမှာထားလဲ၊ ထိုင်နေတာ ဘယ်လောက်ကြာပြီလဲ။",
  },
  "floor.tables.emptyFrozenSub": {
    en: "New tables won’t appear here until this board is updating again. Nothing already open is lost.",
    my: "ဒီဘုတ် ပြန်အသစ်မတက်မချင်း စားပွဲအသစ်တွေ ဒီမှာ ပေါ်မှာ မဟုတ်ပါ။ ဖွင့်ထားပြီးသားတွေ မပျောက်ပါ။",
  },

  // ── /staff/orders — the manager refund surface ────────────────────────────
  "floor.orders.title": { en: "Orders & refunds", my: "အော်ဒါနဲ့ ပြန်အမ်းငွေ" },
  "floor.orders.sub": {
    en: "Recent paid orders. Refunding a line returns its price + tax to the card and is logged with your name.",
    my: "မကြာသေးမီက ငွေရှင်းပြီး အော်ဒါများ။ တစ်လိုင်းကို ပြန်အမ်းလိုက်ရင် အဲဒီဈေးနှုန်းနဲ့ အခွန်ကို ကတ်ထဲ ပြန်ထည့်ပေးပြီး ဘယ်သူလုပ်တယ်ဆိုတာ မှတ်တမ်းတင်ပါတယ်။",
  }, // K15-HIGH — the sentence that says a refund is logged to the person who taps it
  "floor.orders.a11y.list": {
    en: "Recent paid orders",
    my: "မကြာသေးမီက ငွေရှင်းပြီး အော်ဒါများ",
  },
  "floor.orders.a11y.lines": { en: "Order lines", my: "အော်ဒါ လိုင်းများ" },

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
  "browse.price.soldOutSince": {
    en: " · sold out since {t}",
    my: " · {t} ကတည်းက ဖြုတ်ထားပြီ",
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
  "browse.price.a11y.listAvail": { en: "Menu availability", my: "မီနူး ရနိုင်မှု" },
  // The price field's sr-only <label>. It carries the dish, so it is `tf()`/<Chrome>, never `sx()`.
  "browse.price.a11y.newPrice": {
    en: "New price for {x}, in dollars",
    my: "{x} အတွက် ဈေးအသစ်၊ ဒေါ်လာနဲ့",
  },

  // ═══ P2 PR B · people ═══════════════════════════════════════════════════════════
  // ── the floor: guest feedback triage (/staff/feedback) ────────────────────
  // The star name is aria-ONLY and takes TWO count slots, so it goes through `tf`, not `sx` —
  // `sx()` takes no vars. Both {n} and {total} are prose counts and become Burmese numerals.
  "floor.fb.title": { en: "Guest feedback", my: "ဧည့်သည် မှတ်ချက်" },
  "floor.fb.empty": {
    en: "No feedback yet. Diners are asked to rate after every order.",
    my: "မှတ်ချက် မရှိသေးပါ။ အော်ဒါတိုင်း ပြီးတိုင်း ဧည့်သည်တွေကို အဆင့်ပေးဖို့ တောင်းပါတယ်။",
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

  // ── the floor: the team roster (/staff/team) ──────────────────────────────
  // `ownersOnly` is the non-owner DEAD END. Its language control is mounted there too: a person who
  // cannot read English must not land on that screen with no way to change the console's language.
  "floor.team.title": { en: "Team", my: "ဝန်ထမ်းများ" },
  "floor.team.sub": {
    en: "Add staff by email — they’ll sign in with a one-time code. Deactivate to offboard without losing history.",
    my: "အီးမေးလ်နဲ့ ဝန်ထမ်း ထည့်ပါ — တစ်ကြိမ်သုံး ကုဒ်နဲ့ ဝင်ပါလိမ့်မယ်။ မှတ်တမ်း မပျောက်စေဘဲ ထုတ်ဖို့ ရပ်ဆိုင်းပါ။",
  },
  "floor.team.ownersOnly": { en: "Owners only", my: "ပိုင်ရှင်များသာ" },
  "floor.team.ownersOnly.body": {
    en: "Managing the team is limited to owners.",
    my: "ဝန်ထမ်း စီမံခန့်ခွဲမှုကို ပိုင်ရှင်တွေသာ လုပ်နိုင်ပါတယ်။",
  },
  "floor.team.backToFloor": { en: "← Back to the floor", my: "← ခန်းမကို ပြန်သွား" },
  "floor.team.a11y.roster": { en: "Staff", my: "ဝန်ထမ်း စာရင်း" },
  // The SUCCESS half of TeamManager's one live region. The failure half is <OutageText>; wrapping a
  // success literal in it would pass it through as English forever while looking converted.
  "floor.team.added": {
    en: "Added — they can now sign in with a one-time code.",
    my: "ထည့်ပြီးပါပြီ — တစ်ကြိမ်သုံး ကုဒ်နဲ့ ဝင်နိုင်ပါပြီ။",
  },

  // ═══ P2 PR B · reg ═══════════════════════════════════════════════════════════
  // ── the register (FOH counter): identity and the page's own frame ─────────
  // `reg.back` carries the same two words as `kds.back`/`floor.back` and stays its OWN key for the
  // reason stated there: K15 is a per-key native check, and the counter's exit may want different
  // wording from the kitchen's. The arrow lives INSIDE the value — it is part of the label, not a
  // decorative glyph beside it.
  "reg.back": { en: "← Floor", my: "← ခန်းမ" },
  "reg.title": { en: "Register", my: "ကောင်တာ" }, // same word as `what.register`
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
  "reg.queue.title": { en: "Open counter orders", my: "ဖွင့်ထားတဲ့ ကောင်တာ အော်ဒါများ" },
  "reg.queue.failed": {
    en: "Couldn’t load the counter queue — check the connection and refresh.",
    my: "ကောင်တာ အော်ဒါတန်းကို မဖတ်နိုင်ပါ — ချိတ်ဆက်မှုကို စစ်ပြီး ပြန်ဖွင့်ပါ။",
  },
  "reg.queue.empty": { en: "None right now.", my: "အခု တစ်ခုမှ မရှိပါ။" },
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
  "reg.day.refunded.one": {
    en: "{n} order paid today and since fully refunded ({m}) — not counted above. A refund of an earlier day’s order shows on Orders & refunds, not here.",
    my: "ဒီနေ့ ငွေရှင်းပြီးမှ အပြည့် ပြန်အမ်းလိုက်တဲ့ အော်ဒါ {n} ခု ({m}) — အပေါ်က စာရင်းမှာ မပါပါ။ ရှေ့ရက်က အော်ဒါ ပြန်အမ်းတာကို ဒီမှာမဟုတ်ဘဲ အော်ဒါနဲ့ ပြန်အမ်းငွေ စာမျက်နှာမှာ ကြည့်ပါ။",
  },
  "reg.day.refunded.many": {
    en: "{n} orders paid today and since fully refunded ({m}) — not counted above. A refund of an earlier day’s order shows on Orders & refunds, not here.",
    my: "ဒီနေ့ ငွေရှင်းပြီးမှ အပြည့် ပြန်အမ်းလိုက်တဲ့ အော်ဒါ {n} ခု ({m}) — အပေါ်က စာရင်းမှာ မပါပါ။ ရှေ့ရက်က အော်ဒါ ပြန်အမ်းတာကို ဒီမှာမဟုတ်ဘဲ အော်ဒါနဲ့ ပြန်အမ်းငွေ စာမျက်နှာမှာ ကြည့်ပါ။",
  },
  "reg.day.note": {
    en: "Since midnight (LA). Order totals by status — line-level refunds aren’t netted out; check Orders & refunds for those.",
    my: "လော့စ်အိန်ဂျယ်လိစ် အချိန် သန်းခေါင်ကစပြီး။ အော်ဒါ စုစုပေါင်းကို အခြေအနေအလိုက် ခွဲပြထားပါတယ် — တစ်လိုင်းချင်း ပြန်အမ်းငွေတွေ မနုတ်ထားပါ။ အဲဒါတွေအတွက် အော်ဒါနဲ့ ပြန်အမ်းငွေ စာမျက်နှာကို ကြည့်ပါ။",
  },
  "reg.day.outage": {
    en: "Today’s takings can’t load right now — the system is unreachable.",
    my: "ဒီနေ့ ရငွေကို အခု မဖတ်နိုင်သေးပါ — စနစ်နဲ့ မဆက်နိုင်ပါ။",
  },

  // ── the register: accessible names with no visible text to pair with ──────
  "reg.a11y.start": { en: "Start an order", my: "အော်ဒါ စဖွင့်" },
  "reg.a11y.queue": { en: "Open counter orders", my: "ဖွင့်ထားတဲ့ ကောင်တာ အော်ဒါများ" },

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
  "settle.a11y.confirmCash": { en: "Confirm cash settlement", my: "ငွေသား ရှင်းတာ အတည်ပြု" },
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
