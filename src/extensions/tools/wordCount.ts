import type { Editor } from '../../core/Editor';
import { DEFAULTS } from '../../core/defaults';
import { debounce } from '../../core/timing';
import { c } from '../../ui/classes';
import { h } from '../../ui/dom';
import { UIComponent } from '../../ui/UIComponent';
import { defineExtension } from '../factories';

export interface TextCount {
  chars: number;
  charsNoSpace: number;
  words: number;
}

/** Counts user-perceived characters (Korean syllables and emoji count as one) and words. */
export function countText(text: string, locale: string): TextCount {
  const graphemes = Array.from(new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  const words = Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)).filter((s) => s.isWordLike).length;
  return { chars: graphemes.length, charsNoSpace: graphemes.filter((g) => !/\s/.test(g)).length, words };
}

const localeOf = (editor: Editor): string => (typeof editor.config.locale === 'string' ? editor.config.locale : DEFAULTS.locale);

export class StatusBar extends UIComponent<HTMLDivElement> {
  constructor(editor: Editor) {
    super(editor, h('div', { class: c('statusbar') }));
    const refresh = debounce(() => this.render(), DEFAULTS.status.debounce);
    this.subscribe('update', (tr) => {
      if (tr.docChanged) refresh();
    });
    this.addDisposer(() => refresh.cancel());
    this.render();
  }

  private render(): void {
    this.el.textContent = this.editor.t('status.count', { ...countText(this.editor.getText(), localeOf(this.editor)) });
  }
}

export const wordCount = defineExtension({
  name: 'wordCount',
  components: () => [{ slot: 'status', create: (editor) => new StatusBar(editor) }],
});
