import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { PortalPanel, type PortalParts } from './PortalPanel';

const GAP = 4;
const VIEWPORT_PADDING = 8;

/** Desktop panel floating under its toolbar control; closes on an outside pointer press. */
export class Dropdown extends PortalPanel {
  protected render(content: HTMLElement, anchor: HTMLElement | null): PortalParts {
    const dialog = this.portal('dropdown', { role: 'dialog' }, content);
    const onPointerDown = (event: Event): void => {
      const target = event.target as Node;
      if (!dialog.contains(target) && !anchor?.contains(target)) this.close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    const cleanups = [() => document.removeEventListener('pointerdown', onPointerDown, true)];
    if (anchor) cleanups.push(autoUpdate(anchor, dialog, () => void this.position(anchor, dialog)));
    return { dialog, cleanups };
  }

  private async position(anchor: HTMLElement, el: HTMLElement): Promise<void> {
    const { x, y } = await computePosition(anchor, el, {
      placement: 'bottom-start',
      strategy: 'fixed',
      middleware: [offset(GAP), flip(), shift({ padding: VIEWPORT_PADDING })],
    });
    Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
  }
}
