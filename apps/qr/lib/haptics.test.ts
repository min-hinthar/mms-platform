import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { HAPTIC, haptic, type HapticMoment } from "./haptics";

/**
 * W22c — the haptic vocabulary, pinned.
 *
 * Two of these guard rules that have already failed once in this repo: the reduced-motion check
 * (PaySuccess carried a second copy of it, and two implementations of one guard is how an RM user
 * eventually gets buzzed by exactly one of them), and the weights themselves (8 meant both "you
 * chose" and "you bought" until the vocabulary separated them).
 */
const ALL: HapticMoment[] = ["pick", "add", "commit", "celebrate"];

let reduce = false;
const buzzes: (number | number[])[] = [];

beforeEach(() => {
  reduce = false;
  buzzes.length = 0;
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: q.includes("reduce") ? reduce : false }),
  });
  vi.stubGlobal("navigator", {
    vibrate: (p: number | number[]) => {
      buzzes.push(p);
      return true;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("the vocabulary", () => {
  it("keeps the v7.2 weight hierarchy strictly increasing", () => {
    // 6 stepper · 8 quick-add · 12 sheet-add — the prototype's designed order. A vocabulary whose
    // words do not order the way it claims ("pick < add < commit") is a rename, not a hierarchy.
    expect(HAPTIC.pick).toBeLessThan(HAPTIC.add);
    expect(HAPTIC.add).toBeLessThan(HAPTIC.commit);
    expect([HAPTIC.pick, HAPTIC.add, HAPTIC.commit]).toEqual([6, 8, 12]);
  });

  it("gives a pick and an add DIFFERENT weights — the defect this replaces", () => {
    // Both were 8: ItemSheet.choose (selecting a modifier) and AddButton's pill / the grocery
    // scan-add (putting an item in the basket). One thumb-feel meant "you chose" and "you bought".
    haptic("pick");
    haptic("add");
    expect(buzzes[0]).not.toEqual(buzzes[1]);
  });

  it("makes celebrate a PATTERN, and hands out a copy of it", () => {
    // The Vibration API spec permits an implementation to retain the array it is given, and HAPTIC
    // is shared module state — handing out the original would let a platform mutate the vocabulary.
    haptic("celebrate");
    expect(buzzes[0]).toEqual([10, 40, 18]);
    expect(buzzes[0]).not.toBe(HAPTIC.celebrate);
  });

  it("buzzes NOTHING under reduced motion, for every moment", () => {
    reduce = true;
    for (const m of ALL) haptic(m);
    expect(buzzes).toEqual([]);
  });

  it("reads reduced motion at CALL time, not at import time", () => {
    // The reason the rule is `matchMedia` and not `useAnimationPreference`: that hook seeds
    // shouldAnimate=true until its effect resolves, and a haptic is irreversible. A cached read
    // would have the same shape of bug one layer down.
    haptic("pick");
    reduce = true;
    haptic("pick");
    expect(buzzes).toHaveLength(1);
  });

  it("survives a platform with no Vibration API at all — which is every iPhone", () => {
    vi.stubGlobal("navigator", {});
    expect(() => ALL.forEach(haptic)).not.toThrow();
  });

  it("survives a matchMedia that throws", () => {
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("unsupported");
      },
    });
    expect(() => haptic("commit")).not.toThrow();
    expect(buzzes).toEqual([]); // and refuses rather than guessing the preference
  });

  it("no-ops on the server", () => {
    vi.stubGlobal("window", undefined);
    expect(() => haptic("add")).not.toThrow();
    expect(buzzes).toEqual([]);
  });
});
