import type { Attrs, NodeSpec, Node as PMNode, Schema } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  columnResizing,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
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
 * fixTables build 100k cells. Spans and widths are clamped to whole numbers like browsers do.
 */
function clampCellAttrs(attrs: Attrs): Attrs {
  const colspan = clampInteger(attrs.colspan, 1, maxColspan);
  const widths = attrs.colwidth as number[] | null;
  return {
    ...attrs,
    colspan,
    rowspan: clampInteger(attrs.rowspan, 1, maxRowspan),
    colwidth: widths?.length === colspan ? widths.map((width) => clampInteger(width, 0, maxColumnWidth)) : null,
  };
}

const withClampedCells = (spec: NodeSpec): NodeSpec => ({
  ...spec,
  parseDOM: spec.parseDOM?.map((rule) => ({
    ...rule,
    getAttrs: (dom: HTMLElement) => {
      const attrs = rule.getAttrs?.(dom) ?? null;
      return attrs && clampCellAttrs(attrs);
    },
  })),
});

function createTable(schema: Schema, rows: number, cols: number, withHeader: boolean): PMNode {
  const cell = (header: boolean) => schema.nodes[header ? 'table_header' : 'table_cell']!.createAndFill()!;
  const row = (header: boolean) => schema.nodes.table_row!.create(null, Array.from({ length: cols }, () => cell(header)));
  return schema.nodes.table!.create(null, Array.from({ length: rows }, (_, i) => row(withHeader && i === 0)));
}

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
  nodes: { table: nodes.table, table_row: nodes.table_row, table_cell: withClampedCells(nodes.table_cell), table_header: withClampedCells(nodes.table_header) },
  commands: ({ schema, options }) => ({
    ...Object.fromEntries(Object.entries(TABLE_COMMANDS).map(([name, command]) => [name, () => command])),
    insertTable:
      (rows = options.defaultRows, cols = options.defaultCols, withHeader = true): Command =>
      (state, dispatch) => {
        dispatch?.(state.tr.replaceSelectionWith(createTable(schema, rows, cols, withHeader)).scrollIntoView());
        return true;
      },
    setCellBackground: (value: string) => {
      const color = safeColor(value);
      return color ? setCellAttr('background', color) : () => false;
    },
    clearCellBackground: () => setCellAttr('background', null),
  }),
  keymap: () => ({ Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) }),
  plugins: () => [columnResizing(), tableEditing()],
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
