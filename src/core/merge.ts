export type DeepPartial<T> = T extends (...args: any[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Recursively merges plain objects. Arrays, functions and instances are replaced; undefined is ignored. */
export function deepMerge<T>(base: T, ...overrides: Array<DeepPartial<T> | undefined>): T {
  let result: unknown = base;
  for (const override of overrides) result = mergeTwo(result, override);
  return result as T;
}

function mergeTwo(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) out[key] = mergeTwo(base[key], value);
  }
  return out;
}
