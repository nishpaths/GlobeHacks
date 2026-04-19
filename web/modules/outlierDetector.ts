import type {
    ValidatedAngleFrame,
    RepetitionResult,
    AsymmetryResult,
    KineticChainConfig,
  } from "@/types/pipeline";
  import { RingBuffer } from "@/lib/ringBuffer";
  import PipelineEventBus from "@/lib/pipelineEventBus";
  import { PipelineConfig, type PipelineConfigType } from "@/config/pipelineConfig";
  
  type RepState = "BELOW_NEUTRAL" | "ABOVE_NEUTRAL";
  
  interface JointState {
    buffer: RingBuffer;
    repState: RepState;
    currentRepAngles: (number | null)[];
    restingAngle: number;
    calibrationFrames: number[];
    isCalibrated: boolean;
  }

  export interface OutlierDetectorDebugState {
    calibratedJoints: number;
    totalJoints: number;
    calibrationProgress: number;
  }
  
  /**
   * Stage 3 – Outlier Detection Engine.
   *
   * Maintains per-joint ring buffers and threshold-crossing state machines.
   * Detects repetition boundaries, computes max flexion, and flags asymmetry outliers.
   */
  export class OutlierDetector {
    private readonly config: PipelineConfigType;
    private jointStates: Map<string, JointState> = new Map();
  
    constructor(config: PipelineConfigType = PipelineConfig) {
      this.config = config;
      this.initJointStates();
    }
  
    private initJointStates(): void {
      for (const joint of this.config.JOINTS) {
        this.jointStates.set(joint.name, {
          buffer: new RingBuffer(this.config.RING_BUFFER_CAPACITY),
          repState: "BELOW_NEUTRAL",
          currentRepAngles: [],
          restingAngle: 0,
          calibrationFrames: [],
          isCalibrated: false,
        });
      }
    }
  
    /**
     * Process one validated angle frame.
     * Returns any RepetitionResults completed during this frame.
     */
    processFrame(frame: ValidatedAngleFrame): RepetitionResult[] {
      const completed: RepetitionResult[] = [];
  
      for (const [jointName, angleResult] of Object.entries(frame.angles)) {
        const state = this.jointStates.get(jointName);
        if (!state) continue;
  
        const angle = angleResult.angle3D; // use 3D angle as primary signal
        state.buffer.push(angle);
  
        if (angle === null) {
          // Null frame — push null into current rep series but don't change state
          if (state.repState === "ABOVE_NEUTRAL") {
            state.currentRepAngles.push(null);
          }
          continue;
        }
  
        // Calibration: collect first N frames to compute resting angle
        if (!state.isCalibrated) {
          state.calibrationFrames.push(angle);
          if (state.calibrationFrames.length >= this.config.RESTING_ANGLE_CALIBRATION_FRAMES) {
            const sum = state.calibrationFrames.reduce((a, b) => a + b, 0);
            state.restingAngle = sum / state.calibrationFrames.length;
            state.isCalibrated = true;
          }
          continue;
        }
  
        const flexionThreshold =
          state.restingAngle - this.config.RETURN_TO_NEUTRAL_OFFSET_DEG;

        if (state.repState === "BELOW_NEUTRAL") {
          if (angle < flexionThreshold) {
            // Transition to ABOVE_NEUTRAL — start collecting rep once the
            // joint bends below the calibrated resting angle by the configured offset.
            state.repState = "ABOVE_NEUTRAL";
            state.currentRepAngles = [angle];
          }
        } else {
          // ABOVE_NEUTRAL
          if (angle >= flexionThreshold) {
            // Transition back to BELOW_NEUTRAL — flush completed repetition
            // Do NOT include the return-to-neutral frame in the series
            state.repState = "BELOW_NEUTRAL";
            const rep = this.flushRepetition(jointName, state.currentRepAngles);
            state.currentRepAngles = [];
            if (rep) completed.push(rep);
          } else {
            state.currentRepAngles.push(angle);
          }
        }
      }
  
      return completed;
    }
  
    private flushRepetition(
      jointName: string,
      series: (number | null)[]
    ): RepetitionResult | null {
      const validAngles = series.filter((v): v is number => v !== null);
  
      if (validAngles.length < this.config.MIN_VALID_ANGLES_PER_REP) {
        PipelineEventBus.emit("repetition-discarded", {
          joint: jointName,
          reason: `Only ${validAngles.length} valid angles (min ${this.config.MIN_VALID_ANGLES_PER_REP})`,
        });
        return null;
      }
  
      // For joints like the knee, deeper flexion means a smaller interior angle.
      const maxFlexion = Math.min(...validAngles);
      return { joint: jointName, angleSeries: validAngles, maxFlexion };
    }
  
    /**
     * Compute asymmetry results for all kinetic chains given a set of repetition results.
     * Pairs the most recent left and right repetition for each chain.
     */
    getAsymmetry(
      reps: RepetitionResult[],
      chains: readonly KineticChainConfig[] = this.config.KINETIC_CHAINS
    ): AsymmetryResult[] {
      const results: AsymmetryResult[] = [];
  
      for (const chain of chains) {
        // Find the last rep for each side
        const leftRep = [...reps].reverse().find((r) => r.joint === chain.left);
        const rightRep = [...reps].reverse().find((r) => r.joint === chain.right);
  
        if (!leftRep || !rightRep) continue;
  
        const delta = Math.abs(leftRep.maxFlexion - rightRep.maxFlexion);
        results.push({
          joint: chain.joint,
          left: leftRep.maxFlexion,
          right: rightRep.maxFlexion,
          delta,
          thresholdExceeded: delta > this.config.ASYMMETRY_THRESHOLD_DEG,
        });
      }
  
      return results;
    }
  
    /** Reset all buffers and state machines. */
    reset(): void {
      this.jointStates.clear();
      this.initJointStates();
    }

    getDebugState(): OutlierDetectorDebugState {
      let calibratedJoints = 0;
      let progressSum = 0;

      for (const state of this.jointStates.values()) {
        if (state.isCalibrated) {
          calibratedJoints += 1;
          progressSum += 1;
          continue;
        }

        progressSum += Math.min(
          state.calibrationFrames.length / this.config.RESTING_ANGLE_CALIBRATION_FRAMES,
          1
        );
      }

      const totalJoints = this.jointStates.size;

      return {
        calibratedJoints,
        totalJoints,
        calibrationProgress: totalJoints === 0 ? 0 : progressSum / totalJoints,
      };
    }
  }
