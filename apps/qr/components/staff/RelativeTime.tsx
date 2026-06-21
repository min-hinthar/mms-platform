"use client";
import { useEffect, useState } from "react";

/**
 * Relative "last activity" label for the floor (S1.2). Hydration-safe: the FIRST render computes from
 * the server-provided `serverNow` (a fixed prop → identical HTML on server and client, no mismatch),
 * then a client effect ticks it from the real clock. Clock skew between the staff tablet and the server
 * is absorbed by seeding the offset from `serverNow`; a still-negative diff (future) clamps to "just now".
 */
export function RelativeTime({ iso, serverNow }: { iso: string; serverNow: string }) {
  const [label, setLabel] = useState(() => format(iso, new Date(serverNow).getTime()));

  useEffect(() => {
    // Correct for device/server clock skew once, then tick from the real clock.
    const skew = Date.now() - new Date(serverNow).getTime();
    const update = () => setLabel(format(iso, Date.now() - skew));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [iso, serverNow]);

  // Machine-readable timestamp for assistive tech / hover; the text is the human relative label.
  return <time dateTime={iso}>{label}</time>;
}

function format(iso: string, nowMs: number): string {
  const diffSec = Math.round((nowMs - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
