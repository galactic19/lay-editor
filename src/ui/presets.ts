export const SEPARATOR = '|';

/** Toolbar presets are data: ordered item ids, '|' for a separator. */
export const PRESETS = {
  basic: ['bold', 'italic', 'underline', 'strike', SEPARATOR, 'heading', 'bulletList', 'orderedList', SEPARATOR, 'link', 'image', SEPARATOR, 'undo', 'redo'],
  full: [
    'undo', 'redo', SEPARATOR,
    'heading', SEPARATOR,
    'bold', 'italic', 'underline', 'strike', 'code', 'textColor', 'highlight', 'clearFormat', SEPARATOR,
    'align', 'indent', 'outdent', SEPARATOR,
    'bulletList', 'orderedList', 'taskList', SEPARATOR,
    'link', 'image', 'video', 'table', 'blockquote', 'codeBlock', 'horizontalRule', SEPARATOR,
    'findReplace', 'sourceView', 'fullscreen',
  ],
} satisfies Record<string, string[]>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

/** Items shown in the desktop selection bubble. */
export const BUBBLE_ITEMS = ['bold', 'italic', 'underline', 'strike', 'link', 'textColor', 'highlight'];
