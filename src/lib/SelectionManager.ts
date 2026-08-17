import { type CellAddress, type CellRange, normalizeRange } from "./types.ts";

export type SelectionChangeListener = (range: CellRange) => void;

/** Active-cell / range selection with anchor + focus, framework-agnostic. */
export class SelectionManager {
  #rows: number;
  #cols: number;
  #anchor: CellAddress = { row: 0, col: 0 };
  #focus: CellAddress = { row: 0, col: 0 };
  #listeners = new Set<SelectionChangeListener>();

  constructor(rows: number, cols: number) {
    this.#rows = rows;
    this.#cols = cols;
  }

  get anchor(): CellAddress {
    return this.#anchor;
  }

  get focus(): CellAddress {
    return this.#focus;
  }

  getRange(): CellRange {
    return normalizeRange({ start: this.#anchor, end: this.#focus });
  }

  #clamp(address: CellAddress): CellAddress {
    return {
      row: Math.max(0, Math.min(this.#rows - 1, address.row)),
      col: Math.max(0, Math.min(this.#cols - 1, address.col)),
    };
  }

  /** Click / programmatic move: sets both anchor and focus unless extend is true. */
  moveTo(address: CellAddress, extend: boolean): void {
    const clamped = this.#clamp(address);
    this.#focus = clamped;
    if (!extend) this.#anchor = clamped;
    this.#notify();
  }

  setRange(range: CellRange): void {
    this.#anchor = this.#clamp(range.start);
    this.#focus = this.#clamp(range.end);
    this.#notify();
  }

  moveBy(dRow: number, dCol: number, extend: boolean): void {
    this.moveTo({ row: this.#focus.row + dRow, col: this.#focus.col + dCol }, extend);
  }

  onChange(listener: SelectionChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    const range = this.getRange();
    for (const listener of this.#listeners) listener(range);
  }
}
