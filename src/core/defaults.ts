/**
 * Single source of every default value and tunable number.
 * User options override these; nothing else in the codebase hard-codes them.
 */
export const DEFAULTS = {
  preset: 'full',
  locale: 'ko',
  theme: 'auto',
  changeDebounce: 300,
  mobileBreakpoint: 768,
  touchTarget: 44,
  toast: { duration: 4000 },
  url: {
    protocols: ['http:', 'https:', 'mailto:', 'tel:'],
    dataImageTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  },
  image: { minWidth: 10, maxWidth: 100 },
} as const;

export type Defaults = typeof DEFAULTS;
