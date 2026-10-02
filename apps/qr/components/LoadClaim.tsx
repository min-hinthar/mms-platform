"use client";
import { useEffect } from "react";
import { thisLoad } from "@/lib/tab-load";

/**
 * Phase 2i (P2bi) · S0 critic F5 — claims THIS document's load generation (`thisLoad`) on EVERY
 * document of the origin, mounted once in the root layout.
 *
 * The generation is what binds a stash (the lane's picks) to the IMMEDIATELY next load of the same
 * page. Claimed lazily by the feature that reads it, a document that never read it — any page outside
 * the staff tree, loaded between two lane documents — left the counter where it was, so the second
 * lane document read as "immediately after" the first and resumed picks across a page in between.
 * Claimed here, every hydrated document advances it. (A document that never hydrates — the service
 * worker's offline page, a load abandoned before hydration — still cannot; that residual is the
 * caller's TTL-free "mark these again" path, never a resume of the wrong work.)
 */
export function LoadClaim(): null {
  useEffect(() => {
    thisLoad();
  }, []);
  return null;
}
