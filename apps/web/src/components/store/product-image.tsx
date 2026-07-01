"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  onClick?: () => void;
}

/**
 * Remote product image with graceful degradation: renders a neutral
 * placeholder when `src` is absent or fails to load, so a missing/broken
 * image never leaves an empty box or breaks the card (Spec 007 acceptance).
 * Intrinsic width/height are passed through when known to curb layout shift.
 */
export function ProductImage({
  src,
  alt,
  className,
  width,
  height,
  onClick,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground",
          className,
        )}
        aria-label={alt}
        role="img"
      >
        <ImageOff size={28} />
      </div>
    );
  }

  return (
    // Remote catalog images; next/image domains are intentionally not configured (Spec plan §13).
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      onClick={onClick}
      className={className}
    />
  );
}
