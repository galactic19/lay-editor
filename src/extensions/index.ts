import type { Extension } from '../core/types';
import { base } from './base/base';
import { cursors } from './base/cursors';
import { historyExtension } from './base/history';

/** Built-in extensions in schema order. Later tasks append here. */
export function getDefaultExtensions(): Extension[] {
  return [base, historyExtension, cursors];
}
