"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@mms/ui";
import { useDeviceOffline } from "@/lib/useConnectionTruth";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * Phase 2b · feedback — the staff bar's LAST child, on every page. Two jobs:
 *
 * 1. THE OFFLINE ROW, on pages with NO feed (menu, tips, glossary, team, sign-in, lock, the doors):
 *    a device offline for `NET_SHOW_MS` of UNBROKEN outage gets one in-flow line inside the sticky
 *    bar — never over a control, and the bar stays the page's only sticky element. It hides the
 *    moment the device is back (no "back online" dwell): one reflow per real transition. A feed page
 *    (`feed`) draws NO row — its status slot already says Offline and its boards' frozen copy carries
 *    the paper escalation, so nothing ever covers or moves the KDS head. A `we-down` probe verdict
 *    never shows here — the device is fine, and the boards' outage voice owns that case.
 *    `role="status"` (blind review, 2026-09-24 — it was `note`, which is SILENT): on a feedless page
 *    this row is the ONLY carrier of "offline", so it must be spoken. The region is ALWAYS MOUNTED
 *    on a feedless page (visually hidden and empty while online) and only its text comes and goes —
 *    several screen-reader/browser pairs skip a live region born with its text (the Toast's rule).
 *    Hidden, it is absolutely positioned, so it is no flex item and takes no gap. It speaks ONE fact
 *    no other region on those pages carries (their own regions speak their own outcomes), so it
 *    never repeats a sentence — the QA §A rule is about redundancy (StaffLangSwitch's reading).
 *
 * 2. THE ONE PUBLISHER of `--staff-bar-h` (plan conflict: tablet-split × feedback): the header's
 *    measured height, on `<html>`, kept current by a ResizeObserver and removed on unmount. The root's
 *    `scroll-padding-top` reads it, so a keyboard-focused control never parks UNDER the sticky bar
 *    (WCAG 2.4.11) — the offline row included. Everything else that needs the bar's height READS it.
 *
 * The header is reached through a `hidden` probe's parent: `hidden` is `display: none`, so the probe
 * is not a flex item and takes no gap — a bar with no row is laid out exactly as before.
 */
export function StaffBarNet({ lang, feed }: { lang: StaffLang; feed: boolean }) {
  const offline = useDeviceOffline();
  const probe = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = probe.current?.parentElement;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--staff-bar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    publish();
    // No observer (an old engine): the one measurement above stands, the CSS fallback below it.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--staff-bar-h");
    };
  }, []);
  return (
    <>
      {!feed && (
        <div className={offline ? "staff-net mms-rise" : "sr-only"} role="status">
          {offline && (
            <>
              <Icon name="offline" size={18} />
              <span>
                <Chrome lang={lang} k="shell.net.offline" />
              </span>
            </>
          )}
        </div>
      )}
      <span ref={probe} hidden />
    </>
  );
}
