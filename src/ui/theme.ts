import type { ThemeMode } from '../core/types';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Applies data-theme to the editor root and its portals; 'auto' follows the OS. */
export class ThemeController {
  private readonly media = window.matchMedia(DARK_QUERY);
  private readonly onMedia = (): void => this.apply();

  constructor(
    private readonly getTargets: () => HTMLElement[],
    private mode: ThemeMode,
  ) {
    this.media.addEventListener('change', this.onMedia);
    this.apply();
  }

  get resolved(): 'light' | 'dark' {
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
  }

  destroy(): void {
    this.media.removeEventListener('change', this.onMedia);
  }
}
