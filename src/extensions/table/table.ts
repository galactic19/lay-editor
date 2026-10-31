import type { Attrs, NodeSpec, Node as PMNode, Schema } from 'prosemirror-model';
import { type Command, Plugin, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  cellAround,
  columnResizing,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  inSameTable,
  mergeCells,
  setCellAttr,
  splitCell,
  tableEditing,
  tableNodes,
  toggleHeaderRow,
} from 'prosemirror-tables';
import { DEFAULTS } from '../../core/defaults';
import type { UIItem } from '../../core/types';
import { clampInteger, safeColor } from '../../io/sanitize';
import { colorPanel } from '../../ui/panels/colorPanel';
import { defineExtension } from '../factories';
import { tablePanel } from './tablePanel';

type TableOptions = typeof DEFAULTS.table & { cellColors: readonly string[] };

const nodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    background: {
      default: null,
      getFromDOM: (dom) => safeColor(dom.style.backgroundColor),
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = `${attrs.style ?? ''}background-color: ${value};`;
      },
    },
  },
});

const { maxColspan, maxRowspan, maxColumnWidth } = DEFAULTS.tableLimits;

/**
 * prosemirror-tables reads spans with a bare Number(): "abc" becomes NaN, and colspan="100000" makes
 * fixTables build 100k cells. Spans are read and clamped the way browsers do; widths are clamped too.
 */
const cellSpans = (cell: Element): { colspan: number; rowspan: number } => ({
  colspan: clampInteger(cell.getAttribute('colspan'), 1, maxColspan),
  rowspan: clampInteger(cell.getAttribute('rowspan'), 1, maxRowspan),
});

function clampCellAttrs(attrs: Attrs, cell: HTMLElement): Attrs {
  const spans = cellSpans(cell);
  const widths = attrs.colwidth as number[] | null;
  return {
    ...attrs,
    ...spans,
    colwidth: widths?.length === spans.colspan ? widths.map((width) => clampInteger(width, 0, maxColumnWidth)) : null,
  };
}

const withClampedCells = (spec: NodeSpec): NodeSpec => ({
  ...spec,
  parseDOM: spec.parseDOM?.map((rule) => ({
    ...rule,
    getAttrs: (dom: HTMLElement) => {
      const attrs = rule.getAttrs?.(dom) ?? null;
      return attrs && clampCellAttrs(attrs, dom);
    },
  })),
});

function createTable(schema: Schema, rows: number, cols: number, withHeader: boolean): PMNode {
  const cell = (header: boolean) => schema.nodes[header ? 'table_header' : 'table_cell']!.createAndFill()!;
  const row = (header: boolean) => schema.nodes.table_row!.create(null, Array.from({ length: cols }, () => cell(header)));
  return schema.nodes.table!.create(null, Array.from({ length: rows }, (_, i) => row(withHeader && i === 0)));
}

/** Column widths from the first row, read the way prosemirror-tables' TableView reads them (0 = not resized). */
function columnWidths(table: PMNode): number[] {
  const widths: number[] = [];
  table.firstChild?.forEach((cell) => {
    for (let i = 0; i < cell.attrs.colspan; i++) widths.push(cell.attrs.colwidth?.[i] ?? 0);
  });
  return widths;
}

/**
 * Dragged widths live in data-colwidth, which only the editor's TableView reads. Saved HTML also gets
 * the <colgroup> the editor draws, so view pages show the same widths; parsing ignores the colgroup.
 */
const tableSpec: NodeSpec = {
  ...nodes.table,
  toDOM: (node) => {
    const widths = columnWidths(node);
    if (!widths.some(Boolean)) return nodes.table.toDOM!(node);
    return ['table', ['colgroup', ...widths.map((width) => ['col', width ? { style: `width: ${width}px;` } : {}])], ['tbody', 0]];
  },
};

/**
 * replaceSelectionWith leaves the caret after the new table (in its last cell, or in the next block);
 * start typing in its first cell instead. The table may land beside the selection, so find it by identity.
 */
function caretToFirstCell(tr: Transaction, table: PMNode): Transaction {
  tr.doc.descendants((node, pos) => {
    if (node === table) tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)));
    return node !== table && !node.isTextblock;
  });
  return tr;
}

/**
 * Only a mouse drag or Shift makes a cell selection. Touch selection handles dragged across cells leave a
 * TextSelection, so Merge stays disabled and typing moves text between cells. Turn it into a CellSelection.
 * Runs after tableEditing, which first shrinks a selection ending at the next cell's start (triple click).
 */
const textToCellSelection = (): Plugin =>
  new Plugin({
    appendTransaction: (_trs, _old, state) => {
      if (!(state.selection instanceof TextSelection)) return null;
      const $anchor = cellAround(state.selection.$anchor);
      const $head = cellAround(state.selection.$head);
      if (!$anchor || !$head || $anchor.pos === $head.pos || !inSameTable($anchor, $head)) return null;
      return state.tr.setSelection(new CellSelection($anchor, $head));
    },
  });

const TABLE_COMMANDS: Record<string, Command> = {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  mergeCells,
  splitCell,
  toggleHeaderRow,
};

const contextItem = (id: string, icon: string, command: string): UIItem => ({
  id,
  kind: 'button',
  icon,
  label: `toolbar.${id}`,
  command,
  contexts: ['table'],
});

export const table = defineExtension<TableOptions>({
  name: 'table',
  // Below lists (200) so Tab indents a list inside a cell before moving to the next cell.
  priority: 150,
  defaults: { ...DEFAULTS.table, cellColors: DEFAULTS.colors.highlight },
  nodes: { table: tableSpec, table_row: nodes.table_row, table_cell: withClampedCells(nodes.table_cell), table_header: withClampedCells(nodes.table_header) },
  commands: ({ schema, options }) => ({
    ...Object.fromEntries(Object.entries(TABLE_COMMANDS).map(([name, command]) => [name, () => command])),
    insertTable:
      (rows = options.defaultRows, cols = options.defaultCols, withHeader = true): Command =>
      (state, dispatch) => {
        const table = createTable(schema, rows, cols, withHeader);
        dispatch?.(caretToFirstCell(state.tr.replaceSelectionWith(table), table).scrollIntoView());
        return true;
      },
    setCellBackground: (value: string) => {
      const color = safeColor(value);
      return color ? setCellAttr('background', color) : () => false;
    },
    clearCellBackground: () => setCellAttr('background', null),
  }),
  keymap: () => ({ Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) }),
  plugins: () => [columnResizing(), tableEditing(), textToCellSelection()],
  ui: ({ options, editor }) => [
    {
      id: 'table',
      kind: 'panel',
      icon: 'table',
      label: 'toolbar.table',
      contexts: ['text'],
      slash: { keywords: ['table', 'grid', '표', '테이블'] },
      panel: tablePanel(() => (editor.ui?.device.mode === 'mobile' ? options.mobileMaxGrid : options.maxGrid)),
    },
    contextItem('tableAddRowAfter', 'between-horizontal-end', 'addRowAfter'),
    contextItem('tableAddColumnAfter', 'between-vertical-end', 'addColumnAfter'),
    contextItem('tableDeleteRow', 'table-rows-split', 'deleteRow'),
    contextItem('tableDeleteColumn', 'table-columns-split', 'deleteColumn'),
    contextItem('tableMerge', 'table-cells-merge', 'mergeCells'),
    contextItem('tableSplit', 'table-cells-split', 'splitCell'),
    { ...contextItem('tableHeaderRow', 'panel-top', 'toggleHeaderRow'), isEnabled: (e) => e.can('toggleHeaderRow') },
    {
      id: 'tableCellColor',
      kind: 'panel',
      icon: 'paint-bucket',
      label: 'toolbar.tableCellColor',
      contexts: ['table'],
      panel: colorPanel(options.cellColors, 'setCellBackground', 'clearCellBackground', 'table_cell'),
    },
    contextItem('tableDelete', 'trash', 'deleteTable'),
  ],
});
