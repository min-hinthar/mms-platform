export { Sheet } from "./sheet";
// Nested framer domMax provider (Richness R5b) — drag/layout where used (Sheet swipe; future drag-to-assign)
export { DomMaxProvider } from "./dom-max-provider";
// re-export NumberFlow so apps import animated currency from one place
export { default as NumberFlow } from "@number-flow/react";
// Motion & perf foundation primitives (P5.3) — see docs/MOTION_AND_PERF.md
export { useAnimationPreference, useInView, useDeviceTier } from "./motion";
export type { DeviceTier } from "./motion";
// Pointer-spring micro-interactions (Richness R4) — need framer-motion + the MotionProvider
export { useTilt, useMagnetic, useHeroParallax, useRipple } from "./interactions";
export type { Ripple } from "./interactions";
// Presentational primitives (P5.4)
export { Badge } from "./badge";
export type { BadgeTone } from "./badge";
export { EmptyState } from "./empty-state";
export { OutageState, DegradedStrip, RetryButton } from "./fallback";
export { Avatar } from "./avatar";
export { Skeleton } from "./skeleton";
export { Stepper } from "./stepper";
export { Card } from "./card";
// Brand icon set (W2b) — curated lucide glyphs at one stroke weight; retires emoji-as-chrome
export { Icon, categoryIconName } from "./icon";
export type { IconName } from "./icon";
