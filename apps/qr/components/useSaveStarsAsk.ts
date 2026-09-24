"use client";
import { useState } from "react";
import {
  parseDeclined,
  recordDecline,
  SAVE_STARS_DECLINED_KEY,
  saveStarsAsked,
} from "@/lib/save-stars";

/** The stored decline record, or none. Storage can be absent (SSR) or throw (private mode, blocked
 *  site data); either reads as "nothing declined", so the ask still shows and still hides in memory. */
function readDeclined(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseDeclined(window.localStorage.getItem(SAVE_STARS_DECLINED_KEY));
  } catch {
    return [];
  }
}

/**
 * Phase 1c · account-star — "has this diner already said Not now?", per device, capped at two
 * declined ORDERS (lib/save-stars.ts owns the rules; this hook only reads and writes the record).
 *
 * The record is read ONCE, in a useState initializer. That differs between SSR (always []) and the
 * client's first render, and that is safe here: `asked` is consulted only through
 * `successRewardsDoor`, which answers `pending` until the client-only rewards-progress poll has
 * resolved — and that poll cannot have resolved during SSR or hydration. So the rendered output is
 * identical on both sides of hydration whatever the record says.
 *
 * `decline()` updates memory first (the card leaves even if storage throws), then persists.
 */
export function useSaveStarsAsk(orderId: string | null): { asked: boolean; decline: () => void } {
  const [declined, setDeclined] = useState<string[]>(readDeclined);
  const asked = orderId != null && saveStarsAsked(declined, orderId);

  function decline() {
    if (orderId == null) return;
    const next = recordDecline(declined, orderId);
    setDeclined(next);
    try {
      window.localStorage.setItem(SAVE_STARS_DECLINED_KEY, JSON.stringify(next));
    } catch {
      /* deliberate: the in-memory record already hid the card; the next visit may ask again */
    }
  }

  return { asked, decline };
}
