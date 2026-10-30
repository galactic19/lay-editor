/**
 * Single source of every default value and tunable number.
 * User options override these; nothing else in the codebase hard-codes them.
 */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

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
    dataImageTypes: IMAGE_TYPES,
  },
  image: {
    minWidth: 10,
    maxWidth: 100,
    maxSize: 10 * 1024 * 1024,
    accept: IMAGE_TYPES,
    widths: [25, 50, 75, 100],
    aligns: ['left', 'center', 'right'],
  },
  video: { providers: ['youtube', 'vimeo'] },
  table: { maxGrid: 10, mobileMaxGrid: 6, defaultRows: 3, defaultCols: 3 },
  heading: { levels: [1, 2, 3, 4] },
  paste: {
    keepStyles: ['color', 'background-color', 'text-align'],
    keepDataAttrs: ['data-type', 'data-checked', 'data-indent', 'data-align', 'data-video', 'data-provider', 'data-id'],
    /** Colors that equal the page default; dropping them keeps pasted text readable in dark mode. */
    defaultColors: {
      color: ['#000', '#000000', 'rgb(0,0,0)'],
      'background-color': ['#fff', '#ffffff', 'rgb(255,255,255)'],
    },
  },
  indent: { max: 8 },
  colors: {
    text: ['#000000', '#495057', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#6741d9', '#c2255c', '#0c8599', '#868e96'],
    highlight: ['#ffec99', '#ffd8a8', '#ffc9c9', '#d3f9d8', '#d0ebff', '#e5dbff', '#fcc2d7', '#c5f6fa', '#e9ecef', '#fff3bf'],
  },
} as const;

export type Defaults = typeof DEFAULTS;
