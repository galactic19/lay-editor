/**
 * Single source of every default value and tunable number.
 * User options override these; nothing else in the codebase hard-codes them.
 */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const COLOR_STYLES = ['color', 'background-color'];

export const DEFAULTS = {
  preset: 'full',
  locale: 'ko',
  theme: 'auto',
  changeDebounce: 300,
  mobileBreakpoint: 768,
  /** Floating UI: distance from the anchor (px) and the minimum gap to the viewport edge. */
  floating: { viewportPadding: 8, gaps: { dropdown: 4, menu: 6, toolbar: 8, tooltip: 6 } },
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
    /** Enter on the last of this many empty trailing lines leaves the block (0, or any other number that is not a positive whole number, turns it off; NaN is rejected). */
    exitBlankLines: 2,
    plainLanguage: 'plaintext',
    languages: ['plaintext', 'javascript', 'typescript', 'html', 'css', 'json', 'python', 'java', 'sql', 'bash'],
  },
  paste: {
    keepStyles: [...COLOR_STYLES, 'text-align'],
    colorStyles: COLOR_STYLES,
    /** CSS 2.1 color keywords, which Word uses for its standard colors and its highlight palette. */
    namedColors: {
      black: '#000000',
      silver: '#c0c0c0',
      gray: '#808080',
      white: '#ffffff',
      maroon: '#800000',
      red: '#ff0000',
      purple: '#800080',
      fuchsia: '#ff00ff',
      green: '#008000',
      lime: '#00ff00',
      olive: '#808000',
      yellow: '#ffff00',
      navy: '#000080',
      blue: '#0000ff',
      teal: '#008080',
      aqua: '#00ffff',
      orange: '#ffa500',
    },
    keepDataAttrs: ['data-type', 'data-checked', 'data-indent', 'data-align', 'data-video', 'data-provider', 'data-id', 'data-colwidth'],
    /**
     * The source page's own colors, dropped so pasted text stays readable in both themes: any grey text color
     * (channel spread up to `maxChroma`), and grey backgrounds at or beyond `darkBackground`/`lightBackground` lightness (0-255).
     */
    pageColors: { maxChroma: 24, darkBackground: 48, lightBackground: 240 },
  },
  indent: { max: 8 },
  colors: {
    text: ['#000000', '#495057', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#6741d9', '#c2255c', '#0c8599', '#868e96'],
    highlight: ['#ffec99', '#ffd8a8', '#ffc9c9', '#d3f9d8', '#d0ebff', '#e5dbff', '#fcc2d7', '#c5f6fa', '#e9ecef', '#fff3bf'],
  },
} as const;

export type Defaults = typeof DEFAULTS;
