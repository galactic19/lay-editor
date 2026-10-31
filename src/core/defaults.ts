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
  /** Floating UI: distance from the anchor (px) and the minimum gap to the viewport edge. */
  floating: { viewportPadding: 8, gaps: { dropdown: 4, menu: 6, toolbar: 8 } },
  toast: { duration: 4000 },
  sheet: { dismissDistance: 80 },
  mobileBar: { scrollGap: 8 },
  status: { debounce: 200 },
  autosave: { prefix: 'le-draft:', probeKey: 'le-draft-probe', debounce: 1000 },
  slash: { trigger: '/', maxItems: 10 },
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
  /**
   * Limits for tables. Spans clamp like browsers do (HTML spec); column widths are px. maxFillerCells caps the grid
   * slots no written cell starts in (rows x widest row - cells) that one paste or one change may bring in:
   * prosemirror-tables fills them with new cells, so past the cap the largest tables become their cells' blocks.
   */
  tableLimits: { maxColspan: 1000, maxRowspan: 65534, maxColumnWidth: 10000, maxFillerCells: 10000 },
  heading: { levels: [1, 2, 3, 4] },
  codeBlock: {
    indent: '  ',
    plainLanguage: 'plaintext',
    languages: ['plaintext', 'javascript', 'typescript', 'html', 'css', 'json', 'python', 'java', 'sql', 'bash'],
  },
  paste: {
    keepStyles: ['color', 'background-color', 'text-align'],
    keepDataAttrs: ['data-type', 'data-checked', 'data-indent', 'data-align', 'data-video', 'data-provider', 'data-id', 'data-colwidth'],
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
