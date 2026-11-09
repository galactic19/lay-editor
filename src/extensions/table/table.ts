import { type Attrs, Fragment, type NodeSpec, type Node as PMNode, type ResolvedPos, type Schema, Slice } from 'prosemirror-model';
import { chainCommands } from 'prosemirror-commands';
import { type Command, type EditorState, Plugin, Selection, TextSelection, type Transaction } from 'prosemirror-state';
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
  isInTable,
  mergeCells,
  rowIsHeader,
  selectedRect,
  setCellAttr,
  splitCell,
  tableEditing,
  tableNodes,
  toggleHeader,
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

const { maxColspan, maxRowspan, maxColumnWidth, maxFillerCells } = DEFAULTS.tableLimits;

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
 * Grid slots no written cell starts in: rows x widest row - cells, with rowspans widening the rows below them
 * (past the last row too, as pasting into a table does). prosemirror-tables fills these slots with new cells, so
 * a few bytes of HTML (<tr></tr> under a wide row, a tall rowspan, cells colliding with rowspans) can become
 * hundreds of thousands of cells. Merged cells count as well: the figure is the most that can be added.
 */
function fillerCells(table: PMNode): number {
  const widthChange: number[] = [];
  const change = (row: number, by: number): void => {
    widthChange[row] = (widthChange[row] ?? 0) + by;
  };
  let cells = 0;
  table.forEach((row, _, index) =>
    row.forEach(({ attrs }) => {
      cells++;
      change(index, attrs.colspan);
      change(index + attrs.rowspan, -attrs.colspan);
    }),
  );
  const height = Math.max(table.childCount, widthChange.length - 1);
  let width = 0;
  let widest = 0;
  for (let row = 0; row < height; row++) widest = Math.max(widest, (width += widthChange[row] ?? 0));
  return height * widest - cells;
}

/** The tables to unwrap, largest filler first, until the rest fit DEFAULTS.tableLimits.maxFillerCells. */
function tablesToUnwrap(tables: readonly PMNode[]): Set<PMNode> {
  const sized = tables.map((table) => ({ table, filler: fillerCells(table) })).sort((a, b) => b.filler - a.filler);
  let total = sized.reduce((sum, { filler }) => sum + filler, 0);
  const unwrap = new Set<PMNode>();
  for (const { table, filler } of sized) {
    if (total <= maxFillerCells) break;
    unwrap.add(table);
    total -= filler;
  }
  return unwrap;
}

const isTable = (node: PMNode): boolean => node.type.spec.tableRole === 'table';

/** A table's content without the table: the blocks of each cell in reading order, appended to `blocks`. */
function cellBlocks(table: PMNode, blocks: PMNode[] = []): PMNode[] {
  table.forEach((row) => row.forEach((cell) => cell.forEach((block) => blocks.push(block))));
  return blocks;
}

/** `content` with each table in `unwrap` (nested ones too) replaced by its cells' blocks. */
function unwrapTables(content: Fragment, unwrap: ReadonlySet<PMNode>): Fragment {
  const nodes: PMNode[] = [];
  content.forEach((node) => {
    const inner = node.isLeaf ? node : node.copy(unwrapTables(node.content, unwrap));
    if (unwrap.has(node)) cellBlocks(inner, nodes);
    else nodes.push(inner);
  });
  return Fragment.fromArray(nodes);
}

/** prosemirror-tables' changedDescendants (not exported), so tables are checked where fixTables looks. */
function changedDescendants(old: PMNode, cur: PMNode, offset: number, visit: (node: PMNode, pos: number) => void): void {
  let match = 0;
  cur.forEach((child, childOffset, index) => {
    const pos = offset + childOffset;
    for (let scan = match; scan < Math.min(old.childCount, index + 3); scan++) {
      if (old.child(scan) === child) {
        match = scan + 1;
        return;
      }
    }
    visit(child, pos);
    if (match < old.childCount && old.child(match).sameMarkup(child)) changedDescendants(old.child(match), child, pos + 1, visit);
    else child.nodesBetween(0, child.content.size, visit, pos + 1);
  });
}

/**
 * Keeps prosemirror-tables from filling more than maxFillerCells slots at once: tables past the budget become
 * their cells' blocks. Pasted slices are checked before tableEditing's handlePaste, which evens out a table
 * pasted into a cell on its own; other changes are checked before its fixTables (this plugin runs first).
 */
const limitTableFiller = (): Plugin =>
  new Plugin({
    props: {
      transformPasted: (slice) => {
        const tables: PMNode[] = [];
        slice.content.descendants((node) => {
          if (isTable(node)) tables.push(node);
        });
        const unwrap = tablesToUnwrap(tables);
        return unwrap.size ? new Slice(unwrapTables(slice.content, unwrap), 0, 0) : slice;
      },
    },
    appendTransaction: (_trs, old, state) => {
      if (old.doc === state.doc) return null;
      const changed: Array<{ table: PMNode; pos: number }> = [];
      changedDescendants(old.doc, state.doc, 0, (node, pos) => {
        if (isTable(node)) changed.push({ table: node, pos });
      });
      const unwrap = tablesToUnwrap(changed.map(({ table }) => table));
      if (!unwrap.size) return null;
      const tr = state.tr;
      // Last first, so nested tables go before the tables around them and earlier positions stay valid.
      for (const { pos } of changed.filter(({ table }) => unwrap.has(table)).sort((a, b) => b.pos - a.pos)) {
        const table = tr.doc.nodeAt(pos)!;
        tr.replaceWith(pos, pos + table.nodeSize, cellBlocks(table));
      }
      return tr;
    },
  });

/**
 * A cell selection puts the native selection over its head cell, so a handle dragged on starts from there.
 * When the new selection starts in that cell, keep the cell the selection started in.
 */
function firstCell(old: EditorState, state: EditorState, $anchor: ResolvedPos): ResolvedPos {
  const previous = old.selection;
  const grown = previous instanceof CellSelection && old.doc === state.doc && previous.$headCell.pos === $anchor.pos;
  return grown ? previous.$anchorCell : $anchor;
}

/**
 * Only a mouse drag or Shift makes a cell selection. Touch selection handles dragged across cells leave a
 * TextSelection, so Merge stays disabled and typing moves text between cells. Turn it into a CellSelection.
 * Runs after tableEditing, which first shrinks a selection ending at the next cell's start (triple click).
 */
const textToCellSelection = (): Plugin =>
  new Plugin({
    appendTransaction: (_trs, old, state) => {
      if (!(state.selection instanceof TextSelection)) return null;
      const $anchor = cellAround(state.selection.$anchor);
      const $head = cellAround(state.selection.$head);
      if (!$anchor || !$head || $anchor.pos === $head.pos || !inSameTable($anchor, $head)) return null;
      return state.tr.setSelection(new CellSelection(firstCell(old, state, $anchor), $head));
    },
  });

/** Whether the table holding the selection has a header row: its whole first row is header cells. */
function hasHeaderRow(state: EditorState): boolean {
  if (!isInTable(state)) return false;
  const { map, table } = selectedRect(state);
  return rowIsHeader(map, table, 0);
}

/**
 * Tab in the last cell (where goToNextCell has nowhere to go and the browser would move focus out of the editor) adds
 * a row below the table and moves into its first cell, as word processors do.
 */
const addRowAndEnter: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  const tablePos = selectedRect(state).tableStart - 1;
  return addRowAfter(
    state,
    dispatch &&
      ((tr) => {
        const table = tr.doc.nodeAt(tablePos)!;
        const lastRow = tablePos + 1 + table.content.size - table.lastChild!.nodeSize;
        dispatch(tr.setSelection(Selection.near(tr.doc.resolve(lastRow + 1))).scrollIntoView());
      }),
  );
};

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
  // The table's first row from any cell; prosemirror-tables' own toggleHeaderRow turns the selected rows into headers.
  toggleHeaderRow: toggleHeader('row'),
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
  keymap: () => ({ Tab: chainCommands(goToNextCell(1), addRowAndEnter), 'Shift-Tab': goToNextCell(-1) }),
  plugins: () => [columnResizing(), limitTableFiller(), tableEditing(), textToCellSelection()],
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
    {
      ...contextItem('tableHeaderRow', 'panel-top', 'toggleHeaderRow'),
      isEnabled: (e) => e.can('toggleHeaderRow'),
      isActive: (e) => hasHeaderRow(e.state),
    },
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
