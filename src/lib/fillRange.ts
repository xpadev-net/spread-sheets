import type { DataModel } from "./DataModel.ts";
import { type CellAddress, type CellRange, type CellValue, isSingleCell } from "./types.ts";

export type FillCell = { address: CellAddress; value: CellValue };

/**
 * Pure function computing the values to write when dragging the fill handle
 * from `sourceRange` to cover the additional cells in `destRange` (which
 * does not overlap `sourceRange` — it's the newly-covered extension area).
 *
 * This library's own simple autofill rule (not a claim about matching
 * Excel/Google Sheets' pattern-detection autofill), since calculation /
 * series inference is out of scope:
 *   - if the source is exactly one cell holding a finite number, increment
 *     by 1 per step away from the source
 *   - otherwise, tile the source range's values into the destination
 */
export function fillRange(
  sourceRange: CellRange,
  destRange: CellRange,
  dataModel: DataModel,
): FillCell[] {
  const srcRows = sourceRange.end.row - sourceRange.start.row + 1;
  const srcCols = sourceRange.end.col - sourceRange.start.col + 1;
  const sourceValues = dataModel.getRangeValues(sourceRange);

  const vertical =
    destRange.start.col === sourceRange.start.col && destRange.end.col === sourceRange.end.col;

  const singleNumeric =
    isSingleCell(sourceRange) &&
    typeof sourceValues[0][0] === "number" &&
    Number.isFinite(sourceValues[0][0]);
  const baseNumber = singleNumeric ? (sourceValues[0][0] as number) : 0;

  const out: FillCell[] = [];

  for (let r = destRange.start.row; r <= destRange.end.row; r++) {
    for (let c = destRange.start.col; c <= destRange.end.col; c++) {
      let value: CellValue;
      if (singleNumeric) {
        const step = vertical
          ? r - sourceRange.end.row
          : c - sourceRange.end.col;
        value = baseNumber + step;
      } else if (vertical) {
        const srcRowIndex = ((r - sourceRange.start.row) % srcRows + srcRows) % srcRows;
        const srcColIndex = c - sourceRange.start.col;
        value = sourceValues[srcRowIndex][srcColIndex];
      } else {
        const srcRowIndex = r - sourceRange.start.row;
        const srcColIndex = ((c - sourceRange.start.col) % srcCols + srcCols) % srcCols;
        value = sourceValues[srcRowIndex][srcColIndex];
      }
      out.push({ address: { row: r, col: c }, value });
    }
  }

  return out;
}
