import type { ThemeMode } from '../core/types';
import { Signal, type Listener } from './signal';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The theme actually shown: 'auto' resolved against the OS setting. */
export type ResolvedTheme = Exclude<ThemeMode, 'auto'>;

/** Applies data-theme to its targets; 'auto' follows the OS. onChange lets portals follow along. */
export class ThemeController {
  private readonly media = window.matchMedia(DARK_QUERY);
  private readonly signal = new Signal<ResolvedTheme>();
  private readonly onMedia = (): void => this.apply();

  constructor(
    private readonly getTargets: () => HTMLElement[],
    private mode: ThemeMode,
  ) {
    this.media.addEventListener('change', this.onMedia);
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
    this.media.removeEventListener('change', this.onMedia);
    this.signal.clear();
  }
}
