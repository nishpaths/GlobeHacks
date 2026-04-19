import type { LandmarkSet, Landmark } from "@/types/pipeline";
import PipelineEventBus from "@/lib/pipelineEventBus";
import { PipelineConfig } from "@/config/pipelineConfig";

interface PoseEngineOptions {
  onInitFailure: () => void;
  onLandmarks: (landmarkSet: LandmarkSet) => void;
}

// MediaPipe Pose result type (subset we use)
interface PoseResults {
  poseLandmarks?: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }>;
}

const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
const INIT_TIMEOUT_MS = 10_000;

/**
 * PoseEngine — manages the MediaPipe Pose WASM lifecycle and the rAF frame loop.
 *
 * MediaPipe is loaded from CDN at runtime to avoid bundling ~8 MB of WASM
 * into the Next.js build. The frame loop uses requestAnimationFrame and waits
 * for each frame's onResults before scheduling the next to prevent pile-up.
 */
export class PoseEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pose: any = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private options: PoseEngineOptions | null = null;

  async init(options: PoseEngineOptions): Promise<void> {
    this.options = options;

    const initPromise = this.loadMediaPipe();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("PoseEngine init timeout")),
        INIT_TIMEOUT_MS
      )
    );

    try {
      await Promise.race([initPromise, timeoutPromise]);
    } catch {
      PipelineEventBus.emit("pose-engine-init-failure");
      options.onInitFailure();
      throw new Error("PoseEngine failed to initialise within 10 seconds");
    }

    // Set up offscreen canvas for frame capture
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCanvas.width = PipelineConfig.WEBCAM_WIDTH;
    this.offscreenCanvas.height = PipelineConfig.WEBCAM_HEIGHT;
    this.offscreenCtx = this.offscreenCanvas.getContext("2d");
  }

  private async loadMediaPipe(): Promise<void> {
    // Dynamically import @mediapipe/pose — loaded from CDN via package
    const { Pose } = await import("@mediapipe/pose");

    this.pose = new Pose({
      locateFile: (file: string) => `${MEDIAPIPE_CDN}/${file}`,
    });

    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // Resolve when MediaPipe fires its first onResults (confirms WASM loaded)
    await new Promise<void>((resolve) => {
      this.pose.onResults((results: PoseResults) => {
        this.handleResults(results);
        resolve(); // resolve on first callback — WASM is ready
      });
      // Send a blank frame to trigger initialisation
      const blank = document.createElement("canvas");
      blank.width = 1;
      blank.height = 1;
      this.pose.send({ image: blank }).catch(() => {
        // Ignore errors on the blank init frame
      });
    });
  }

  /**
   * Start the requestAnimationFrame loop against the given video element.
   * Each iteration draws the current frame to an offscreen canvas and sends
   * it to MediaPipe. The loop waits for onResults before scheduling the next
   * frame to prevent pile-up.
   */
  startLoop(videoEl: HTMLVideoElement): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleFrame(videoEl);
  }

  private scheduleFrame(videoEl: HTMLVideoElement): void {
    if (!this.isRunning) return;

    this.rafId = requestAnimationFrame(async () => {
      if (!this.isRunning || !this.pose || !this.offscreenCtx || !this.offscreenCanvas) return;

      // Draw current video frame to offscreen canvas
      this.offscreenCtx.drawImage(
        videoEl,
        0,
        0,
        PipelineConfig.WEBCAM_WIDTH,
        PipelineConfig.WEBCAM_HEIGHT
      );

      try {
        await this.pose.send({ image: this.offscreenCanvas });
      } catch {
        // Ignore individual frame errors — continue loop
      }

      // Schedule next frame after results have been processed
      this.scheduleFrame(videoEl);
    });
  }

  private handleResults(results: PoseResults): void {
    if (!results.poseLandmarks || !this.options) return;

    const landmarks: Landmark[] = results.poseLandmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 0,
    }));

    // Emit low-confidence events for any landmark below threshold
    landmarks.forEach((lm, idx) => {
      if (lm.visibility < PipelineConfig.POSE_CONFIDENCE_THRESHOLD) {
        PipelineEventBus.emit("low-confidence-landmark", { index: idx, visibility: lm.visibility });
      }
    });

    const landmarkSet: LandmarkSet = {
      landmarks,
      frameTimestamp: performance.now(),
    };

    this.options.onLandmarks(landmarkSet);
  }

  /** Stop the frame loop and release MediaPipe resources. */
  destroy(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.pose) {
      try {
        this.pose.close();
      } catch {
        // Ignore close errors
      }
      this.pose = null;
    }
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.options = null;
  }
}