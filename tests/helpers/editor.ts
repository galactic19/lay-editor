import { NodeSelection, TextSelection } from 'prosemirror-state';
import { createEditor } from '../../src/core/createEditor';
import type { Editor } from '../../src/core/Editor';
import type { EditorOptions } from '../../src/core/types';
import { onCleanup, triggerResize } from '../setup';

export function makeEditor(opts: Partial<EditorOptions> = {}): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element, ...opts });
  onCleanup(() => editor.destroy());
  return editor;
}

/** Types character by character through handleTextInput so input rules fire. */
export function typeText(editor: Editor, text: string): void {
  const { view } = editor;
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(ch, from, to);
    if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, deflt))) view.dispatch(deflt());
  }
}

export function findText(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    const index = node.isText ? node.text!.indexOf(text) : -1;
    if (index !== -1) found = pos + index;
    return found === -1;
  });
  if (found === -1) throw new Error(`text "${text}" not found`);
  return found;
}

/** Puts a collapsed caret at document position `pos`. */
export function caretAt(editor: Editor, pos: number): void {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

/** Puts the caret right after the first occurrence of `text`. */
export function caretAfter(editor: Editor, text: string): void {
  caretAt(editor, findText(editor, text) + text.length);
}

/** A control of the editor's main (desktop) toolbar. */
export function toolbarControl(editor: Editor, id: string): HTMLButtonElement {
  return editor.root.querySelector<HTMLButtonElement>(`.le-toolbar [data-item="${id}"]`)!;
}

export function selectText(editor: Editor, text: string): void {
  const from = findText(editor, text);
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
}

/** 'node:<pos>' selects a node, 'text:<string>' selects text. */
export function select(editor: Editor, spec: string): void {
  const [kind, value = ''] = spec.split(/:(.*)/s);
  if (kind === 'text') return selectText(editor, value);
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, Number(value))));
}

/** Presses a key spec like 'Enter' or 'Mod-Shift-b' through handleKeyDown (Mod = Ctrl in jsdom). */
export function press(editor: Editor, spec: string): boolean {
  const parts = spec.split('-');
  const key = parts.pop()!;
  const mods = new Set(parts);
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: mods.has('Mod') || mods.has('Ctrl'),
    shiftKey: mods.has('Shift'),
    altKey: mods.has('Alt'),
    bubbles: true,
    cancelable: true,
  });
  const { view } = editor;
  return Boolean(view.someProp('handleKeyDown', (f) => f(view, event)));
}

export async function flushPromises(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Squeezes the top toolbar so only `visible` controls fit (each 40px wide); returns the "more" button. */
export function squeezeToolbar(editor: Editor, visible: number): HTMLButtonElement {
  const bar = editor.root.querySelector<HTMLElement>('.le-toolbar')!;
  Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => (visible + 1) * 40 });
  Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => Array.from(bar.children).filter((el) => !(el as HTMLElement).hidden).length * 40 });
  triggerResize();
  return bar.querySelector<HTMLButtonElement>('[data-item="more"]')!;
}
