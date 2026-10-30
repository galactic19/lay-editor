import type { Extension } from '../core/types';
import { base } from './base/base';
import { clipboard } from './base/clipboard';
import { cursors } from './base/cursors';
import { historyExtension } from './base/history';
import { placeholder } from './base/placeholder';
import { align } from './blocks/align';
import { blockquote } from './blocks/blockquote';
import { heading } from './blocks/heading';
import { horizontalRule } from './blocks/horizontalRule';
import { indent } from './blocks/indent';
import { lists } from './blocks/lists';
import { basicMarks } from './marks/basic';
import { clearFormat } from './marks/clearFormat';
import { highlight, textColor } from './marks/colorMark';
import { link } from './marks/link';
import { image } from './media/image';
import { video } from './media/video';
import { table } from './table/table';

/** Built-in extensions in schema order. Later tasks append here. */
export function getDefaultExtensions(): Extension[] {
  return [
    base,
    historyExtension,
    cursors,
    clipboard,
    placeholder,
    heading,
    blockquote,
    lists,
    horizontalRule,
    image,
    video,
    table,
    align,
    indent,
    link,
    ...basicMarks,
    textColor,
    highlight,
    clearFormat,
  ];
}
