// ============================================
// CENTRAL EVENT BUS
// Enables cross-module communication
// ============================================

type EventHandler<T = any> = (payload: T) => Promise<void> | void;

interface EventSubscription {
  id: string;
  event: string;
  handler: EventHandler;
  priority: number;
}

class EventBus {
  private subscriptions: EventSubscription[] = [];

  subscribe<T>(event: string, handler: EventHandler<T>, priority: number = 0): () => void {
    const id = `${event}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.subscriptions.push({ id, event, handler, priority });
    this.subscriptions.sort((a, b) => b.priority - a.priority);
    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s.id !== id);
    };
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const handlers = this.subscriptions.filter((s) => {
      if (s.event === event) return true;
      if (s.event.endsWith('*')) {
        return event.startsWith(s.event.slice(0, -1));
      }
      return false;
    });

    for (const sub of handlers) {
      try {
        await sub.handler(payload);
      } catch (error) {
        console.error(`Event handler error for ${event}:`, error);
      }
    }
  }
}

export const eventBus = new EventBus();

// Type-safe helpers
export function emitEvent(event: string, payload: any): Promise<void> {
  return eventBus.emit(event, payload);
}

export function onEvent(event: string, handler: EventHandler, priority?: number): () => void {
  return eventBus.subscribe(event, handler, priority);
}
