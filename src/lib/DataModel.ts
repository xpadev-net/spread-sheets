import type { CellAddress, CellRange, CellValue } from "./types.ts";

function key(row: number, col: number): string {
  return `${row},${col}`;
}

export type DataModelChangeListener = (address: CellAddress) => void;

/**
 * Sparse in-memory cell store. Pure get/set — no file/network I/O.
 * Cells that were never written read as `null`.
 */
export class DataModel {
  #rows: number;
  #cols: number;
  #cells = new Map<string, CellValue>();
  #warningMessages = new Map<string, string>();
  #listeners = new Set<DataModelChangeListener>();

  constructor(rows: number, cols: number, initialData?: CellValue[][]) {
    this.#rows = rows;
    this.#cols = cols;
    if (initialData) this.loadSnapshot(initialData);
  }

  get rows(): number {
    return this.#rows;
  }

  get cols(): number {
    return this.#cols;
  }

  assertInBounds(address: CellAddress): void {
    if (
      address.row < 0 ||
      address.row >= this.#rows ||
      address.col < 0 ||
      address.col >= this.#cols
    ) {
      throw new RangeError(
        `Cell address (${address.row}, ${address.col}) is out of bounds for a ${this.#rows}x${this.#cols} sheet`,
      );
    }
  }

  getValue(row: number, col: number): CellValue {
    this.assertInBounds({ row, col });
    return this.#cells.get(key(row, col)) ?? null;
  }

  /** Writes the raw value without validation — validation happens in commitCellValue. */
  setValue(row: number, col: number, value: CellValue): void {
    this.assertInBounds({ row, col });
    const k = key(row, col);
    if (value === null) {
      this.#cells.delete(k);
    } else {
      this.#cells.set(k, value);
    }
    this.#notify({ row, col });
  }

  hasWarning(row: number, col: number): boolean {
    return this.#warningMessages.has(key(row, col));
  }

  getWarningMessage(row: number, col: number): string | null {
    return this.#warningMessages.get(key(row, col)) ?? null;
  }

  setWarning(row: number, col: number, warning: boolean, message?: string): void {
    const k = key(row, col);
    if (warning) this.#warningMessages.set(k, message ?? "Invalid value");
    else this.#warningMessages.delete(k);
    this.#notify({ row, col });
  }

  getRangeValues(range: CellRange): CellValue[][] {
    const out: CellValue[][] = [];
    for (let r = range.start.row; r <= range.end.row; r++) {
      const rowValues: CellValue[] = [];
      for (let c = range.start.col; c <= range.end.col; c++) {
        rowValues.push(this.getValue(r, c));
      }
      out.push(rowValues);
    }
    return out;
  }

  getSnapshot(): CellValue[][] {
    return this.getRangeValues({
      start: { row: 0, col: 0 },
      end: { row: this.#rows - 1, col: this.#cols - 1 },
    });
  }

  loadSnapshot(data: CellValue[][]): void {
    if (data.length !== this.#rows) {
      throw new RangeError(
        `setData expected ${this.#rows} rows, received ${data.length}`,
      );
    }
    this.#cells.clear();
    this.#warningMessages.clear();
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      if (row.length !== this.#cols) {
        throw new RangeError(
          `setData expected ${this.#cols} columns on row ${r}, received ${row.length}`,
        );
      }
      for (let c = 0; c < row.length; c++) {
        const value = row[c];
        if (value !== null) this.#cells.set(key(r, c), value);
      }
    }
    this.#notify(null);
  }

  onChange(listener: DataModelChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(address: CellAddress | null): void {
    for (const listener of this.#listeners) {
      listener(address ?? { row: -1, col: -1 });
    }
  }
}
