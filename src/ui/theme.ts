import type { ThemeMode } from '../core/types';
import { watchMedia } from './dom';
import { Signal, type Listener } from './signal';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The theme actually shown: 'auto' resolved against the OS setting. */
export type ResolvedTheme = Exclude<ThemeMode, 'auto'>;

/** Copies the editor root's theme onto chrome rendered outside it (body portals), which its data-theme cannot reach. */
export function copyTheme(portal: HTMLElement, root: HTMLElement): void {
  portal.dataset.theme = root.dataset.theme;
}

/** Chrome in a body portal: it copies the editor's theme when it shows, and again through syncTheme() when the theme changes. */
export interface ThemedPortal {
  syncTheme(): void;
}

/** Applies data-theme to its targets; 'auto' follows the OS. onChange lets portals follow along. */
export class ThemeController {
  private readonly media = watchMedia(DARK_QUERY, () => this.apply());
  private readonly signal = new Signal<ResolvedTheme>();

  constructor(
    private readonly getTargets: () => HTMLElement[],
    private mode: ThemeMode,
  ) {
    this.apply();
  }

  get resolved(): ResolvedTheme {
    if (this.mode !== 'auto') return this.mode;
    return this.media.matches ? 'dark' : 'light';
  }

  set(mode: ThemeMode): void {
    this.mode = mode;
    this.apply();
  }

  apply(): void {
    const theme = this.resolved;
    this.getTargets().forEach((el) => (el.dataset.theme = theme));
    this.signal.emit(theme);
  }

  onChange(fn: Listener<ResolvedTheme>): () => void {
    return this.signal.on(fn);
  }

  destroy(): void {
    this.media.stop();
    this.signal.clear();
  }
}
