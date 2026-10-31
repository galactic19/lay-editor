import { followFloating, visibleOr, type Anchor } from './floating';
import { PortalPanel, type PortalParts } from './PortalPanel';

/** Desktop panel floating under its anchor; closes on an outside pointer press. */
export class Dropdown extends PortalPanel {
  /** `fallback` (the selection) takes over when the anchor element hides or goes away while the panel is open. */
  constructor(
    themeSource: HTMLElement,
    private readonly fallback: Anchor,
  ) {
    super(themeSource);
  }

  protected render(content: HTMLElement, anchor: Anchor | null): PortalParts {
    const dialog = this.portal('dropdown', { role: 'dialog' }, content);
    const opener = anchor instanceof Element ? anchor : null;
    const onPointerDown = (event: Event): void => {
      const target = event.target as Node;
      if (!dialog.contains(target) && !opener?.contains(target)) this.close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    const cleanups = [() => document.removeEventListener('pointerdown', onPointerDown, true)];
    if (anchor) cleanups.push(followFloating(opener ? visibleOr(opener, this.fallback) : anchor, dialog, 'bottom-start', 'dropdown'));
    return { dialog, cleanups };
  }
}
