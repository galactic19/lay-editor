import { DOMParser as PMDOMParser, Fragment, Slice } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { DEFAULTS } from '../../core/defaults';
import { EditorError } from '../../core/errors';
import { fillContainerStarts } from '../../io/html';
import { withDocument } from '../../io/paste/dom';
import { PastePipeline } from '../../io/paste/pipeline';
import { cleanHwp } from '../../io/paste/cleaners/cleanHwp';
import { cleanWord } from '../../io/paste/cleaners/cleanWord';
import { normalizeStyles } from '../../io/paste/cleaners/normalizeStyles';
import { unwrapGoogleDocs } from '../../io/paste/cleaners/unwrapGoogleDocs';
import { defineExtension } from '../factories';

export const BUILT_IN_CLEANERS = [cleanWord, cleanHwp, unwrapGoogleDocs, normalizeStyles];
/** ProseMirror marks HTML it copied itself; it needs no cleanup. */
const INTERNAL_CLIPBOARD = 'data-pm-slice';

const escapeHTML = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAB_SPACES = ' '.repeat(DEFAULTS.paste.tabWidth);

/** Blank lines separate paragraphs; single newlines become line breaks; tabs become spaces, which the saved HTML keeps. */
export function textToHTML(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, TAB_SPACES)
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.split('\n').map(escapeHTML).join('<br>')}</p>`)
    .join('');
}

const htmlToText = (html: string): string => new window.DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

export const clipboard = defineExtension({
  name: 'clipboard',
  plugins: ({ editor, schema }) => {
    const keepContainers = (html: string): string => withDocument(html, (doc) => fillContainerStarts(doc.body, schema));
    const pipeline = new PastePipeline([...BUILT_IN_CLEANERS, ...editor.manager.pasteCleaners(), keepContainers]);
    const parser = PMDOMParser.fromSchema(schema);
    return [
      new Plugin({
        props: {
          transformPastedHTML: (html) => {
            if (html.includes(INTERNAL_CLIPBOARD)) return html;
            try {
              return pipeline.run(html);
            } catch (cause) {
              editor.reportError(new EditorError('PASTE_FAILED', '', { cause }));
              return textToHTML(htmlToText(html));
            }
          },
          clipboardTextParser: (text, $context) => {
            if ($context.parent.type.spec.code) return new Slice(Fragment.from(schema.text(text)), 0, 0);
            const dom = document.createElement('div');
            dom.innerHTML = textToHTML(text);
            return parser.parseSlice(dom, { preserveWhitespace: true, context: $context });
          },
        },
      }),
    ];
  },
});
