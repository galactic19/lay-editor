import type { Editor } from '../core/Editor';
import type { DeviceMode, PanelFactory } from '../core/types';
import { BottomSheet } from './BottomSheet';
import { Dropdown } from './Dropdown';
import { selectionReference, type Anchor } from './floating';

export interface PanelContainer {
  /** `onClose(hadFocus)` reports whether focus was inside the panel when it closed. */
  open(content: HTMLElement, anchor: Anchor | null, onClose: (hadFocus: boolean) => void): void;
  close(): void;
  readonly isOpen: boolean;
  destroy(): void;
}

/** Opens panel content in the container that fits the device: dropdown on desktop, bottom sheet on mobile. */
export class PanelHost {
  private container: PanelContainer | null = null;

  constructor(
    protected readonly editor: Editor,
    protected readonly getMode: () => DeviceMode,
  ) {}

  get isOpen(): boolean {
    return Boolean(this.container?.isOpen);
  }

  openPanel(factory: PanelFactory, anchor: Anchor | null = null): void {
    this.close();
    this.editor.syncSelection();
    const container = this.createContainer();
    const cleanups: Array<() => void> = [];
    const content = factory({ editor: this.editor, t: this.editor.t, close: () => this.close(), onClose: (fn) => cleanups.push(fn) });
    this.container = container;
    container.open(content, anchor, (hadFocus) => {
      if (this.container === container) this.container = null;
      cleanups.forEach((fn) => fn());
      if (hadFocus) this.editor.focus();
    });
  }

  close(): void {
    this.container?.close();
  }

  destroy(): void {
    this.container?.destroy();
    this.container = null;
  }

  protected createContainer(): PanelContainer {
    return this.getMode() === 'mobile' ? new BottomSheet(this.editor.root) : new Dropdown(this.editor.root, selectionReference(this.editor.view));
  }
}
