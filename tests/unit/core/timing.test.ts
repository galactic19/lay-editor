import { debounce, rafBatch } from '../../../src/core/timing';

describe('debounce', () => {
  it('debounce delays, flush runs now, cancel drops', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d(1);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    d(2);
    d.flush();
    expect(fn).toHaveBeenCalledWith(2);
    d(3);
    d.cancel();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reports pending state and flush is a no-op when idle', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 10);
    expect(d.pending()).toBe(false);
    d();
    expect(d.pending()).toBe(true);
    vi.advanceTimersByTime(10);
    expect(d.pending()).toBe(false);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('rafBatch', () => {
  it('coalesces schedules into one frame and flush runs synchronously', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const fn = vi.fn();
    const b = rafBatch(fn);
    b.schedule();
    b.schedule();
    vi.advanceTimersToNextFrame();
    expect(fn).toHaveBeenCalledTimes(1);
    b.schedule();
    b.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersToNextFrame();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
