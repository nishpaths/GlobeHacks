import { cn } from "@/lib/utils";

/**
 * Decorative vector backdrops — abstract muscular torso readouts (not clinical imagery).
 * Pure SVG, no bitmaps.
 */
export function MuscleSilhouettes({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      {/* Back view — dominant, stage left */}
      <svg
        className="landing-muscle-a absolute -left-[6%] top-[8%] h-[min(88vh,780px)] w-[min(42vw,420px)] text-cyan-400/90"
        viewBox="0 0 160 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="muscle-fade-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Outer silhouette — back view */}
        <path
          d="M80 18C58 18 42 30 40 48c-2 4-4 12-2 20l-5 40c-5 47-1 105 12 152 4 14 12 28 24 38 2 2 6 3 11 3s9-1 11-3c12-10 20-24 24-38 13-47 17-105 12-152l-5-40c2-8 0-16-2-20-2-18-18-30-40-30z"
          fill="url(#muscle-fade-a)"
        />
        {/* Spine */}
        <path
          d="M80 52v148"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        {/* Trapezius / upper back */}
        <path
          d="M52 58c10-6 20-8 28-8s18 2 28 8"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        <path
          d="M58 72c12-10 24-12 22-12s10 2 22 12"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="0.85"
          strokeLinecap="round"
        />
        {/* Lat sweeps */}
        <path
          d="M44 95c18 22 36 32 36 32s18-10 36-32"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="0.85"
          strokeLinecap="round"
        />
        <path
          d="M48 118c14 18 28 26 32 26s18-8 32-26"
          stroke="currentColor"
          strokeOpacity="0.26"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        {/* Mid-back “diamond” */}
        <path
          d="M68 155c8 6 12 10 12 10s4-4 12-10"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
        {/* Lumbar erectors */}
        <path
          d="M62 188c6 14 10 22 18 28s12-14 18-28"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
        <path
          d="M66 212c4 10 8 16 14 20s10-10 14-20"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        {/* Glute shelf */}
        <path
          d="M52 248c10 10 20 14 28 14s18-4 28-14"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="0.85"
          strokeLinecap="round"
        />
        {/* Rear delt / rotator hint */}
        <path
          d="M42 70c-6 10-8 22-6 34"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        <path
          d="M118 70c6 10 8 22 6 34"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
      </svg>

      {/* Front view — smaller, mirrored right */}
      <svg
        className="landing-muscle-b absolute -right-[4%] bottom-[6%] h-[min(62vh,520px)] w-[min(32vw,300px)] text-violet-400/90"
        viewBox="0 0 140 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="muscle-fade-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M70 16C52 16 40 28 38 44c-2 6-2 14 0 22l-4 38c-4 40 0 90 10 132 3 12 10 24 20 32 2 2 5 3 6 3s4-1 6-3c10-8 17-20 20-32 10-42 14-92 10-132l-4-38c2-8 2-16 0-22-2-16-14-28-32-28z"
          fill="url(#muscle-fade-b)"
        />
        {/* Sternum line */}
        <path
          d="M70 56v118"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        {/* Pectoral curves */}
        <path
          d="M38 78c14 12 22 18 32 20"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <path
          d="M102 78c-14 12-22 18-32 20"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        {/* Ab stack */}
        <path
          d="M52 138h36"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="0.65"
          strokeLinecap="round"
        />
        <path
          d="M54 154h32"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="0.65"
          strokeLinecap="round"
        />
        <path
          d="M56 170h28"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="0.65"
          strokeLinecap="round"
        />
        <path
          d="M58 186h24"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="0.65"
          strokeLinecap="round"
        />
        {/* Serratus / oblique hint */}
        <path
          d="M36 112c8 18 14 28 18 32"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        <path
          d="M104 112c-8 18-14 28-18 32"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        {/* Quad separation */}
        <path
          d="M70 218v42"
          stroke="currentColor"
          strokeOpacity="0.24"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
