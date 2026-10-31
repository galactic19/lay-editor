import { c, PORTAL_CLASS } from './classes';
import { h } from './dom';
import { placeFloating } from './floating';
import { copyTheme } from './theme';

/**
 * The label + shortcut hint of icon-only controls. It lives in a body portal so the main
 * toolbar's overflow clipping cannot hide it, and shows on mouse hover and keyboard focus.
 * Hidden from assistive technology: the control's aria-label already carries the label.
 */
export class Tooltip {
  private readonly el = h('div', { class: `${PORTAL_CLASS} ${c('tooltip')}`, attrs: { 'aria-hidden': 'true', hidden: true } });
  private target: HTMLElement | null = null;

  constructor(private readonly themeSource: HTMLElement) {
    document.body.appendChild(this.el);
  }

  /**
   * Shows `control`'s `data-tooltip` text while it is hovered or focused. Controls never take
   * focus from a pointer (createControl prevents it), so focus here means keyboard focus.
   */
  attach(control: HTMLElement): void {
    const hide = (): void => this.hide(control);
    control.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') this.show(control);
    });
    control.addEventListener('focus', () => this.show(control));
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hide();
    });
    for (const type of ['pointerleave', 'pointerdown', 'blur'] as const) control.addEventListener(type, hide);
  }

  /** Hides the tooltip, or only when it belongs to `control`. */
  hide(control?: HTMLElement): void {
    if (control && control !== this.target) return;
    this.target = null;
    this.el.hidden = true;
  }

  destroy(): void {
    this.el.remove();
  }

  private show(control: HTMLElement): void {
    const text = control.dataset.tooltip;
    if (!text) return;
    this.target = control;
    this.el.textContent = text;
    copyTheme(this.el, this.themeSource);
    this.el.hidden = false;
    void placeFloating(control, this.el, 'bottom', 'tooltip');
  }
}
