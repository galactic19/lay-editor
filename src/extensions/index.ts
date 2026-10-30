import type { Extension } from '../core/types';
import { base } from './base/base';
import { cursors } from './base/cursors';
import { historyExtension } from './base/history';
import { basicMarks } from './marks/basic';
import { clearFormat } from './marks/clearFormat';
import { highlight, textColor } from './marks/colorMark';
import { link } from './marks/link';

/** Built-in extensions in schema order. Later tasks append here. */
export function getDefaultExtensions(): Extension[] {
  return [base, historyExtension, cursors, link, ...basicMarks, textColor, highlight, clearFormat];
}
