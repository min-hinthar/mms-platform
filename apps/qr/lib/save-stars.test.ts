import { describe, expect, it } from "vitest";
import {
  chooserLeavesNote,
  parseDeclined,
  recordDecline,
  SAVE_STARS_DECLINE_CAP,
  SAVE_STARS_DECLINED_KEY,
  saveStarsAsked,
  saveStarsBlockedReason,
  saveStarsCopy,
  saveStarsOffer,
  successRewardsDoor,
} from "./save-stars";

// A guest earner whose post-order total is 7 — distinct from the order's own +1 (so a count that
// quoted the order instead of the total cannot pass) and not a milestone at step 5.
const EARNER = { stars: 7, milestoneStep: 5, earnedThisOrder: true, isUpgraded: false };
const offerFor = (
  o: Partial<{ justPaid: boolean; refunded: boolean; progress: typeof EARNER | null }> = {},
) => saveStarsOffer({ justPaid: true, refunded: false, progress: EARNER, ...o });

describe("saveStarsOffer — who is asked to keep their Stars", () => {
  it("a guest earner on the success moment is asked", () => {
    expect(offerFor()).toEqual({ stars: 7, rewardJustUnlocked: false });
  });

  it("a signed-in earner is never asked", () => {
    // MUTATION save-stars/pitches-signed-in: drop the isUpgraded clause — a diner whose Stars are
    // already on their account is told they live only on this phone; red.
    expect(offerFor({ progress: { ...EARNER, isUpgraded: true } })).toBeNull();
  });

  it("a split share-payer who did not earn this order is never asked", () => {
    // MUTATION save-stars/pitches-share-payer: drop the earnedThisOrder clause; red.
    expect(offerFor({ progress: { ...EARNER, earnedThisOrder: false, stars: 4 } })).toBeNull();
  });

  it("a degenerate summary (earned, stars 0) offers nothing", () => {
    // RED when `stars > 0` becomes `stars >= 0` — "Keep your 0 Stars".
    expect(offerFor({ progress: { ...EARNER, stars: 0 } })).toBeNull();
  });

  it("a revisit offers nothing", () => {
    expect(offerFor({ justPaid: false })).toBeNull();
  });

  it("a refunded order offers nothing", () => {
    // MUTATION save-stars/pitches-a-refunded-order: drop the refunded clause; red.
    expect(offerFor({ refunded: true })).toBeNull();
  });

  it("a failed progress read offers nothing — never a zeroed claim", () => {
    expect(offerFor({ progress: null })).toBeNull();
  });

  it("the count is the server total after attribution", () => {
    // MUTATION save-stars/claims-this-orders-plus-one: `stars: 1` — the order's own Star quoted as
    // the total; red.
    expect(offerFor()?.stars).toBe(7);
  });

  it("carries the SAME reward-unlocked verdict PaySuccess reads", () => {
    expect(offerFor({ progress: { ...EARNER, stars: 10 } })?.rewardJustUnlocked).toBe(true);
    expect(offerFor({ progress: { ...EARNER, stars: 11 } })?.rewardJustUnlocked).toBe(false);
  });
});

describe("successRewardsDoor — one rewards door at a time, and none vanishes", () => {
  const GUEST_UNATTRIBUTED = { earnedThisOrder: false, isUpgraded: false };
  const OFFER = { stars: 3, rewardJustUnlocked: false };

  it("a guest whose attribution is still undecided sees no door at all", () => {
    // MUTATION save-stars/door-flips-before-attribution: drop the pending branch — GoodbyeBeat's
    // link renders, then vanishes when attribution lands and the card takes over; red.
    expect(
      successRewardsDoor({
        progress: GUEST_UNATTRIBUTED,
        pollSettled: false,
        offer: null,
        asked: true,
        receiptSettled: true,
      }),
    ).toEqual({ card: false, goodbye: "pending" });
  });

  it("the card waits for the receipt row to settle, and GoodbyeBeat yields to it either way", () => {
    // MUTATION save-stars/card-lands-above-receipt-actions: `card: true` — the card mounts before
    // ReceiptActions' row exists, and that row then pushes the card's buttons down; red.
    const base = {
      progress: { earnedThisOrder: true, isUpgraded: false },
      pollSettled: true,
      offer: OFFER,
      asked: true,
    };
    expect(successRewardsDoor({ ...base, receiptSettled: false })).toEqual({
      card: false,
      goodbye: "none",
    });
    expect(successRewardsDoor({ ...base, receiptSettled: true })).toEqual({
      card: true,
      goodbye: "none",
    });
  });

  it("a signed-in diner's door is never held up by the poll", () => {
    // RED when isUpgraded is removed from the finality test (it would read 'pending').
    expect(
      successRewardsDoor({
        progress: { earnedThisOrder: false, isUpgraded: true },
        pollSettled: false,
        offer: null,
        asked: true,
        receiptSettled: false,
      }),
    ).toEqual({ card: false, goodbye: "link" });
  });

  it("after 'Not now' the GoodbyeBeat link is the door", () => {
    expect(
      successRewardsDoor({
        progress: { earnedThisOrder: true, isUpgraded: false },
        pollSettled: true,
        offer: OFFER,
        asked: false,
        receiptSettled: true,
      }),
    ).toEqual({ card: false, goodbye: "link" });
  });

  it("a settled poll with no progress (no session) keeps today's link", () => {
    expect(
      successRewardsDoor({
        progress: null,
        pollSettled: true,
        offer: null,
        asked: true,
        receiptSettled: true,
      }),
    ).toEqual({ card: false, goodbye: "link" });
  });
});

describe("the decline record — bounded, per device, never throws", () => {
  it("names its storage key and cap", () => {
    expect(SAVE_STARS_DECLINED_KEY).toBe("mms.saveStars.declined.v1");
    expect(SAVE_STARS_DECLINE_CAP).toBe(2);
  });

  it("asks on a clean device, not for an order already declined", () => {
    expect(saveStarsAsked([], "a")).toBe(true);
    expect(saveStarsAsked(["a"], "a")).toBe(false);
    expect(saveStarsAsked(["a"], "b")).toBe(true);
  });

  it("stops asking once the device has declined two orders", () => {
    // MUTATION save-stars/decline-cap-ignored: drop the cap — order 'c' is asked after two
    // declines; red.
    expect(saveStarsAsked(["a", "b"], "c")).toBe(false);
  });

  it("records a decline once, and never grows past the cap", () => {
    expect(recordDecline([], "a")).toEqual(["a"]);
    expect(recordDecline(["a"], "a")).toEqual(["a"]);
    expect(recordDecline(["a"], "b")).toEqual(["a", "b"]);
    expect(recordDecline(["a", "b"], "c")).toEqual(["a", "b"]);
  });

  it("reads malformed storage as nothing declined, and drops non-strings", () => {
    // RED when JSON.parse is unguarded (the first case throws).
    expect(parseDeclined("{")).toEqual([]);
    expect(parseDeclined('[1,"x"]')).toEqual(["x"]);
    expect(parseDeclined(null)).toEqual([]);
    expect(parseDeclined('"a"')).toEqual([]);
    expect(parseDeclined('["a","a","b","c"]')).toEqual(["a", "b"]);
  });
});

describe("saveStarsCopy — what the card says", () => {
  // Every expected string below was PASTED from the function's own output (esbuild bundle + node),
  // never typed.
  it("the heading counts the server total, singular and plural", () => {
    expect(saveStarsCopy(1, false, false).heading).toBe("Keep your Star");
    expect(saveStarsCopy(3, false, false).heading).toBe("Keep your 3 Stars");
  });

  it("the CTA names the destination and the dismiss is quiet", () => {
    expect(saveStarsCopy(3, false, false).cta).toBe("Save to an account");
    expect(saveStarsCopy(3, false, false).dismiss).toBe("Not now");
  });

  it("the reward clause appears only when this order unlocked one", () => {
    expect(saveStarsCopy(3, false, false).body).toBe(
      "Guest Stars live only on this phone. Save them to an account with an email code or Google, and the orders that earned them come along too.",
    );
    expect(saveStarsCopy(3, true, false).body).toBe(
      "Guest Stars — and the reward you just unlocked — live only on this phone. Save them to an account with an email code or Google, and the orders that earned them come along too.",
    );
    expect(saveStarsCopy(3, false, false).body).not.toContain("the reward you just unlocked");
  });

  it("the receipt note appears only when the email capture is on screen", () => {
    expect(saveStarsCopy(3, false, false).receiptNote).toBeNull();
    expect(saveStarsCopy(3, false, true).receiptNote).toBe("Emailing a receipt doesn’t save them.");
  });

  it("the Burmese heading carries no numeral — Latin or Burmese digits", () => {
    for (const n of [1, 3, 12]) {
      const my = saveStarsCopy(n, false, false).headingMy;
      expect(my).not.toMatch(/[0-9]/);
      expect(my).not.toMatch(/[၀-၉]/);
    }
    expect(saveStarsCopy(3, false, false).headingMy).toBe(
      "ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်",
    );
  });
});

describe("saveStarsBlockedReason — the CTA stays rendered and says why", () => {
  it("offline names itself", () => {
    // RED when the offline branch is dropped.
    expect(saveStarsBlockedReason({ offline: true })).toBe(
      "You look offline — saving needs a connection.",
    );
  });
  it("otherwise nothing is withheld", () => {
    expect(saveStarsBlockedReason({ offline: false })).toBeNull();
  });
});

describe("chooserLeavesNote — a disclosure BEFORE a costly tap names every cost", () => {
  it("nothing at stake → no note", () => {
    expect(chooserLeavesNote({ stars: 0, inProgress: 0 })).toBeNull();
  });

  it("names the Stars and the orders that earned them", () => {
    expect(chooserLeavesNote({ stars: 3, inProgress: 0 })?.en).toBe(
      "Tapping a name signs in without this phone’s 3 guest Stars or the orders that earned them — use your email or Google below to bring your Stars and the orders that earned them along.",
    );
    expect(chooserLeavesNote({ stars: 1, inProgress: 0 })?.en).toBe(
      "Tapping a name signs in without this phone’s 1 guest Star or the order that earned it — use your email or Google below to bring your Stars and the orders that earned them along.",
    );
  });

  it("names the order in progress when one is live", () => {
    // RED when the in-progress branch is dropped.
    expect(chooserLeavesNote({ stars: 3, inProgress: 1 })?.en).toBe(
      "Tapping a name signs in without this phone’s 3 guest Stars or its orders, including the one in progress — use your email or Google below to bring your Stars and the orders that earned them along.",
    );
    expect(chooserLeavesNote({ stars: 3, inProgress: 2 })?.en).toContain(
      "including the 2 in progress",
    );
  });

  it("the failed-read branch still warns, without a number", () => {
    // RED when null is coerced to 0 (the failed-read landing would get no note at all).
    const note = chooserLeavesNote({ stars: null, inProgress: 0 });
    expect(note?.en).toBe(
      "Tapping a name signs in without anything this phone earned as a guest — use your email or Google below to bring your Stars and the orders that earned them along.",
    );
    expect(note?.en).not.toMatch(/[0-9]/);
    expect(chooserLeavesNote({ stars: null, inProgress: 1 })?.en).toBe(
      "Tapping a name signs in without anything this phone earned as a guest, including your order in progress — use your email or Google below to bring your Stars and the orders that earned them along.",
    );
    expect(chooserLeavesNote({ stars: null, inProgress: 2 })?.en).toContain(
      ", including your 2 orders in progress",
    );
  });

  it("a zero-Star guest with a live order hears about the order only — and no promise", () => {
    // MUTATION save-stars/chooser-tells-a-zero-star-guest: `stars > 0` → `stars >= 0` — a guest
    // with no Stars is told they leave "0 guest Stars" behind, and promised a carry the merge does
    // not keep for a share-payer's order; red.
    const note = chooserLeavesNote({ stars: 0, inProgress: 1 });
    expect(note?.en).toBe("Tapping a name signs in without your order in progress.");
    expect(note?.en).not.toContain("bring");
    expect(chooserLeavesNote({ stars: 0, inProgress: 2 })?.en).toBe(
      "Tapping a name signs in without your 2 orders in progress.",
    );
    expect(note?.my).toBe("နာမည်ကို နှိပ်ရင် လုပ်နေဆဲ အော်ဒါ မပါလာပါဘူး");
  });

  it("the Burmese lines carry no numeral", () => {
    for (const i of [
      { stars: 3, inProgress: 2 },
      { stars: null, inProgress: 2 },
      { stars: 0, inProgress: 2 },
    ]) {
      const my = chooserLeavesNote(i)?.my ?? "";
      expect(my.length).toBeGreaterThan(0);
      expect(my).not.toMatch(/[0-9၀-၉]/);
    }
  });
});
