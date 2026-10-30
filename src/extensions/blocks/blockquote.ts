import { blockExtension } from '../factories';

export const blockquote = blockExtension({
  name: 'blockquote',
  kind: 'wrapper',
  tag: 'blockquote',
  defining: true,
  shortcut: 'Mod-Shift-b',
  icon: 'quote',
  inputRule: { pattern: /^>\s$/ },
  slash: { keywords: ['quote', 'blockquote', '인용'] },
});
