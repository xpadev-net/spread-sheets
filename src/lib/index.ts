import "./style.css";

export { Spreadsheet } from "./Spreadsheet.tsx";
export type { SpreadsheetProps, SpreadsheetHandle } from "./Spreadsheet.tsx";
export type {
  CellValue,
  CellAddress,
  CellRange,
  ColumnDef,
  ValidationRule,
  ValidationMode,
  ListValidationRule,
  NumberValidationRule,
  TextValidationRule,
  DateValidationRule,
  CustomValidationRule,
  CheckboxValidationRule,
  CellChangeEvent,
  ValidationErrorEvent,
  CellChangeSource,
  TextOverflowMode,
} from "./types.ts";
