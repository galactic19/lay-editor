import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { defineExtension } from '../factories';

export const cursors = defineExtension({
  name: 'cursors',
  plugins: () => [dropCursor(), gapCursor()],
});
