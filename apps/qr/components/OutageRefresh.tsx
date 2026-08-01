"use client";
import { useRouter } from "next/navigation";
import { OutageState } from "@mms/ui";
import type { ComponentProps } from "react";

/**
 * W10a — the RSC-friendly outage state: server pages can't retry in place, so this client shell
 * gives OutageState a real in-place retry (`router.refresh()` re-runs the server render without
 * losing client state — never `location.reload()`).
 */
export function OutageRefresh(
  props: Omit<ComponentProps<typeof OutageState>, "onRetry"> & { focusOnMount?: boolean },
) {
  const router = useRouter();
  // Escalation counts TAPS here, not proven failures — deliberate: router.refresh() resolves
  // before the new RSC payload lands, but a SUCCESSFUL refresh unmounts this whole state (the page
  // renders data instead), so any tap that leaves the counter alive to increment WAS a failure.
  return <OutageState {...props} onRetry={() => router.refresh()} />;
}
