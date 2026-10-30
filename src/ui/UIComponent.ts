/** Forward declaration; implemented in Task 9. */
export declare abstract class UIComponent {
  readonly el: HTMLElement;
  update(): void;
  destroy(): void;
}
