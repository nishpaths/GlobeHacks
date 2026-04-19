// Mock for @mediapipe/pose — used in Jest (WASM cannot run in Node.js)
export class Pose {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resultsCallback: ((results: any) => void) | null = null;

  setOptions(_options: unknown): void {}

  onResults(callback: (results: unknown) => void): void {
    this.resultsCallback = callback;
  }

  async send(_input: unknown): Promise<void> {
    // Simulate empty results by default
    this.resultsCallback?.({ poseLandmarks: null });
  }

  close(): void {}
}
