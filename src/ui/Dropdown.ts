import { followFloating, type Anchor } from './floating';
import { PortalPanel, type PortalParts } from './PortalPanel';

/** Desktop panel floating under its anchor; closes on an outside pointer press. */
export class Dropdown extends PortalPanel {
  protected render(content: HTMLElement, anchor: Anchor | null): PortalParts {
    const dialog = this.portal('dropdown', { role: 'dialog' }, content);
    const onPointerDown = (event: Event): void => {
      const target = event.target as Node;
      const onAnchor = anchor instanceof Element && anchor.contains(target);
      if (!dialog.contains(target) && !onAnchor) this.close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    const cleanups = [() => document.removeEventListener('pointerdown', onPointerDown, true)];
    if (anchor) cleanups.push(followFloating(anchor, dialog, 'bottom-start', 'dropdown'));
    return { dialog, cleanups };
  }
}
