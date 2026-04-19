/**
 * Fixed-capacity ring buffer backed by Float32Array.
 * null values are encoded as NaN in the underlying array.
 * Avoids GC pressure from dynamic array growth.
 */
export class RingBuffer {
  private readonly buf: Float32Array;
  private _writeIndex: number = 0;
  private _count: number = 0;

  constructor(readonly capacity: number) {
    this.buf = new Float32Array(capacity);
    this.buf.fill(NaN);
  }

  get writeIndex(): number {
    return this._writeIndex;
  }

  get count(): number {
    return this._count;
  }

  /** Push a value (or null) into the buffer, overwriting the oldest entry when full. */
  push(value: number | null): void {
    this.buf[this._writeIndex] = value === null ? NaN : value;
    this._writeIndex = (this._writeIndex + 1) % this.capacity;
    if (this._count < this.capacity) this._count++;
  }

  /**
   * Return the last `n` entries (most recent first is NOT guaranteed —
   * entries are in insertion order from oldest to newest within the filled window).
   * Returns an array of (number | null) of length min(n, count).
   */
  toArray(n?: number): (number | null)[] {
    const len = Math.min(n ?? this._count, this._count);
    const result: (number | null)[] = [];

    // Start from the oldest entry in the filled window
    const start = this._count < this.capacity
      ? 0
      : this._writeIndex;

    for (let i = 0; i < len; i++) {
      const idx = (start + (this._count - len) + i) % this.capacity;
      const v = this.buf[idx];
      result.push(isNaN(v) ? null : v);
    }
    return result;
  }

  /** Drain all entries as an array and reset the buffer. */
  drain(): (number | null)[] {
    const all = this.toArray();
    this.reset();
    return all;
  }

  reset(): void {
    this.buf.fill(NaN);
    this._writeIndex = 0;
    this._count = 0;
  }
}
