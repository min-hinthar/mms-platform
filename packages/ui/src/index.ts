export { Sheet } from "./sheet";
// re-export NumberFlow so apps import animated currency from one place
export { default as NumberFlow } from "@number-flow/react";
// Motion & perf foundation primitives (P5.3) — see docs/MOTION_AND_PERF.md
export { useAnimationPreference, useInView, useDeviceTier } from "./motion";
export type { DeviceTier } from "./motion";
// Presentational primitives (P5.4)
export { Badge } from "./badge";
export type { BadgeTone } from "./badge";
export { EmptyState } from "./empty-state";
export { Avatar } from "./avatar";
