type Listener<A extends unknown[]> = (...args: A) => void;

export interface EventEmitterOptions<E> {
  onListenerError?(error: unknown, event: keyof E): void;
}

/** Typed event bus. A throwing listener never stops the others. */
export class EventEmitter<E extends { [K in keyof E]: unknown[] }> {
  private readonly listeners = new Map<keyof E, Set<Listener<any>>>();

  constructor(private readonly options: EventEmitterOptions<E> = {}) {}

  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => this.off(event, fn);
  }

  off<K extends keyof E>(event: K, fn: Listener<E[K]>): void {
    this.listeners.get(event)?.delete(fn);
  }

  emit<K extends keyof E>(event: K, ...args: E[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        fn(...args);
      } catch (error) {
        if (this.options.onListenerError) this.options.onListenerError(error, event);
        else console.error(error);
      }
    }
  }

  listenerCount<K extends keyof E>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
