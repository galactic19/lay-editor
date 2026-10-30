/** Forward declaration; preset contents are filled in Task 9. */
export const PRESET_NAMES = ['basic', 'full'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
