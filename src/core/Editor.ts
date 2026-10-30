import type { Attrs } from 'prosemirror-model';
import type { Translate } from '../i18n';

/** Forward declaration; implemented in Task 4. */
export declare class Editor {
  readonly t: Translate;
  isActive(name: string, attrs?: Attrs): boolean;
  exec(name: string, ...args: unknown[]): boolean;
}
