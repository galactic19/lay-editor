const KEYS = {
  horizontal: { next: 'ArrowRight', prev: 'ArrowLeft' },
  vertical: { next: 'ArrowDown', prev: 'ArrowUp' },
} as const;

/** One tab stop for a group; arrows, Home and End move focus inside it. */
export class RovingFocus {
  private items: HTMLElement[] = [];
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKey(event);

  constructor(
    private readonly container: HTMLElement,
    private readonly selector: string,
    private readonly orientation: keyof typeof KEYS = 'horizontal',
  ) {
    container.addEventListener('keydown', this.onKeyDown);
    this.refresh();
  }

  /** Re-reads the items. Only items hidden inside the group are skipped: the group itself may still be hidden while it is built. */
  refresh(): void {
    this.items = Array.from(this.container.querySelectorAll<HTMLElement>(this.selector)).filter((el) => !this.hiddenInside(el));
    const current = this.items.findIndex((el) => el.tabIndex === 0);
    this.items.forEach((el, i) => (el.tabIndex = i === Math.max(0, current) ? 0 : -1));
  }

  destroy(): void {
    this.container.removeEventListener('keydown', this.onKeyDown);
  }

  private hiddenInside(el: HTMLElement): boolean {
    for (let node: HTMLElement | null = el; node && node !== this.container; node = node.parentElement) if (node.hidden) return true;
    return false;
  }

  private handleKey(event: KeyboardEvent): void {
    const index = this.items.indexOf(event.target as HTMLElement);
    if (index === -1) return;
    const keys = KEYS[this.orientation];
    const last = this.items.length - 1;
    const target =
      event.key === keys.next ? (index === last ? 0 : index + 1)
      : event.key === keys.prev ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1;
    if (target === -1) return;
    event.preventDefault();
    this.items.forEach((el, i) => (el.tabIndex = i === target ? 0 : -1));
    this.items[target]!.focus();
  }
}
