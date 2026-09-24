export { Sheet } from "./sheet";
// M76 — hold a sheet's subject through its exit (a parent that unmounts on close cuts the animation)
export { useSheetSubject, holdSubject } from "./sheet-subject";
export type { SheetSubjectState } from "./sheet-subject";
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
// Phase 1c · cart-motion — the one "same gesture" window (the Stepper's remove-arm + /cart's tap hold)
export { SAME_GESTURE_MS, removeHeld } from "./gesture";
export { Card } from "./card";
// Interaction primitives (Phase 0) — styled by `@mms/ui/primitives.css` (.ui-*)
export { Button, buttonClass } from "./button";
export type { ButtonVariant, ButtonSize } from "./button";
export { Toast } from "./toast";
export type { ToastMessage } from "./toast";
export { Field } from "./field";
export type { FieldControlProps } from "./field";
export { PageMasthead, Kicker } from "./masthead";
// Brand icon set (W2b) — curated lucide glyphs at one stroke weight; retires emoji-as-chrome
export { Icon, categoryIconName } from "./icon";
export type { IconName } from "./icon";
