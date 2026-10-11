"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * PD4 (Codex round 2 on #329, 4226434718) — does a page-owned sheet still COVER the Scan stage?
 *
 * The camera's hold (`decodeHold`) reads "a sheet is over the stage" from the page. A sheet's
 * `open` state turns false at the START of its exit, but Radix keeps the sheet and its scrim mounted
 * for the whole `--dur-sheet` exit (M76: the exit is CSS, and Presence unmounts on `animationend`).
 * Told "no sheet" that early, `BarcodeScanner` announces the next FRESH sighting — `sightBarcode`
 * emits on any barcode that differs from the last one — and `add()` charges a jar the shopper never
 * saw go in, behind a scrim they are still looking at.
 *
 * So the cover is up from the render a sheet opens until its exit has FINISHED: the caller passes
 * `exitEnd` as (or calls it from) the Sheet's `onCloseAutoFocus`, which the primitive fires at
 * UNMOUNT, after the exit (its documented M76 contract; instant under reduced motion, where the exit
 * is). If that signal never comes, the fail-safe lifts the cover anyway — a camera left swallowing
 * every sighting is a dead scanner, and a hold that errs long only costs a re-presented jar.
 *
 * `check:scan-repeat` proposition 5 PARSES the page so each page-owned sheet's cover reaches the
 * stage and its exit end reaches `exitEnd`. Pinned by `useStageCover.test.tsx` and its mutants.
 */

/** How long after a sheet's close STARTS the cover lifts with no exit-end signal. Above the exit's
 *  own `--dur-sheet` (the suite reads the token), and short enough that a missed signal never reads
 *  as a broken scanner. */
export const SHEET_EXIT_FAILSAFE_MS = 1000;

export function useStageCover(open: boolean): { covering: boolean; exitEnd: () => void } {
  const [cover, setCover] = useState(open);
  // Raised in the render the sheet opens (React's "adjust state when a prop changes" pattern), never
  // in an effect: the cover is already up in the commit that mounts the sheet. It also self-heals a
  // stale exit end — a sheet re-opened mid-exit is covered again on the next render.
  if (open && !cover) setCover(true);
  useEffect(() => {
    if (open || !cover) return;
    const id = window.setTimeout(() => setCover(false), SHEET_EXIT_FAILSAFE_MS);
    return () => window.clearTimeout(id);
  }, [open, cover]);
  const exitEnd = useCallback(() => setCover(false), []);
  return { covering: open || cover, exitEnd };
}
