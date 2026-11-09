export type Listener<T> = (value: T) => void;

/** Small subscription helper shared by the device and theme watchers. */
export class Signal<T> {
  private readonly listeners = new Set<Listener<T>>();
  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(value: T): void {
    this.listeners.forEach((fn) => fn(value));
  }
  clear(): void {
    this.listeners.clear();
  }
}
