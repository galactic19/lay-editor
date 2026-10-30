import { EventEmitter } from '../../../src/core/EventEmitter';

describe('EventEmitter', () => {
  it('passes args to listeners and unsubscribes via returned fn', () => {
    const e = new EventEmitter<{ a: [number] }>();
    const fn = vi.fn();
    const off = e.on('a', fn);
    e.emit('a', 1);
    off();
    e.emit('a', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('off removes a listener', () => {
    const e = new EventEmitter<{ a: [] }>();
    const fn = vi.fn();
    e.on('a', fn);
    e.off('a', fn);
    e.emit('a');
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates a throwing listener and reports it', () => {
    const onListenerError = vi.fn();
    const e = new EventEmitter<{ a: [] }>({ onListenerError });
    const ok = vi.fn();
    e.on('a', () => {
      throw new Error('x');
    });
    e.on('a', ok);
    e.emit('a');
    expect(ok).toHaveBeenCalled();
    expect(onListenerError).toHaveBeenCalledWith(expect.any(Error), 'a');
  });

  it('clear removes every listener', () => {
    const e = new EventEmitter<{ a: [] }>();
    const fn = vi.fn();
    e.on('a', fn);
    e.clear();
    e.emit('a');
    expect(fn).not.toHaveBeenCalled();
  });
});
