import * as api from '../../src';

describe('public API', () => {
  it('exports the documented functions', () => {
    for (const name of [
      'createEditor',
      'sanitizeHTML',
      'defineExtension',
      'markExtension',
      'blockExtension',
      'registerIcon',
      'registerLocale',
      'registerVideoProvider',
      'createTranslator',
      'EditorError',
      'Editor',
    ]) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(api.DEFAULTS.changeDebounce).toBe(300);
  });

  it('runs the documented @mention extension example', () => {
    const mention = api.defineExtension({
      name: 'mention',
      nodes: {
        mention: {
          group: 'inline',
          inline: true,
          atom: true,
          attrs: { id: {}, label: {} },
          parseDOM: [{ tag: 'span[data-mention]', getAttrs: (dom) => ({ id: (dom as HTMLElement).dataset.mention, label: (dom as HTMLElement).textContent!.replace(/^@/, '') }) }],
          toDOM: (node) => ['span', { 'data-mention': node.attrs.id, class: 'mention' }, `@${node.attrs.label}`],
        },
      },
      commands: ({ schema }) => ({
        insertMention: (id: string, label: string) => (state, dispatch) => {
          dispatch?.(state.tr.replaceSelectionWith(schema.nodes.mention!.create({ id, label })));
          return true;
        },
      }),
      ui: () => [{ id: 'mention', kind: 'button', icon: 'at-sign', label: 'toolbar.mention', command: 'insertMention', args: ['u1', '민수'], contexts: ['text'] }],
    });
    api.registerIcon('at-sign', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>');
    api.registerLocale('ko-custom', { toolbar: { mention: '사람 언급' } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = api.createEditor({ element: host, extensions: [mention], locale: 'ko-custom', toolbar: ['bold', 'mention'] });
    host.querySelector<HTMLButtonElement>('[data-item="mention"]')!.click();
    expect(editor.getHTML()).toBe('<p><span data-mention="u1" class="mention">@민수</span></p>');
    expect(host.querySelector('[data-item="mention"]')!.getAttribute('aria-label')).toBe('사람 언급');
    expect(api.sanitizeHTML('<p><span data-mention="u1">@민수</span></p>', { extensions: [mention] })).toBe(
      '<p><span data-mention="u1" class="mention">@민수</span></p>',
    );
    editor.destroy();
  });
});
