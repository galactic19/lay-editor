import { DEFAULTS } from '../core/defaults';
import { c } from './classes';
import { h } from './dom';
import { PortalPanel, type PortalParts } from './PortalPanel';

/** Mobile panel sliding up from the bottom; closes on a backdrop tap or a downward drag. */
export class BottomSheet extends PortalPanel {
  protected render(content: HTMLElement): PortalParts {
    const handle = h('div', { class: c('sheet-handle'), attrs: { 'aria-hidden': 'true' } });
    const dialog = this.portal('sheet', { role: 'dialog', 'aria-modal': 'true' }, handle, h('div', { class: c('sheet-body') }, content));
    const backdrop = this.portal('sheet-backdrop');
    // Close on the click, not the press: the backdrop must still be there to take the click, or it lands on
    // the page underneath. Cancelling the press keeps focus in the sheet until close() hands it to the editor.
    backdrop.addEventListener('pointerdown', (event) => event.preventDefault());
    backdrop.addEventListener('click', () => this.close());
    handle.addEventListener('pointerdown', (event) => this.drag(event, dialog));
    return { dialog, extras: [backdrop] };
  }

  private drag(start: PointerEvent, dialog: HTMLElement): void {
    const startY = start.clientY;
    const distance = (event: PointerEvent): number => Math.max(0, event.clientY - startY);
    const onMove = (event: PointerEvent): void => {
      dialog.style.transform = `translateY(${distance(event)}px)`;
    };
    const onUp = (event: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dialog.style.transform = '';
      if (distance(event) > DEFAULTS.sheet.dismissDistance) this.close();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
}
