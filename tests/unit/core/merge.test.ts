import { deepMerge } from '../../../src/core/merge';

describe('deepMerge', () => {
  it('merges objects, replaces arrays, ignores undefined', () => {
    expect(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2] } }, { a: { b: undefined } })).toEqual({ a: { b: 1, c: [2] } });
  });

  it('does not mutate inputs and skips undefined overrides', () => {
    const base = { a: { b: 1 } };
    const out = deepMerge(base, undefined, { a: { b: 2 } });
    expect(out).toEqual({ a: { b: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });

  it('replaces functions and class instances instead of merging them', () => {
    const fn = () => 1;
    const date = new Date(0);
    const out = deepMerge<{ f: unknown; d: unknown }>({ f: () => 0, d: { x: 1 } }, { f: fn, d: date });
    expect(out.f).toBe(fn);
    expect(out.d).toBe(date);
  });
});
