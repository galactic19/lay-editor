export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const MAC_SYMBOLS: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' };
const PC_NAMES: Record<string, string> = { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Ctrl: 'Ctrl' };

/** 'Mod-Shift-b' → '⌘⇧B' on Mac, 'Ctrl+Shift+B' elsewhere. */
export function formatShortcut(spec: string, isMac = IS_MAC): string {
  const parts = spec.split(/-(?!$)/);
  const key = parts.pop()!;
  const mods = parts.map((mod) => (isMac ? MAC_SYMBOLS : PC_NAMES)[mod] ?? mod);
  const label = key.length === 1 ? key.toUpperCase() : key;
  return isMac ? [...mods, label].join('') : [...mods, label].join('+');
}
