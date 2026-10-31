import { chainCommands } from 'prosemirror-commands';
import { InputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import type { Command } from 'prosemirror-state';
import { findWrapping, StepMap } from 'prosemirror-transform';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Editor } from '../../core/Editor';
import { findParent, type FoundNode } from '../../core/state-utils';
import type { UIItem } from '../../core/types';
import { c } from '../../ui/classes';
import { h, outsideForms } from '../../ui/dom';
import { commandName, defineExtension } from '../factories';

type ListName = 'bulletList' | 'orderedList' | 'taskList';
const ITEM_OF: Record<ListName, 'listItem' | 'taskItem'> = { bulletList: 'listItem', orderedList: 'listItem', taskList: 'taskItem' };
const LIST_NAMES = Object.keys(ITEM_OF) as ListName[];

const isList = (node: PMNode): boolean => node.type.name in ITEM_OF;
export const listItemTypes = (schema: Schema): NodeType[] => [schema.nodes.listItem!, schema.nodes.taskItem!];

/**
 * Rebuilds the whole list as `listType` with every item as `itemType` (a nested list included).
 * Item content and sizes stay the same, so the selection keeps its positions.
 */
function retypeList(list: FoundNode, listType: NodeType, itemType: NodeType): Command {
  return (state, dispatch) => {
    const $list = state.doc.resolve(list.pos);
    if (!$list.parent.canReplaceWith($list.index(), $list.index() + 1, listType)) return false;
    if (dispatch) {
      const items: PMNode[] = [];
      list.node.forEach((item) => items.push(itemType.create(null, item.content, item.marks)));
      const tr = state.tr.replaceWith(list.pos, list.pos + list.node.nodeSize, listType.create(null, items));
      dispatch(tr.setSelection(state.selection.map(tr.doc, StepMap.empty)).scrollIntoView());
    }
    return true;
  };
}

/** Wraps in the list, unwraps it if already there, or converts a list of another kind. */
export function toggleList(schema: Schema, listName: ListName): Command {
  const listType = schema.nodes[listName]!;
  const itemType = schema.nodes[ITEM_OF[listName]]!;
  return (state, dispatch) => {
    const current = findParent(state, isList);
    if (!current) return wrapInList(listType)(state, dispatch);
    const currentItem = schema.nodes[ITEM_OF[current.node.type.name as ListName]]!;
    if (current.node.type === listType) return liftListItem(itemType)(state, dispatch);
    if (currentItem === itemType) {
      dispatch?.(state.tr.setNodeMarkup(current.pos, listType));
      return true;
    }
    return retypeList(current, listType, itemType)(state, dispatch);
  };
}

const anyItem = (schema: Schema, run: (type: NodeType) => Command): Command => chainCommands(...listItemTypes(schema).map(run));

class TaskItemView implements NodeView {
  dom: HTMLLIElement;
  contentDOM: HTMLElement;
  private readonly checkbox: HTMLInputElement;

  constructor(
    private node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    editor: Editor,
  ) {
    this.dom = document.createElement('li');
    const label = document.createElement('label');
    label.contentEditable = 'false';
    label.className = c('task-check');
    this.checkbox = outsideForms(h('input', { attrs: { type: 'checkbox' } }));
    this.checkbox.setAttribute('aria-label', editor.t('a11y.taskCheckbox'));
    this.checkbox.addEventListener('change', () => {
      const pos = getPos();
      if (pos !== undefined && view.editable) editor.exec('toggleTaskChecked', pos);
      else this.render();
    });
    label.appendChild(this.checkbox);
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = c('task-content');
    this.dom.append(label, this.contentDOM);
    this.render();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: { target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }

  stopEvent(event: Event): boolean {
    return event.target === this.checkbox;
  }

  private render(): void {
    this.checkbox.checked = this.node.attrs.checked;
    this.dom.dataset.checked = String(this.node.attrs.checked);
  }
}

const listButton = (id: ListName, icon: string, shortcut: string, keywords: string[]): UIItem => ({
  id,
  kind: 'button',
  icon,
  label: `toolbar.${id}`,
  command: commandName('toggle', id),
  shortcut,
  contexts: ['text', 'table'],
  isActive: (editor) => editor.isActive(id),
  slash: { keywords },
});

export const lists = defineExtension({
  name: 'lists',
  priority: 200,
  nodes: {
    bulletList: { group: 'block', content: 'listItem+', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      attrs: { start: { default: 1 } },
      parseDOM: [{ tag: 'ol', getAttrs: (dom) => ({ start: Math.max(1, Number((dom as HTMLElement).getAttribute('start')) || 1) }) }],
      toDOM: (node) => (node.attrs.start === 1 ? ['ol', 0] : ['ol', { start: String(node.attrs.start) }, 0]),
    },
    listItem: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    taskList: { group: 'block', content: 'taskItem+', parseDOM: [{ tag: 'ul[data-type="taskList"]', priority: 60 }], toDOM: () => ['ul', { 'data-type': 'taskList' }, 0] },
    taskItem: {
      content: 'paragraph block*',
      defining: true,
      attrs: { checked: { default: false } },
      parseDOM: ['li[data-checked]', 'ul[data-type="taskList"] > li'].map((tag) => ({
        tag,
        priority: 60,
        getAttrs: (dom: HTMLElement) => ({ checked: dom.getAttribute('data-checked') === 'true' }),
      })),
      toDOM: (node) => ['li', { 'data-checked': String(node.attrs.checked) }, 0],
    },
  },
  commands: ({ schema }) => ({
    ...Object.fromEntries(LIST_NAMES.map((name) => [commandName('toggle', name), () => toggleList(schema, name)])),
    sinkListItem: () => anyItem(schema, sinkListItem),
    liftListItem: () => anyItem(schema, liftListItem),
    toggleTaskChecked: (pos: number): Command => (state, dispatch) => {
      const node = state.doc.nodeAt(pos);
      if (!node || node.type !== schema.nodes.taskItem) return false;
      dispatch?.(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
      return true;
    },
  }),
  keymap: ({ schema }) => ({
    Enter: chainCommands(splitListItem(schema.nodes.listItem!), splitListItem(schema.nodes.taskItem!, { checked: false })),
    Tab: anyItem(schema, sinkListItem),
    'Shift-Tab': anyItem(schema, liftListItem),
    'Mod-Shift-8': 'toggleBulletList',
    'Mod-Shift-7': 'toggleOrderedList',
    'Mod-Shift-9': 'toggleTaskList',
  }),
  inputRules: ({ schema }) => [
    wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bulletList!),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      schema.nodes.orderedList!,
      (match) => ({ start: Number(match[1]) }),
      (match, node) => node.childCount + node.attrs.start === Number(match[1]),
    ),
    new InputRule(/^\[( |x)?\]\s$/, (state, match, start, end) => {
      const tr = state.tr.delete(start, end);
      const range = tr.doc.resolve(start).blockRange();
      const wrapping = range && findWrapping(range, schema.nodes.taskList!);
      if (!range || !wrapping) return null;
      const checked = match[1] === 'x';
      tr.wrap(range, wrapping.map((w) => (w.type === schema.nodes.taskItem ? { type: w.type, attrs: { checked } } : w)));
      return tr;
    }),
  ],
  nodeViews: ({ editor }) => ({ taskItem: (node, view, getPos) => new TaskItemView(node, view, getPos, editor) }),
  ui: () => [
    listButton('bulletList', 'list', 'Mod-Shift-8', ['bullet', 'list', '목록', '글머리']),
    listButton('orderedList', 'list-ordered', 'Mod-Shift-7', ['number', 'ordered', '번호']),
    listButton('taskList', 'list-checks', 'Mod-Shift-9', ['todo', 'task', 'check', '체크', '할일']),
  ],
});
