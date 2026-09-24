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
 *    the paper escalation, so nothing ever covers or moves the KDS head. `role="note"`: ambient, not a
 *    new live region. A `we-down` probe verdict never shows here — the device is fine, and the
 *    boards' outage voice owns that case.
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
      <span ref={probe} hidden />
      {offline && !feed && (
        <div className="staff-net mms-rise" role="note">
          <Icon name="offline" size={18} />
          <span>
            <Chrome lang={lang} k="shell.net.offline" />
          </span>
        </div>
      )}
    </>
  );
}
