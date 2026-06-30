"use client";
import Image from "next/image";
import { useState } from "react";

/**
 * Blur-up thumbnail (R6a). `next/image` that fades + un-blurs on load (`filter: blur(8px) scale(1.05)` →
 * clear), over the parent's gradient placeholder — no broken-image flash. transform/opacity/filter only
 * (GPU-safe, one-shot — not a loop); the `.blur-up` CSS carries a `prefers-reduced-motion` off-switch.
 * A failed load removes the img so the gradient placeholder shows through (the caller sets the bg).
 */
export function BlurUpImage({
  src,
  alt,
  width,
  height,
  sizes,
}: {
  src: string | null;
  alt: string;
  width: number;
  height: number;
  sizes: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  if (!src || errored) return null;
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      onLoad={() => setLoaded(true)}
      onError={() => setErrored(true)}
      className={`blur-up${loaded ? " on" : ""}`}
      style={{ objectFit: "cover", width: "100%", height: "100%" }}
    />
  );
}
