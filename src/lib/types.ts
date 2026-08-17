export type CellValue = string | number | boolean | null;

export type CellAddress = {
  row: number;
  col: number;
};

/** Inclusive, normalized range: start <= end on both axes. */
export type CellRange = {
  start: CellAddress;
  end: CellAddress;
};

export type ValidationMode = "reject" | "warn";

export type ListValidationRule = {
  type: "list";
  values: string[] | ((ctx: CellAddress) => string[]);
  /** When true, only values from the list may be entered (no free text). */
  strict?: boolean;
  mode?: ValidationMode;
};

export type NumberValidationRule = {
  type: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  mode?: ValidationMode;
};

export type TextValidationRule = {
  type: "text";
  maxLength?: number;
  pattern?: RegExp;
  mode?: ValidationMode;
};

/**
 * Dates are plain 'YYYY-MM-DD' strings — calendar-date validation only.
 * No Date object, no timezone conversion, no ISO datetime.
 */
export type DateValidationRule = {
  type: "date";
  min?: string;
  max?: string;
  mode?: ValidationMode;
};

export type CustomValidationRule = {
  type: "custom";
  validate: (value: CellValue, address: CellAddress) => true | string;
  mode?: ValidationMode;
};

export type ValidationRule =
  | ListValidationRule
  | NumberValidationRule
  | TextValidationRule
  | DateValidationRule
  | CustomValidationRule;

export type ValidationResult = {
  ok: boolean;
  message?: string;
  mode: ValidationMode;
};

export type CellChangeSource = "edit" | "dropdown" | "fill" | "api" | "paste";

export type CellChangeEvent = {
  address: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  source: CellChangeSource;
};

export type ValidationErrorEvent = {
  address: CellAddress;
  value: CellValue;
  rule: ValidationRule;
  message: string;
  source: CellChangeSource;
};

export type TextOverflowMode = "ellipsis" | "wrap";

export type ColumnDef = {
  width?: number;
  header?: string;
  /** Overflow behavior for text wider than the column. Defaults to 'ellipsis'. */
  overflow?: TextOverflowMode;
};

export function normalizeRange(range: CellRange): CellRange {
  const startRow = Math.min(range.start.row, range.end.row);
  const endRow = Math.max(range.start.row, range.end.row);
  const startCol = Math.min(range.start.col, range.end.col);
  const endCol = Math.max(range.start.col, range.end.col);
  return {
    start: { row: startRow, col: startCol },
    end: { row: endRow, col: endCol },
  };
}

export function rangeContains(range: CellRange, address: CellAddress): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.col >= range.start.col &&
    address.col <= range.end.col
  );
}

export function isSingleCell(range: CellRange): boolean {
  return range.start.row === range.end.row && range.start.col === range.end.col;
}
