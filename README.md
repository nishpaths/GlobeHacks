# Hydrawav3 — Recovery Intelligence Platform

A real-time biomechanics capture and recovery recommendation system built for the GlobeHacks hackathon. The app uses your device's webcam and MediaPipe Pose to track joint angles during movement, detect left/right asymmetry, and generate targeted recovery protocol suggestions powered by AI.

**Live demo:** https://motiontelemetry.insforge.site

---

## What it does

1. **Live pose detection** — MediaPipe Pose runs in the browser via WebAssembly, tracking 33 body landmarks at up to 30fps through your webcam.

2. **Movement capture** — An 8-second capture window records joint angle series for knees and hips as you perform slow squats.

3. **Asymmetry analysis** — The pipeline computes left/right peak flexion deltas and flags imbalances that exceed a configurable threshold.

4. **Recovery protocol generation** — When asymmetry is detected, the system POSTs telemetry to the backend API, which:
   - Runs AI-generated protocol settings (thermal cycle, photobiomodulation wavelengths, mechanical frequency)
   - Produces a clinical explanation of why those settings were chosen
   - Saves the session to the InsForge database

5. **Zone map** — A front/back body silhouette highlights the exact muscle zones targeted by the Sun (activation) and Moon (support) pads.

6. **Results screen** — A frozen result screen shows pad placement instructions, protocol values, AI explanation, and a technical event timeline.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, shadcn/ui |
| Pose detection | MediaPipe Pose (loaded from CDN) |
| Backend / DB | InsForge (Postgres + Edge Functions) |
| AI | Claude Sonnet via InsForge AI gateway |
| Deployment | InsForge Deployments (Vercel-backed) |

---

## Project structure

```
web/
├── app/
│   ├── (marketing)/        # Landing page
│   ├── demo/               # Live capture demo page
│   └── api/telemetry/      # POST /api/telemetry — analysis + DB ingest
├── components/
│   ├── capture-overlay.tsx # Main capture UI + pose canvas + results
│   ├── zone-map/           # Front/back body SVG zone map
│   └── landing/            # Landing page components
├── hooks/
│   └── useSensorPipeline.ts # Orchestrates the full CV pipeline
├── modules/
│   ├── poseEngine.ts        # MediaPipe lifecycle + rAF loop
│   ├── angleCalculator.ts   # 2D/3D joint angle computation
│   ├── alignmentValidator.ts# Alignment warning detection
│   └── outlierDetector.ts   # Rep detection + asymmetry scoring
├── lib/
│   ├── telemetry-ingest.ts  # DB write logic (demo auth bypass)
│   ├── protocol-engine.ts   # AI protocol generation with fallbacks
│   └── telemetry-contract.ts# AJV schema validation
└── config/
    └── pipelineConfig.ts    # All tunable pipeline thresholds
```

---

## Running locally

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. Allow camera access when prompted.

### Environment variables

Create `web/.env`:

```env
NEXT_PUBLIC_INSFORGE_BASE_URL=https://<your-appkey>.us-west.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=<your-anon-key>
INSFORGE_API_KEY=<your-admin-key>
```

Without these, the app still runs — telemetry POSTs will fail silently and the AI explanation falls back to a static string.

---

## How to use the demo

1. Open `http://localhost:3000` and click **Live demo**
2. Allow camera access when prompted
3. Hit **Start Protocol** — a 3-second countdown begins, then an 8-second capture window opens
4. Perform 2–3 slow squats during the capture window
5. The results screen appears automatically with pad placement, protocol values, and an AI explanation

On mobile, use the **Flip Camera** button (camera icon) to switch between front and rear cameras.

---

## Pipeline configuration

Key thresholds in `web/config/pipelineConfig.ts`:

| Setting | Value | Description |
|---|---|---|
| `POSE_CONFIDENCE_THRESHOLD` | 0.4 | Min landmark visibility to process |
| `ALIGNMENT_THRESHOLD_DEG` | 25 | Max 2D/3D angle divergence before warning |
| `ASYMMETRY_THRESHOLD_DEG` | 10 | Min left/right delta to flag imbalance |
| `ALIGNMENT_WARNING_WINDOW_FRAMES` | 10 | Frames to evaluate for repositioning banner |
| `RESTING_ANGLE_CALIBRATION_FRAMES` | 30 | Frames averaged to establish resting angle |

---

## Deploying

```bash
cd web
npx @insforge/cli deployments deploy . --env '{"NEXT_PUBLIC_INSFORGE_BASE_URL":"...","INSFORGE_API_KEY":"..."}' -y
```
