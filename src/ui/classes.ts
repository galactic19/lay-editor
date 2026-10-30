/** The single place that knows the CSS class prefix. */
export const CLASS_PREFIX = 'le-';

export function c(...names: string[]): string {
  return names.map((name) => CLASS_PREFIX + name).join(' ');
}
