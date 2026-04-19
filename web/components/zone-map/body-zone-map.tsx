"use client";

import type { RecommendedPad } from "@globe/contracts";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Potrace silhouette served from `web/public`. */
export const BODY_ZONE_MAP_IMAGE_SRC = "/2029276.svg";

type ZoneRect = { label: string; x: number; y: number; width: number; height: number };

/**
 * Normalized 0–100 coordinates (viewBox 0 0 100 100), aligned with prior percentage `ZONE_LAYOUT`.
 * Quadriceps vs hamstrings use distinct vertical bands (previously duplicated).
 */
const ZONE_LAYOUT: Record<string, ZoneRect> = {
  // ── FRONT BODY ─────────────────────────────────────────────────────────────
  // Convention: right_* = viewer's right (x ~16-26), left_* = viewer's left (x ~32-42)
  right_quadriceps: {
    label: "Right quadriceps",
    x: 17,
    y: 60,
    width: 10,
    height: 10,
  },
  left_quadriceps: {
    label: "Left quadriceps",
    x: 33,
    y: 60,
    width: 10,
    height: 10,
  },
  right_hip_flexors: {
    label: "Right hip flexors",
    x: 18,
    y: 49,
    width: 10,
    height: 10,
  },
  left_hip_flexors: {
    label: "Left hip flexors",
    x: 32,
    y: 49,
    width: 10,
    height: 10,
  },
  right_biceps: {
    label: "Right biceps",
    x: 14,
    y: 37,
    width: 9,
    height: 12,
  },
  left_biceps: {
    label: "Left biceps",
    x: 37,
    y: 37,
    width: 9,
    height: 12,
  },
  right_deltoids: {
    label: "Right deltoids",
    x: 14,
    y: 27,
    width: 11,
    height: 9,
  },
  left_deltoids: {
    label: "Left deltoids",
    x: 35,
    y: 27,
    width: 11,
    height: 9,
  },
  right_shoulder: {
    label: "Right shoulder",
    x: 14,
    y: 27,
    width: 11,
    height: 9,
  },
  left_shoulder: {
    label: "Left shoulder",
    x: 35,
    y: 27,
    width: 11,
    height: 9,
  },
  right_tibialis: {
    label: "Right tibialis",
    x: 18,
    y: 72,
    width: 8,
    height: 12,
  },
  left_tibialis: {
    label: "Left tibialis",
    x: 34,
    y: 72,
    width: 8,
    height: 12,
  },
  right_hip: {
    label: "Right hip",
    x: 18,
    y: 48,
    width: 10,
    height: 10,
  },
  left_hip: {
    label: "Left hip",
    x: 32,
    y: 48,
    width: 10,
    height: 10,
  },

  // ── BACK BODY ──────────────────────────────────────────────────────────────
  // Convention: right_* = viewer's right (x ~54-64), left_* = viewer's left (x ~70-80)
  right_hamstrings: {
    label: "Right hamstrings",
    x: 71,
    y: 60,
    width: 10,
    height: 10,
  },
  left_hamstrings: {
    label: "Left hamstrings",
    x: 55,
    y: 60,
    width: 10,
    height: 10,
  },
  right_glutes: {
    label: "Right glutes",
    x: 71,
    y: 49,
    width: 10,
    height: 11,
  },
  left_glutes: {
    label: "Left glutes",
    x: 61,
    y: 49,
    width: 10,
    height: 11,
  },
  right_triceps: {
    label: "Right triceps",
    x: 75,
    y: 37,
    width: 9,
    height: 12,
  },
  left_triceps: {
    label: "Left triceps",
    x: 52,
    y: 37,
    width: 9,
    height: 12,
  },
  right_rotator_cuff: {
    label: "Right rotator cuff",
    x: 72,
    y: 29,
    width: 10,
    height: 9,
  },
  left_rotator_cuff: {
    label: "Left rotator cuff",
    x: 54,
    y: 29,
    width: 10,
    height: 9,
  },
  right_calves: {
    label: "Right calves",
    x: 71,
    y: 72,
    width: 9,
    height: 12,
  },
  left_calves: {
    label: "Left calves",
    x: 56,
    y: 72,
    width: 9,
    height: 12,
  },
};

/** Map API/demo muscle keys to a zone we can highlight. */
export function resolveMuscleToZoneKey(targetMuscle: string): string {
  if (targetMuscle.endsWith("_gluteus_medius")) {
    return targetMuscle.replace("_gluteus_medius", "_glutes");
  }
  return targetMuscle;
}

function formatMuscleLabel(muscle: string): string {
  return muscle
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function BodyZoneMap({ pads }: { pads: RecommendedPad[] }) {
  return (
    <div
      className={cn(
        "relative h-[26rem] overflow-hidden rounded-[2rem] border border-white/10",
        "bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.18),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))]",
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:36px_36px] opacity-25" />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Body zone map with pad placement"
      >
        <defs>
          <filter id="zone-map-soft-glow-sun" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="zone-map-soft-glow-moon" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <image
          href={BODY_ZONE_MAP_IMAGE_SRC}
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid meet"
          className="opacity-[0.42]"
          style={{ filter: "brightness(0) invert(1)" }}
        />

        {pads.map((pad) => {
          const zoneKey = resolveMuscleToZoneKey(pad.targetMuscle);
          const zone = ZONE_LAYOUT[zoneKey];
          if (!zone) {
            return null;
          }
          const isSun = pad.padType === "Sun";
          return (
            <rect
              key={`highlight-${pad.padType}-${pad.targetMuscle}`}
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx={2.2}
              ry={2.2}
              className={cn(
                "pointer-events-none animate-pulse",
                isSun
                  ? "fill-orange-400/22 stroke-orange-300/55"
                  : "fill-sky-400/18 stroke-sky-300/50",
              )}
              strokeWidth={0.6}
              filter={isSun ? "url(#zone-map-soft-glow-sun)" : "url(#zone-map-soft-glow-moon)"}
            />
          );
        })}


      </svg>

      <div className="absolute inset-x-6 bottom-5 flex flex-wrap gap-2">
        {pads.map((pad) => {
          const zoneKey = resolveMuscleToZoneKey(pad.targetMuscle);
          const label = ZONE_LAYOUT[zoneKey]?.label ?? formatMuscleLabel(pad.targetMuscle);
          return (
            <Badge
              key={`legend-${pad.padType}-${pad.targetMuscle}`}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em]",
                pad.padType === "Sun"
                  ? "bg-orange-400/18 text-orange-100 ring-1 ring-orange-300/20"
                  : "bg-sky-400/18 text-sky-100 ring-1 ring-sky-300/20",
              )}
            >
              {pad.padType} • {label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
