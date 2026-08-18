import type { CellAddress, CellChangeSource, CellValue } from "./types.ts";

export type HistoryEntry = {
  address: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  source: CellChangeSource;
};

/** One undo/redo step — every cell touched by a single user action (a fill, a paste, a delete, an edit) undoes/redoes together. */
export type HistoryBatch = HistoryEntry[];

const MAX_BATCHES = 200;

/**
 * Plain undo/redo stack of cell-change batches. Doesn't touch the
 * DataModel itself — callers pop a batch and replay oldValue (undo) or
 * newValue (redo) through their own commit pipeline.
 */
export class HistoryManager {
  #undoStack: HistoryBatch[] = [];
  #redoStack: HistoryBatch[] = [];

  push(batch: HistoryBatch): void {
    if (batch.length === 0) return;
    this.#undoStack.push(batch);
    if (this.#undoStack.length > MAX_BATCHES) this.#undoStack.shift();
    this.#redoStack = [];
  }

  canUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  undo(): HistoryBatch | null {
    const batch = this.#undoStack.pop();
    if (!batch) return null;
    this.#redoStack.push(batch);
    return batch;
  }

  redo(): HistoryBatch | null {
    const batch = this.#redoStack.pop();
    if (!batch) return null;
    this.#undoStack.push(batch);
    return batch;
  }
}
