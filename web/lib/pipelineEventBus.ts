import type { PipelineEventType } from "@/types/pipeline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (payload?: any) => void;

class PipelineEventBusClass {
  private handlers: Map<PipelineEventType, Set<EventHandler>> = new Map();

  on(event: PipelineEventType, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: PipelineEventType, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: PipelineEventType, payload?: any): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[PipelineEventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  /** Remove all handlers — useful for test teardown */
  reset(): void {
    this.handlers.clear();
  }
}

// Singleton — one instance shared across the entire app
const PipelineEventBus = new PipelineEventBusClass();
export default PipelineEventBus;