"use client";
import { useEffect } from "react";
import { primeSound } from "@/lib/diner-sound";

/**
 * W22f — re-arms the audio context once per document, from the diner's first gesture.
 *
 * Mounted at the root because the preference outlives the page and the AudioContext does not: without
 * this, sound worked only on the load where the toggle was tapped and was silently dead on every one
 * after, with the switch still reading ON. All the policy lives in `lib/chime.ts` and all the
 * plumbing in `lib/diner-sound.ts`; this component exists solely to own the listener's lifetime.
 *
 * Costs nothing when sound is off — `primeSound` re-reads the preference inside the handler, so a
 * guest who never enabled it never constructs a context.
 */
export function SoundPrimer() {
  useEffect(() => primeSound(), []);
  return null;
}
