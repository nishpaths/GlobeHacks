"use client";

import React from "react";

interface RepositioningOverlayProps {
  visible: boolean;
}

/**
 * Semi-transparent overlay shown when alignment warning rate exceeds 50%
 * in a 3-second window — indicating camera perspective distortion.
 * Framed as a wellness/mobility guidance message per brand guidelines.
 */
export default function RepositioningOverlay({ visible }: RepositioningOverlayProps) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm"
    >
      <div className="mx-4 rounded-xl border border-amber-400/50 bg-amber-900/80 p-6 text-center shadow-xl">
        <div className="mb-3 text-3xl">🎯</div>
        <h3 className="mb-2 text-base font-semibold text-amber-200">
          Adjust Your Position
        </h3>
        <p className="max-w-xs text-sm text-amber-100/90">
          For the most accurate mobility insights, please step back so your
          full body is visible and face the camera directly.
        </p>
        <p className="mt-3 text-xs text-amber-300/70">
          Optimal distance: 2–3 metres from the camera
        </p>
      </div>
    </div>
  );
}
