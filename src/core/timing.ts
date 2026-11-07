export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  flush(): void;
  cancel(): void;
  pending(): boolean;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const run = (): void => {
    timer = null;
    const args = lastArgs!;
    lastArgs = null;
    fn(...args);
  };
  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, ms);
  }) as Debounced<A>;
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    run();
  };
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  debounced.pending = () => timer !== null;
  return debounced;
}

export interface FrameBatch {
  schedule(): void;
  flush(): void;
  cancel(): void;
}

/** Coalesces many schedule() calls into one call per animation frame. */
export function rafBatch(fn: () => void): FrameBatch {
  let frame: number | null = null;
  const cancel = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  return {
    schedule() {
      if (frame === null) frame = requestAnimationFrame(() => {
        frame = null;
        fn();
      });
    },
    flush() {
      if (frame === null) return;
      cancel();
      fn();
    },
    cancel,
  };
}
