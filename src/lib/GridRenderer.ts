import type { DataModel } from "./DataModel.ts";
import { CELL_PADDING_X, LINE_HEIGHT, WRAP_VERTICAL_PADDING, ellipsize, wrapLines } from "./textLayout.ts";
import type { CellAddress, CellRange, ColumnDef, TextOverflowMode } from "./types.ts";

export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COL_WIDTH = 100;
export const HEADER_HEIGHT = 24;
export const HEADER_WIDTH = 44;
export const MIN_COL_WIDTH = 24;
export const MIN_ROW_HEIGHT = 16;
const RESIZE_HIT_TOLERANCE = 4;

function columnLabel(col: number): string {
  let n = col;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Binary search the largest prefix-sum index i such that offsets[i] <= x. */
function offsetAt(offsets: number[], x: number): number {
  if (x <= 0) return 0;
  let lo = 0;
  let hi = offsets.length - 2; // offsets.length - 1 is the final total, not a valid index
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export type VisibleRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export type DrawParams = {
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  selection: CellRange;
  activeCell: CellAddress;
};

/**
 * Canvas draw routines + geometry (row/col offsets) + hit-testing.
 * Framework-agnostic: takes a CanvasRenderingContext2D, owns no DOM nodes.
 */
export class GridRenderer {
  #dataModel: DataModel;
  #colOffsets: number[]; // prefix sums, length cols + 1
  #rowOffsets: number[]; // prefix sums, length rows + 1
  #overflow: TextOverflowMode[]; // per column, length cols
  #defaultRowHeight: number;
  // true until the row is explicitly resized (drag or the setRowHeight
  // API) — while true, wrap-mode overflow auto-grows the row to fit.
  #autoRowHeight: boolean[];
  #headers: (string | undefined)[]; // per column; falls back to the A/B/C label when unset

  constructor(dataModel: DataModel, columns?: ColumnDef[], defaultRowHeight = DEFAULT_ROW_HEIGHT) {
    this.#dataModel = dataModel;
    this.#defaultRowHeight = defaultRowHeight;
    this.#colOffsets = [0];
    this.#overflow = [];
    this.#headers = [];
    for (let c = 0; c < dataModel.cols; c++) {
      const width = columns?.[c]?.width ?? DEFAULT_COL_WIDTH;
      this.#colOffsets.push(this.#colOffsets[c] + width);
      this.#overflow.push(columns?.[c]?.overflow ?? "ellipsis");
      this.#headers.push(columns?.[c]?.header);
    }
    this.#rowOffsets = [0];
    this.#autoRowHeight = [];
    for (let r = 0; r < dataModel.rows; r++) {
      this.#rowOffsets.push(this.#rowOffsets[r] + defaultRowHeight);
      this.#autoRowHeight.push(true);
    }
  }

  getColWidth(col: number): number {
    return this.#colOffsets[col + 1] - this.#colOffsets[col];
  }

  getColX(col: number): number {
    return this.#colOffsets[col];
  }

  getRowHeight(row: number): number {
    return this.#rowOffsets[row + 1] - this.#rowOffsets[row];
  }

  getRowY(row: number): number {
    return this.#rowOffsets[row];
  }

  setColWidth(col: number, width: number): void {
    const clamped = Math.max(MIN_COL_WIDTH, width);
    const delta = clamped - this.getColWidth(col);
    if (delta === 0) return;
    for (let i = col + 1; i < this.#colOffsets.length; i++) this.#colOffsets[i] += delta;
  }

  /** Explicit resize (drag or API): pins the row's height and stops auto-fit from touching it. */
  setRowHeight(row: number, height: number): void {
    this.#autoRowHeight[row] = false;
    this.#applyRowHeight(row, height);
  }

  #applyRowHeight(row: number, height: number): void {
    const clamped = Math.max(MIN_ROW_HEIGHT, height);
    const delta = clamped - this.getRowHeight(row);
    if (delta === 0) return;
    for (let i = row + 1; i < this.#rowOffsets.length; i++) this.#rowOffsets[i] += delta;
  }

  /**
   * Grows rows whose height hasn't been explicitly set so wrapped text that
   * needs more than one line is no longer clipped. Only considers the
   * currently visible columns (consistent with this renderer's
   * virtualization elsewhere) — a row can grow further once a wrapped cell
   * further right scrolls into view.
   */
  #autoFitRowHeights(ctx: CanvasRenderingContext2D, visible: VisibleRange): void {
    for (let r = visible.startRow; r <= visible.endRow; r++) {
      if (!this.#autoRowHeight[r]) continue;
      let maxLines = 1;
      for (let c = visible.startCol; c <= visible.endCol; c++) {
        if (this.#overflow[c] !== "wrap") continue;
        const value = this.#dataModel.getValue(r, c);
        if (value === null) continue;
        const maxWidth = this.getColWidth(c) - CELL_PADDING_X * 2;
        if (maxWidth <= 0) continue;
        const lines = wrapLines(ctx, String(value), maxWidth).length;
        if (lines > maxLines) maxLines = lines;
      }
      const desired = Math.max(this.#defaultRowHeight, maxLines * LINE_HEIGHT + WRAP_VERTICAL_PADDING * 2);
      this.#applyRowHeight(r, desired);
    }
  }

  getColumnOverflow(col: number): TextOverflowMode {
    return this.#overflow[col] ?? "ellipsis";
  }

  setColumnOverflow(col: number, mode: TextOverflowMode): void {
    this.#overflow[col] = mode;
  }

  totalWidth(): number {
    return this.#colOffsets[this.#dataModel.cols];
  }

  totalHeight(): number {
    return this.#rowOffsets[this.#dataModel.rows];
  }

  #colAt(x: number): number {
    return Math.min(this.#dataModel.cols - 1, offsetAt(this.#colOffsets, x));
  }

  #rowAt(y: number): number {
    return Math.min(this.#dataModel.rows - 1, offsetAt(this.#rowOffsets, y));
  }

  getVisibleRange(scrollLeft: number, scrollTop: number, viewportWidth: number, viewportHeight: number): VisibleRange {
    const startRow = Math.max(0, this.#rowAt(scrollTop));
    const endRow = Math.min(this.#dataModel.rows - 1, this.#rowAt(scrollTop + viewportHeight));
    const startCol = Math.max(0, this.#colAt(scrollLeft));
    const endCol = Math.min(this.#dataModel.cols - 1, this.#colAt(scrollLeft + viewportWidth));
    return { startRow, endRow, startCol, endCol };
  }

  /**
   * Maps a pointer position in canvas-local pixels (relative to the
   * viewport's top-left, i.e. NOT yet offset by scroll) to a cell address.
   * Returns null when the point falls on a header or outside the sheet.
   */
  hitTest(canvasX: number, canvasY: number, scrollLeft: number, scrollTop: number): CellAddress | null {
    if (canvasX < HEADER_WIDTH || canvasY < HEADER_HEIGHT) return null;
    const x = canvasX - HEADER_WIDTH + scrollLeft;
    const y = canvasY - HEADER_HEIGHT + scrollTop;
    if (x < 0 || y < 0) return null;
    const col = this.#colAt(x);
    const row = this.#rowAt(y);
    if (row >= this.#dataModel.rows || col >= this.#dataModel.cols) return null;
    return { row, col };
  }

  /**
   * Clamped column/row lookup from canvas-local coordinates, valid anywhere
   * (header strip, grid body, or even past either edge) — unlike hitTest,
   * this never returns null. Used for header click/drag selection, where
   * the pointer is expected to be over a header, and a drag started on a
   * header may stray into the grid body or out of bounds without breaking
   * the selection.
   */
  columnAtCanvasX(canvasX: number, scrollLeft: number): number {
    return this.#colAt(Math.max(0, canvasX - HEADER_WIDTH + scrollLeft));
  }

  rowAtCanvasY(canvasY: number, scrollTop: number): number {
    return this.#rowAt(Math.max(0, canvasY - HEADER_HEIGHT + scrollTop));
  }

  /**
   * Returns which header (column or row) canvasX/canvasY falls on, or null
   * for the grid body or the top-left corner cell.
   */
  hitTestHeader(
    canvasX: number,
    canvasY: number,
    scrollLeft: number,
    scrollTop: number,
  ): { type: "col" | "row"; index: number } | null {
    if (canvasY < HEADER_HEIGHT && canvasX >= HEADER_WIDTH) {
      return { type: "col", index: this.columnAtCanvasX(canvasX, scrollLeft) };
    }
    if (canvasX < HEADER_WIDTH && canvasY >= HEADER_HEIGHT) {
      return { type: "row", index: this.rowAtCanvasY(canvasY, scrollTop) };
    }
    return null;
  }

  /**
   * Returns the column index whose right edge is within resize tolerance of
   * canvasX, when canvasY is within the column-header strip. Null otherwise.
   */
  hitTestColumnBoundary(canvasX: number, canvasY: number, scrollLeft: number): number | null {
    if (canvasY >= HEADER_HEIGHT || canvasX < HEADER_WIDTH) return null;
    const x = canvasX - HEADER_WIDTH + scrollLeft;
    const col = this.#colAt(x);
    for (const candidate of [col, col - 1]) {
      if (candidate < 0 || candidate >= this.#dataModel.cols) continue;
      if (Math.abs(x - this.#colOffsets[candidate + 1]) <= RESIZE_HIT_TOLERANCE) return candidate;
    }
    return null;
  }

  /**
   * Returns the row index whose bottom edge is within resize tolerance of
   * canvasY, when canvasX is within the row-header strip. Null otherwise.
   */
  hitTestRowBoundary(canvasX: number, canvasY: number, scrollTop: number): number | null {
    if (canvasX >= HEADER_WIDTH || canvasY < HEADER_HEIGHT) return null;
    const y = canvasY - HEADER_HEIGHT + scrollTop;
    const row = this.#rowAt(y);
    for (const candidate of [row, row - 1]) {
      if (candidate < 0 || candidate >= this.#dataModel.rows) continue;
      if (Math.abs(y - this.#rowOffsets[candidate + 1]) <= RESIZE_HIT_TOLERANCE) return candidate;
    }
    return null;
  }

  /** Screen-space (viewport-local, header-offset-included) rect for a cell. */
  cellRect(address: CellAddress, scrollLeft: number, scrollTop: number) {
    return {
      x: HEADER_WIDTH + this.getColX(address.col) - scrollLeft,
      y: HEADER_HEIGHT + this.getRowY(address.row) - scrollTop,
      width: this.getColWidth(address.col),
      height: this.getRowHeight(address.row),
    };
  }

  #drawCellText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number, mode: TextOverflowMode): void {
    const maxWidth = width - CELL_PADDING_X * 2;
    if (maxWidth <= 0) return;

    // Clip to the cell's own rect: wrap mode can produce more lines than
    // fit vertically, and this stops that (or any glyph) bleeding into
    // neighboring cells instead of silently squashing the text to fit.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.fillStyle = "#1f1f1f";

    if (mode === "wrap") {
      const lines = wrapLines(ctx, text, maxWidth);
      let lineY = y + WRAP_VERTICAL_PADDING + LINE_HEIGHT / 2;
      for (const line of lines) {
        ctx.fillText(line, x + CELL_PADDING_X, lineY);
        lineY += LINE_HEIGHT;
      }
    } else {
      ctx.fillText(ellipsize(ctx, text, maxWidth), x + CELL_PADDING_X, y + height / 2);
    }

    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, params: DrawParams): void {
    const { scrollLeft, scrollTop, viewportWidth, viewportHeight, selection, activeCell } = params;

    ctx.save();
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    // Explicit white background: the canvas otherwise inherits whatever is
    // behind it (e.g. a dark page background), making cell text unreadable.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.font = "13px system-ui, sans-serif";
    ctx.textBaseline = "middle";

    // Auto-fit wrap-mode rows before computing anything position-dependent
    // below — row heights (and therefore the visible range and every Y
    // offset) can change here.
    this.#autoFitRowHeights(ctx, this.getVisibleRange(scrollLeft, scrollTop, viewportWidth, viewportHeight));
    const visible = this.getVisibleRange(scrollLeft, scrollTop, viewportWidth, viewportHeight);

    // Selection fill (behind cell content)
    ctx.fillStyle = "rgba(26, 115, 232, 0.08)";
    const selRect = {
      x: HEADER_WIDTH + this.getColX(selection.start.col) - scrollLeft,
      y: HEADER_HEIGHT + this.getRowY(selection.start.row) - scrollTop,
      width: this.getColX(selection.end.col) + this.getColWidth(selection.end.col) - this.getColX(selection.start.col),
      height: this.getRowY(selection.end.row) + this.getRowHeight(selection.end.row) - this.getRowY(selection.start.row),
    };
    ctx.fillRect(selRect.x, selRect.y, selRect.width, selRect.height);

    // Cell contents + gridlines
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    for (let r = visible.startRow; r <= visible.endRow; r++) {
      const y = HEADER_HEIGHT + this.getRowY(r) - scrollTop;
      const rowHeight = this.getRowHeight(r);
      for (let c = visible.startCol; c <= visible.endCol; c++) {
        const x = HEADER_WIDTH + this.getColX(c) - scrollLeft;
        const width = this.getColWidth(c);
        ctx.strokeRect(x + 0.5, y + 0.5, width, rowHeight);

        const value = this.#dataModel.getValue(r, c);
        if (value !== null) {
          this.#drawCellText(ctx, String(value), x, y, width, rowHeight, this.getColumnOverflow(c));
        }

        if (this.#dataModel.hasWarning(r, c)) {
          ctx.fillStyle = "#d93025";
          ctx.beginPath();
          ctx.moveTo(x + width - 8, y);
          ctx.lineTo(x + width, y);
          ctx.lineTo(x + width, y + 8);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Active cell border
    const activeRect = this.cellRect(activeCell, scrollLeft, scrollTop);
    ctx.strokeStyle = "#1a73e8";
    ctx.lineWidth = 2;
    ctx.strokeRect(activeRect.x + 1, activeRect.y + 1, activeRect.width - 2, activeRect.height - 2);

    // Selection border (whole range)
    ctx.strokeStyle = "#1a73e8";
    ctx.lineWidth = 1;
    ctx.strokeRect(selRect.x + 0.5, selRect.y + 0.5, selRect.width - 1, selRect.height - 1);

    // Headers
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, viewportWidth, HEADER_HEIGHT);
    ctx.fillRect(0, 0, HEADER_WIDTH, viewportHeight);
    ctx.strokeStyle = "#c4c7c5";
    ctx.strokeRect(0.5, 0.5, viewportWidth - 1, HEADER_HEIGHT);

    ctx.fillStyle = "#5f6368";
    ctx.textAlign = "center";
    for (let c = visible.startCol; c <= visible.endCol; c++) {
      const x = HEADER_WIDTH + this.getColX(c) - scrollLeft;
      const width = this.getColWidth(c);
      ctx.strokeRect(x + 0.5, 0.5, width, HEADER_HEIGHT - 1);
      const headerText = ellipsize(ctx, this.#headers[c] ?? columnLabel(c), Math.max(0, width - CELL_PADDING_X * 2));
      ctx.fillText(headerText, x + width / 2, HEADER_HEIGHT / 2);
    }
    for (let r = visible.startRow; r <= visible.endRow; r++) {
      const y = HEADER_HEIGHT + this.getRowY(r) - scrollTop;
      const rowHeight = this.getRowHeight(r);
      ctx.strokeRect(0.5, y + 0.5, HEADER_WIDTH, rowHeight);
      ctx.fillText(String(r + 1), HEADER_WIDTH / 2, y + rowHeight / 2);
    }
    ctx.textAlign = "left";

    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);
    ctx.strokeRect(0.5, 0.5, HEADER_WIDTH - 1, HEADER_HEIGHT - 1);

    ctx.restore();
  }
}
